/**
 * @file src/components/editor/EditorRightInspector.jsx
 * @description Komponen sidebar inspektor properti kanan: Transform, Alignment, Fill, Gradien, Stroke, & Ekspor (EditorRightInspector)
 */
import React from 'react';
import { Vi, Ico } from '../ui/IconGlyphs.jsx';
import { zFmt, vzToSl, vslToZ } from '../../utils/zoomAndFormatHelpers.jsx';
import { Slider } from '../ui/Slider.jsx';
import { isPixelBoxModeActive } from '../../utils/renderConfigAndTelemetry.jsx';
import { ALN_BTNS } from '../../constants/editorToolsAndShapes.jsx';
import { TIPS, TIPS_EN } from '../../constants/tooltipsCatalog.jsx';
import { XfField } from '../ui/TransformField.jsx';
import { PinGrid } from '../ui/PinGridSelector.jsx';
import { Seg } from '../ui/SegmentedControl.jsx';
import { VE } from '../../engine/vectorEngine.jsx';
import { FontManager } from '../../utils/fontManager.jsx';
import { ALL_FONT_WEIGHTS, FONT_WEIGHT_LABELS } from '../../constants/fontCatalog.jsx';
import { CustomTextBox } from '../ui/CustomTextBox.jsx';
import { Select } from '../ui/SelectDropdown.jsx';
import { clampN } from '../../utils/colorMath.jsx';
import { Range } from '../ui/RangeField.jsx';
import { pickScreenColor } from '../../utils/screenPipette.jsx';
import { GradientEditorPanel } from './GradientEditorPanel.jsx';
import { ColorField } from '../ui/ColorPickerField.jsx';
import { ColorText } from '../ui/ColorHexInput.jsx';
import { pickFiles } from '../../utils/presenceAndFilePicker.jsx';

const EditorRightInspector = ({
  L,
  lang = 'id',
  canUndo,
  undo,
  canRedo,
  redo,
  zoomBy,
  zoomPctRef,
  displayZoomRef,
  zoom,
  zoomSliderDomRef,
  setZ,
  zoomToPixels,
  fitView,
  selObjs,
  selNodes,
  alignDo,
  xm,
  xp,
  setXfPos,
  xfNodes,
  setXfDim,
  lockAR,
  setLockAR,
  setXfRot,
  flipXf,
  pin,
  setPin,
  rotPivot,
  setRotPivot,
  scaleStk,
  setScaleStk,
  tool,
  commitObjs,
  fontSearch,
  fontUrlInput,
  setFontUrlStatus,
  setFontUrlInput,
  docRef,
  primary,
  commit,
  setSel,
  say,
  setFontSearch,
  fontUrlStatus,
  customFonts,
  toggleSelHidden,
  allSelHidden,
  setProp,
  indivCornerOpen,
  activeCorners,
  detectedCorners,
  curR,
  setRadius,
  setIndivCornerOpen,
  cornerMode,
  setCornerMode,
  applyRadiusToCorners,
  setPickedCornerKeys,
  pickedCornerKeys,
  paintObjs,
  isBgObj,
  paintTargetIds,
  cp,
  activeStopId,
  setActiveStopId,
  selectionColors,
  replaceSelectionColor,
  convertFrameToAutoLayout,
  lay,
  layUpd,
  setLay,
  layPad,
  layItems,
  runLayout,
  doc,
  padToArtboard,
  bg,
  setBg,
  importFiles,
  expFmt,
  setExpFmt,
  isRasterFmt,
  expScale,
  setExpScale,
  exportArea,
  setExportArea,
  exportSvg,
  downloadSvg,
  onExportBackup
}) => <aside className="fig-right-sidebar order-3 lg:order-none"><style>{`
  .fig-right-sidebar .fig-r-scroll { cursor: var(--cur-default); scroll-behavior: auto; overscroll-behavior: contain; scrollbar-gutter: stable; -webkit-overflow-scrolling: touch; scroll-padding-block: 10px; contain: layout style paint; will-change: scroll-position; overflow-anchor: none; }
  .fig-right-sidebar .fig-isec { contain: layout style; }
  .fig-right-sidebar .fig-r-scroll::-webkit-scrollbar { width: 8px; cursor: var(--cur-default) !important; }
  .fig-right-sidebar .fig-r-scroll::-webkit-scrollbar-track { cursor: var(--cur-default) !important; }
  .fig-right-sidebar .fig-r-scroll::-webkit-scrollbar-thumb { border: 2px solid transparent; background-clip: padding-box; transition: background-color .18s ease; cursor: var(--cur-pointer) !important; }
  .fig-right-sidebar .fig-r-scroll:hover::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, var(--acc) 65%, var(--mut)) !important; }
  .fig-right-sidebar .fig-ibtn, .fig-right-sidebar .ved-pill, .fig-right-sidebar .fig-aln-bar button, .fig-right-sidebar .seg button, .fig-right-sidebar .gch button, .fig-right-sidebar .opt, .fig-right-sidebar [role="switch"] { transition: background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease; }
  .fig-right-sidebar .fig-ibtn:hover:not(:disabled), .fig-right-sidebar .ved-pill:hover:not(:disabled), .fig-right-sidebar .fig-aln-bar button:hover:not(:disabled), .fig-right-sidebar .seg button:hover:not(:disabled), .fig-right-sidebar .gch button:hover:not(:disabled), .fig-right-sidebar .opt:hover, .fig-right-sidebar [role="switch"]:hover:not(:disabled) { background-color: color-mix(in srgb, var(--acc) 10%, var(--card)); border-color: color-mix(in srgb, var(--acc) 28%, var(--line)); color: var(--ink); }
  .fig-right-sidebar button:disabled { cursor: not-allowed; }
  .ct-canvas-inline { display: block; width: 100%; height: 100%; min-height: 0 !important; box-sizing: border-box; align-items: flex-start; line-height: 1.06; overflow: hidden !important; resize: none !important; }
  .ct-canvas-inline .c-inp-txt, .ct-canvas-inline .c-inp-txt.sel { font-family: inherit !important; font-size: inherit !important; font-weight: inherit !important; font-style: inherit !important; line-height: 1.06 !important; letter-spacing: inherit !important; word-spacing: inherit !important; padding: 0 !important; vertical-align: top; transform: none !important; }
  .ct-canvas-inline .c-caret { display: inline-block !important; width: 1.5px !important; height: 1em !important; margin-left: 1px; vertical-align: baseline; background: var(--acc) !important; opacity: 1 !important; visibility: visible !important; animation: cblink 1s steps(2, start) infinite !important; }
  .ct-canvas-caret { position: absolute; z-index: 2; display: block; width: 3px; min-width: 3px; background: var(--acc); border-radius: 2px; pointer-events: none; animation: cblink .9s steps(2, start) infinite; }
  .ct-multiline-input-wrap { width: 100%; }
  .c-inp-multiline { font-size: 12px; border-radius: 7px; }
  .c-inp-multiline:focus { outline: 2px solid color-mix(in srgb, var(--acc) 32%, transparent); outline-offset: 1px; }
`}</style><div className="fig-r-topbar space-y-2"><div className="flex items-center justify-between gap-1 min-w-0"><div className="flex items-center gap-1"><button type="button" className="fig-ibtn" disabled={!canUndo} data-tip="veUndo" onClick={undo}><Vi d="M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.36 2.64L3 13" s={15} /></button><button type="button" className="fig-ibtn" disabled={!canRedo} data-tip="veRedo" onClick={redo}><Vi d="M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 13" s={15} /></button></div><div className="flex items-center gap-1 min-w-0"><button type="button" className="fig-ibtn" data-tip="veZoomOut" onClick={() => zoomBy(1 / 1.25)}><Ico n="zoomOut" size={14} /></button><span ref={zoomPctRef} className="text-[11.5px] font-semibold tabular-nums text-center" data-tip="veZoomPct" style={{
          minWidth: 56,
          display: 'inline-block',
          fontVariantNumeric: 'tabular-nums'
        }}>{zFmt(displayZoomRef.current || zoom)}</span><button type="button" className="fig-ibtn" data-tip="veZoomIn" onClick={() => zoomBy(1.25)}><Ico n="zoomIn" size={14} /></button></div></div><Slider domRef={zoomSliderDomRef} min={0} max={1000} step={0.05} value={vzToSl(displayZoomRef.current || zoom)} on={v => setZ(vslToZ(v), null, null, true)} label="Zoom" tip="veZoomSl" /><div className="flex items-center gap-1.5 w-full"><button type="button" className={'ved-pill text-[11px] flex-1 justify-center' + (isPixelBoxModeActive(zoom) ? ' on' : '')} style={{
        padding: '5px 10px',
        flex: '1 1 0%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }} data-tip="vePixelMode" onClick={() => zoomToPixels()}>{L.riPixels}</button><button type="button" className="ved-pill text-[11px] flex-1 justify-center" style={{
        padding: '5px 10px',
        flex: '1 1 0%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }} data-tip="veZoomFit" onClick={fitView}>{L.riFit}</button></div></div><div className="fig-r-scroll"><div className="fig-isec" data-tip="veXfPanel"><div className="fig-isec-title"><span>Position & Transform</span></div><div className="fig-sub-lbl" data-tip="veAlnPanel">{L.riAlignDist}</div><div className="flex items-center gap-1 mb-2.5"><div className="fig-aln-bar flex-1">{[0, 1, 2, 3, 4, 5].map(ix => {
            const [k, tip, d] = ALN_BTNS[ix];
            return <button key={k} type="button" data-tip={tip} aria-label={(lang === 'en' ? TIPS_EN : TIPS)[tip].t} disabled={!selObjs.length || selNodes.size === 1} onClick={() => alignDo(k)}><Vi d={d} s={14} /></button>;
          })}</div><button type="button" className="fig-ibtn" style={{
          background: 'var(--sub)',
          width: 30,
          height: 30
        }} data-tip="veAlnDistH" disabled={!selObjs.length || selNodes.size > 0 || selObjs.length < 3} onClick={() => alignDo('distH')}><Vi d={ALN_BTNS[6][2]} s={14} /></button><button type="button" className="fig-ibtn" style={{
          background: 'var(--sub)',
          width: 30,
          height: 30
        }} data-tip="veAlnDistV" disabled={!selObjs.length || selNodes.size > 0 || selObjs.length < 3} onClick={() => alignDo('distV')}><Vi d={ALN_BTNS[7][2]} s={14} /></button></div>{!xm ? <div className="text-[11px] mut">{L.riHintPos}</div> : <div className="space-y-2.5 fade"><div><div className="fig-sub-lbl">Position</div><div className="grid grid-cols-2 gap-1.5"><XfField label="X" value={xp.x} on={v => setXfPos('x', v)} tip="veXfX" /><XfField label="Y" value={xp.y} on={v => setXfPos('y', v)} tip="veXfY" /></div></div><div><div className="fig-sub-lbl">Dimensions</div><div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center"><XfField label="W" value={xm.w} min={0.5} dis={!!xfNodes} on={v => setXfDim('w', v)} tip="veXfW" /><XfField label="H" value={xm.h} min={0.5} dis={!!xfNodes} on={v => setXfDim('h', v)} tip="veXfH" /><button type="button" className={'fig-ibtn' + (lockAR ? ' on' : '')} style={{
              background: 'var(--sub)',
              width: 30,
              height: 30
            }} data-tip="veXfLock" aria-label={L.riLockAR} aria-pressed={lockAR} onClick={() => setLockAR(v => !v)}><Vi s={14} d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></button></div></div><div><div className="fig-sub-lbl">Rotation & Flip</div><div className="grid grid-cols-[1fr_auto] gap-1.5 items-center"><XfField label="∠" value={xm.rot} step={1} dis={!!xfNodes} on={setXfRot} tip="veXfRot" /><div className="flex items-center gap-1"><button type="button" className="fig-ibtn" style={{
                background: 'var(--sub)',
                width: 30,
                height: 30
              }} data-tip="veXfFlipH" aria-label={L.riFlipH} disabled={!!xfNodes} onClick={() => flipXf('h')}><Vi s={15} d="M12 3v18 M8 7 3 12l5 5V7z M16 7l5 5-5 5V7z" /></button><button type="button" className="fig-ibtn" style={{
                background: 'var(--sub)',
                width: 30,
                height: 30
              }} data-tip="veXfFlipV" aria-label={L.riFlipV} disabled={!!xfNodes} onClick={() => flipXf('v')}><Vi s={15} d="M3 12h18 M7 8l5-5 5 5H7z M7 16l5 5 5-5H7z" /></button></div></div></div><div className="flex items-start gap-2.5 pt-0.5"><PinGrid L={L} value={pin} on={setPin} tip="veXfPin" /><div className="flex-1 space-y-1.5 min-w-0"><Seg o={[['center', L.riPivotCenter], ['pin', L.riPivotPin]]} v={rotPivot} on={setRotPivot} tip="veXfPivot" tips={{
              center: 'veXfPivC',
              pin: 'veXfPivP'
            }} /><button type="button" className={'ved-pill w-full' + (scaleStk ? ' on' : '')} data-tip="veXfStroke" aria-pressed={scaleStk} onClick={() => setScaleStk(v => !v)}>{L.riStrokeScale}</button></div></div></div>}</div>{(() => {
      const textObjs = selObjs.filter(o => o && o.text);
      const tPrimary = textObjs[0] || null;
      if (!tPrimary && tool !== 'text') return null;
      const tData = tPrimary ? tPrimary.text : {
        content: lang === 'en' ? 'New Text' : 'Teks Baru',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        fontSize: 36,
        fontStyle: 'normal',
        textDecoration: 'none',
        textAnchor: 'start',
        letterSpacing: 0,
        wordSpacing: 0,
        lineHeight: 1.2,
        textTransform: 'none',
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        baselineShift: 0
      };
      const updateSelText = (patch, histKey = 'p:text') => {
        const resolvedPatch = typeof patch === 'function' ? patch(tData) : patch;
        if (resolvedPatch && resolvedPatch.fontFamily && FontManager.ensureFontLoaded) {
          FontManager.ensureFontLoaded(resolvedPatch.fontFamily);
        }
        if (!textObjs.length) return;
        const ids = new Set(textObjs.map(o => o.id));
        commitObjs(o => ids.has(o.id) && !o.locked && o.text ? VE.updateTextObj(o, resolvedPatch) : o, histKey);
      };
      const handleAnchorChange = newAnchor => {
        if (!textObjs.length) return;
        const ids = new Set(textObjs.map(o => o.id));
        commitObjs(o => {
          if (!ids.has(o.id) || o.locked || !o.text) return o;
          const curT = o.text;
          if ((curT.textAnchor || 'start') === newAnchor) return o;
          const mbOld = VE.measureTextBox(curT);
          const mbNew = VE.measureTextBox({
            ...curT,
            textAnchor: newAnchor
          });
          /* Jaga posisi visual kotak teks di kanvas tetap stabil saat berganti Kiri / Tengah / Kanan */
          const sx = Number(curT.scaleX) || 1;
          const rad = (Number(curT.rotation) || 0) * Math.PI / 180;
          const deltaLocalX = (mbOld.xOff - mbNew.xOff) * sx;
          const nx = VE.rd((curT.x || 0) + deltaLocalX * Math.cos(rad));
          const ny = VE.rd((curT.y || 0) + deltaLocalX * Math.sin(rad));
          return VE.updateTextObj(o, {
            textAnchor: newAnchor,
            x: nx,
            y: ny
          });
        }, 'p:text-anchor');
      };
      const allFonts = FontManager.getAllFonts();
      const qSearch = (fontSearch || '').trim().toLowerCase();
      const filteredFonts = qSearch ? allFonts.filter(f => f.name.toLowerCase().includes(qSearch) || f.family.toLowerCase().includes(qSearch)) : allFonts;
      const curFontMeta = FontManager.findFontByNameOrFamily(tData.fontFamily);
      const availWeights = curFontMeta && Array.isArray(curFontMeta.weights) && curFontMeta.weights.length ? curFontMeta.weights : ALL_FONT_WEIGHTS;
      const fontOptions = filteredFonts.map(f => [f.family, f.name + (f.builtin ? '' : ' (Google)')]);
      if (!fontOptions.some(([fam]) => fam === tData.fontFamily)) {
        fontOptions.unshift([tData.fontFamily, curFontMeta.name || tData.fontFamily]);
      }
      const weightOptions = availWeights.map(w => [String(w), FONT_WEIGHT_LABELS[w] || String(w)]);
      if (!weightOptions.some(([w]) => Number(w) === Number(tData.fontWeight))) {
        weightOptions.push([String(tData.fontWeight || 400), FONT_WEIGHT_LABELS[tData.fontWeight] || String(tData.fontWeight || 400)]);
      }
      const handleAddGoogleFont = rawOverride => {
        const rawVal = typeof rawOverride === 'string' ? rawOverride : fontUrlInput;
        if (!String(rawVal || '').trim()) {
          setFontUrlStatus({
            ok: false,
            msg: L.riFontUrl
          });
          return;
        }
        const res = FontManager.addFontUrl(rawVal);
        if (!res.ok) {
          setFontUrlStatus({
            ok: false,
            msg: res.code ? L['riFontErr_' + res.code] : L.riFontUrlInvalid
          });
          return;
        }
        const firstAdded = res.added && res.added[0];
        setFontUrlInput('');
        setFontUrlStatus({
          ok: true,
          msg: L.riFontLoaded.replace('{names}', res.added.map(a => a.name).join(', '))
        });
        if (firstAdded && textObjs.length) {
          const nextW = firstAdded.weights.includes(Number(tData.fontWeight)) ? Number(tData.fontWeight) : firstAdded.weights.includes(400) ? 400 : firstAdded.weights[0];
          updateSelText({
            fontFamily: firstAdded.family,
            fontWeight: nextW
          }, 'p:font');
        }
      };
      return <div className="fig-isec fade" data-tip="veTextPanel"><div className="fig-isec-title"><span>Text & Typography{textObjs.length > 1 ? ' (' + textObjs.length + ')' : ''}</span><button type="button" className="ved-pill text-[10px] text-nowrap" style={{
            padding: '2px 7px'
          }} onClick={() => {
            const [vx0, vy0, vw0, vh0] = docRef.current.viewBox;
            const names = new Set(docRef.current.objects.map(q => q.name));
            let idx = 1;
            while (names.has('Text-' + idx)) idx++;
            const no = VE.makeTextObj({
              name: 'Text-' + idx,
              content: lang === 'en' ? 'New Text' : 'Teks Baru',
              x: Math.round(vx0 + vw0 * 0.35),
              y: Math.round(vy0 + vh0 * 0.5),
              fontFamily: tData.fontFamily,
              fontWeight: tData.fontWeight,
              fontSize: tData.fontSize,
              fill: primary && primary.fill && primary.fill !== 'none' ? primary.fill : '#18181b'
            });
            commit({
              ...docRef.current,
              objects: [...docRef.current.objects, no]
            });
            setSel({
              objs: new Set([no.id]),
              nodes: new Set()
            });
            say(no.name + ' dibuat');
          }}>{L.riAddText}</button></div>{!tPrimary ? <div className="text-[11px] mut mb-2">{L.riTextHint}</div> : <div className="space-y-2.5"><div><div className="flex items-center justify-between mb-1"><span className="fig-sub-lbl mb-0">{L.riTextContent}</span><button type="button" className="ved-pill text-[10px] text-nowrap" style={{
                padding: '1px 6px'
              }} data-tip="veTextNewLine" onClick={() => updateSelText({
                content: (tData.content || '') + (lang === 'en' ? '\nNew Line' : '\nBaris Baru')
              }, 'p:text-content')}>{L.riAddLine}</button></div><div className="fld px-2.5 py-1.5" style={{
              minHeight: 34
            }}><CustomTextBox value={tData.content} multiline={true} selectOnFocus={false} placeholder={L.riTypeHere} onChange={v => updateSelText({
                content: v
              }, 'p:text-content')} onCommit={v => updateSelText({
                content: v
              }, 'p:text-content')} /></div></div><div className="space-y-1.5"><div className="flex items-center justify-between"><span className="fig-sub-lbl mb-0">A. Font Family</span><span className="text-[10px] mut">{filteredFonts.length}/{allFonts.length} font</span></div><div className="fld px-2.5 py-1"><CustomTextBox value={fontSearch} selectOnFocus={false} placeholder={L.riFontSearchPh} onChange={v => setFontSearch(v)} />{fontSearch && <button type="button" className="fig-ibtn" style={{
                width: 18,
                height: 18
              }} data-tip="veFontSearchReset" onClick={() => setFontSearch('')}><Ico n="x" size={11} /></button>}</div><Select value={tData.fontFamily} on={fam => {
              const fMeta = FontManager.findFontByNameOrFamily(fam);
              const wList = fMeta && fMeta.weights || ALL_FONT_WEIGHTS;
              const nextW = wList.includes(Number(tData.fontWeight)) ? Number(tData.fontWeight) : wList.includes(400) ? 400 : wList[0];
              updateSelText({
                fontFamily: fam,
                fontWeight: nextW
              }, 'p:font-family');
            }} options={fontOptions} /></div><div className="p-2 rounded-xl space-y-1.5" style={{
            background: 'var(--sub)',
            border: '1px solid var(--line)'
          }}><div className="fig-sub-lbl mb-0">{L.riAddGoogleFonts}</div><div className="flex items-center gap-1.5"><div className="fld px-2 py-1 flex-1 min-w-0" style={{
                background: 'var(--card)'
              }}><CustomTextBox value={fontUrlInput} selectOnFocus={false} placeholder={L.riFontUrlPh} onChange={v => {
                  setFontUrlInput(v);
                  if (fontUrlStatus) setFontUrlStatus(null);
                }} onCommit={v => {
                  setFontUrlInput(v);
                }} /></div><button type="button" className="btn pri text-[11px] text-nowrap" style={{
                padding: '6px 10px',
                flex: 'none'
              }} onClick={() => handleAddGoogleFont(fontUrlInput)}>{L.riLoad}</button></div>{fontUrlStatus && <div className={'text-[10.5px] ' + (fontUrlStatus.ok ? 'text-emerald-600' : 'text-rose-500')}>{fontUrlStatus.msg}</div>}{customFonts.length > 0 && <div className="space-y-1 pt-1" style={{
              maxHeight: 110,
              overflowY: 'auto'
            }}>{customFonts.map(cf => <div key={cf.id} className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg text-[11px]" style={{
                background: 'var(--card)'
              }}><button type="button" className="truncate font-medium text-left flex-1" style={{
                  fontFamily: cf.family
                }} onClick={() => updateSelText({
                  fontFamily: cf.family
                }, 'p:font-family')}>{cf.name}</button><span className="fig-badge text-[9.5px] text-nowrap">{cf.status === 'error' ? L.riFontFail : cf.status === 'loading' ? L.riFontLoading : (cf.weights || []).length + 'w'}</span><button type="button" className="fig-ibtn" style={{
                  width: 20,
                  height: 20
                }} data-tip="veFontRemove" onClick={() => {
                  FontManager.removeFont(cf.id);
                  say('Font ' + cf.name + ' dihapus dari daftar');
                }}><Ico n="x" size={11} /></button></div>)}</div>}</div><div className="space-y-2"><div><div className="fig-sub-lbl">B. Font Weight</div><Select value={String(tData.fontWeight || 400)} on={v => updateSelText({
                fontWeight: Number(v) || 400
              }, 'p:font-weight')} options={weightOptions} /></div><div><div className="fig-sub-lbl">{L.riFontSize}</div><div className="flex items-center gap-1"><button type="button" className="fig-ibtn" style={{
                  background: 'var(--sub)',
                  width: 26,
                  height: 28
                }} data-tip="veFontSizeDown" onClick={() => updateSelText({
                  fontSize: Math.max(1, (Number(tData.fontSize) || 32) - 2)
                }, 'p:font-size')}>-</button><div className="flex-1 min-w-0"><XfField label="Sz" value={tData.fontSize} min={1} step={1} on={v => updateSelText({
                    fontSize: Math.max(1, v)
                  }, 'p:font-size')} /></div><button type="button" className="fig-ibtn" style={{
                  background: 'var(--sub)',
                  width: 26,
                  height: 28
                }} data-tip="veFontSizeUp" onClick={() => updateSelText({
                  fontSize: Math.max(1, (Number(tData.fontSize) || 32) + 2)
                }, 'p:font-size')}>+</button></div></div></div><div className="ved-pills">{[16, 24, 36, 48, 72, 96].map(sz => <button key={sz} type="button" className={'ved-pill text-[10px]' + (Math.round(Number(tData.fontSize) || 36) === sz ? ' on' : '')} onClick={() => updateSelText({
              fontSize: sz
            }, 'p:font-size')}>{sz}px</button>)}</div><div className="flex flex-wrap gap-2"><div className="flex-1" style={{
              minWidth: '100%'
            }}><div className="fig-sub-lbl text-nowrap">{L.riFontStyle}</div><div className="fig-wrap-tabs" role="group" aria-label={L.riFontStyle}>{[['normal', 'Normal'], ['italic', 'Italic'], ['oblique', 'Oblique']].map(([k, lbl]) => <button key={k} type="button" className={'text-nowrap whitespace-nowrap' + ((tData.fontStyle || 'normal') === k ? ' on' : '')} onClick={() => updateSelText({
                  fontStyle: k
                }, 'p:font-style')}><span className="text-nowrap whitespace-nowrap">{lbl}</span></button>)}</div></div><div className="flex-1" style={{
              minWidth: '100%'
            }}><div className="fig-sub-lbl text-nowrap">{L.riTextAlign}</div><div className="fig-wrap-tabs" role="group" aria-label={L.riTextAlign}>{[['start', L.riAlignLeft], ['middle', L.riAlignCenter], ['end', L.riAlignRight]].map(([k, lbl]) => <button key={k} type="button" className={'text-nowrap whitespace-nowrap' + ((tData.textAnchor || 'start') === k ? ' on' : '')} onClick={() => handleAnchorChange(k)}><span className="text-nowrap whitespace-nowrap">{lbl}</span></button>)}</div></div></div><div><div className="fig-sub-lbl text-nowrap">{L.riTextDecor}</div><div className="fig-wrap-tabs" role="group" aria-label={L.riTextDecor}>{[['none', 'None'], ['underline', 'Under'], ['overline', 'Over'], ['line-through', 'Strike']].map(([k, lbl]) => <button key={k} type="button" className={'text-nowrap whitespace-nowrap' + ((tData.textDecoration || 'none') === k ? ' on' : '')} onClick={() => updateSelText({
                textDecoration: k
              }, 'p:text-decoration')}><span className="text-nowrap whitespace-nowrap">{lbl}</span></button>)}</div></div><div className="space-y-1.5"><div className="fig-sub-lbl text-nowrap">{L.riCharSpacing}</div><div className="grid grid-cols-3 gap-1.5"><XfField label="AV" value={tData.letterSpacing || 0} step={0.5} on={v => updateSelText({
                letterSpacing: v
              }, 'p:letter-spacing')} /><XfField label="Wd" value={tData.wordSpacing || 0} step={1} on={v => updateSelText({
                wordSpacing: v
              }, 'p:word-spacing')} /><XfField label="LH" value={tData.lineHeight || 1.2} min={0.5} step={0.1} on={v => updateSelText({
                lineHeight: Math.max(0.5, v)
              }, 'p:line-height')} /></div><div className="fig-sub-lbl pt-0.5 text-nowrap">{L.riLetterTransform}</div><div className="fig-wrap-tabs" role="group" aria-label={L.riLetterTransform}>{[['none', L.riTransformOrig], ['uppercase', 'UPPER'], ['lowercase', 'lower'], ['capitalize', 'Title']].map(([k, lbl]) => <button key={k} type="button" className={'text-nowrap whitespace-nowrap' + ((tData.textTransform || 'none') === k ? ' on' : '')} onClick={() => updateSelText({
                textTransform: k
              }, 'p:text-transform')}><span className="text-nowrap whitespace-nowrap">{lbl}</span></button>)}</div></div><div className="space-y-1.5"><div className="fig-sub-lbl text-nowrap">{L.riTextScale}</div><div className="space-y-1.5"><XfField label="SX%" value={Math.round((tData.scaleX || 1) * 100)} min={10} step={5} on={v => updateSelText({
                scaleX: Math.max(0.1, v / 100)
              }, 'p:text-sx')} /><XfField label="SY%" value={Math.round((tData.scaleY || 1) * 100)} min={10} step={5} on={v => updateSelText({
                scaleY: Math.max(0.1, v / 100)
              }, 'p:text-sy')} /><XfField label="Base" value={tData.baselineShift || 0} step={1} on={v => updateSelText({
                baselineShift: v
              }, 'p:text-base')} /></div></div></div>}</div>;
    })()}<div className="fig-isec" data-tip="veAppear"><div className="fig-isec-title"><span>Appearance{selObjs.length > 1 ? ' (' + selObjs.length + ')' : ''}</span><button type="button" className="fig-ibtn" data-tip="veToggleHidden" disabled={!selObjs.length} onClick={toggleSelHidden}><Ico n={allSelHidden ? 'eyeOff' : 'eye'} size={14} /></button></div>{primary ? <div className="space-y-2.5 fade"><div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end"><div><div className="fig-sub-lbl">Opacity</div><XfField label="%" value={Math.round(primary.opacity * 100)} min={0} step={5} on={v => setProp('opacity', clampN(v / 100, 0, 1))} tip="veOpacity" /></div><div><div className="fig-sub-lbl">{indivCornerOpen && activeCorners.length < detectedCorners.length ? `Radius (${activeCorners.length}/${detectedCorners.length})` : 'Corner radius'}</div><XfField label="◜" value={curR} min={0} step={1} dis={!!(primary.img || primary.text)} on={setRadius} tip="veCornerRadius" /></div><button type="button" className={'fig-ibtn' + (indivCornerOpen ? ' on' : '')} style={{
            background: 'var(--sub)',
            width: 30,
            height: 30
          }} data-tip="veCorner" aria-pressed={indivCornerOpen} onClick={() => setIndivCornerOpen(v => !v)}><Vi s={14} d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></button></div>{indivCornerOpen && !primary.img && !primary.text && <div className="p-2.5 rounded-xl space-y-2.5 fade" style={{
          background: 'var(--sub)',
          border: '1px solid var(--line)'
        }}><div className="flex items-center justify-between gap-1"><span className="text-[11px] font-semibold">Individual Radius ({detectedCorners.length} {lang === 'en' ? 'corners' : 'sudut'})</span></div><Seg v={cornerMode} on={m => {
            setCornerMode(m);
            if (activeCorners.length) applyRadiusToCorners(activeCorners, curR, 'cr-mode');
          }} o={[['circular', 'Circular'], ['bezier', 'Squircle'], ['chamfer', 'Bevel']]} tip="veCornerMode" />{detectedCorners.length === 0 ? <div className="text-[11px] mut">{L.riNoCorners}</div> : <div className="space-y-2"><div className="flex flex-wrap gap-1"><button type="button" className={'ved-pill text-[10px]' + (activeCorners.length === detectedCorners.length ? ' on' : '')} onClick={() => setPickedCornerKeys(new Set(detectedCorners.map(c => c.key)))}>{L.riAllN.replace('{n}', detectedCorners.length)}</button><button type="button" className="ved-pill text-[10px]" onClick={() => setPickedCornerKeys(new Set(detectedCorners.filter((_, i) => i % 2 === 0).map(c => c.key)))}>{L.riOdd}</button><button type="button" className="ved-pill text-[10px]" onClick={() => setPickedCornerKeys(new Set(detectedCorners.filter((_, i) => i % 2 === 1).map(c => c.key)))}>{L.riEven}</button><button type="button" className="ved-pill text-[10px]" onClick={() => applyRadiusToCorners(activeCorners.length ? activeCorners : detectedCorners, 0, 'cr-reset')}>{L.riSharpen}</button></div><div className="text-[10.5px] mut">{L.riCornerPick}</div><div className="grid grid-cols-3 gap-1.5" style={{
              maxHeight: 132,
              overflowY: 'auto'
            }}>{detectedCorners.map(c => {
                const on = pickedCornerKeys.has(c.key);
                return <button key={c.key} type="button" className={'crn-chip' + (on ? ' on' : '')} data-tip-text={L.riCornerTip.replace('{idx}', c.idx).replace('{dir}', c.dir).replace('{r}', c.r)} onClick={e => {
                  setPickedCornerKeys(prev => {
                    const next = new Set(prev);
                    if (e.shiftKey) {
                      next.add(c.key);
                      return next;
                    }
                    if (next.has(c.key) && next.size > 1) next.delete(c.key);else next.add(c.key);
                    return next;
                  });
                }}><span className="truncate min-w-0">#{c.idx}{c.dir}</span><span className="font-mono text-[10px] opacity-80 flex-none">{c.r}</span></button>;
              })}</div><Range l={L.riRadiusN.replace('{n}', activeCorners.length)} v={curR} min={0} max={100} step={0.5} on={r => applyRadiusToCorners(activeCorners.length ? activeCorners : detectedCorners, r, 'cr-sel')} f={v => v ? v + ' u' : L.riSharp0} /><div className="text-[10.5px] mut pt-1">{L.riCornerTitle}</div><div className="grid grid-cols-2 gap-1.5" style={{
              maxHeight: 168,
              overflowY: 'auto'
            }}>{detectedCorners.map(c => <XfField key={'xf-' + c.key} label={'#' + c.idx + c.dir} value={c.r} min={0} step={1} on={v => applyRadiusToCorners([c], v, 'cr-one-' + c.key)} />)}</div></div>}</div>}{!primary.img && <div><div className="fig-sub-lbl" data-tip="veFillRule">{L.riFillRule}</div><Seg o={[['nonzero', 'Nonzero'], ['evenodd', 'Even-odd']]} v={primary.fillRule} on={v => setProp('fillRule', v)} tip="veFillRule" tips={{
            nonzero: 'veFillNonzero',
            evenodd: 'veFillEvenodd'
          }} /></div>}</div> : <div className="text-[11px] mut">{L.riHintStyle}</div>}</div>{primary && !primary.img && <div className="fig-isec fade" data-tip="veFill"><div className="fig-isec-title"><span>Fill{paintObjs.length === 1 && isBgObj(paintObjs[0]) && selObjs.length > 1 ? ' (Frame)' : ''}</span><div className="flex items-center gap-1"><button type="button" className="fig-ibtn" data-tip="vePipetteFill" onClick={async () => {
            const c = await pickScreenColor();
            if (c) commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
              ...o,
              fill: c,
              grad: null
            } : o, 'p:fill');
          }}><Ico n="pipette" size={13} /></button><button type="button" className="fig-ibtn" data-tip="veFillNone" onClick={() => {
            const nf = cp.fill === 'none' ? '#0d99ff' : 'none';
            commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
              ...o,
              fill: nf
            } : o, 'p:fill');
          }}><Ico n={cp.fill !== 'none' ? 'minus' : 'plus'} size={14} /></button></div></div><div className="space-y-2.5"><GradientEditorPanel L={L} obj={cp} selObjs={paintObjs} commitObjs={commitObjs} say={say} activeStopId={activeStopId} setActiveStopId={setActiveStopId} />{!VE.gradOn(cp) && <div className="flex items-center gap-2"><ColorField L={L} tip="veFill" value={cp.fill} on={v => commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
            ...o,
            fill: v,
            grad: null
          } : o, 'p:fill')} /><ColorText L={L} value={cp.fill} on={v => commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
            ...o,
            fill: v,
            grad: null
          } : o, 'p:fill')} /></div>}</div></div>}{primary && !primary.img && <div className="fig-isec fade" data-tip="veStroke"><div className="fig-isec-title"><span>Stroke{paintObjs.length === 1 && isBgObj(paintObjs[0]) && selObjs.length > 1 ? ' (Frame)' : ''}</span><div className="flex items-center gap-1"><button type="button" className="fig-ibtn" data-tip="vePipetteStroke" onClick={async () => {
            const c = await pickScreenColor();
            if (c) commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
              ...o,
              stroke: c,
              strokeWidth: o.strokeWidth || 1
            } : o, 'p:stroke');
          }}><Ico n="pipette" size={13} /></button><button type="button" className="fig-ibtn" data-tip="veStrokeNone" onClick={() => commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
            ...o,
            stroke: cp.stroke === 'none' ? '#000000' : 'none',
            strokeWidth: cp.stroke === 'none' ? o.strokeWidth || 1 : o.strokeWidth
          } : o, 'p:stroke')}><Ico n={cp.stroke !== 'none' ? 'minus' : 'plus'} size={14} /></button></div></div><div className="space-y-2"><div className="flex items-center gap-2"><ColorField L={L} tip="veStroke" value={cp.stroke} on={v => commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
            ...o,
            stroke: v,
            strokeWidth: v !== 'none' && !o.strokeWidth ? 1 : o.strokeWidth
          } : o, 'p:stroke')} /><ColorText L={L} value={cp.stroke} on={v => commitObjs(o => paintTargetIds.has(o.id) && !o.img ? {
            ...o,
            stroke: v,
            strokeWidth: v !== 'none' && !o.strokeWidth ? 1 : o.strokeWidth
          } : o, 'p:stroke')} /></div>{cp.stroke !== 'none' && <Range l="Stroke width" v={cp.strokeWidth || 0} min={0} max={20} step={0.5} on={v => commitObjs(o => paintTargetIds.has(o.id) && !o.img && (o.strokeWidth !== v || v > 0 && o.stroke === 'none') ? {
          ...o,
          stroke: v > 0 && o.stroke === 'none' ? '#000000' : o.stroke,
          strokeWidth: v
        } : o, 'p:sw')} tip="veStrokeW" />}</div></div>}{selectionColors.length > 0 && <div className="fig-isec fade"><div className="fig-isec-title"><span>Selection colors ({selectionColors.length})</span><span className="text-[10px] mut font-normal">{L.riSelColorHint}</span></div><div className="sel-col-list space-y-1.5">{selectionColors.slice(0, 40).map(sc => <div key={sc.stableKey} className="flex items-center gap-2 p-1.5 rounded-xl" style={{
          background: 'var(--sub)'
        }}><ColorField L={L} tip="veSelColor" value={sc.raw || sc.hex} on={v => replaceSelectionColor(sc, v)} /><span className="text-[11px] font-mono flex-1 truncate">{(sc.raw || sc.hex).toUpperCase()}</span><span className="fig-badge">{sc.kind === 'grad' ? L.riKindGrad : sc.kind === 'fill' ? 'Fill' : 'Stroke'} · {sc.ids.length}</span><button type="button" className="ved-pill text-[10px]" style={{
            padding: '2px 6px'
          }} data-tip="veSelPick" onClick={() => {
            setSel({
              objs: new Set(sc.ids),
              nodes: new Set()
            });
            say(sc.ids.length + ' objek ' + sc.hex.toUpperCase() + ' dipilih');
          }}>◎</button></div>)}</div></div>}<div className="fig-isec" data-tip="veLayPanel"><div className="fig-isec-title"><span>Auto layout</span><div className="flex items-center gap-1"><button type="button" className="ved-pill text-[10px]" style={{
            padding: '2px 6px'
          }} data-tip="veFrameAuto" disabled={!selObjs.some(o => o.group)} onClick={() => convertFrameToAutoLayout()}>{L.riFrameToAuto}</button></div></div><div className="fig-sub-lbl" data-tip="veLayDir">Flow</div><div className="fig-flow-bar mb-2.5"><button type="button" className={lay.dir === 'row' ? 'on' : ''} data-tip="veLayRow" onClick={() => layUpd({
          dir: 'row'
        })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 12h16m-4-4 4 4-4 4" /></svg><span>{L.riRows}</span></button><button type="button" className={lay.dir === 'col' ? 'on' : ''} data-tip="veLayCol" onClick={() => layUpd({
          dir: 'col'
        })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 4v16m-4-4 4 4 4-4" /></svg><span>{L.riColumns}</span></button><button type="button" className={lay.dir === 'wrap' ? 'on' : ''} data-tip="veLayWrap" onClick={() => layUpd({
          dir: 'wrap'
        })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg><span>Grid</span></button></div>{lay.dir === 'wrap' && <div className="mb-2.5"><Range l={L.riColsPerRow} v={lay.cols} min={1} max={10} step={1} on={v => layUpd({
          cols: v
        })} tip="veLayCols" /></div>}<div className="grid grid-cols-[auto_1fr] gap-2.5 items-start mb-2.5"><div><div className="fig-sub-lbl">Alignment</div><PinGrid L={L} value={[lay.ax, lay.ay]} on={p => layUpd({
            ax: p[0],
            ay: p[1]
          })} tip="veLayAlign" label={L.riAlignLbl} /></div><div><div className="fig-sub-lbl">{L.riGap}</div><XfField label="][ " value={lay.gap} min={0} on={v => layUpd({
            gap: v
          })} tip="veLayGap" /></div></div><div className="flex items-center justify-between mb-1"><span className="fig-sub-lbl mb-0" data-tip="veLayPad">Padding</span><button type="button" className={'ved-pill text-[10px]' + (lay.split ? ' on' : '')} style={{
          padding: '1px 6px'
        }} data-tip="veLayPadMode" aria-pressed={lay.split} onClick={() => setLay(l => ({
          ...l,
          split: !l.split
        }))}>{lay.split ? L.riPad4Sides : L.riPadSym}</button></div>{lay.split ? <div className="grid grid-cols-2 gap-1.5 mb-2.5 fade"><XfField label="T" value={lay.pt} min={0} on={v => layPad('pt', v)} tip="veLayPadT" /><XfField label="R" value={lay.pr} min={0} on={v => layPad('pr', v)} tip="veLayPadR" /><XfField label="B" value={lay.pb} min={0} on={v => layPad('pb', v)} tip="veLayPadB" /><XfField label="L" value={lay.pl} min={0} on={v => layPad('pl', v)} tip="veLayPadL" /></div> : <div className="mb-2.5"><Range l={L.riPadAll} v={lay.pt === lay.pr && lay.pr === lay.pb && lay.pb === lay.pl ? lay.pt : Math.max(lay.pt, lay.pr, lay.pb, lay.pl)} min={0} max={120} step={1} on={v => layPad('all', v)} tip="veLayPad" f={v => v + ' unit'} /></div>}<div className="space-y-2"><div className="flex items-center justify-between"><span className="text-[11px] mut" data-tip="veLayFrame">{L.riFrameBg}</span><Seg cls="eq" o={[['on', L.riFrameOn], ['off', L.riFrameOff]]} v={lay.frame ? 'on' : 'off'} on={v => layUpd({
            frame: v === 'on'
          })} tip="veLayFrame" /></div>{lay.frame && <Range l={L.riFrameRadius} v={lay.radius} min={0} max={60} step={1} on={v => layUpd({
          radius: v
        })} tip="veLayRadius" f={v => v ? v + ' unit' : L.riSharp} />}<div className="flex gap-2 pt-1.5"><button type="button" className="btn pri fig-cta-btn flex-1" data-tip="veLayApply" disabled={!layItems.length} onClick={() => runLayout(lay, true)}>{L.riApply}{layItems.length ? ' (' + layItems.length + ')' : ''}</button><button type="button" className="btn sec fig-cta-btn" data-tip="veLayArtboard" disabled={!doc.objects.length} onClick={padToArtboard}>{L.riToArtboard}</button></div></div></div><div className="fig-isec" data-tip="veBg"><div className="fig-isec-title"><span>{L.riCanvas}</span></div><div className="space-y-2.5"><Seg o={[['transparent', L.riBgTransparent], ['solid', 'Solid']]} v={bg.mode} on={v => setBg(b => ({
          ...b,
          mode: v
        }))} tip="veBg" tips={{
          transparent: 'veBgTr',
          solid: 'veBgSolid'
        }} /><div className="flex items-center gap-2 fade" data-tip="veBgColor"><ColorField L={L} tip="veBgColor" value={bg.mode === 'transparent' ? 'none' : bg.color} on={v => setBg(b => v === 'none' ? {
            ...b,
            mode: 'transparent'
          } : {
            ...b,
            mode: 'solid',
            color: v
          })} /><ColorText L={L} value={bg.mode === 'transparent' ? 'none' : bg.color} on={v => setBg(b => v === 'none' ? {
            ...b,
            mode: 'transparent'
          } : {
            ...b,
            mode: 'solid',
            color: v
          })} /></div></div></div><div className="fig-isec" data-tip="veExpFmt"><div className="fig-isec-title"><span>{L.riExportImport}</span><button type="button" className="fig-ibtn" data-tip="veImport" onClick={() => pickFiles('.svg,.ai,.ps,.eps,.pdf,.png,.jpg,.jpeg,.webp,.gif,image/*,application/postscript,application/pdf', fs => importFiles(fs))}><Ico n="upload" size={14} /></button></div><div className="space-y-2.5"><div><div className="fig-sub-lbl">{L.riExportFmt}</div><div className="ved-pills">{[['svg', 'SVG'], ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WEBP'], ['ai', 'AI'], ['eps', 'EPS']].map(([k, lb]) => <button key={k} type="button" data-tip={'veExp_' + k} className={'ved-pill' + (expFmt === k ? ' on' : '')} onClick={() => setExpFmt(k)}>{lb}</button>)}</div></div>{isRasterFmt(expFmt) && <div className="fade"><div className="fig-sub-lbl" data-tip="veExpScale">{L.riScaleRes}</div><Seg o={[[1, '1x'], [2, '2x (HD)'], [4, '4x (Ultra)']]} v={expScale} on={setExpScale} tip="veExpScale" tips={{
            1: 'veExpS_1',
            2: 'veExpS_2',
            4: 'veExpS_4'
          }} /></div>}<div><div className="fig-sub-lbl">{L.riExportArea}</div><Seg o={[['board', 'Artboard'], ['content', L.riAreaAll], ['sel', L.riAreaSel]]} v={exportArea} on={setExportArea} tip="veArea" tips={{
            board: 'veAreaBoard',
            content: 'veAreaAll',
            sel: 'veAreaSel'
          }} /></div><div className="flex gap-2 pt-1"><button type="button" className="btn sec fig-cta-btn flex-1" data-tip="veCopy" onClick={exportSvg}><Ico n="copy" size={14} />{L.riCopy} {expFmt.toUpperCase()}</button><button type="button" className="btn pri fig-cta-btn flex-1" data-tip="veDownload" onClick={downloadSvg}><Ico n="download" size={14} />{L.riDownload} .{expFmt.toUpperCase()}</button></div>{onExportBackup && <button type="button" className="btn sec fig-cta-btn w-full mt-1.5 text-xs" onClick={() => onExportBackup()}><Ico n="database" size={13} /><span>{L.riExportBackup}</span></button>}</div></div></div></aside>;

export { EditorRightInspector };
export default EditorRightInspector;
