/**
 * @file src/components/modals/SettingsModal.jsx
 * @description Dialog modal pengaturan tampilan, aksen, performa GPU, & informasi aplikasi (Settings)
 */
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { RENDER_CONFIG, updateRenderConfig, PERF_TELEMETRY } from '../../utils/renderConfigAndTelemetry.jsx';
import { usePresence } from '../../utils/presenceAndFilePicker.jsx';
import { applyTheme, applyMotion, applyAccent, savePrefs } from '../../utils/themeAndPrefsManager.jsx';
import { LS_KEY, DEFAULT_PREFS, ACCENT_PALETTE } from '../../constants/themeAndPrefsConstants.jsx';
import { GEOMETRY_CACHE } from '../../renderer/geometryCache.jsx';
import { Ico, Keys } from '../ui/IconGlyphs.jsx';
import { Seg } from '../ui/SegmentedControl.jsx';
import { ColorField } from '../ui/ColorPickerField.jsx';
import { parseColorWithAlpha } from '../../utils/colorParserAndFormatter.jsx';
import { ColorText } from '../ui/ColorHexInput.jsx';
import { pickScreenColor } from '../../utils/screenPipette.jsx';
import { GPU_INFO } from '../../utils/gpuCapabilities.jsx';
import { VE } from '../../engine/vectorEngine.jsx';
import { Range } from '../ui/RangeField.jsx';
import { GEOVANTA_BENCHMARK_SUITE } from '../../renderer/benchmarkSuite.jsx';
import { LOGO_INNER } from '../../constants/brandAndIcons.jsx';
import { SC, SC_EN } from '../../constants/keyboardShortcuts.jsx';
import { getSettingsStr } from '../../constants/settingsI18n.jsx';
import { getAppStr } from '../../constants/appI18n.jsx';

const Settings = ({
  open,
  onClose,
  prefs,
  setPrefs,
  flash
}) => {
  const [sTab, setSTab] = useState('umum');
  const [debugModeOpen, setDebugModeOpen] = useState(false);
  const [advRenderOpen, setAdvRenderOpen] = useState(false);
  const [renderCfg, setRenderCfgS] = useState(() => ({
    ...RENDER_CONFIG
  }));
  const [benchResults, setBenchResults] = useState(null);
  useEffect(() => {
    const onCfg = () => setRenderCfgS({
      ...RENDER_CONFIG
    });
    window.addEventListener('geovanta-render-config', onCfg);
    return () => window.removeEventListener('geovanta-render-config', onCfg);
  }, []);
  const setRenderCfg = patch => {
    const next = updateRenderConfig(patch);
    setRenderCfgS(next);
  };
  const [m, lv] = usePresence(open, 200);
  const L = getSettingsStr(prefs && prefs.lang);
  const scList = prefs && prefs.lang === 'en' ? SC_EN : SC;
  if (!m) return null;
  const set = k => v => {
    setPrefs(p => {
      const n = {
        ...p,
        [k]: v
      };
      if (k === 'theme') applyTheme(v);
      if (k === 'motion') applyMotion(v);
      if (k === 'accent') applyAccent(v);
      if (k === 'persist' || n.persist) savePrefs(n);else if (k === 'persist' && !v) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch (e) {}
      }
      return n;
    });
  };
  const reset = () => {
    const n = {
      ...DEFAULT_PREFS
    };
    setPrefs(n);
    applyTheme(n.theme);
    applyMotion(n.motion);
    applyAccent(n.accent);
    savePrefs(n);
    flash && flash(L.resetFlash);
  };
  const gpuOn = (!prefs || prefs.gpu !== false) && renderCfg.backendOverride !== 'svg';
  const snap = PERF_TELEMETRY.getSnapshot();
  const aa = snap.aaDiagnostics || {};
  const cacheStats = typeof GEOMETRY_CACHE !== 'undefined' && GEOMETRY_CACHE ? GEOMETRY_CACHE.getStats() : {
    hits: 0,
    misses: 0
  };
  const edApi = typeof window !== 'undefined' && window.__geovantaEditorApi || {};
  const curZoom = edApi.getZoom ? edApi.getZoom() : 1;
  const loadTestSvg = (svgStr, label) => {
    if (edApi.loadTestSvg) edApi.loadTestSvg(svgStr, label);
  };
  const loadTestDoc = (d, label) => {
    if (edApi.loadTestDoc) edApi.loadTestDoc(d, label);
  };
  const setZ = zf => {
    if (edApi.setZ) edApi.setZ(zf);
  };
  const runAutomatedBenchmarks = () => {
    if (edApi.runAutomatedBenchmarks) {
      const rows = edApi.runAutomatedBenchmarks();
      if (rows) setBenchResults(rows);
    }
  };
  return ReactDOM.createPortal(<div className={'ov ' + (lv ? 'out' : 'in')} onPointerDown={e => {
    if (e.target === e.currentTarget) onClose();
  }}><div className="hp stg-modal" role="dialog" aria-label={L.title} style={{
      maxWidth: 740
    }}><div className="hp-head"><div className="stg-hdr"><div className="stg-title-blk"><span className="stg-title-ico"><Ico n="settings" size={17} /></span><div className="flex flex-wrap items-baseline gap-2"><span className="text-sm font-semibold">{L.title}</span><span className="text-[11px] mut">{L.subtitle}</span></div></div><div className="flex flex-wrap items-center gap-2"><Seg v={sTab} on={setSTab} cls="ic" o={[['umum', L.tabGeneral, 'sliders'], ['keys', L.tabShortcuts, 'keyboard']]} tips={{
              umum: 'setTabUmum',
              keys: 'setTabKeys'
            }} /><button className="btn sec" style={{
              padding: 0,
              width: 32,
              height: 32,
              borderRadius: 10,
              flex: 'none'
            }} onClick={onClose} aria-label={L.close} data-tip="closeDlg"><Ico n="x" size={14} /></button></div></div></div><div className="hp-body"><div className="stg-stack" style={{
          display: sTab === 'umum' ? 'flex' : 'none'
        }}><div className="stg-sec"><div className="stg-sec-hdr"><span className="stg-sec-lbl"><Ico n="palette" size={13} /><span>{L.secAppearance}</span></span><span className="font-mono text-[10.5px] font-semibold px-2 py-0.5 rounded-md" style={{
                background: 'var(--fig-sel)',
                color: 'var(--acc)'
              }}>{(prefs.accent || '#13b152').toUpperCase()}</span></div><div className="stg-group"><div className="stg-row" data-tip="setTheme"><div className="stg-meta"><span className="stg-ico"><Ico n="eye" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.themeLabel}</span><span className="stg-sub">{L.themeSub}</span></div></div><div className="stg-ctrl"><Seg v={prefs.theme} on={set('theme')} o={[['system', L.themeSystem], ['light', L.themeLight], ['dark', L.themeDark]]} tip="setTheme" /></div></div><div className="stg-row" data-tip="setLang"><div className="stg-meta"><span className="stg-ico"><Ico n="flow" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.langLabel}</span><span className="stg-sub">{L.langSub}</span></div></div><div className="stg-ctrl"><Seg v={prefs.lang === 'en' ? 'en' : 'id'} on={set('lang')} o={[['id', 'Indonesia'], ['en', 'English']]} tip="setLang" /></div></div><div className="stg-row-col"><div className="flex flex-wrap items-center justify-between gap-2"><div className="stg-meta"><span className="stg-ico"><Ico n="brush" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.accentLabel}</span><span className="stg-sub">{L.accentSub}</span></div></div><div className="stg-ctrl"><ColorField L={getAppStr(prefs && prefs.lang)} value={prefs.accent || '#13b152'} on={v => {
                      if (v && v !== 'none') set('accent')(parseColorWithAlpha(v).hex);
                    }} /><div style={{
                      width: 104
                    }}><ColorText L={getAppStr(prefs && prefs.lang)} value={prefs.accent || '#13b152'} on={v => {
                        if (v && v !== 'none') set('accent')(parseColorWithAlpha(v).hex);
                      }} /></div><button type="button" className="btn sec text-[11px]" style={{
                      padding: '6px 10px',
                      borderRadius: 9
                    }} onClick={async () => {
                      const c = await pickScreenColor();
                      if (c) set('accent')(c);
                    }}><Ico n="pipette" size={13} /><span>{L.pipetteBtn}</span></button><button type="button" className="btn sec text-[11px]" style={{
                      padding: '6px 10px',
                      borderRadius: 9
                    }} onClick={() => set('accent')('#13b152')}><Ico n="reset" size={13} /><span>{L.defaultBtn}</span></button></div></div><div className="stg-pal-wrap">{ACCENT_PALETTE.map(([hex, name]) => {
                    const active = (prefs.accent || '#13b152').toLowerCase() === hex.toLowerCase();
                    return <button key={hex} type="button" className={'stg-pal-chip' + (active ? ' on' : '')} data-tip-text={name + ' (' + hex.toUpperCase() + ')'} onClick={() => set('accent')(hex)}><span className="stg-pal-dot" style={{
                        background: hex
                      }}>{active && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>{name}</span></button>;
                  })}</div></div></div></div><div className="stg-sec"><div className="stg-sec-hdr"><span className="stg-sec-lbl"><Ico n="sliders" size={13} /><span>{L.secInteraction}</span></span></div><div className="stg-group"><div className="stg-row" data-tip="setMotion"><div className="stg-meta"><span className="stg-ico"><Ico n="bolt" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.motionLabel}</span><span className="stg-sub">{L.motionSub}</span></div></div><div className="stg-ctrl"><Seg v={prefs.motion} on={set('motion')} o={[['system', L.themeSystem], ['on', L.on], ['off', L.off]]} tip="setMotion" /></div></div><div className="stg-row" data-tip="setTips"><div className="stg-meta"><span className="stg-ico"><Ico n="sparkle" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.tipsLabel}</span><span className="stg-sub">{L.tipsSub}</span></div></div><div className="stg-ctrl"><Seg v={prefs.tips ? 'on' : 'off'} on={k => set('tips')(k === 'on')} o={[['on', L.on], ['off', L.off]]} tip="setTips" /></div></div><div className="stg-row" data-tip="setPersist"><div className="stg-meta"><span className="stg-ico"><Ico n="database" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.persistLabel}</span><span className="stg-sub">{L.persistSub}</span></div></div><div className="stg-ctrl"><Seg v={prefs.persist ? 'on' : 'off'} on={k => set('persist')(k === 'on')} o={[['on', L.yes], ['off', L.no]]} tip="setPersist" /></div></div><div className="stg-row"><div className="stg-meta"><span className="stg-ico"><Ico n="reset" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.resetLabel}</span><span className="stg-sub">{L.resetSub}</span></div></div><div className="stg-ctrl"><button type="button" className="btn sec text-xs" style={{
                    padding: '7px 11px',
                    borderRadius: 9
                  }} data-tip="setReset" onClick={reset}><Ico n="reset" size={13} /><span>{L.resetBtn}</span></button><button type="button" className="btn sec text-xs" style={{
                    padding: '7px 11px',
                    borderRadius: 9
                  }} data-tip="help" onClick={() => setSTab('keys')}><Ico n="keyboard" size={13} /><span>{L.shortcutsBtn}</span></button></div></div></div></div><div className="stg-sec"><div className="stg-sec-hdr"><span className="stg-sec-lbl"><Ico n="chip" size={13} /><span>{L.secEngine}</span></span><span className="abt-ver font-mono" style={{
                fontSize: 10,
                padding: '2px 8px'
              }}>{PERF_TELEMETRY.getBadgeText(prefs.gpu !== false)}</span></div><div className="stg-group"><div className="stg-row"><div className="stg-meta"><span className="stg-ico"><Ico n="chip" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.gpuLabel}</span><span className="stg-sub font-mono" style={{
                      color: 'var(--acc)'
                    }}>{GPU_INFO}</span></div></div><div className="stg-ctrl"><Seg v={prefs.gpu !== false ? 'on' : 'off'} on={k => set('gpu')(k === 'on')} o={[['on', L.on], ['off', L.off]]} /><button type="button" className={'btn ' + (advRenderOpen ? 'pri' : 'sec') + ' text-[11px]'} style={{
                    padding: '6px 10px',
                    borderRadius: 9
                  }} onClick={() => setAdvRenderOpen(v => !v)}><Ico n="sliders" size={13} /><span>{L.paramsBtn}</span></button><button type="button" className={'btn ' + (debugModeOpen ? 'pri' : 'sec') + ' text-[11px]'} style={{
                    padding: '6px 10px',
                    borderRadius: 9
                  }} onClick={() => setDebugModeOpen(v => !v)}><Ico n="code" size={13} /><span>{L.debugBtn}</span></button></div></div><div className="stg-row-col"><div className="stg-stat-wrap"><div className="stg-stat-pill"><span>{L.statBackend}</span><b style={{
                      color: 'var(--acc)'
                    }}>{gpuOn ? snap.activeBackend : 'SVG DOM'}</b></div><div className="stg-stat-pill"><span>{L.statAA}</span><b>{aa.antialiasEnabled ? `MSAA ${aa.samples || 1}x` : renderCfg.aaMode.toUpperCase()}</b></div><div className="stg-stat-pill"><span>{L.statLOD}</span><b>L{snap.lodLevel} · ε={VE.rd(snap.currentEpsilon)}</b></div><div className="stg-stat-pill"><span>{L.statGeom}</span><b>{snap.totalVertices}v · {snap.fillTriangleCount + snap.strokeTriangleCount}Δ</b></div><div className="stg-stat-pill"><span>{L.statFrame}</span><b>{snap.renderPassMs} ms (p95 {PERF_TELEMETRY.state.p95} ms)</b></div><div className="stg-stat-pill"><span>{L.statCache}</span><b>{cacheStats.hits}H / {cacheStats.misses}M</b></div></div></div><div className="stg-row-col space-y-2.5" style={{
                display: advRenderOpen ? 'flex' : 'none',
                background: 'color-mix(in srgb, var(--sub) 35%, var(--card))'
              }}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium mut">{L.renderPath}</span><div className="stg-ctrl"><Seg v={renderCfg.backendOverride} on={v => setRenderCfg({
                      backendOverride: v
                    })} o={[['auto', 'Auto (WebGL2)'], ['webgl2', 'WebGL2'], ['canvas2d', 'Canvas2D'], ['svg', 'SVG DOM']]} /></div></div><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium mut">{L.renderAA}</span><div className="stg-ctrl"><Seg v={renderCfg.aaMode} on={v => setRenderCfg({
                      aaMode: v
                    })} o={[['msaa', 'MSAA'], ['analytic', 'Analytic AA'], ['ssaa', 'SSAA 1.5×'], ['fxaa', 'FXAA']]} /></div></div><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium mut">{L.seamGuard}</span><Seg v={renderCfg.seamGuard ? 'on' : 'off'} on={k => setRenderCfg({
                      seamGuard: k === 'on'
                    })} o={[['off', L.seamOff], ['on', L.seamOn]]} /></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium mut">{L.localCoord}</span><Seg v={renderCfg.localCoordRebasing ? 'on' : 'off'} on={k => setRenderCfg({
                      localCoordRebasing: k === 'on'
                    })} o={[['on', L.rebaseOn], ['off', L.rebaseOff]]} /></div></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1"><Range l={L.targetPixelError} v={renderCfg.targetPixelError} min={0.05} max={1.5} step={0.05} on={v => setRenderCfg({
                    targetPixelError: v
                  })} f={v => v.toFixed(2) + ' px'} /><Range l={L.maxBezierDepth} v={renderCfg.maxBezierDepth} min={6} max={20} step={1} on={v => setRenderCfg({
                    maxBezierDepth: v
                  })} f={v => 'Depth ' + v} /></div></div><div className="stg-row-col space-y-2.5" style={{
                display: debugModeOpen ? 'flex' : 'none',
                background: 'color-mix(in srgb, var(--sub) 45%, var(--card))'
              }}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-semibold flex items-center gap-1.5"><Ico n="layers" size={13} /><span>{L.debugOverlay}</span></span><div className="flex flex-wrap items-center gap-1">{[['none', 'Normal'], ['original', '1. Original Path'], ['polyline', '2. Flattened Polyline'], ['mesh', '3. Tessellation Mesh'], ['fill_tris', '4. Fill Triangles'], ['stroke_tris', '5. Stroke Triangles'], ['seam_guard', '6. Seam Guard'], ['edge_coverage', '7. Edge Coverage']].map(([k, lb]) => <button key={k} type="button" className={'ved-pill text-[10.5px]' + (renderCfg.debugMode === k ? ' on' : '')} onClick={() => setRenderCfg({
                      debugMode: k,
                      debugGeometry: k !== 'none'
                    })}>{lb}</button>)}</div></div><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-semibold flex items-center gap-1.5"><Ico n="shapes" size={13} /><span>{L.testScenario}</span></span><div className="flex flex-wrap items-center gap-1"><button type="button" className="ved-pill text-[10.5px]" onClick={() => loadTestSvg(GEOVANTA_BENCHMARK_SUITE.buildCircleSvg(), L.test01Load)}>{L.test01Label}</button><button type="button" className="ved-pill text-[10.5px]" onClick={() => loadTestSvg(GEOVANTA_BENCHMARK_SUITE.buildBezierSvg(), L.test02Load)}>{L.test02Label}</button><button type="button" className="ved-pill text-[10.5px]" onClick={() => loadTestSvg(GEOVANTA_BENCHMARK_SUITE.buildDiagonalSvg(), L.test03Load)}>{L.test03Label}</button><button type="button" className="ved-pill text-[10.5px]" onClick={() => loadTestSvg(GEOVANTA_BENCHMARK_SUITE.buildCompoundSvg(), L.test04Load)}>{L.test04Label}</button>{[10, 100, 1000, 10000].map(cnt => <button key={cnt} type="button" className="ved-pill text-[10.5px]" onClick={() => loadTestDoc(GEOVANTA_BENCHMARK_SUITE.buildNodeDensityDoc(cnt), L.nodesLoad(cnt))}>{L.nodesBtn(cnt)}</button>)}<button type="button" className="ved-pill text-[10.5px]" onClick={() => loadTestDoc(GEOVANTA_BENCHMARK_SUITE.buildExtremeCoordinateDoc(100000000), L.testCoordLabel)}>{L.testCoordBtn}</button><button type="button" className="ved-pill text-[10.5px]" onClick={() => loadTestDoc(GEOVANTA_BENCHMARK_SUITE.buildSeamMosaicDoc(240), L.testMosaicLabel)}>{L.testMosaicBtn}</button></div></div><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><Seg v={renderCfg.pixelPreviewMode} on={v => setRenderCfg({
                      pixelPreviewMode: v
                    })} o={[['smooth', '1. Smooth Vector'], ['hard', '3. Hard Pixel (Solid)'], ['coverage', '2. Coverage AA']]} /><div className="stg-stat-pill"><span>Partial Alpha:</span><b style={{
                        color: snap.partialAlphaPixels === 0 ? '#10b981' : '#f59e0b'
                      }}>{snap.partialAlphaPixels} px</b></div></div><div className="flex flex-wrap items-center gap-1">{[0.25, 1, 4, 8, 16, 32, 64, 128, 256].map(zf => <button key={zf} type="button" className={'ved-pill text-[10px]' + (Math.abs(curZoom - zf) < 0.05 ? ' on' : '')} onClick={() => setZ(zf)}>{zf * 100}%</button>)}</div></div><div className="flex flex-wrap items-center justify-between gap-2 pt-1"><button type="button" className="btn pri text-[11px] py-2 px-3.5" onClick={runAutomatedBenchmarks}><Ico n="play" size={12} /><span>{L.runBench}</span></button></div>{benchResults && <div className="p-2.5 rounded-xl text-[10px] font-mono space-y-1" style={{
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  maxHeight: 165,
                  overflowY: 'auto'
                }}><div className="font-bold text-[10.5px] mb-1" style={{
                    color: 'var(--acc)'
                  }}>{L.benchResults}</div>{benchResults.map((r, idx) => <div key={idx} className="flex flex-wrap items-center justify-between gap-2 py-0.5" style={{
                    borderBottom: '1px solid var(--line)'
                  }}><span>{r.name}</span><span>L{r.lod} · {r.verts}v · {r.ms}ms · {r.cacheHitVerified ? 'Cache✓' : ''}</span></div>)}</div>}</div></div></div><div className="stg-sec"><div className="stg-sec-hdr"><span className="stg-sec-lbl" data-tip="setAbout"><Ico n="sparkle" size={13} /><span>{L.aboutTitle}</span></span></div><div className="stg-about-hero"><div className="stg-about-top"><div className="stg-about-logo"><svg role="img" aria-label="Geovanta" viewBox="150 180 1750 380" style={{
                    height: 54,
                    width: 249,
                    display: 'block',
                    color: 'var(--acc)'
                    /* Tanpa drop-shadow: filter me-raster logo lalu mem-blur-kan
                       tepi huruf + lubang kecil pada huruf G (tampak pecah
                       pada ukuran kecil). shapeRendering di bawah memaksa
                       geometri presisi. */
                  }} shapeRendering="geometricPrecision" dangerouslySetInnerHTML={{
                    __html: LOGO_INNER
                  }} /></div><div className="flex flex-wrap items-center gap-2"><span className="abt-ver" style={{
                    padding: '5px 12px',
                    fontSize: 11.5
                  }}><Ico n="sparkle" size={11} /><span>{L.version}</span></span></div></div><div className="stg-about-badges"><span className="stg-about-pill"><Ico n="shapes" size={13} /><span>Precision Vector Studio</span></span><span className="stg-about-pill"><Ico n="chip" size={13} /><span>Hybrid WebGL2 Engine</span></span><span className="stg-about-pill"><Ico n="wand" size={13} /><span>Adaptive Bézier & Topology</span></span></div></div></div></div>{sTab === 'keys' && <div className="space-y-4 fade" key="s-keys"><div className="stg-group"><div className="stg-row"><div className="stg-meta"><span className="stg-ico"><Ico n="keyboard" size={15} /></span><div className="stg-txt"><span className="stg-lbl">{L.keysTitle}</span><span className="stg-sub">{L.keysSubPrefix}<kbd className="kbd">?</kbd>{L.keysSubSuffix}</span></div></div></div></div><div className="hp-g">{scList.map(([g, rows]) => <div key={g} className="stg-group p-3"><div className="hp-t flex items-center gap-1.5"><Ico n="keyboard" size={12} /><span>{g}</span></div>{rows.map(([k, t]) => <div key={t} className="hp-r flex-wrap"><span>{t}</span><Keys s={k} /></div>)}</div>)}</div></div>}</div></div></div>, document.fullscreenElement || document.body);
};

export { Settings };
export default Settings;
