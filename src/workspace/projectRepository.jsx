/**
 * @file src/workspace/projectRepository.jsx
 * @description Repositori proyek lokal: autosave, pemulihan snapshot, duplikasi, & ekspor/impor .geovanta
 */
import { wsUid } from '../utils/zoomAndFormatHelpers.jsx';
import { AssetManager } from './assetManager.jsx';
import { ThumbnailGenerator } from './thumbnailGenerator.jsx';
import { WORKSPACE_SCHEMA_VERSION, MAX_SNAPSHOTS_PER_PROJECT, ALLOWED_ASSET_MIMES } from '../constants/workspaceConstants.jsx';
import { WorkspaceDB } from './workspaceDb.jsx';
import { ZipEngine } from './zipEngine.jsx';

/* ----------------------------------------------------------------------------
   5. ProjectRepository — Full Project CRUD, Trash, Duplicate, Snapshots & Backup
   ---------------------------------------------------------------------------- */
const ProjectRepository = (() => {
  /* GV-A14: Deep Schema Validation untuk dokumen vektor (mencegah korupsi state/OOM dari JSON/backup rusak) */
  const DOC_SCHEMA_LIMITS = {
    MAX_OBJECTS: 25000,
    MAX_SUBPATHS_PER_OBJECT: 4096,
    MAX_NODES_PER_SUBPATH: 50000,
    MAX_TOTAL_NODES: 500000,
    MAX_GRAD_STOPS: 256,
    MAX_STRING_LEN: 65536,
    MAX_COORD: 1e7
  };
  const validateDocStructure = doc => {
    if (!doc || typeof doc !== 'object') return false;
    if (!Array.isArray(doc.viewBox) || doc.viewBox.length !== 4) return false;
    if (!doc.viewBox.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= DOC_SCHEMA_LIMITS.MAX_COORD)) return false;
    if (!(doc.viewBox[2] > 0 && doc.viewBox[3] > 0)) return false;
    if (!Array.isArray(doc.objects) || doc.objects.length > DOC_SCHEMA_LIMITS.MAX_OBJECTS) return false;
    let totalNodes = 0;
    const isFinCoord = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= DOC_SCHEMA_LIMITS.MAX_COORD;
    for (let i = 0; i < doc.objects.length; i++) {
      const o = doc.objects[i];
      if (!o || typeof o !== 'object') return false;
      if (o.name != null && (typeof o.name !== 'string' || o.name.length > 512)) return false;
      if (o.opacity != null && (typeof o.opacity !== 'number' || !Number.isFinite(o.opacity) || o.opacity < 0 || o.opacity > 1)) return false;
      if (o.strokeWidth != null && (typeof o.strokeWidth !== 'number' || !Number.isFinite(o.strokeWidth) || o.strokeWidth < 0 || o.strokeWidth > 1e5)) return false;
      if (o.clipPathD != null && (typeof o.clipPathD !== 'string' || o.clipPathD.length > DOC_SCHEMA_LIMITS.MAX_STRING_LEN)) return false;
      if (!Array.isArray(o.subs) || o.subs.length > DOC_SCHEMA_LIMITS.MAX_SUBPATHS_PER_OBJECT) return false;
      for (let s = 0; s < o.subs.length; s++) {
        const sp = o.subs[s];
        if (!sp || typeof sp !== 'object' || !Array.isArray(sp.nodes)) return false;
        if (sp.nodes.length > DOC_SCHEMA_LIMITS.MAX_NODES_PER_SUBPATH) return false;
        totalNodes += sp.nodes.length;
        if (totalNodes > DOC_SCHEMA_LIMITS.MAX_TOTAL_NODES) return false;
        for (let n = 0; n < sp.nodes.length; n++) {
          const nd = sp.nodes[n];
          if (!nd || !isFinCoord(nd.x) || !isFinCoord(nd.y)) return false;
          if (nd.handleIn != null && (!isFinCoord(nd.handleIn.x) || !isFinCoord(nd.handleIn.y))) return false;
          if (nd.handleOut != null && (!isFinCoord(nd.handleOut.x) || !isFinCoord(nd.handleOut.y))) return false;
        }
      }
      if (o.grad && typeof o.grad === 'object') {
        if (!Array.isArray(o.grad.stops) || o.grad.stops.length > DOC_SCHEMA_LIMITS.MAX_GRAD_STOPS) return false;
        for (let g = 0; g < o.grad.stops.length; g++) {
          const st = o.grad.stops[g];
          if (!st || typeof st.offset !== 'number' || !Number.isFinite(st.offset)) return false;
        }
      }
      if (o.img != null) {
        if (typeof o.img !== 'object') return false;
        if (!(Number(o.img.w) > 0 && Number.isFinite(Number(o.img.w)) && Number(o.img.h) > 0 && Number.isFinite(Number(o.img.h)))) return false;
      }
    }
    return true;
  };
  const estimateDocSize = (docRecord, assetsList = [], thumbBlob = null) => {
    let bytes = 0;
    try {
      bytes += JSON.stringify(docRecord && docRecord.data ? docRecord.data : {}).length;
    } catch (e) {}
    if (Array.isArray(assetsList)) {
      assetsList.forEach(a => {
        bytes += a && (a.size || a.blob && a.blob.size) || 0;
      });
    }
    if (thumbBlob && thumbBlob.size) bytes += thumbBlob.size;
    return bytes;
  };

  // 6.2 Create New Project
  const createProject = async (opts = {}) => {
    const now = Date.now();
    const projectId = opts.id || wsUid('proj');
    const documentId = opts.documentId || wsUid('doc');
    const name = String(opts.name || 'Untitled Project').trim() || 'Untitled Project';
    const rawDoc = opts.initialDoc && validateDocStructure(opts.initialDoc) ? opts.initialDoc : {
      viewBox: [0, 0, 800, 600],
      objects: []
    };
    const viewState = opts.viewState || {
      zoom: 1,
      pan: {
        x: 40,
        y: 40
      }
    };
    const {
      cleanDoc,
      newAssets
    } = await AssetManager.prepareDocumentForStorage(projectId, rawDoc);
    const thumbBlob = opts.thumbnail || (await ThumbnailGenerator.generateThumbnailBlob(rawDoc));
    const storageSize = estimateDocSize({
      data: cleanDoc
    }, newAssets, thumbBlob);
    const projectRecord = {
      id: projectId,
      name,
      type: 'geovanta-project',
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      documentId,
      thumbnail: thumbBlob,
      thumbnailRenderVer: 3,
      status: 'active',
      favorite: !!opts.favorite,
      revision: 1,
      storageSize
    };
    const documentRecord = {
      id: documentId,
      projectId,
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      revision: 1,
      data: cleanDoc,
      viewState,
      updatedAt: now
    };
    await WorkspaceDB.runTransaction(['projects', 'documents', 'assets'], 'readwrite', async stores => {
      for (const ast of newAssets) {
        await stores.assets.put(ast);
      }
      await stores.documents.put(documentRecord);
      await stores.projects.put(projectRecord);
    });
    return {
      project: projectRecord,
      document: documentRecord
    };
  };
  const getProject = async projectId => {
    if (!projectId) return null;
    return await WorkspaceDB.get('projects', projectId);
  };
  const getDocumentByProject = async project => {
    if (!project) return null;
    if (project.documentId) {
      const doc = await WorkspaceDB.get('documents', project.documentId);
      if (doc) return doc;
    }
    const docs = await WorkspaceDB.getAllByIndex('documents', 'projectId', project.id);
    return docs[0] || null;
  };

  // 6.1 List & Filter & Sort Projects
  const listProjects = async (opts = {}) => {
    const {
      filter = 'all',
      search = '',
      sortBy = 'updatedAt'
    } = opts;
    const all = await WorkspaceDB.getAll('projects');
    const q = String(search || '').trim().toLowerCase();
    let filtered = all.filter(p => {
      if (!p || p.type !== 'geovanta-project') return false;
      if (filter === 'trash') {
        if (p.status !== 'trash') return false;
      } else {
        if (p.status === 'trash') return false;
        if (filter === 'favorites' && !p.favorite) return false;
        if (filter === 'recent' && !p.lastOpenedAt) return false;
      }
      if (q && !String(p.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (filter === 'recent' && sortBy === 'updatedAt') {
        return (b.lastOpenedAt || b.updatedAt || 0) - (a.lastOpenedAt || a.updatedAt || 0);
      }
      switch (sortBy) {
        case 'lastOpenedAt':
          return (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0);
        case 'createdAt':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'nameAsc':
          return String(a.name || '').localeCompare(String(b.name || ''), 'id', {
            sensitivity: 'base'
          });
        case 'nameDesc':
          return String(b.name || '').localeCompare(String(a.name || ''), 'id', {
            sensitivity: 'base'
          });
        case 'updatedAt':
        default:
          return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
    });
    return filtered;
  };

  // 6.3 Open Project
  const openProject = async projectId => {
    const project = await getProject(projectId);
    if (!project) throw new Error('Proyek tidak ditemukan di database');
    const docRecord = await getDocumentByProject(project);
    if (!docRecord || !validateDocStructure(docRecord.data)) {
      throw new Error('Struktur dokumen proyek tidak valid atau rusak');
    }
    const assets = await AssetManager.getProjectAssets(projectId);
    const hydrated = await AssetManager.hydrateDocument(projectId, docRecord.data, assets);
    const now = Date.now();
    const updatedProject = {
      ...project,
      lastOpenedAt: now
    };
    await WorkspaceDB.put('projects', updatedProject);

    // Check crash recovery candidate (Section 9.3)
    const recoverySnapshot = await getRecoveryCandidate(projectId, docRecord.revision || project.revision || 1);
    return {
      project: updatedProject,
      documentRecord: docRecord,
      doc: hydrated.doc,
      viewState: docRecord.viewState || {
        zoom: 1,
        pan: {
          x: 40,
          y: 40
        }
      },
      missingAssets: hydrated.missingAssets,
      externalAssets: hydrated.externalAssets,
      recoverySnapshot
    };
  };

  // 6.4 Rename Project (Metadata only — never re-serializes vector objects)
  const renameProject = async (projectId, newName) => {
    const cleanName = String(newName || '').trim();
    if (!cleanName) throw new Error('Nama proyek tidak boleh kosong');
    return await WorkspaceDB.runTransaction(['projects'], 'readwrite', async stores => {
      const proj = await stores.projects.get(projectId);
      if (!proj) throw new Error('Proyek tidak ditemukan');
      const updated = {
        ...proj,
        name: cleanName,
        updatedAt: Date.now()
      };
      await stores.projects.put(updated);
      return updated;
    });
  };
  const toggleFavorite = async projectId => {
    return await WorkspaceDB.runTransaction(['projects'], 'readwrite', async stores => {
      const proj = await stores.projects.get(projectId);
      if (!proj) throw new Error('Proyek tidak ditemukan');
      const updated = {
        ...proj,
        favorite: !proj.favorite
      };
      await stores.projects.put(updated);
      return updated;
    });
  };

  // 6.5 Duplicate Project (Physical copy of all assets + remapped assetIds so deleting source never breaks copy)
  const duplicateProject = async projectId => {
    const srcProj = await getProject(projectId);
    if (!srcProj) throw new Error('Proyek sumber tidak ditemukan');
    const srcDoc = await getDocumentByProject(srcProj);
    if (!srcDoc) throw new Error('Dokumen proyek sumber tidak ditemukan');
    const srcAssets = await AssetManager.getProjectAssets(projectId);
    const now = Date.now();
    const newProjectId = wsUid('proj');
    const newDocumentId = wsUid('doc');
    const assetIdMap = new Map();
    const copiedAssets = srcAssets.map(a => {
      const newAssetId = wsUid('ast');
      assetIdMap.set(a.id, newAssetId);
      return {
        ...a,
        id: newAssetId,
        projectId: newProjectId,
        blob: a.blob ? new Blob([a.blob], {
          type: a.mimeType || a.blob.type || 'image/png'
        }) : a.blob,
        createdAt: now
      };
    });
    const clonedData = JSON.parse(JSON.stringify(srcDoc.data || {
      viewBox: [0, 0, 800, 600],
      objects: []
    }));
    clonedData.objects = (clonedData.objects || []).map(o => {
      const nextObj = {
        ...o,
        id: wsUid('obj')
      };
      if (nextObj.img && nextObj.img.assetId && assetIdMap.has(nextObj.img.assetId)) {
        nextObj.img = {
          ...nextObj.img,
          assetId: assetIdMap.get(nextObj.img.assetId)
        };
        delete nextObj.img.href;
      }
      return nextObj;
    });
    const thumbCopy = srcProj.thumbnail ? new Blob([srcProj.thumbnail], {
      type: srcProj.thumbnail.type || 'image/webp'
    }) : null;
    const newProj = {
      ...srcProj,
      id: newProjectId,
      name: `${srcProj.name} (Salinan)`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      documentId: newDocumentId,
      thumbnail: thumbCopy,
      status: 'active',
      revision: 1,
      storageSize: estimateDocSize({
        data: clonedData
      }, copiedAssets, thumbCopy)
    };
    const newDoc = {
      id: newDocumentId,
      projectId: newProjectId,
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      revision: 1,
      data: clonedData,
      viewState: srcDoc.viewState ? JSON.parse(JSON.stringify(srcDoc.viewState)) : {
        zoom: 1,
        pan: {
          x: 40,
          y: 40
        }
      },
      updatedAt: now
    };
    await WorkspaceDB.runTransaction(['projects', 'documents', 'assets'], 'readwrite', async stores => {
      for (const ca of copiedAssets) {
        await stores.assets.put(ca);
      }
      await stores.documents.put(newDoc);
      await stores.projects.put(newProj);
    });
    return newProj;
  };

  // 6.6 Delete Project (Two-stage: Move to Trash & Delete Permanently)
  const moveToTrash = async projectId => {
    return await WorkspaceDB.runTransaction(['projects'], 'readwrite', async stores => {
      const proj = await stores.projects.get(projectId);
      if (!proj) throw new Error('Proyek tidak ditemukan');
      const updated = {
        ...proj,
        status: 'trash',
        updatedAt: Date.now()
      };
      await stores.projects.put(updated);
      return updated;
    });
  };
  const restoreFromTrash = async projectId => {
    return await WorkspaceDB.runTransaction(['projects'], 'readwrite', async stores => {
      const proj = await stores.projects.get(projectId);
      if (!proj) throw new Error('Proyek tidak ditemukan');
      const updated = {
        ...proj,
        status: 'active',
        updatedAt: Date.now()
      };
      await stores.projects.put(updated);
      return updated;
    });
  };
  const deletePermanently = async projectId => {
    AssetManager.releaseProjectUrls(projectId);
    await WorkspaceDB.runTransaction(['projects', 'documents', 'assets', 'snapshots'], 'readwrite', async stores => {
      const proj = await stores.projects.get(projectId);
      if (proj && proj.documentId) {
        await stores.documents.delete(proj.documentId);
      }
      const docs = await stores.documents.getAllByIndex('projectId', projectId);
      for (const d of docs) await stores.documents.delete(d.id);
      const assets = await stores.assets.getAllByIndex('projectId', projectId);
      for (const a of assets) await stores.assets.delete(a.id);
      const snaps = await stores.snapshots.getAllByIndex('projectId', projectId);
      for (const s of snaps) await stores.snapshots.delete(s.id);
      await stores.projects.delete(projectId);
    });
    return true;
  };

  // 8. Save Document Revision & 9.2 Checkpoint Creation
  const saveDocumentRevision = async ({
    projectId,
    doc,
    viewState,
    expectedMinRevision = 0,
    createCheckpoint = false,
    thumbnail = undefined
  }) => {
    if (!projectId) throw new Error('projectId wajib diisi saat menyimpan revisi');
    const {
      cleanDoc,
      newAssets,
      externalWarnings
    } = await AssetManager.prepareDocumentForStorage(projectId, doc);
    const existingAssets = await AssetManager.getProjectAssets(projectId);
    const now = Date.now();
    return await WorkspaceDB.runTransaction(['projects', 'documents', 'assets', 'snapshots'], 'readwrite', async stores => {
      const proj = await stores.projects.get(projectId);
      if (!proj) throw new Error('Proyek tidak ditemukan saat menyimpan dokumen');
      const docRec = proj.documentId && (await stores.documents.get(proj.documentId)) || {
        id: proj.documentId || wsUid('doc'),
        projectId,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        revision: proj.revision || 1
      };
      const currentRev = Math.max(proj.revision || 1, docRec.revision || 1);
      if (expectedMinRevision && expectedMinRevision < currentRev) {
        // Stale save request — ignore to prevent overwriting newer data (Section 8.3)
        return {
          skipped: true,
          revision: currentRev,
          project: proj
        };
      }
      const nextRevision = currentRev + 1;
      for (const ast of newAssets) {
        await stores.assets.put(ast);
      }
      const nextThumb = thumbnail !== undefined ? thumbnail : proj.thumbnail;
      const allAssets = [...existingAssets, ...newAssets];
      const storageSize = estimateDocSize({
        data: cleanDoc
      }, allAssets, nextThumb);
      const updatedDoc = {
        ...docRec,
        projectId,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        revision: nextRevision,
        data: cleanDoc,
        viewState: viewState || docRec.viewState || {
          zoom: 1,
          pan: {
            x: 40,
            y: 40
          }
        },
        updatedAt: now
      };
      const updatedProj = {
        ...proj,
        documentId: updatedDoc.id,
        updatedAt: now,
        revision: nextRevision,
        thumbnail: nextThumb,
        thumbnailRenderVer: proj.thumbnailRenderVer || 3,
        storageSize
      };
      await stores.documents.put(updatedDoc);
      await stores.projects.put(updatedProj);
      if (createCheckpoint) {
        const snapRec = {
          id: wsUid('snap'),
          projectId,
          revision: nextRevision,
          type: 'autosave',
          savedAt: now,
          data: cleanDoc,
          viewState: updatedDoc.viewState
        };
        await stores.snapshots.put(snapRec);

        // Enforce retention policy: max MAX_SNAPSHOTS_PER_PROJECT per project (Section 4.4)
        const allSnaps = await stores.snapshots.getAllByIndex('projectId', projectId);
        allSnaps.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        for (let i = MAX_SNAPSHOTS_PER_PROJECT; i < allSnaps.length; i++) {
          await stores.snapshots.delete(allSnaps[i].id);
        }
      }
      return {
        skipped: false,
        revision: nextRevision,
        project: updatedProj,
        document: updatedDoc,
        externalWarnings
      };
    });
  };

  // Save standalone crash checkpoint (e.g. before unload / periodic checkpoint)
  const saveCrashCheckpoint = async (projectId, doc, viewState, baseRevision) => {
    if (!projectId || !doc) return null;
    const {
      cleanDoc,
      newAssets
    } = await AssetManager.prepareDocumentForStorage(projectId, doc);
    const now = Date.now();
    return await WorkspaceDB.runTransaction(['snapshots', 'assets'], 'readwrite', async stores => {
      for (const ast of newAssets) {
        await stores.assets.put(ast);
      }
      const snap = {
        id: wsUid('snap'),
        projectId,
        revision: (baseRevision || 1) + 1,
        type: 'autosave',
        savedAt: now,
        data: cleanDoc,
        viewState: viewState || {
          zoom: 1,
          pan: {
            x: 40,
            y: 40
          }
        }
      };
      await stores.snapshots.put(snap);
      const allSnaps = await stores.snapshots.getAllByIndex('projectId', projectId);
      allSnaps.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      for (let i = MAX_SNAPSHOTS_PER_PROJECT; i < allSnaps.length; i++) {
        await stores.snapshots.delete(allSnaps[i].id);
      }
      return snap;
    });
  };

  // Section 9.3: Find recovery checkpoint newer than main document
  const getRecoveryCandidate = async (projectId, mainRevision) => {
    const snaps = await WorkspaceDB.getAllByIndex('snapshots', 'projectId', projectId);
    if (!snaps || !snaps.length) return null;
    snaps.sort((a, b) => (b.revision || 0) - (a.revision || 0) || (b.savedAt || 0) - (a.savedAt || 0));
    const latest = snaps[0];
    if (!latest || !validateDocStructure(latest.data)) return null;
    if ((latest.revision || 0) > (mainRevision || 0)) {
      return latest;
    }
    return null;
  };
  const checkAllRecoveryCandidates = async () => {
    const projects = await listProjects({
      filter: 'all'
    });
    const candidates = [];
    for (const proj of projects) {
      const docRec = await getDocumentByProject(proj);
      const mainRev = Math.max(proj.revision || 1, docRec && docRec.revision || 1);
      const cand = await getRecoveryCandidate(proj.id, mainRev);
      if (cand) {
        candidates.push({
          project: proj,
          documentRecord: docRec,
          snapshot: cand
        });
      }
    }
    return candidates;
  };
  const restoreSnapshotToMain = async (projectId, snapshotId) => {
    const snap = await WorkspaceDB.get('snapshots', snapshotId);
    if (!snap || snap.projectId !== projectId || !validateDocStructure(snap.data)) {
      throw new Error('Checkpoint pemulihan tidak valid');
    }
    const thumb = await ThumbnailGenerator.generateThumbnailBlob(snap.data);
    const res = await saveDocumentRevision({
      projectId,
      doc: snap.data,
      viewState: snap.viewState,
      createCheckpoint: false,
      thumbnail: thumb
    });
    return res;
  };
  const discardNewerSnapshots = async (projectId, maxKeepRevision) => {
    await WorkspaceDB.runTransaction(['snapshots'], 'readwrite', async stores => {
      const snaps = await stores.snapshots.getAllByIndex('projectId', projectId);
      for (const s of snaps) {
        if ((s.revision || 0) > maxKeepRevision) {
          await stores.snapshots.delete(s.id);
        }
      }
    });
  };

  // Section 11: Storage Monitoring
  const getStorageStats = async () => {
    const [projects, assets] = await Promise.all([WorkspaceDB.getAll('projects'), WorkspaceDB.getAll('assets')]);
    let localUsedBytes = 0;
    projects.forEach(p => {
      localUsedBytes += p.storageSize || 0;
    });
    let usage = localUsedBytes;
    let quota = null;
    let persisted = false;
    let persistSupported = false;
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (typeof navigator.storage.estimate === 'function') {
        try {
          const est = await navigator.storage.estimate();
          if (est && typeof est.usage === 'number') usage = Math.max(usage, est.usage);
          if (est && typeof est.quota === 'number') quota = est.quota;
        } catch (e) {}
      }
      if (typeof navigator.storage.persisted === 'function') {
        persistSupported = true;
        try {
          persisted = !!(await navigator.storage.persisted());
        } catch (e) {}
      }
    }
    return {
      usageBytes: usage,
      localProjectBytes: localUsedBytes,
      quotaBytes: quota,
      projectCount: projects.filter(p => p.status !== 'trash').length,
      trashCount: projects.filter(p => p.status === 'trash').length,
      assetCount: assets.length,
      persisted,
      persistSupported
    };
  };
  const requestPersistentStorage = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      try {
        return !!(await navigator.storage.persist());
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  // Section 12.3: Export .geovanta Backup Archive
  const exportBackupBlob = async projectId => {
    const project = await getProject(projectId);
    if (!project) throw new Error('Proyek tidak ditemukan untuk diekspor');
    const docRecord = await getDocumentByProject(project);
    if (!docRecord || !validateDocStructure(docRecord.data)) {
      throw new Error('Dokumen proyek tidak valid untuk diekspor');
    }
    const {
      cleanDoc
    } = await AssetManager.prepareDocumentForStorage(projectId, docRecord.data);
    const projectAssets = await AssetManager.getProjectAssets(projectId);
    const assetMap = new Map(projectAssets.map(a => [a.id, a]));

    // Collect referenced asset IDs & validate
    const referencedAssetIds = new Set();
    for (const o of cleanDoc.objects || []) {
      if (o && o.img && o.img.assetId) {
        referencedAssetIds.add(o.img.assetId);
      }
    }
    const manifestAssets = [];
    const zipEntries = [];
    for (const assetId of referencedAssetIds) {
      const a = assetMap.get(assetId);
      if (!a || !a.blob) {
        throw new Error(`Aset yang direferensikan (${assetId}) tidak ditemukan di database`);
      }
      const ext = AssetManager.extFromMime(a.mimeType || a.blob.type);
      const filePath = `assets/${assetId}.${ext}`;
      const buf = new Uint8Array(await a.blob.arrayBuffer());
      manifestAssets.push({
        id: assetId,
        name: a.name || `${assetId}.${ext}`,
        file: filePath,
        mimeType: AssetManager.normalizeMime(a.mimeType || a.blob.type),
        size: buf.byteLength
      });
      zipEntries.push({
        name: filePath,
        data: buf
      });
    }
    const manifest = {
      format: 'GEOVANTA_PROJECT',
      formatVersion: 1,
      application: 'GEOVANTA',
      project: {
        name: project.name || 'Untitled Project',
        createdAt: project.createdAt || Date.now(),
        updatedAt: project.updatedAt || Date.now(),
        favorite: !!project.favorite
      },
      document: {
        file: 'document.json'
      },
      assets: manifestAssets
    };
    const docJsonPayload = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      revision: docRecord.revision || project.revision || 1,
      data: cleanDoc,
      viewState: docRecord.viewState || {
        zoom: 1,
        pan: {
          x: 40,
          y: 40
        }
      }
    };
    zipEntries.unshift({
      name: 'manifest.json',
      data: ZipEngine.encodeText(JSON.stringify(manifest, null, 2))
    }, {
      name: 'document.json',
      data: ZipEngine.encodeText(JSON.stringify(docJsonPayload, null, 2))
    });
    if (project.thumbnail && project.thumbnail.size > 0) {
      const thumbBytes = new Uint8Array(await project.thumbnail.arrayBuffer());
      zipEntries.push({
        name: 'thumbnail.webp',
        data: thumbBytes
      });
    }
    const blob = ZipEngine.createZipBlob(zipEntries);
    const safeFileName = (String(project.name || 'project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'project') + '.geovanta';
    return {
      blob,
      fileName: safeFileName,
      manifest
    };
  };

  // Section 12.4: Import .geovanta Backup Archive (Validate completely before writing transactionally)
  const importBackupBlob = async fileOrBlob => {
    if (!fileOrBlob) throw new Error('File backup tidak ditemukan');
    const MAX_BACKUP_BYTES = 150 * 1024 * 1024; // 150 MB safety cap
    if (fileOrBlob.size > MAX_BACKUP_BYTES) {
      throw new Error('Ukuran file .geovanta melebihi batas keamanan maksimum (150 MB)');
    }
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const entries = await ZipEngine.readZipBuffer(arrayBuffer);
    if (!entries.has('manifest.json')) {
      throw new Error('Arsip .geovanta tidak valid: manifest.json tidak ditemukan');
    }
    let manifest;
    try {
      manifest = JSON.parse(ZipEngine.decodeText(entries.get('manifest.json')));
    } catch (e) {
      throw new Error('Arsip .geovanta tidak valid: manifest.json rusak');
    }
    if (!manifest || manifest.format !== 'GEOVANTA_PROJECT' || manifest.application !== 'GEOVANTA' || typeof manifest.formatVersion !== 'number' || manifest.formatVersion < 1 || manifest.formatVersion > 1) {
      throw new Error('Format atau versi .geovanta tidak didukung');
    }
    const docFile = manifest.document && manifest.document.file || 'document.json';
    if (!entries.has(docFile)) {
      throw new Error(`File dokumen (${docFile}) tidak ditemukan di dalam arsip .geovanta`);
    }
    let parsedDocPayload;
    try {
      parsedDocPayload = JSON.parse(ZipEngine.decodeText(entries.get(docFile)));
    } catch (e) {
      throw new Error('Isi document.json di dalam arsip .geovanta tidak valid');
    }
    const rawDocData = parsedDocPayload && parsedDocPayload.data ? parsedDocPayload.data : parsedDocPayload;
    if (!validateDocStructure(rawDocData)) {
      throw new Error('Struktur geometri dokumen di dalam .geovanta tidak valid');
    }
    const now = Date.now();
    const newProjectId = wsUid('proj');
    const newDocumentId = wsUid('doc');
    const assetIdRemap = new Map();
    const validAssetRecords = [];
    const manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
    for (const ma of manifestAssets) {
      if (!ma || !ma.id || !ma.file) {
        throw new Error('Entri aset pada manifest.json tidak lengkap');
      }
      if (!entries.has(ma.file)) {
        throw new Error(`File aset "${ma.file}" yang terdaftar di manifest tidak ditemukan dalam arsip`);
      }
      const mimeType = AssetManager.normalizeMime(ma.mimeType, ma.file);
      if (!ALLOWED_ASSET_MIMES.has(mimeType)) {
        throw new Error(`Tipe MIME aset tidak diizinkan: ${ma.mimeType}`);
      }
      const bytes = entries.get(ma.file);
      const newAssetId = wsUid('ast');
      assetIdRemap.set(ma.id, newAssetId);
      const blob = new Blob([bytes], {
        type: mimeType
      });
      validAssetRecords.push({
        id: newAssetId,
        projectId: newProjectId,
        name: ma.name || ma.file.split('/').pop() || `${newAssetId}.png`,
        mimeType,
        size: bytes.byteLength,
        blob,
        createdAt: now
      });
    }

    // Verify all referenced assetIds in document exist in manifest
    const remappedObjects = (rawDocData.objects || []).map(o => {
      if (!o || typeof o !== 'object') throw new Error('Objek dokumen tidak valid');
      const nextObj = {
        ...o,
        id: o.id || wsUid('obj')
      };
      if (nextObj.img && nextObj.img.assetId) {
        const mappedId = assetIdRemap.get(nextObj.img.assetId);
        if (!mappedId) {
          throw new Error(`Referensi aset "${nextObj.img.assetId}" tidak valid atau tidak ada di arsip`);
        }
        nextObj.img = {
          assetId: mappedId,
          w: Number(nextObj.img.w) || 100,
          h: Number(nextObj.img.h) || 100,
          par: nextObj.img.par || 'none'
        };
      }
      return nextObj;
    });
    const cleanDoc = {
      ...rawDocData,
      viewBox: rawDocData.viewBox.map(Number),
      objects: remappedObjects
    };
    let thumbBlob = null;
    if (entries.has('thumbnail.webp')) {
      thumbBlob = new Blob([entries.get('thumbnail.webp')], {
        type: 'image/webp'
      });
    } else {
      thumbBlob = await ThumbnailGenerator.generateThumbnailBlob(cleanDoc);
    }
    const projName = String(manifest.project && manifest.project.name || 'Imported Project').trim() || 'Imported Project';
    const storageSize = estimateDocSize({
      data: cleanDoc
    }, validAssetRecords, thumbBlob);
    const projectRecord = {
      id: newProjectId,
      name: projName,
      type: 'geovanta-project',
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      createdAt: manifest.project && Number(manifest.project.createdAt) || now,
      updatedAt: now,
      lastOpenedAt: now,
      documentId: newDocumentId,
      thumbnail: thumbBlob,
      thumbnailRenderVer: 3,
      status: 'active',
      favorite: !!(manifest.project && manifest.project.favorite),
      revision: 1,
      storageSize
    };
    const documentRecord = {
      id: newDocumentId,
      projectId: newProjectId,
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      revision: 1,
      data: cleanDoc,
      viewState: parsedDocPayload && parsedDocPayload.viewState || {
        zoom: 1,
        pan: {
          x: 40,
          y: 40
        }
      },
      updatedAt: now
    };

    // Transactional write (Section 12.4 step 8)
    await WorkspaceDB.runTransaction(['projects', 'documents', 'assets'], 'readwrite', async stores => {
      for (const aRec of validAssetRecords) {
        await stores.assets.put(aRec);
      }
      await stores.documents.put(documentRecord);
      await stores.projects.put(projectRecord);
    });
    return {
      project: projectRecord,
      document: documentRecord,
      assetCount: validAssetRecords.length
    };
  };
  return {
    validateDocStructure,
    createProject,
    getProject,
    getDocumentByProject,
    listProjects,
    openProject,
    renameProject,
    toggleFavorite,
    duplicateProject,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    saveDocumentRevision,
    saveCrashCheckpoint,
    getRecoveryCandidate,
    checkAllRecoveryCandidates,
    restoreSnapshotToMain,
    discardNewerSnapshots,
    getStorageStats,
    requestPersistentStorage,
    exportBackupBlob,
    importBackupBlob
  };
})();

/* ============================================================================
   GEOVANTA WORKSPACE — CONTROLLER, UI & ROUTER LAYER (PHASE 4, 5, 6, 8, 9, 11, 14)
   Modules:
   1. WorkspaceController — Autosave Scheduler (700ms debounce), Save Queue,
                            Flush on Navigation/VisibilityChange/PageHide,
                            Import as Project (.geovanta, SVG, AI/EPS/PS/PDF, Raster)
   2. WorkspaceUI         — Workspace Home, Header, Navigation Tabs, Search/Sort,
                            Project Grid & Cards, Create/Rename/Delete/Import/Storage/
                            Recovery/Quota Modals
   ============================================================================ */

export { ProjectRepository };
export default ProjectRepository;
