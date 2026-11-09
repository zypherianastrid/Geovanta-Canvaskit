/**
 * @file src/App.jsx
 * @description Komponen akar aplikasi Geovanta yang menghubungkan WorkspaceHome, VectorEditor, & modal global
 */
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { loadPrefs, applyTheme, applyMotion, applyAccent, savePrefs } from './utils/themeAndPrefsManager.jsx';
import { WorkspaceDB } from './workspace/workspaceDb.jsx';
import { ProjectRepository } from './workspace/projectRepository.jsx';
import { WorkspaceController } from './workspace/workspaceController.jsx';
import { AssetManager } from './workspace/assetManager.jsx';
import { WS_LAST_PROJECT_KEY } from './constants/workspaceConstants.jsx';
import { formatDateTimeFull } from './utils/zoomAndFormatHelpers.jsx';
import { WorkspaceHome } from './components/workspace/WorkspaceHome.jsx';
import { VectorEditor } from './components/editor/VectorEditor.jsx';
import { Ico } from './components/ui/IconGlyphs.jsx';
import { VE } from './engine/vectorEngine.jsx';
import { CustomTextBox } from './components/ui/CustomTextBox.jsx';
import { TipHost } from './components/modals/TooltipHost.jsx';
import { Help } from './components/modals/HelpShortcutsModal.jsx';
import { Settings } from './components/modals/SettingsModal.jsx';
import { getAppStr, translateToast } from './constants/appI18n.jsx';

function App() {
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const L = getAppStr(prefs.lang);
  useEffect(() => {
    applyTheme(prefs.theme);
    applyMotion(prefs.motion);
    applyAccent(prefs.accent);
  }, [prefs.accent]);
  useEffect(() => {
    if (prefs.persist) savePrefs(prefs);
  }, [prefs]);
  const [help, setHelp] = useState(false),
    [settings, setSettings] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(0);
  const flash = t => {
    setToast(t);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2400);
  };

  /* Section 14: Application Router State ({ screen: "workspace" | "editor", activeProjectId }) */
  const [navState, setNavState] = useState({
    screen: 'workspace',
    activeProjectId: null
  });
  const [activeProject, setActiveProject] = useState(null);
  const [activeDoc, setActiveDoc] = useState(null);
  const [activeViewState, setActiveViewState] = useState({
    zoom: 1,
    pan: {
      x: 40,
      y: 40
    }
  });
  const [saveStatus, setSaveStatus] = useState('saved');

  /* Crash Recovery & Quota Modals */
  const [recoveryCandidates, setRecoveryCandidates] = useState([]);
  const [recoveryDialog, setRecoveryDialog] = useState(null); // { project, documentRecord, snapshot }
  const [quotaErrorInfo, setQuotaErrorInfo] = useState(null); // { projectId, doc, error }
  const [unsavedNavDialog, setUnsavedNavDialog] = useState(null); // GV-A01: { projectId, targetAction, targetProjectId, error }
  const [editorRenameOpen, setEditorRenameOpen] = useState(false);
  const [editorRenameDraft, setEditorRenameDraft] = useState('');
  const latestEditorDocRef = useRef(null);
  const latestEditorViewRef = useRef({
    zoom: 1,
    pan: {
      x: 40,
      y: 40
    }
  });
  const activeProjectIdRef = useRef(null);
  activeProjectIdRef.current = navState.activeProjectId;

  // Initialize database & check crash recovery candidates on app startup
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await WorkspaceDB.open();
        const cands = await ProjectRepository.checkAllRecoveryCandidates();
        if (mounted && cands.length > 0) {
          setRecoveryCandidates(cands);
          setRecoveryDialog(cands[0]);
        }
      } catch (e) {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Subscribe to WorkspaceController save status & quota errors
  useEffect(() => {
    const unsubStatus = WorkspaceController.onSaveStatusChange(st => setSaveStatus(st));
    const unsubQuota = WorkspaceController.onQuotaError(info => {
      setQuotaErrorInfo(info);
      flash('Penyimpanan browser penuh (QuotaExceededError) — proyek sebelumnya tetap aman');
    });
    return () => {
      unsubStatus();
      unsubQuota();
    };
  }, []);

  // Section 8.4: Best-effort flush & crash checkpoint on visibilitychange and pagehide
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'hidden' && activeProjectIdRef.current && latestEditorDocRef.current) {
        WorkspaceController.flushAutosave({
          projectId: activeProjectIdRef.current,
          doc: latestEditorDocRef.current,
          viewState: latestEditorViewRef.current,
          forceCheckpoint: true,
          forceThumb: false
        });
      }
    };
    const onPageHide = () => {
      if (activeProjectIdRef.current && latestEditorDocRef.current) {
        WorkspaceController.flushAutosave({
          projectId: activeProjectIdRef.current,
          doc: latestEditorDocRef.current,
          viewState: latestEditorViewRef.current,
          forceCheckpoint: true,
          forceThumb: false
        });
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // GV-A01: Open project handler with strict flush verification before switching or releasing assets
  const handleOpenProject = async (projectId, forceDiscard = false) => {
    try {
      if (activeProjectIdRef.current && activeProjectIdRef.current !== projectId && !forceDiscard) {
        const flushRes = await WorkspaceController.flushAutosave({
          projectId: activeProjectIdRef.current,
          doc: latestEditorDocRef.current,
          viewState: latestEditorViewRef.current,
          forceThumb: true
        });
        if (flushRes && !flushRes.ok) {
          setUnsavedNavDialog({
            projectId: activeProjectIdRef.current,
            targetAction: 'open-project',
            targetProjectId: projectId,
            error: flushRes.error
          });
          flash('Gagal menyimpan perubahan proyek aktif — navigasi ditahan agar pekerjaan tidak hilang');
          return false;
        }
        AssetManager.releaseProjectUrls(activeProjectIdRef.current);
      } else if (activeProjectIdRef.current && activeProjectIdRef.current !== projectId && forceDiscard) {
        AssetManager.releaseProjectUrls(activeProjectIdRef.current);
      }
      const opened = await ProjectRepository.openProject(projectId);
      try {
        localStorage.setItem(WS_LAST_PROJECT_KEY, projectId);
      } catch (e) {}
      latestEditorDocRef.current = opened.doc;
      latestEditorViewRef.current = opened.viewState || {
        zoom: 1,
        pan: {
          x: 40,
          y: 40
        }
      };
      setActiveProject(opened.project);
      setActiveDoc(opened.doc);
      setActiveViewState(opened.viewState || {
        zoom: 1,
        pan: {
          x: 40,
          y: 40
        }
      });
      WorkspaceController.resetSessionState(opened.recoverySnapshot ? 'recovery' : 'saved');
      setNavState({
        screen: 'editor',
        activeProjectId: projectId
      });
      if (opened.recoverySnapshot) {
        setRecoveryDialog({
          project: opened.project,
          documentRecord: opened.documentRecord,
          snapshot: opened.recoverySnapshot
        });
      }
      if (opened.missingAssets && opened.missingAssets.length > 0) {
        flash(`Peringatan: ${opened.missingAssets.length} aset gambar tidak ditemukan di database lokal`);
      } else if (opened.externalAssets && opened.externalAssets.length > 0) {
        flash(`Info: Proyek memiliki ${opened.externalAssets.length} tautan gambar eksternal yang belum tertanam lokal`);
      }
    } catch (err) {
      flash('Gagal membuka proyek: ' + (err && err.message || 'kesalahan tidak dikenal'));
    }
  };

  // GV-A01: Back to Workspace handler — blocks navigation and preserves Object URLs if flushAutosave fails
  const handleBackToWorkspace = async (currentDoc, currentViewState, forceDiscard = false) => {
    const pid = activeProjectIdRef.current;
    if (pid && !forceDiscard) {
      let flushRes = {
        ok: false,
        error: null
      };
      try {
        flushRes = await WorkspaceController.flushAutosave({
          projectId: pid,
          doc: currentDoc || latestEditorDocRef.current,
          viewState: currentViewState || latestEditorViewRef.current,
          forceThumb: true
        });
      } catch (err) {
        flushRes = {
          ok: false,
          error: err
        };
      }
      if (flushRes && !flushRes.ok) {
        setUnsavedNavDialog({
          projectId: pid,
          targetAction: 'workspace',
          targetProjectId: null,
          error: flushRes.error
        });
        flash('Gagal menyimpan proyek — tetap di editor agar perubahan tidak hilang');
        return false;
      }
      AssetManager.releaseProjectUrls(pid);
    } else if (pid && forceDiscard) {
      AssetManager.releaseProjectUrls(pid);
    }
    latestEditorDocRef.current = null;
    setActiveProject(null);
    setActiveDoc(null);
    setNavState({
      screen: 'workspace',
      activeProjectId: null
    });
    const cands = await ProjectRepository.checkAllRecoveryCandidates().catch(() => []);
    setRecoveryCandidates(cands);
    return true;
  };

  // Called by VectorEditor on every permanent commit (push, replaceTop, undo, redo)
  const handleDocumentCommit = (nextDoc, nextViewState) => {
    latestEditorDocRef.current = nextDoc;
    if (nextViewState) latestEditorViewRef.current = nextViewState;
    const pid = activeProjectIdRef.current;
    if (pid) {
      WorkspaceController.scheduleAutosave(pid, nextDoc, nextViewState || latestEditorViewRef.current);
    }
  };
  const handleRestoreRecovery = async () => {
    if (!recoveryDialog) return;
    const {
      project,
      snapshot
    } = recoveryDialog;
    try {
      await ProjectRepository.restoreSnapshotToMain(project.id, snapshot.id);
      await ProjectRepository.discardNewerSnapshots(project.id, snapshot.revision + 10);
      setRecoveryDialog(null);
      const cands = await ProjectRepository.checkAllRecoveryCandidates();
      setRecoveryCandidates(cands);
      flash(`Proyek "${project.name}" berhasil dipulihkan ke checkpoint (${formatDateTimeFull(snapshot.savedAt, prefs.lang)})`);
      if (navState.screen === 'editor' && navState.activeProjectId === project.id) {
        await handleOpenProject(project.id);
      }
    } catch (err) {
      flash('Gagal memulihkan checkpoint: ' + (err && err.message || ''));
    }
  };
  const handleIgnoreRecovery = async () => {
    if (!recoveryDialog) return;
    const {
      project,
      documentRecord
    } = recoveryDialog;
    try {
      const mainRev = Math.max(project.revision || 1, documentRecord && documentRecord.revision || 1);
      await ProjectRepository.discardNewerSnapshots(project.id, mainRev);
      setRecoveryDialog(null);
      const cands = await ProjectRepository.checkAllRecoveryCandidates();
      setRecoveryCandidates(cands);
      if (navState.screen === 'editor') setSaveStatus('saved');
      flash('Checkpoint pemulihan diabaikan — menggunakan versi utama yang tersimpan');
    } catch (err) {
      setRecoveryDialog(null);
    }
  };
  const handleEditorRenameSubmit = async () => {
    if (!activeProject) return;
    const clean = String(editorRenameDraft || '').trim();
    if (!clean) {
      flash('Nama proyek tidak boleh kosong');
      return;
    }
    try {
      const updated = await ProjectRepository.renameProject(activeProject.id, clean);
      setActiveProject(updated);
      setEditorRenameOpen(false);
      flash(`Nama proyek disimpan: "${clean}"`);
    } catch (err) {
      flash('Gagal mengganti nama proyek');
    }
  };
  useEffect(() => {
    const kd = e => {
      const t = e.target,
        typing = !!(t && t.closest && t.closest('[data-custom-input="true"],[role="textbox"],[contenteditable="true"]'));
      if (help) {
        if (e.key === 'Escape' || e.key === '?') {
          e.preventDefault();
          setHelp(false);
        }
        return;
      }
      if (settings) {
        if (e.key === 'Escape' && document.querySelector('.flt')) return;
        if (e.key === 'Escape' || e.key === ',') {
          e.preventDefault();
          setSettings(false);
        }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === ',') {
        e.preventDefault();
        setSettings(s => !s);
      }
    };
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, [help, settings]);
  return <div className="app-ws app-full"><div className="mx-auto ws-fin"><div className="ws-body">{navState.screen === 'workspace' ? <div className="fade ws-fill" style={{
          display: 'flex'
        }}><WorkspaceHome onOpenProject={handleOpenProject} onSettings={() => setSettings(true)} onHelp={() => setHelp(true)} flash={flash} lang={prefs.lang} recoveryCandidates={recoveryCandidates} onResolveRecovery={rc => setRecoveryDialog(rc)} /></div> : <div className="fade ws-fill" style={{
          display: 'flex'
        }}><VectorEditor key={navState.activeProjectId || 'default-editor'} initialSvg={null} initialDoc={activeDoc} initialViewState={activeViewState} projectId={navState.activeProjectId} projectName={activeProject ? activeProject.name : 'Untitled Project'} saveStatus={saveStatus} onDocumentCommit={handleDocumentCommit} onBackToWorkspace={handleBackToWorkspace} onRenameProject={() => {
            setEditorRenameDraft(activeProject ? activeProject.name : 'Untitled Project');
            setEditorRenameOpen(true);
          }} onExportBackup={async () => {
            if (!navState.activeProjectId) return;
            await WorkspaceController.flushAutosave({
              projectId: navState.activeProjectId,
              doc: latestEditorDocRef.current,
              viewState: latestEditorViewRef.current,
              forceThumb: true
            });
            const fname = await WorkspaceController.triggerBackupDownload(navState.activeProjectId);
            if (fname) flash(`Backup "${fname}" berhasil diunduh`);
          }} onRetrySave={() => WorkspaceController.retryFailedSave()} flash={flash} active={true} full={true} prefs={prefs} onHelp={() => setHelp(true)} onSettings={() => setSettings(true)} /></div>}</div></div>{recoveryDialog && ReactDOM.createPortal(<div className="ov in"><div className="hp" role="dialog" aria-label={L.appDlgRecovery} style={{
        maxWidth: 460
      }}><div className="flex items-center gap-2.5 mb-2"><span className="inline-flex items-center justify-center w-9 h-9 rounded-xl" style={{
            background: 'rgba(245, 158, 11, 0.16)',
            color: '#f59e0b'
          }}><Ico n="refresh" size={18} /></span><div><div className="text-sm font-semibold">{L.appRecoveryTitle}</div><div className="text-[11px] mut">{L.appProject} <b>{recoveryDialog.project.name}</b></div></div></div><div className="text-xs mut leading-relaxed mb-3">{L.appRecoveryQ}</div><div className="space-y-1.5 text-xs mb-4"><div className="ws-stat-row"><span className="mut">{L.appLastCheckpoint}</span><span className="font-mono font-semibold" style={{
              color: 'var(--acc)'
            }}>{formatDateTimeFull(recoveryDialog.snapshot.savedAt, prefs.lang)}</span></div><div className="ws-stat-row"><span className="mut">{L.appLastMainSave}</span><span className="font-mono">{formatDateTimeFull(recoveryDialog.project.updatedAt, prefs.lang)}</span></div><div className="ws-stat-row"><span className="mut">{L.appCheckpointVsMain}</span><span className="font-mono">Rev #{recoveryDialog.snapshot.revision} vs Rev #{recoveryDialog.project.revision || 1}</span></div></div><div className="flex justify-end gap-2"><button type="button" className="btn sec text-xs px-3.5 py-2" onClick={handleIgnoreRecovery}>{L.appIgnoreOld}</button><button type="button" className="btn pri text-xs px-4 py-2" onClick={handleRestoreRecovery}><Ico n="check" size={14} /><span>Restore Checkpoint</span></button></div></div></div>, document.body)}{unsavedNavDialog && ReactDOM.createPortal(<div className="ov in"><div className="hp" role="dialog" aria-label={L.appDlgUnsaved} style={{
        maxWidth: 460
      }}><div className="flex items-center justify-between mb-2"><div className="text-sm font-semibold text-red-400">{L.appSaveFailed}</div><button type="button" data-tip="uiClose" className="btn sec" style={{
            padding: 0,
            width: 28,
            height: 28,
            borderRadius: '50%'
          }} onClick={() => setUnsavedNavDialog(null)}><Ico n="x" size={13} /></button></div><div className="text-xs mut leading-relaxed mb-4">{L.appUnsavedA}{unsavedNavDialog.error && unsavedNavDialog.error.message ? unsavedNavDialog.error.message : L.appSaveErrorFallback}{L.appUnsavedB}</div><div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn sec text-xs px-3 py-2" onClick={() => setUnsavedNavDialog(null)}>{L.appStayEditor}</button><button type="button" className="btn sec text-xs px-3 py-2" onClick={async () => {
            try {
              const docToSave = latestEditorDocRef.current;
              if (docToSave) {
                const svgStr = VE.serializeDoc(docToSave, {});
                const blob = new Blob([svgStr], {
                  type: 'image/svg+xml;charset=utf-8'
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = (activeProject && activeProject.name || 'recovery') + '-recovery.svg';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2500);
                flash('Berkas pemulihan darurat (.svg) berhasil diunduh');
              }
            } catch (e) {}
          }}><Ico n="download" size={13} /><span>{L.appEmergency}</span></button><button type="button" className="btn pri text-xs px-4 py-2" onClick={async () => {
            const res = await WorkspaceController.retryFailedSave();
            if (res && res.ok) {
              const act = unsavedNavDialog.targetAction;
              const tPid = unsavedNavDialog.targetProjectId;
              setUnsavedNavDialog(null);
              if (act === 'open-project' && tPid) await handleOpenProject(tPid);else await handleBackToWorkspace(latestEditorDocRef.current, latestEditorViewRef.current);
            } else {
              flash('Penyimpanan masih gagal — silakan unduh pemulihan darurat terlebih dahulu');
            }
          }}><Ico n="refresh" size={13} /><span>{L.appRetrySave2}</span></button></div></div></div>, document.body)}{quotaErrorInfo && ReactDOM.createPortal(<div className="ov in"><div className="hp" role="dialog" aria-label={L.appDlgQuota} style={{
        maxWidth: 460
      }}><div className="flex items-center justify-between mb-2"><div className="text-sm font-semibold text-red-400">{L.appQuotaTitle}</div><button type="button" data-tip="uiClose" className="btn sec" style={{
            padding: 0,
            width: 28,
            height: 28,
            borderRadius: '50%'
          }} onClick={() => setQuotaErrorInfo(null)}><Ico n="x" size={13} /></button></div><div className="text-xs mut leading-relaxed mb-4">{L.appQuotaBody} <b>{L.appRecoveryBody}</b> {L.appExportHint} <code>.geovanta</code> {L.appQuotaTail}</div><div className="flex flex-wrap justify-end gap-2">{quotaErrorInfo.projectId && <button type="button" className="btn sec text-xs px-3 py-2" onClick={async () => {
            try {
              await WorkspaceController.triggerBackupDownload(quotaErrorInfo.projectId);
            } catch (e) {}
          }}><Ico n="download" size={13} /><span>Export Backup (.geovanta)</span></button>}<button type="button" className="btn sec text-xs px-3 py-2" onClick={() => {
            setQuotaErrorInfo(null);
            setNavState({
              screen: 'workspace',
              activeProjectId: null
            });
          }}>{L.appManageDelete}</button><button type="button" className="btn pri text-xs px-4 py-2" onClick={async () => {
            setQuotaErrorInfo(null);
            await WorkspaceController.retryFailedSave();
          }}><Ico n="refresh" size={13} /><span>{L.appRetrySave}</span></button></div></div></div>, document.body)}{editorRenameOpen && ReactDOM.createPortal(<div className="ov in" onPointerDown={e => {
      if (e.target === e.currentTarget) setEditorRenameOpen(false);
    }}><div className="hp" role="dialog" aria-label={L.appDlgRename} style={{
        maxWidth: 400
      }}><div className="flex items-center justify-between mb-3"><div className="text-sm font-semibold">{L.wsRename}</div><button type="button" data-tip="uiClose" className="btn sec" style={{
            padding: 0,
            width: 28,
            height: 28,
            borderRadius: '50%'
          }} onClick={() => setEditorRenameOpen(false)}><Ico n="x" size={13} /></button></div><div className="space-y-3"><div className="fld px-2.5 py-1.5"><CustomTextBox value={editorRenameDraft} autoFocus={true} ariaLabel="Nama Proyek" onChange={setEditorRenameDraft} onCommit={v => setEditorRenameDraft(v)} /></div><div className="flex justify-end gap-2"><button type="button" className="btn sec text-xs px-3 py-1.5" onClick={() => setEditorRenameOpen(false)}>{L.cCancel}</button><button type="button" className="btn pri text-xs px-4 py-1.5" onClick={handleEditorRenameSubmit}>{L.wsSaveName}</button></div></div></div></div>, document.body)}<div className="fixed left-1/2 bottom-24 lg:bottom-6 px-4 py-2 rounded-full text-xs text-white max-w-[92vw] text-center" style={{
      background: '#18181b',
      zIndex: 120,
      transform: `translateX(-50%) translateY(${toast ? 0 : 20}px)`,
      opacity: toast ? 1 : 0,
      transition: 'all .3s',
      pointerEvents: 'none'
    }}>{translateToast(toast, prefs.lang)}</div>{prefs.tips !== false && <TipHost />}<Help open={help} onClose={() => setHelp(false)} lang={prefs.lang} /><Settings open={settings} onClose={() => setSettings(false)} prefs={prefs} setPrefs={setPrefs} flash={flash} /></div>;
}

export { App };
export default App;
