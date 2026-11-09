/**
 * @file src/components/editor/EditorFloatingToolbar.jsx
 * @description Komponen bilah alat melayang utama di bagian bawah kanvas (EditorFloatingToolbar)
 */
import React from 'react';
import { VE_TOOLS, SHAPES, SHAPE_EN, SNAP_OPTS, SNAP_OPTS_EN, SNAP_TOOL_CAPABILITIES } from '../../constants/editorToolsAndShapes.jsx';
import { TIPS, TIPS_EN } from '../../constants/tooltipsCatalog.jsx';
import { Vi, Chev, ShapeGlyph, IconBtn } from '../ui/IconGlyphs.jsx';
import { Float } from '../ui/FloatPopover.jsx';
import { VE } from '../../engine/vectorEngine.jsx';

const FrameToolGlyph = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8" y="8" width="8" height="8" rx="1.2" /><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" /></svg>;

const SNAP_ICON_PATHS = {
  bbox: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M12 2v4 M12 18v4 M2 12h4 M18 12h4" /></>,
  spacing: <><path d="M3 5v14 M21 5v14 M7 12h10 M7 12l2.5-2.5 M7 12l2.5 2.5 M17 12l-2.5-2.5 M17 12l-2.5 2.5" /></>,
  artboard: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M12 3v18 M3 12h18" /></>,
  node: <><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M4 20 9 15 M20 4l-5 5" /><circle cx="3.5" cy="20.5" r="1.3" /><circle cx="20.5" cy="3.5" r="1.3" /></>,
  axial: <><path d="M4 20V4 M4 20h16" /><circle cx="12" cy="12" r="2" /><path d="M12 14v6 M10 12H4" strokeDasharray="2 2.4" /></>,
  midpoint: <><path d="M3 18 21 6" /><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /><path d="M12 3.5v3 M12 17.5v3" /></>,
  edge: <><path d="M3 17C7 17 7 7 12 7s5 10 9 10" /><circle cx="12" cy="7" r="1.8" fill="currentColor" stroke="none" /></>,
  perp: <><path d="M5 4v15h15" /><path d="M5 14h5v5" /><path d="M15 4h5v5" strokeDasharray="2 2.4" /></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M9 3v18 M15 3v18 M3 9h18 M3 15h18" /></>,
  pixel: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" fill="currentColor" stroke="none" /></>
};
const SnapIcon = ({ k }) => <svg className="snp-custom-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SNAP_ICON_PATHS[k] || <circle cx="12" cy="12" r="6" />}</svg>;

const EditorFloatingToolbar = ({
  L,
  lang = 'id',
  tool,
  setOpenGrp,
  setTool,
  lastGrpTool,
  openGrp,
  grpBtnRefs,
  vcSimpRef,
  openVcSimplify,
  setShapeOpen,
  say,
  shapeBtn,
  shapeOpen,
  shapeKind,
  setShapeKind,
  snapMenuBtn,
  snapOn,
  setSnapOn,
  snapMenuOpen,
  setSnapMenuOpen,
  setSnapCfg,
  snapCfg,
  gridOn,
  setGridOn,
  mirrorBtn,
  mirrorCur,
  selNodes,
  mirrorOpen,
  setMirrorOpen,
  MIRROR_OPTS,
  curveDragOn,
  setCurveDragOn,
  commitObjs,
  sel,
  selHandles,
  applyMirror,
  onSettings,
  boolOpen,
  setBoolOpen,
  boolBtn,
  selObjs,
  applyBoolean,
  applyOutlineStroke,
  openOffsetStrip
}) => {
  /* Boolean / Pathfinder: syarat seleksi (sama seperti menu konteks). */
  const canBool = (selObjs || []).filter(o => !o.img && !o.text).length >= 2;
  const canOutline = (selObjs || []).some(o => !o.img && o.stroke && o.stroke !== 'none' && o.strokeWidth > 0);
  const canOffset = (selObjs || []).some(o => !o.img);
  const TT = lang === 'en' ? TIPS_EN : TIPS;
  const BOOL_ITEMS = [['union', 'veBoolUnion', L.edBoolUnion, 'M3 3h10v10H3z M11 11h10v10H11z', 'Ctrl+Alt+U', !canBool, () => applyBoolean('union')], ['subtract', 'veBoolSubtract', L.edBoolSubtract, 'M3 3h18v18H3z M10 10h8v8h-8z', 'Ctrl+Alt+S', !canBool, () => applyBoolean('subtract')], ['intersect', 'veBoolIntersect', L.edBoolIntersect, 'M8 3h8v18H8z M3 8h18v8H3z', 'Ctrl+Alt+I', !canBool, () => applyBoolean('intersect')], ['exclude', 'veBoolExclude', L.edBoolExclude, 'M3 3h8v8H3z M13 13h8v8h-8z', 'Ctrl+Alt+X', !canBool, () => applyBoolean('exclude')], ['outline', 'veOutlineStroke', L.edOutlineStroke, 'M4 4h16v16H4z M8 8h8v8H8z', 'Ctrl+Alt+O', !canOutline, applyOutlineStroke], ['offset', 'veOffsetPath', L.edOffsetPath, 'M7 7h10v10H7z M3 3h18v18H3z', '', !canOffset, openOffsetStrip]];
  return <div className="fig-floating-bar" style={{
  background: 'var(--card)',
  opacity: 1,
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none'
}} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><style>{`
  .fig-floating-bar .tool-btn, .flt .opt, .flt .tool-btn, .flt .ved-pill, .flt .snp-row { transition: background-color .16s ease, color .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
  .fig-floating-bar .tool-btn:hover:not(:disabled), .flt .opt:hover, .flt .tool-btn:hover:not(:disabled), .flt .ved-pill:hover:not(:disabled), .flt .snp-row:hover:not(:disabled) { background-color: color-mix(in srgb, var(--acc) 12%, var(--card)); color: var(--ink); border-color: color-mix(in srgb, var(--acc) 32%, var(--line)); }
  .fig-floating-bar .tool-btn:focus-visible, .flt .opt:focus-visible, .flt button:focus-visible { outline: 2px solid color-mix(in srgb, var(--acc) 72%, transparent); outline-offset: 1px; }
  .flt .snp-row, .flt .snp-row:hover:not(:disabled), .flt .snp-row.on, .flt .snp-row:focus-visible { background: transparent !important; border: 0 !important; box-shadow: none !important; outline: none; }
  .flt .snp-row { color: var(--ink); }
  .flt .snp-row .snp-custom-icon { color: var(--mut); flex: none; transition: color .16s ease; }
  .flt .snp-row:hover:not(:disabled) .snp-custom-icon, .flt .snp-row.on .snp-custom-icon { color: var(--acc); }
  .flt .snp-row:hover:not(:disabled) .snp-lb { color: var(--ink); }
  .flt .snp-row .snp-sw { background: color-mix(in srgb, var(--acc) 22%, var(--line)) !important; }
  .flt .snp-row.on .snp-sw { background: var(--acc) !important; }
  .flt .snp-row .snp-sw::after { background: #fff !important; }
  .flt .opt { cursor: pointer; }
`}</style>{VE_TOOLS.map(entry => {
    if (entry.type === 'single') {
      const [k, tip, d] = entry.item;
      return <button key={k} type="button" className={'tool-btn' + (tool === k ? ' on' : '')} data-tip={tip} aria-label={TT[tip] ? TT[tip].t : k} onClick={() => {
        setOpenGrp(null);
        setTool(k);
      }}><Vi d={d} s={24} /></button>;
    }
    const {
      id,
      items
    } = entry;
    const activeInGroup = items.find(x => x[0] === tool);
    const currentItem = activeInGroup || items.find(x => x[0] === lastGrpTool[id]) || items[0];
    const [curK, curTip, curD] = currentItem;
    const isOpen = openGrp === id;
    const btnRef = grpBtnRefs[id];
    return <React.Fragment key={id}><div ref={btnRef} className="inline-flex items-center"><button type="button" className={'tool-btn' + (activeInGroup ? ' on' : '')} data-tip={curTip} aria-label={TT[curTip] ? TT[curTip].t : curK} onClick={() => {
          if (activeInGroup) {
            if (curK === 'simplify' && !vcSimpRef.current) openVcSimplify();else setOpenGrp(isOpen ? null : id);
          } else {
            setTool(curK);
            setOpenGrp(null);
            if (curK === 'simplify') openVcSimplify();
          }
        }}><Vi d={curD} s={24} /></button><button type="button" className="tool-btn chev-btn" aria-label={L.ftPickToolGroup} data-tip="veToolGroup" aria-expanded={isOpen} onClick={e => {
          e.stopPropagation();
          setOpenGrp(isOpen ? null : id);
        }}><Chev open={isOpen} /></button></div><Float anchor={btnRef} open={isOpen} onClose={() => setOpenGrp(null)} w={236} preferUp={true}><div className="text-[10.5px] mut px-2.5 py-1 font-semibold uppercase tracking-wider">{id === 'nodeGrp' ? L.ftNodeGroup : L.ftGeoGroup}</div>{items.map(([k, tip, d]) => {
          const info = TT[tip] || {
            t: k
          };
          const on = tool === k;
          return <div key={k} role="option" aria-selected={on} className={'opt' + (on ? ' on' : '')} data-tip={tip} onClick={() => {
            setTool(k);
            setOpenGrp(null);
            if (k === 'simplify') openVcSimplify();
          }}><span className="sel-l"><Vi d={d} s={17} /><span>{info.t}</span></span><span className="flex items-center gap-1.5">{info.k && <span className="text-[10px] font-mono mut px-1.5 py-0.5 rounded bg-[var(--sub)]">{info.k}</span>}<svg className="ck" style={{
                opacity: on ? 1 : 0
              }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></span></div>;
        })}</Float></React.Fragment>;
  })}<span className="fig-bar-sep" /><div ref={boolBtn} className="inline-flex items-center"><button type="button" className="tool-btn" disabled={!canBool} data-tip="veBoolUnion" aria-label="Boolean Union" aria-haspopup="listbox" aria-expanded={boolOpen} onClick={() => {
      if (!canBool) return;
      setBoolOpen(false);
      applyBoolean('union');
    }}><Vi d="M3 3h10v10H3z M11 11h10v10H11z" s={22} /></button><button type="button" className="tool-btn chev-btn" data-tip="veBoolUnion" aria-label={L.ftPickBool} aria-expanded={boolOpen} onClick={e => {
      e.stopPropagation();
      setBoolOpen(o => !o);
    }}><Chev open={boolOpen} /></button></div><Float anchor={boolBtn} open={boolOpen} onClose={() => setBoolOpen(false)} w={268} preferUp={true}><div className="text-[10.5px] mut px-2.5 py-1 font-semibold uppercase tracking-wider">Boolean / Pathfinder</div>{BOOL_ITEMS.map(([k, tip, label, d, kbd, dis, act]) => <div key={k} role="option" aria-disabled={dis} className="opt" data-tip={tip} style={dis ? {
        opacity: 0.45
      } : undefined} onClick={() => {
        if (dis) return;
        setBoolOpen(false);
        act();
      }}><span className="sel-l"><Vi d={d} s={17} /><span>{label}</span></span>{kbd && <span className="text-[10px] font-mono mut px-1.5 py-0.5 rounded bg-[var(--sub)]">{kbd}</span>}</div>)}</Float><span className="fig-bar-sep" /><button type="button" className={'tool-btn' + (tool === 'frame' ? ' on' : '')} data-tool="frame" data-tip="veFrameTool" aria-label="Frame" onClick={() => {
    setShapeOpen(false);
    setTool('frame');
  }}><FrameToolGlyph /></button><button type="button" className={'tool-btn' + (tool === 'text' ? ' on' : '')} data-tip="veTextTool" aria-label="Text" onClick={() => {
    setShapeOpen(false);
    setTool('text');
    say('Alat Teks (T): klik di kanvas untuk menambahkan teks');
  }}><Vi d="M4 7V4h16v3 M9 20h6 M12 4v16" s={22} /></button><div className="inline-flex items-center"><button ref={shapeBtn} type="button" className={'tool-btn' + (tool === 'shape' ? ' on' : '')} data-tip="veShape" aria-label="Shape" aria-expanded={shapeOpen} onClick={() => {
      if (tool !== 'shape') {
        setTool('shape');
        setShapeOpen(true);
      } else setShapeOpen(o => !o);
    }}><ShapeGlyph k={shapeKind} s={22} /></button><button type="button" className="tool-btn chev-btn" aria-label={L.ftShape} data-tip="veShapePicker" onClick={() => setShapeOpen(o => !o)}><Chev open={shapeOpen} /></button></div><Float anchor={shapeBtn} open={shapeOpen} onClose={() => setShapeOpen(false)} w={244} cls="cp" preferUp={true}><div className="text-[11px] mut mb-2 font-medium">{L.ftShape}</div><div className="grid grid-cols-5 gap-1.5">{SHAPES.map(([k, lb]) => <button key={k} type="button" data-tip={'veShp_' + k} aria-label={lang === 'en' ? (SHAPE_EN[k] || lb) : lb} className={'tool-btn' + (tool === 'shape' && shapeKind === k ? ' on' : '')} onClick={() => {
        setShapeKind(k);
        setTool('shape');
        setShapeOpen(false);
        say((lang === 'en' ? (SHAPE_EN[k] || lb) : lb) + (lang === 'en' ? ': drag on the canvas to draw' : ': seret di kanvas untuk menggambar'));
      }}><ShapeGlyph k={k} s={22} /></button>)}</div></Float><span className="fig-bar-sep" /><div ref={snapMenuBtn} className="inline-flex items-center"><IconBtn lang={lang} s={22} on={snapOn} tip="veSnap" act={() => setSnapOn(s => !s)} d="M6 4v6a6 6 0 0 0 12 0V4 M6 7.5h3.5 M14.5 7.5H18" /><button type="button" className="tool-btn chev-btn" data-tip="veSnapMenu" aria-label={L.ftSnapOpts} aria-expanded={snapMenuOpen} onClick={() => setSnapMenuOpen(o => !o)}><Chev open={snapMenuOpen} /></button></div><Float anchor={snapMenuBtn} open={snapMenuOpen} onClose={() => setSnapMenuOpen(false)} w={272} cls="cp" preferUp={true}><div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold">{L.ftSnapChecklist}</span><div className="flex gap-1"><button type="button" className="ved-pill" data-tip="veSnapPresetAll" onClick={() => setSnapCfg({
          bbox: true,
          spacing: true,
          artboard: true,
          node: true,
          axial: true,
          midpoint: true,
          edge: true,
          perp: true,
          grid: true
        })}>{L.ftAll}</button><button type="button" className="ved-pill" data-tip="veSnapPresetMin" onClick={() => setSnapCfg({
          bbox: false,
          spacing: false,
          artboard: false,
          node: true,
          axial: false,
          midpoint: false,
          edge: false,
          perp: false,
          grid: false,
          pixel: false
        })}>{L.ftMinimal}</button></div></div><div className="space-y-0.5" style={{
      maxHeight: 300,
      overflowY: 'auto',
      margin: '0 -4px',
      padding: '0 4px'
    }}>{(lang === 'en' ? SNAP_OPTS_EN : SNAP_OPTS).map(([k, label, col]) => {
        const toolCap = SNAP_TOOL_CAPABILITIES[tool] || SNAP_TOOL_CAPABILITIES.select;
        const activeInTool = !!toolCap[k];
        return <button key={k} type="button" role="switch" data-tip={'veSnap_' + k} aria-checked={!!snapCfg[k]} className={'snp-row' + (snapCfg[k] ? ' on' : '')} style={{
          '--c': col,
          opacity: activeInTool ? 1 : 0.65
        }} onClick={() => setSnapCfg(c => ({
          [k]: !c[k]
        }))}><SnapIcon k={k} /><span className="snp-lb">{label}{!activeInTool ? L.ftOtherTool : ''}</span><span className="snp-sw" aria-hidden="true" /></button>;
      })}</div></Float><IconBtn lang={lang} s={22} on={gridOn} tip="veGrid" act={() => setGridOn(g => !g)} d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10h16 M4 14h16 M10 4v16 M14 4v16" /><span className="fig-bar-sep" /><div ref={mirrorBtn} className="inline-flex items-center"><button type="button" className={'tool-btn' + (mirrorCur ? ' on' : '')} disabled={!selNodes.size} data-tip="veMirror" aria-label="Mirroring Handle" aria-haspopup="listbox" aria-expanded={mirrorOpen} onClick={() => setMirrorOpen(o => !o)}><Vi d={(MIRROR_OPTS.find(q => q[0] === (mirrorCur || 'symmetric')) || MIRROR_OPTS[3])[3]} s={22} /></button><button type="button" className="tool-btn chev-btn" disabled={!selNodes.size} data-tip="veMirror" aria-label={L.ftPickMirror} aria-expanded={mirrorOpen} onClick={e => {
      e.stopPropagation();
      setMirrorOpen(o => !o);
    }}><Chev open={mirrorOpen} /></button></div><IconBtn lang={lang} s={22} on={curveDragOn} tip="veCurveDrag" act={() => {
    const next = !curveDragOn;
    setCurveDragOn(next);
    if (next && selNodes.size) commitObjs(o => sel.objs.has(o.id) ? VE.mirrorNodes(o, selNodes, 'freeCurve', selHandles) : o);
    say(next ? 'Geser Handle Melengkung: AKTIF' : 'Geser Handle Melengkung: MATI');
  }} d="M4 17C7 7 17 7 20 17 M10 9.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M5 9.5h5 M14 9.5h5" /><Float anchor={mirrorBtn} open={mirrorOpen && selNodes.size > 0} onClose={() => setMirrorOpen(false)} w={268} preferUp={true}><div className="text-[10.5px] mut px-2.5 py-1 font-semibold uppercase tracking-wider">Mirroring Handle</div>{MIRROR_OPTS.map(([k, tip, label, d]) => <div key={k} role="option" aria-selected={mirrorCur === k} className={'opt' + (mirrorCur === k ? ' on' : '')} data-tip={tip} onClick={() => applyMirror(k)}><span className="sel-l"><Vi d={d} s={17} /><span>{label}</span></span><svg className="ck" style={{
        opacity: mirrorCur === k ? 1 : 0
      }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></div>)}{!mirrorCur && <div className="text-[10.5px] mut px-2.5 py-1">{L.ftMixed}</div>}</Float><span className="fig-bar-sep" /><IconBtn lang={lang} s={22} tip="settings" act={onSettings} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></div>;
};

export { EditorFloatingToolbar };
export default EditorFloatingToolbar;
