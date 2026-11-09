/**
 * @file src/workspace/workspaceController.jsx
 * @description Koordinator siklus hidup proyek & sinkronisasi status ruang kerja (WorkspaceController)
 */
import { ThumbnailGenerator } from './thumbnailGenerator.jsx';
import { WorkspaceDB } from './workspaceDb.jsx';
import { ProjectRepository } from './projectRepository.jsx';
import { PERF_TELEMETRY } from '../utils/renderConfigAndTelemetry.jsx';
import { VE } from '../engine/vectorEngine.jsx';
import { wsUid } from '../utils/zoomAndFormatHelpers.jsx';
import { AssetManager } from './assetManager.jsx';

/* ----------------------------------------------------------------------------
   1. WorkspaceController — Lifecycle, Save Queue & Autosave Scheduler
   ---------------------------------------------------------------------------- */
const WorkspaceController = (() => {
  const AUTOSAVE_DEBOUNCE_MS = 700;
  const THUMB_THROTTLE_MS = 4500;
  const CHECKPOINT_INTERVAL_MS = 45000;
  const CHECKPOINT_COMMIT_STEP = 5;
  let _debounceTimer = 0;
  let _pendingJob = null; // { projectId, doc, viewState, seq, forceCheckpoint, forceThumb }
  let _activeSavePromise = null;
  let _seqCounter = 0;
  let _commitsSinceCheckpoint = 0;
  let _lastCheckpointTime = 0;
  let _lastThumbTime = 0;
  let _statusListeners = new Set();
  let _quotaErrorListeners = new Set();
  let _currentStatus = 'clean';
  const setSaveStatus = status => {
    _currentStatus = status;
    _statusListeners.forEach(fn => {
      try {
        fn(status);
      } catch (e) {}
    });
  };
  const getSaveStatus = () => _currentStatus;
  const onSaveStatusChange = fn => {
    _statusListeners.add(fn);
    return () => _statusListeners.delete(fn);
  };
  const onQuotaError = fn => {
    _quotaErrorListeners.add(fn);
    return () => _quotaErrorListeners.delete(fn);
  };
  const notifyQuotaError = info => {
    _quotaErrorListeners.forEach(fn => {
      try {
        fn(info);
      } catch (e) {}
    });
  };

  /* GV-A01 & GV-A19: Antrean simpan berurutan per-projectId dengan pengembalian status eksplisit { ok, projectId, seq, error }
     serta pembuatan thumbnail asinkron non-blocking setelah dokumen utama tersimpan */
  let _lastFlushResult = {
    ok: true,
    projectId: null,
    seq: 0,
    error: null
  };
  const _pendingJobsByProject = new Map(); // projectId -> job

  const _scheduleBackgroundThumbnail = (projectId, doc, seq) => {
    if (!projectId || !doc) return;
    Promise.resolve().then(async () => {
      try {
        const thumbBlob = await ThumbnailGenerator.generateThumbnailBlob(doc);
        if (!thumbBlob || thumbBlob.size < 16) return;
        const proj = await WorkspaceDB.get('projects', projectId);
        if (proj) {
          await WorkspaceDB.put('projects', {
            ...proj,
            thumbnail: thumbBlob,
            thumbnailRenderVer: 3
          });
        }
      } catch (e) {}
    });
  };
  const _processQueue = async () => {
    if (_activeSavePromise) return _activeSavePromise;
    _activeSavePromise = (async () => {
      let lastRes = {
        ok: true,
        projectId: null,
        seq: _seqCounter,
        error: null
      };
      while (_pendingJob || _pendingJobsByProject.size > 0) {
        let job = _pendingJob;
        if (!job) {
          const firstPid = _pendingJobsByProject.keys().next().value;
          job = _pendingJobsByProject.get(firstPid);
          _pendingJobsByProject.delete(firstPid);
        } else {
          _pendingJob = null;
          _pendingJobsByProject.delete(job.projectId);
        }
        if (!job) break;
        const tQueueStart = Date.now();
        setSaveStatus('saving');
        const now = Date.now();
        const shouldCheckpoint = !!job.forceCheckpoint || _commitsSinceCheckpoint >= CHECKPOINT_COMMIT_STEP || now - _lastCheckpointTime >= CHECKPOINT_INTERVAL_MS;
        const shouldThumb = !!job.forceThumb || now - _lastThumbTime >= THUMB_THROTTLE_MS;
        let attempt = 0;
        let success = false;
        let lastErr = null;
        while (attempt < 2 && !success) {
          attempt++;
          try {
            /* GV-A19: Simpan dokumen utama terlebih dahulu tanpa memblokir transaksi pada pembuatan thumbnail */
            await ProjectRepository.saveDocumentRevision({
              projectId: job.projectId,
              doc: job.doc,
              viewState: job.viewState,
              createCheckpoint: shouldCheckpoint,
              thumbnail: undefined
            });
            success = true;
            if (shouldCheckpoint) {
              _commitsSinceCheckpoint = 0;
              _lastCheckpointTime = Date.now();
            }
          } catch (err) {
            lastErr = err;
            if (WorkspaceDB.isQuotaExceededError(err)) {
              break; // Do not blindly retry QuotaExceededError
            }

            await new Promise(r => setTimeout(r, 120));
          }
        }
        PERF_TELEMETRY.updateSceneMetrics({
          autosaveQueueLagMs: Date.now() - (job.enqueuedAt || tQueueStart)
        });
        if (!success) {
          if (!_pendingJob) {
            _pendingJob = job;
          }
          _pendingJobsByProject.set(job.projectId, job);
          setSaveStatus('error');
          lastRes = {
            ok: false,
            projectId: job.projectId,
            seq: job.seq,
            error: lastErr || new Error('Gagal menyimpan revisi dokumen')
          };
          _lastFlushResult = lastRes;
          if (WorkspaceDB.isQuotaExceededError(lastErr)) {
            notifyQuotaError({
              projectId: job.projectId,
              doc: job.doc,
              error: lastErr
            });
          }
          break;
        }
        lastRes = {
          ok: true,
          projectId: job.projectId,
          seq: job.seq,
          error: null
        };
        _lastFlushResult = lastRes;
        if (shouldThumb) {
          _lastThumbTime = Date.now();
          _scheduleBackgroundThumbnail(job.projectId, job.doc, job.seq);
        }
        if (!_pendingJob && _pendingJobsByProject.size === 0) {
          setSaveStatus(WorkspaceDB.isMemoryFallback() ? 'session-ram' : 'saved');
        }
      }
      return lastRes;
    })().finally(() => {
      _activeSavePromise = null;
    });
    return _activeSavePromise;
  };

  // Called by VectorEditor whenever a permanent document commit occurs (push, replaceTop, undo, redo)
  const scheduleAutosave = (projectId, doc, viewState) => {
    if (!projectId || !doc) return;
    _seqCounter++;
    _commitsSinceCheckpoint++;
    const job = {
      projectId,
      doc,
      viewState: viewState || {
        zoom: 1,
        pan: {
          x: 40,
          y: 40
        }
      },
      seq: _seqCounter,
      enqueuedAt: Date.now(),
      forceCheckpoint: false,
      forceThumb: false
    };
    _pendingJob = job;
    _pendingJobsByProject.set(projectId, job);
    setSaveStatus('dirty');
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      _debounceTimer = 0;
      _processQueue();
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  // GV-A01: Immediately flushes any pending autosave and returns explicit { ok, projectId, seq, error }
  const flushAutosave = async (opts = {}) => {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = 0;
    }
    const targetPid = opts.projectId || _pendingJob && _pendingJob.projectId || null;
    if (opts.projectId && opts.doc && (!_pendingJob || _pendingJob.projectId !== opts.projectId) && (_currentStatus === 'dirty' || _currentStatus === 'error' || opts.forceThumb || opts.forceCheckpoint)) {
      _seqCounter++;
      const job = {
        projectId: opts.projectId,
        doc: opts.doc,
        viewState: opts.viewState || {
          zoom: 1,
          pan: {
            x: 40,
            y: 40
          }
        },
        seq: _seqCounter,
        enqueuedAt: Date.now(),
        forceCheckpoint: !!opts.forceCheckpoint,
        forceThumb: opts.forceThumb !== false
      };
      _pendingJob = job;
      _pendingJobsByProject.set(opts.projectId, job);
    } else if (_pendingJob) {
      if (opts.doc && (!opts.projectId || _pendingJob.projectId === opts.projectId)) {
        _pendingJob.doc = opts.doc;
      }
      if (opts.viewState && (!opts.projectId || _pendingJob.projectId === opts.projectId)) {
        _pendingJob.viewState = opts.viewState;
      }
      if (opts.forceCheckpoint) _pendingJob.forceCheckpoint = true;
      if (opts.forceThumb !== false) _pendingJob.forceThumb = true;
    }
    if (_pendingJob || _pendingJobsByProject.size > 0 || _activeSavePromise) {
      const res = await _processQueue();
      return res || _lastFlushResult;
    }
    if (_currentStatus === 'error') {
      return {
        ok: false,
        projectId: targetPid,
        seq: _seqCounter,
        error: _lastFlushResult.error || new Error('Perubahan belum tersimpan')
      };
    }
    return {
      ok: true,
      projectId: targetPid,
      seq: _seqCounter,
      error: null
    };
  };
  const retryFailedSave = async () => {
    if (_pendingJob || _pendingJobsByProject.size > 0) {
      return await _processQueue();
    }
    return _lastFlushResult;
  };
  const resetSessionState = (initialStatus = 'saved') => {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = 0;
    }
    _pendingJob = null;
    _commitsSinceCheckpoint = 0;
    _lastCheckpointTime = Date.now();
    _lastThumbTime = 0;
    setSaveStatus(initialStatus);
  };

  // Section 13.1: Import files as new Project(s) in Workspace (distinct from Import into Canvas)
  const readFileAsText = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(r.error || new Error('Gagal membaca teks berkas'));
    r.readAsText(file);
  });
  const measureImageFromUrl = url => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res({
      w: im.naturalWidth || 800,
      h: im.naturalHeight || 600
    });
    im.onerror = () => rej(new Error('Gagal memuat dimensi gambar'));
    im.src = url;
  });
  const detectFileCategory = async file => {
    const name = String(file.name || '').toLowerCase();
    if (name.endsWith('.geovanta') || name.endsWith('.zip')) return 'geovanta';
    let u8 = new Uint8Array(0);
    try {
      u8 = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    } catch (e) {}
    if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04) {
      return 'geovanta';
    }
    const hd = String.fromCharCode.apply(null, u8.subarray(0, 16));
    const txt = new TextDecoder('utf-8').decode(u8.subarray(0, 2048));
    if (u8[0] === 0x89 && hd.slice(1, 4) === 'PNG') return 'img';
    if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'img';
    if (hd.startsWith('GIF8') || hd.startsWith('RIFF') && hd.slice(8, 12) === 'WEBP') return 'img';
    if (hd.startsWith('%PDF-') || hd.startsWith('%!PS') || u8[0] === 0xC5 && u8[1] === 0xD0 && u8[2] === 0xD3 && u8[3] === 0xC6) return 'ps';
    if (/<svg[\s>]/i.test(txt)) return 'svg';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const ty = String(file.type || '').toLowerCase();
    if (ext === 'svg' || ty === 'image/svg+xml') return 'svg';
    if (['ai', 'ps', 'eps', 'pdf'].includes(ext) || ty === 'application/postscript' || ty === 'application/pdf') return 'ps';
    if (ty.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'img';
    return null;
  };

  /* GV-A14: Heavy file import with cooperative yielding, cancellation token, and deep schema validation */
  let _activeImportCancel = null;
  const cancelActiveImport = () => {
    if (_activeImportCancel) _activeImportCancel.cancelled = true;
  };
  const yieldToMain = () => new Promise(r => setTimeout(r, 0));
  const importFileAsNewProject = async (file, opts = {}) => {
    if (!file) throw new Error('Berkas tidak ditemukan');
    const MAX_IMPORT_BYTES = 150 * 1024 * 1024;
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error('Ukuran berkas melebihi batas keamanan maksimum (150 MB)');
    }
    const cancelToken = opts.cancelToken || {
      cancelled: false
    };
    _activeImportCancel = cancelToken;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
    const tImport0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    onProgress({
      stage: 'detecting',
      percent: 10
    });
    const kind = await detectFileCategory(file);
    if (cancelToken.cancelled) throw new Error('Impor berkas dibatalkan');
    const baseName = String(file.name || 'Imported Project').replace(/\.[^.]+$/, '').trim() || 'Imported Project';
    if (kind === 'geovanta') {
      onProgress({
        stage: 'extracting-archive',
        percent: 35
      });
      await yieldToMain();
      const res = await ProjectRepository.importBackupBlob(file);
      PERF_TELEMETRY.updateSceneMetrics({
        lastImportParseMs: Math.round(((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - tImport0) * 100) / 100
      });
      onProgress({
        stage: 'done',
        percent: 100
      });
      return res.project;
    }
    if (kind === 'svg') {
      onProgress({
        stage: 'reading-svg',
        percent: 25
      });
      const txt = await readFileAsText(file);
      if (cancelToken.cancelled) throw new Error('Impor berkas dibatalkan');
      if (file.size > 256 * 1024) await yieldToMain();
      onProgress({
        stage: 'parsing-svg',
        percent: 60
      });
      const parsed = VE.parseSVG(txt);
      if (cancelToken.cancelled) throw new Error('Impor berkas dibatalkan');
      if (parsed.error || !Array.isArray(parsed.objects)) {
        throw new Error('Berkas SVG tidak valid atau tidak dapat diurai');
      }
      const initialDoc = {
        viewBox: parsed.viewBox || [0, 0, 800, 600],
        objects: parsed.objects
      };
      if (!ProjectRepository.validateDocStructure(initialDoc)) {
        throw new Error('Struktur geometri SVG melebihi batas keamanan skema dokumen');
      }
      onProgress({
        stage: 'saving-project',
        percent: 85
      });
      const created = await ProjectRepository.createProject({
        name: baseName,
        initialDoc
      });
      PERF_TELEMETRY.updateSceneMetrics({
        lastImportParseMs: Math.round(((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - tImport0) * 100) / 100
      });
      onProgress({
        stage: 'done',
        percent: 100
      });
      return created.project;
    }
    if (kind === 'ps') {
      onProgress({
        stage: 'reading-ps',
        percent: 25
      });
      const buf = await file.arrayBuffer();
      if (cancelToken.cancelled) throw new Error('Impor berkas dibatalkan');
      await yieldToMain();
      onProgress({
        stage: 'parsing-ps',
        percent: 60
      });
      const parsed = await VE.parsePSorAI(buf);
      if (cancelToken.cancelled) throw new Error('Impor berkas dibatalkan');
      if (parsed.error || !Array.isArray(parsed.objects)) {
        throw new Error('Berkas AI/EPS/PS/PDF tidak valid atau kosong');
      }
      const initialDoc = {
        viewBox: parsed.viewBox || [0, 0, 800, 600],
        objects: parsed.objects
      };
      if (!ProjectRepository.validateDocStructure(initialDoc)) {
        throw new Error('Struktur geometri AI/EPS/PDF melebihi batas keamanan skema dokumen');
      }
      onProgress({
        stage: 'saving-project',
        percent: 85
      });
      const created = await ProjectRepository.createProject({
        name: baseName,
        initialDoc
      });
      PERF_TELEMETRY.updateSceneMetrics({
        lastImportParseMs: Math.round(((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - tImport0) * 100) / 100
      });
      onProgress({
        stage: 'done',
        percent: 100
      });
      return created.project;
    }
    if (kind === 'img') {
      const projectId = wsUid('proj');
      const savedAsset = await AssetManager.ingestBlob(projectId, file, file.name || baseName + '.png');
      let dims = {
        w: 800,
        h: 600
      };
      try {
        dims = await measureImageFromUrl(savedAsset.href);
      } catch (e) {}
      const vw = Math.max(100, dims.w);
      const vh = Math.max(100, dims.h);
      const imgObj = VE.makeImageObj(savedAsset.href, dims.w, dims.h, 0, 0, baseName, 'none');
      imgObj.img.assetId = savedAsset.assetId;
      const created = await ProjectRepository.createProject({
        id: projectId,
        name: baseName,
        initialDoc: {
          viewBox: [0, 0, vw, vh],
          objects: [imgObj]
        }
      });
      return created.project;
    }
    throw new Error('Format berkas tidak didukung (gunakan .geovanta, .SVG, .AI, .EPS, .PS, .PDF, .PNG, .JPG, .WEBP, .GIF)');
  };
  const triggerBackupDownload = async projectId => {
    const {
      blob,
      fileName
    } = await ProjectRepository.exportBackupBlob(projectId);
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Geovanta Project Archive (.geovanta)',
            accept: {
              'application/zip': ['.geovanta']
            }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return fileName;
      } catch (err) {
        if (err && err.name === 'AbortError') return null;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
    return fileName;
  };
  return {
    scheduleAutosave,
    flushAutosave,
    retryFailedSave,
    resetSessionState,
    getSaveStatus,
    setSaveStatus,
    onSaveStatusChange,
    onQuotaError,
    importFileAsNewProject,
    cancelActiveImport,
    triggerBackupDownload
  };
})();

/* ----------------------------------------------------------------------------
   2. WorkspaceUI — Full Workspace Home Screen & Modals (Section 6, 9.3, 11, 12)
   ---------------------------------------------------------------------------- */

export { WorkspaceController };
export default WorkspaceController;
