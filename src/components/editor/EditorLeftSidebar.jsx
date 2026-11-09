/**
 * @file src/components/editor/EditorLeftSidebar.jsx
 * @description Komponen sidebar kiri: header proyek, pohon layer, & panel alat kontekstual (EditorLeftSidebar)
 */
import React from 'react';
import { LOGO_INNER } from '../../constants/brandAndIcons.jsx';
import { Ico, Vi } from '../ui/IconGlyphs.jsx';
import { ColorField } from '../ui/ColorPickerField.jsx';
import { Range } from '../ui/RangeField.jsx';
import { VE } from '../../engine/vectorEngine.jsx';
import { Seg } from '../ui/SegmentedControl.jsx';
import { Select } from '../ui/SelectDropdown.jsx';
import { XfField } from '../ui/TransformField.jsx';
import { clampN } from '../../utils/colorMath.jsx';
import { LayerTreeViewport } from './LayerTreeViewport.jsx';
import { LayerObjRow, LayerGroupRow, LayerBucketRow, LayerEmptyRow } from './LayerRows.jsx';

const FLAT_ID_MAP_CACHE = new WeakMap();
const getFlatIdMap = flatIds => {
  let m = FLAT_ID_MAP_CACHE.get(flatIds);
  if (!m) {
    m = new Map();
    for (let i = 0, L = flatIds.length; i < L; i++) m.set(flatIds[i], i);
    FLAT_ID_MAP_CACHE.set(flatIds, m);
  }
  return m;
};
const EditorLeftSidebar = ({
  L,
  onBackToWorkspace,
  docRef,
  zoomRef,
  panRef,
  saveStatus,
  onRetrySave,
  onRenameProject,
  projectName,
  doc,
  nTotal,
  sel,
  selNodes,
  createFrameSel,
  groupSel,
  clipFrames,
  setClipFrames,
  groupSameColor,
  setGroupSameColor,
  layerScrollRef,
  layerTreeDomRef,
  layerViewportCtrlRef,
  tool,
  pen,
  penSty,
  setPenSty,
  penRef,
  commitObjs,
  finishPen,
  selObjs,
  autoSel,
  autoAll,
  ahOpt,
  setAhOpt,
  primary,
  alOpt,
  setAlOpt,
  applyNodeAngleAlign,
  selHandles,
  applyStraight,
  applyAutoRefine,
  applyPruneNodes,
  pruneOpt,
  setPruneOpt,
  sOpt,
  setSOpt,
  vcSimp,
  vcSimpRetain,
  openVcSimplify,
  triggerAutoSimplifyLevel,
  openVcMoreOptions,
  updateVcSimplify,
  cancelVcSimplify,
  confirmVcSimplify,
  virtualLayerRows,
  dragLayerIds,
  moveObjsToGroup,
  setDragLayerIds,
  setOverFrameId,
  layerAnchor,
  layerFlatIds,
  setSel,
  setLayerIns,
  renameVal,
  setRenameVal,
  renameSkip,
  setRenamingId,
  renamingId,
  layerIns,
  openLayerCtx,
  overFrameId,
  reorderLayerTo,
  layerClickSkipExpandRef,
  commitRename,
  say,
  dropFrameId,
  toggleCollapseGrp,
  ungroupIds,
  rzProps
}) => {
  /* PERF: handler baris layer didefinisikan sekali di body komponen (bukan di
     dalam renderRowFn yang dipanggil per baris) agar identitasnya stabil
     selama scroll — syarat agar React.memo di LayerRows.jsx menahan
     re-render baris yang bertahan di window virtualisasi. */
  const pick = (ids, e, allOn) => {
    if (e.shiftKey && layerAnchor.current) {
      const idxMap = getFlatIdMap(layerFlatIds);
      const ai = idxMap.get(layerAnchor.current);
      if (ai !== undefined) {
        let lo = ai, hi = ai, found = false;
        for (let i = 0, L = ids.length; i < L; i++) {
          const bi = idxMap.get(ids[i]);
          if (bi !== undefined) {
            if (bi < lo) lo = bi;
            if (bi > hi) hi = bi;
            found = true;
          }
        }
        if (found) {
          const objs = new Set(e.ctrlKey || e.metaKey ? sel.objs : []);
          for (let k = lo; k <= hi; k++) objs.add(layerFlatIds[k]);
          setSel({ objs, nodes: new Set() });
          return;
        }
      }
    }
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    const objs = multi ? new Set(sel.objs) : new Set();
    for (let i = 0, L = ids.length; i < L; i++) {
      const id = ids[i];
      if (multi && allOn) objs.delete(id); else objs.add(id);
    }
    layerAnchor.current = ids[0] || null;
    setSel({ objs, nodes: new Set() });
  };
  const dStart = (e, ids) => {
    e.stopPropagation();
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ids.join(','));
    } catch (x) {}
    setDragLayerIds(ids);
  };
  const dEnd = () => {
    setDragLayerIds(null);
    setOverFrameId(null);
    setLayerIns(null);
  };
  const rowDragOver = (e, o) => {
    if (!dragLayerIds || dragLayerIds.includes(o.id)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect(),
      pos = e.clientY - r.top < r.height / 2 ? 'top' : 'bot';
    if (!layerIns || layerIns.id !== o.id || layerIns.pos !== pos) setLayerIns({ id: o.id, pos });
    if (overFrameId) setOverFrameId(null);
  };
  const rowDragLeave = (e, o) => {
    if (!e.currentTarget.contains(e.relatedTarget) && layerIns && layerIns.id === o.id) setLayerIns(null);
  };
  const rowDrop = (e, o) => {
    if (!dragLayerIds) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    reorderLayerTo(dragLayerIds, o, e.clientY - r.top < r.height / 2 ? 'top' : 'bot');
    setDragLayerIds(null);
    setOverFrameId(null);
    setLayerIns(null);
  };
  const groupDragOver = (e, item) => {
    if (!dragLayerIds) return;
    e.preventDefault();
    e.stopPropagation();
    setOverFrameId(item.id);
  };
  const groupDragLeave = (e, item) => {
    if (!e.currentTarget.contains(e.relatedTarget) && overFrameId === item.id) setOverFrameId(null);
  };
  const groupDrop = (e, item) => {
    if (!dragLayerIds) return;
    e.preventDefault();
    e.stopPropagation();
    moveObjsToGroup(dragLayerIds, item.id);
    setDragLayerIds(null);
    setOverFrameId(null);
  };
  const toggleObjLock = o => commitObjs(q => q.id === o.id ? { ...q, locked: !q.locked } : q);
  const toggleObjHide = o => commitObjs(q => q.id === o.id ? { ...q, hidden: !q.hidden } : q);
  const ejectChild = o => moveObjsToGroup([o.id], null);
  const toggleGroupLock = (item, allLocked) => commitObjs(q => q.group === item.id ? { ...q, locked: !allLocked } : q);
  const toggleGroupHide = (item, allHidden) => commitObjs(q => q.group === item.id ? { ...q, hidden: !allHidden } : q);
  const ungroup = item => ungroupIds(new Set([item.id]), (item.isFrame ? 'Frame "' : L.edGroupWord + ' "') + item.id + '"');
  const bgClick = bgId => setSel({ objs: new Set([bgId]), nodes: new Set() });
  const startRenameObj = o => {
    renameSkip.current = false;
    setRenamingId(o.id);
    setRenameVal(o.name);
  };
  const startRenameGroup = (gKey, id) => {
    renameSkip.current = false;
    setRenamingId(gKey);
    setRenameVal(id);
  };
  const renameCancel = () => {
    renameSkip.current = true;
    setRenamingId(null);
  };
  const renameCommitObj = (o, v) => commitRename(o.id, false, v);
  const renameCommitGroup = (id, v) => commitRename(id, true, v);
  const bucketPick = (bucket, e, bucketSel) => {
    layerClickSkipExpandRef.current = true;
    pick(bucket.ids, e, bucketSel);
    const label = bucket.hex === 'IMAGE' ? L.edBucketImage : bucket.hex === 'NONE' ? L.edBucketNoFill : bucket.hex.toUpperCase();
    say(bucket.ids.length + ' objek (' + label + ') dipilih');
  };
  const ejectBucket = bucket => moveObjsToGroup(bucket.ids, null);
  return (<aside className="fig-left-sidebar"><style>{`
  .fig-layers-scroll .fig-row .fig-eject { display: inline-flex !important; visibility: visible !important; opacity: 1 !important; }
  .fig-layers-scroll .fig-row .truncate + .fig-eject { margin-left: auto !important; }
  /* SAVEFIX: baris atas header tidak boleh wrap — dulu saat label status
     memanjang (Tersimpan -> Menyimpan...) pill jatuh ke baris kedua lalu
     kembali ke atas. Lebar pill dibuat tetap (min-width menutup seluruh
     siklus autosave umum: Tersimpan/Belum tersimpan/Menyimpan...) agar
     posisinya tidak bergeser saat status berubah. */
  .ws-ed-top-row { flex-wrap: nowrap !important; }
  .ws-save-pill { flex: none !important; min-width: 120px !important; justify-content: center !important; }
`}</style><div className="fig-doc-hdr"><div className="ws-ed-proj-bar min-w-0 flex-1"><div className="ws-ed-top-row">{onBackToWorkspace ? <button type="button" className="ws-back-btn" data-tip="veBackWorkspace" onClick={() => onBackToWorkspace(docRef.current, {
          zoom: zoomRef.current,
          pan: {
            ...panRef.current
          }
        })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg><span>Workspace</span></button> : <svg role="img" aria-label="Geovanta" viewBox="150 180 1750 380" style={{
          height: 20,
          width: 'auto',
          display: 'block',
          color: 'var(--acc)'
        }} dangerouslySetInnerHTML={{
          __html: LOGO_INNER
        }} />}<span className={'ws-save-pill st-' + (saveStatus || 'saved')} data-tip={saveStatus === 'error' ? 'veSaveError' : 'veSaveOk'} onClick={() => {
          if (saveStatus === 'error' && onRetrySave) onRetrySave();
        }}><span className="ws-save-dot" /><span>{({clean: L.edSaveClean, dirty: L.edSaveDirty, saving: L.edSaveSaving, saved: L.edSaveClean, error: L.edSaveError, recovery: L.edSaveRecovery, 'session-ram': L.edSaveSession})[saveStatus] || L.edSaveClean}</span></span></div><div className="flex items-center justify-between gap-1.5 min-w-0"><button type="button" className="ws-ed-proj-name-btn" data-tip="veRenameProject" onClick={() => onRenameProject && onRenameProject()}><span className="truncate">{projectName || 'Untitled Project'}</span><Ico n="pencil" size={11} /></button></div><div className="text-[11px] mut truncate" data-tip="veStats">{doc.objects.length} {L.edStatsObj} · {nTotal} node · {sel.objs.size} {L.edStatsSel}{selNodes.size ? ' · ' + selNodes.size + 'n' : ''}</div></div></div><div className="fig-sec-hdr flex-wrap gap-1.5"><span className="whitespace-nowrap" data-tip="veLayers">{L.edLayers} ({doc.objects.length})</span><div className="flex items-center gap-1"><button type="button" className={'ved-pill text-[10.5px]' + (clipFrames ? ' on' : '')} style={{
        padding: '3px 7px'
      }} aria-pressed={clipFrames} data-tip="veClipFrames" onClick={() => setClipFrames(v => !v)}>Clip Frame</button><button type="button" className={'ved-pill text-[10.5px]' + (groupSameColor ? ' on' : '')} style={{
        padding: '3px 7px'
      }} aria-pressed={groupSameColor} data-tip="veLayBucket" onClick={() => setGroupSameColor(v => !v)}>{L.edGroupColor}</button></div></div><div ref={layerScrollRef} className="fig-layers-scroll space-y-2" onScroll={e => {
    const ctrl = layerViewportCtrlRef.current;
    if (!ctrl) return;
    const st = e.currentTarget.scrollTop;
    if (ctrl.syncScrollFromContainer) {
      ctrl.syncScrollFromContainer(st);
    } else {
      const treeEl = layerTreeDomRef.current;
      ctrl.syncScroll(Math.max(0, st - (treeEl ? treeEl.offsetTop : 0)));
    }
  }}>{tool === 'addnode' && <div className="ved-panel fade"><div className="text-xs mut mb-1.5 font-medium">{L.edAddNode}</div><div className="text-[11px] mut leading-relaxed">{L.edAddNodeHelp}</div></div>}{tool === 'addhandle' && <div className="ved-panel fade"><div className="text-xs mut mb-1.5 font-medium">{L.edAddHandle}</div><div className="text-[11px] mut leading-relaxed">{L.edAddHandleHelp}</div></div>}{tool === 'pen' && <div className="ved-panel fade"><div className="text-xs mut mb-2 font-medium">Pen Tool{pen ? L.edPenDrawing : ''}</div><div className="text-[11px] mut leading-relaxed"><b>{L.edPenClick}</b> = {L.edPenCorner}. <b>{L.edPenDrag}</b> = {L.edPenCurve}. <b>Alt</b> = {L.edPenBreak}. <b>Enter/Esc</b> = {L.edPenDone}.</div><div className="space-y-2.5 mt-2.5"><div className="flex flex-wrap gap-1.5"><button type="button" data-tip="vePenNoFill" className={'ved-pill' + (penSty.fill === 'none' ? ' on' : '')} onClick={() => {
            setPenSty(s => ({
              ...s,
              fill: 'none'
            }));
            if (penRef.current) commitObjs(o => o.id === penRef.current.oid ? {
              ...o,
              fill: 'none'
            } : o, 'pen-sty');
          }}>{L.edNoContent}</button><button type="button" data-tip="vePenFill" className={'ved-pill' + (penSty.fill !== 'none' ? ' on' : '')} onClick={() => {
            const nf = penSty.fill === 'none' ? '#0d99ff' : penSty.fill;
            setPenSty(s => ({
              ...s,
              fill: nf
            }));
            if (penRef.current) commitObjs(o => o.id === penRef.current.oid ? {
              ...o,
              fill: nf
            } : o, 'pen-sty');
          }}>{L.edWithContent}</button></div><div><div className="text-[11px] mut mb-1">Fill</div><ColorField L={L} tip="veFill" value={penSty.fill} on={v => {
            setPenSty(s => ({
              ...s,
              fill: v
            }));
            if (penRef.current) commitObjs(o => o.id === penRef.current.oid ? {
              ...o,
              fill: v
            } : o, 'pen-sty');
          }} /></div><div><div className="text-[11px] mut mb-1">Stroke</div><ColorField L={L} tip="veStroke" value={penSty.stroke} on={v => {
            setPenSty(s => ({
              ...s,
              stroke: v
            }));
            if (penRef.current) commitObjs(o => o.id === penRef.current.oid ? {
              ...o,
              stroke: v
            } : o, 'pen-sty');
          }} /></div><Range l="Stroke width" v={penSty.sw} min={0} max={20} step={0.5} on={v => {
          setPenSty(s => ({
            ...s,
            sw: v
          }));
          if (penRef.current) commitObjs(o => o.id === penRef.current.oid ? {
            ...o,
            strokeWidth: v
          } : o, 'pen-sty');
        }} tip="veStrokeW" /></div>{pen && <button type="button" className="btn sec text-[11px] mt-2.5 w-full" style={{
        padding: '6px 8px'
      }} onClick={finishPen} data-tip="vePenFinish">{L.edDoneEnter}</button>}</div>}{tool === 'autohandle' && <div className="ved-panel fade"><div className="text-xs mut mb-2 font-medium">Auto Handle Bézier</div><div className="space-y-2.5"><button type="button" className="btn pri w-full text-[11px]" style={{
          padding: '7px 8px'
        }} disabled={!selObjs.length} data-tip="veAhAddSel" onClick={() => autoSel(false, true)}>{selNodes.size ? L.edAddHandleN.replace('{n}', selNodes.size) : L.edAddHandleSel}</button><button type="button" className="btn sec w-full text-[11px]" style={{
          padding: '7px 8px'
        }} disabled={!doc.objects.length} data-tip="veAhAddAll" onClick={() => autoAll(false, true)}>{L.edAddHandleAll}</button><div className="flex gap-1.5"><button type="button" className="btn sec flex-1 text-[10.5px]" style={{
            padding: '6px'
          }} disabled={!selObjs.length} data-tip="veAhDelSel" onClick={() => autoSel(true)}>{L.edDelSel}</button><button type="button" className="btn sec flex-1 text-[10.5px]" style={{
            padding: '6px'
          }} disabled={!doc.objects.length} data-tip="veAhDelAll" onClick={() => autoAll(true)}>{L.edDelAll}</button></div><Range l={L.edTension} v={ahOpt.tau} min={0} max={0.5} step={0.01} on={v => setAhOpt(o => ({
          ...o,
          tau: v
        }))} tip="veAhTension" f={v => v < 0.005 ? L.edSharp0 : v.toFixed(2)} /><Range l={L.edSkipSharp} v={ahOpt.minAng} min={0} max={150} step={5} on={v => setAhOpt(o => ({
          ...o,
          minAng: v
        }))} tip="veAhAngle" f={v => v ? '< ' + v + '°' : L.edOff} /><div className="flex gap-1.5"><button type="button" data-tip="veAhScopeSub" className={'ved-pill' + (ahOpt.scope === 'sub' ? ' on' : '')} onClick={() => setAhOpt(o => ({
            ...o,
            scope: 'sub'
          }))}>Subpath</button><button type="button" data-tip="veAhScopeObj" className={'ved-pill' + (ahOpt.scope === 'obj' ? ' on' : '')} onClick={() => setAhOpt(o => ({
            ...o,
            scope: 'obj'
          }))}>{L.edAllObjects}</button></div></div></div>}{tool === 'straighten' && <div className="ved-panel ved-straight-panel fade"><div className="text-xs mut mb-2 font-medium whitespace-nowrap">{L.edAlignNodes}</div><div className="space-y-3"><div><div className="ved-straight-row text-[11px] mut mb-1"><span>{L.edNodeMode}</span>{selNodes.size >= 2 && primary && <span className="font-mono text-[10px]" data-tip="veCurAngle" style={{
              color: 'var(--acc)'
            }}>{VE.measureSelectedNodesAngle(primary, selNodes)}°</span>}</div><Seg v={alOpt.mode} on={m => setAlOpt(o => ({
            ...o,
            mode: m
          }))} o={[['auto', 'Auto'], ['custom', L.edDegrees], ['perp', '⊥ 90°'], ['parallel', '∥']]} tip="veAlMode" tips={{
            auto: 'veAlAuto',
            custom: 'veAlCustom',
            perp: 'veAlPerp',
            parallel: 'veAlPar'
          }} /></div>{alOpt.mode === 'custom' && <div className="space-y-2 fade"><Range l={L.edLineAngle} v={alOpt.deg} min={-180} max={180} step={0.5} on={v => {
            setAlOpt(o => ({
              ...o,
              deg: v
            }));
            if (selNodes.size >= 2) applyNodeAngleAlign(v, 'custom');
          }} f={v => v + '°'} tip="veAlDeg" /><div className="ved-pills">{[0, 15, 30, 45, 60, 90, -30, -45, -60, -90].map(d => <button key={d} type="button" data-tip="veAlPreset" className={'ved-pill' + (alOpt.deg === d ? ' on' : '')} onClick={() => {
              setAlOpt(o => ({
                ...o,
                mode: 'custom',
                deg: d
              }));
              if (selNodes.size >= 2) applyNodeAngleAlign(d, 'custom');
            }}>{d}°</button>)}</div></div>}<div><div className="text-[11px] mut mb-1 whitespace-nowrap" data-tip="veAlAnchor">{L.edAnchorPoint}</div><Seg v={alOpt.anchor} on={a => setAlOpt(o => ({
            ...o,
            anchor: a
          }))} o={[['center', L.edAnchorCenter], ['first', L.edAnchorFirst], ['last', L.edAnchorLast]]} tip="veAlAnchor" tips={{
            center: 'veAlAncCenter',
            first: 'veAlAncFirst',
            last: 'veAlAncLast'
          }} /></div><div><div className="text-[11px] mut mb-1 whitespace-nowrap" data-tip="veAlSlide">{L.edDragTip}</div><Seg v={alOpt.slide ? 'slide' : 'ortho'} on={k => setAlOpt(o => ({
            ...o,
            slide: k === 'slide'
          }))} o={[['slide', L.edSlideRail], ['ortho', L.edSlideOrtho]]} tip="veAlSlide" tips={{
            slide: 'veAlSlideOn',
            ortho: 'veAlSlideOff'
          }} /></div>{selNodes.size >= 3 && <div><div className="text-[11px] mut mb-1 whitespace-nowrap" data-tip="veAlCollapse">{L.edMidNode}</div><Seg v={alOpt.collapse ? 'on' : 'off'} on={k => setAlOpt(o => ({
            ...o,
            collapse: k === 'on'
          }))} o={[['off', L.edKeep], ['on', L.edMerge]]} tip="veAlCollapse" tips={{
            off: 'veAlKeep',
            on: 'veAlMerge'
          }} /></div>}<div className="ved-straight-acts"><button type="button" className="btn pri text-xs" data-tip="veApplyStraight" disabled={!selObjs.length} onClick={() => selNodes.size >= 2 || selHandles.size ? applyNodeAngleAlign() : applyStraight()}>{selHandles.size ? L.edStraightenHandles.replace('{n}', selHandles.size) : selNodes.size >= 2 ? L.edAlignNodesN.replace('{n}', selNodes.size) : L.edStraightenAll}</button><button type="button" className="btn sec text-xs" data-tip="veAutoRefine" disabled={!selObjs.length} onClick={applyAutoRefine}>{L.edAutoTidy}</button><button type="button" className="btn sec text-xs" data-tip="vePruneNodes" disabled={!selObjs.length} onClick={applyPruneNodes}>{L.edDelNonCorner}</button></div><Range l={L.edTolDelete} v={pruneOpt.tol} min={0.2} max={3} step={0.05} on={v => setPruneOpt(o => ({
          ...o,
          tol: v
        }))} tip="vePruneTol" f={v => v.toFixed(2)} /><Range l={L.edMinAngle} v={pruneOpt.cornerDeg} min={12} max={70} step={1} on={v => setPruneOpt(o => ({
          ...o,
          cornerDeg: v
        }))} tip="vePruneAng" f={v => v + '°'} /><Range l={L.edMaxDev} v={sOpt.maxDev} min={0.2} max={5} step={0.1} on={v => setSOpt(o => ({
          ...o,
          maxDev: v
        }))} tip="veMaxDev" f={v => v.toFixed(1)} /><Range l={L.edDirTol} v={sOpt.angTol} min={0} max={15} step={0.5} on={v => setSOpt(o => ({
          ...o,
          angTol: v
        }))} tip="veAngTol" f={v => v + '°'} /></div></div>}{tool === 'simplify' && (() => {
      const s = vcSimp || {
        mode: 'slider',
        level: 50,
        tolerance: 1.0,
        angleThreshold: 150,
        straightLines: false,
        showOriginal: false,
        retain: vcSimpRetain,
        preview: true,
        before: nTotal,
        after: nTotal
      };
      return <div className="ved-panel fade"><div className="flex items-center justify-between mb-2"><div className="text-xs font-semibold">Simplify</div><span className="vc-simp-badge" data-tip="veSimpBadge">{s.preview ? `${s.before} → ${s.after} pts` : `${s.before} pts`}</span></div><div className="space-y-2.5"><div className="flex items-center gap-1.5"><button type="button" className="btn sec text-[11px] flex-1 flex items-center justify-center gap-1.5" data-tip="veSimplifyAuto" onClick={() => {
              if (!vcSimp) openVcSimplify('slider');else triggerAutoSimplifyLevel();
            }}><Ico n="wand" size={13} /><span>Auto-Simplify</span></button><button type="button" className="btn sec text-[11px] px-2.5" data-tip="veSimplifyMore" onClick={() => openVcMoreOptions()}>•••</button></div><Range l="Curve Precision (Level)" v={s.level} min={0} max={100} step={1} on={v => {
            if (!vcSimp) openVcSimplify('slider');
            updateVcSimplify({
              level: v
            });
          }} tip="veSimplifyLevel" f={v => `${v}% (${VE.rd(VE.simplifyLevelTolerance(v))} pt)`} /><div><div className="fig-sub-lbl">Tolerance (pt)</div><XfField label="Tol" value={s.tolerance} min={0.001} step={0.1} on={v => {
              if (!vcSimp) openVcSimplify('dialog');
              updateVcSimplify({
                mode: 'dialog',
                tolerance: clampN(v, 0.001, 10000)
              });
            }} tip="veSimplifyTol" /></div><Range l="Angle Threshold" v={s.angleThreshold} min={0} max={180} step={1} on={v => {
            if (!vcSimp) openVcSimplify();
            updateVcSimplify({
              angleThreshold: v
            });
          }} tip="veSimplifyAngle" f={v => `${Math.round(v)}°`} /><div className="space-y-1.5 pt-0.5"><button type="button" role="checkbox" aria-checked={s.straightLines} className={'c-chk' + (s.straightLines ? ' on' : '')} data-tip="veSimplifyStraight" onClick={() => {
              if (!vcSimp) openVcSimplify();
              updateVcSimplify({
                straightLines: !s.straightLines
              });
            }}><span className="c-chk-box">{s.straightLines && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>Convert to Straight Lines</span></button><button type="button" role="checkbox" aria-checked={s.showOriginal} className={'c-chk' + (s.showOriginal ? ' on' : '')} data-tip="veSimplifyOrig" onClick={() => {
              if (!vcSimp) openVcSimplify();
              updateVcSimplify({
                showOriginal: !s.showOriginal
              });
            }}><span className="c-chk-box">{s.showOriginal && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>Show Original Path</span></button><button type="button" role="checkbox" aria-checked={s.preview} className={'c-chk' + (s.preview ? ' on' : '')} onClick={() => {
              if (!vcSimp) openVcSimplify();
              updateVcSimplify({
                preview: !s.preview
              });
            }}><span className="c-chk-box">{s.preview && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>Preview</span></button></div><div className="flex gap-1.5 pt-1">{vcSimp ? <><button type="button" className="btn sec flex-1 text-xs" onClick={cancelVcSimplify}>Cancel</button><button type="button" className="btn pri flex-1 text-xs" data-tip="veApplySimplify" onClick={confirmVcSimplify}>OK</button></> : <button type="button" className="btn pri w-full text-xs" data-tip="veApplySimplify" onClick={() => openVcSimplify()}>{L.edOpenSimplify}</button>}</div></div></div>;
    })()}<LayerTreeViewport L={L} virtualLayerRows={virtualLayerRows} hasObjects={doc.objects.length > 0} layerTreeDomRef={layerTreeDomRef} layerViewportCtrlRef={layerViewportCtrlRef} dragLayerIds={dragLayerIds} moveObjsToGroup={moveObjsToGroup} setDragLayerIds={setDragLayerIds} setOverFrameId={setOverFrameId} renderRowFn={(row, fastScroll) => {
      if (row.kind === 'single') return <LayerObjRow key={row.obj.id} o={row.obj} child={false} nodeCount={row.nodeCount} selected={sel.objs.has(row.obj.id)} renaming={renamingId === row.obj.id} renameVal={renameVal} layerInsPos={layerIns && layerIns.id === row.obj.id ? layerIns.pos : null} layerNameLabel={L.edLayerName} clickSkipRef={layerClickSkipExpandRef} onPick={pick} onDragStart={dStart} onDragEnd={dEnd} onRowDragOver={rowDragOver} onRowDragLeave={rowDragLeave} onRowDrop={rowDrop} onOpenCtx={openLayerCtx} onToggleLock={toggleObjLock} onToggleHide={toggleObjHide} onEjectChild={ejectChild} onStartRename={startRenameObj} onRenameVal={setRenameVal} onRenameCommit={renameCommitObj} onRenameCancel={renameCancel} fastScroll={fastScroll} />;
      if (row.kind === 'child') return <LayerObjRow key={row.obj.id} o={row.obj} child={true} nodeCount={row.nodeCount} selected={sel.objs.has(row.obj.id)} renaming={renamingId === row.obj.id} renameVal={renameVal} layerInsPos={layerIns && layerIns.id === row.obj.id ? layerIns.pos : null} layerNameLabel={L.edLayerName} clickSkipRef={layerClickSkipExpandRef} onPick={pick} onDragStart={dStart} onDragEnd={dEnd} onRowDragOver={rowDragOver} onRowDragLeave={rowDragLeave} onRowDrop={rowDrop} onOpenCtx={openLayerCtx} onToggleLock={toggleObjLock} onToggleHide={toggleObjHide} onEjectChild={ejectChild} onStartRename={startRenameObj} onRenameVal={setRenameVal} onRenameCommit={renameCommitObj} onRenameCancel={renameCancel} fastScroll={fastScroll} />;
      if (row.kind === 'group-empty') return <LayerEmptyRow key={row.key} label={L.edEmptyFrame} />;
      if (row.kind === 'bucket') {
        const b = row.bucket;
        const bucketSel = b.ids.every(id => sel.objs.has(id));
        const label = b.hex === 'IMAGE' ? L.edBucketImage : b.hex === 'NONE' ? L.edBucketNoFill : b.hex.toUpperCase();
        return <LayerBucketRow key={row.key} bucket={b} label={L.edBucketColor + ' ' + label} selected={bucketSel} onPickBucket={bucketPick} onEjectBucket={ejectBucket} onDragStart={dStart} onDragEnd={dEnd} />;
      }
      const {
        item,
        allIds,
        gKey,
        isCollapsed,
        allHidden,
        allLocked
      } = row;
      const isAllSel = allIds.length > 0 && allIds.every(id => sel.objs.has(id));
      const isSomeSel = !isAllSel && allIds.some(id => sel.objs.has(id));
      return <LayerGroupRow key={row.key} item={item} allIds={allIds} gKey={gKey} isCollapsed={isCollapsed} allHidden={allHidden} allLocked={allLocked} isAllSel={isAllSel} isSomeSel={isSomeSel} dropOn={overFrameId === item.id || dropFrameId === item.id} renaming={renamingId === gKey} renameVal={renameVal} layerNameLabel={L.edLayerName} clickSkipRef={layerClickSkipExpandRef} onPick={pick} onDragStart={dStart} onDragEnd={dEnd} onGroupDragOver={groupDragOver} onGroupDragLeave={groupDragLeave} onGroupDrop={groupDrop} onToggleCollapse={toggleCollapseGrp} onToggleGroupLock={toggleGroupLock} onToggleGroupHide={toggleGroupHide} onUngroup={ungroup} onBgClick={bgClick} onStartRenameGroup={startRenameGroup} onRenameVal={setRenameVal} onRenameCommitGroup={renameCommitGroup} onRenameCancel={renameCancel} />;
    }} /></div><div className="ved-rz" {...rzProps('l')} /></aside>);
};

export { EditorLeftSidebar };
export default EditorLeftSidebar;
