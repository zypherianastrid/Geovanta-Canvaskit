/**
 * @file src/components/editor/VectorEditor.jsx
 * @description Komponen ruang kerja utama Vector Editor interaktif (VectorEditor)
 */
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { DEFAULT_PREFS, VZMIN, VZMAX } from '../../constants/themeAndPrefsConstants.jsx';
import { RENDER_CONFIG, updateRenderConfig, PERF_TELEMETRY } from '../../utils/renderConfigAndTelemetry.jsx';
import { VE } from '../../engine/vectorEngine.jsx';
import { zFmt, vzToSl } from '../../utils/zoomAndFormatHelpers.jsx';
import { clampN, hex2hsv, hsv2hex } from '../../utils/colorMath.jsx';
import { getAppStr, translateToast } from '../../constants/appI18n.jsx';
import { setSceneInteractingZoom, buildObjectGpuBuffers } from '../../renderer/polygonTriangulatorAndStroke.jsx';
import { FontManager } from '../../utils/fontManager.jsx';
import { DEFAULT_SNAP_CFG, VE_NODE_GROUP, VE_GEO_GROUP, SHAPES, SNAP_TOOL_CAPABILITIES } from '../../constants/editorToolsAndShapes.jsx';
import { ACTIVE_DEVICE_PROFILE } from '../../utils/gpuCapabilities.jsx';
import { cssToHex, parseColorWithAlpha } from '../../utils/colorParserAndFormatter.jsx';
import { vinfo, buildScopeBatches } from '../../renderer/pathWindingAndBatching.jsx';
import { LAYER_ROW_EST_PX } from './LayerTreeViewport.jsx';
import { SceneRenderer } from '../../renderer/sceneRenderer.jsx';
import { AssetManager } from '../../workspace/assetManager.jsx';
import { shapeRect } from '../../utils/shapeGenerators.jsx';
import { ICONS } from '../../constants/brandAndIcons.jsx';
import { TIPS, TIPS_EN } from '../../constants/tooltipsCatalog.jsx';
import { Vi, Chev, Ico } from '../ui/IconGlyphs.jsx';
import { Float } from '../ui/FloatPopover.jsx';
import { EditorActionRail } from './EditorActionRail.jsx';
import { EditorLeftSidebar } from './EditorLeftSidebar.jsx';
import { CanvasObj, CompositePathObj } from './CanvasVectorObjects.jsx';
import { GradientCanvasGizmo } from './GradientCanvasGizmo.jsx';
import { SelectionRotationAndRedlines } from './SelectionRotationAndRedlines.jsx';
import { RenderDebugCanvasOverlay } from './RenderDebugCanvasOverlay.jsx';
import { EditorSimplifyStrip } from './EditorSimplifyStrip.jsx';
import { EditorOffsetStrip } from './EditorOffsetStrip.jsx';
import { Slider } from '../ui/Slider.jsx';
import { XfField } from '../ui/TransformField.jsx';
import { CustomTextBox } from '../ui/CustomTextBox.jsx';
import { EditorFloatingToolbar } from './EditorFloatingToolbar.jsx';
import { GEOVANTA_BENCHMARK_SUITE } from '../../renderer/benchmarkSuite.jsx';
import { GEOMETRY_CACHE } from '../../renderer/geometryCache.jsx';
import { getObjectTessellationLOD } from '../../renderer/objectTessellationLod.jsx';
import { EditorRightInspector } from './EditorRightInspector.jsx';
import { CtxMenu } from '../ui/ContextMenu.jsx';

const VectorEditor = ({
  initialSvg,
  initialDoc = null,
  initialViewState = null,
  projectId = null,
  projectName = 'Untitled Project',
  saveStatus = 'saved',
  onDocumentCommit = null,
  onViewStateChange = null,
  onBackToWorkspace = null,
  onRenameProject = null,
  onExportBackup = null,
  onRetrySave = null,
  flash,
  active = true,
  full = true,
  prefs = DEFAULT_PREFS,
  onHelp = () => {},
  onSettings = () => {}
}) => {
  const [renderCfg, setRenderCfgState] = useState(() => ({
    ...RENDER_CONFIG
  }));
  const [diagOpen, setDiagOpen] = useState(false);
  const [benchResults, setBenchResults] = useState(null);
  const setRenderCfg = patch => {
    const next = updateRenderConfig(patch);
    setRenderCfgState(next);
    if (sceneRendererRef.current) sceneRendererRef.current.requestRender(true);
  };
  useEffect(() => {
    const onCfg = () => {
      setRenderCfgState({
        ...RENDER_CONFIG
      });
      if (sceneRendererRef.current) sceneRendererRef.current.requestRender(true);
    };
    const onAcc = () => {
      if (sceneRendererRef.current) sceneRendererRef.current.requestRender(true);
    };
    window.addEventListener('geovanta-render-config', onCfg);
    window.addEventListener('geovanta-accent-change', onAcc);
    return () => {
      window.removeEventListener('geovanta-render-config', onCfg);
      window.removeEventListener('geovanta-accent-change', onAcc);
    };
  }, []);
  const L = getAppStr(prefs && prefs.lang);
  const TT = prefs && prefs.lang === 'en' ? TIPS_EN : TIPS;
  const unsSummary = d => {
    if (d && d.unsupportedElements && d.unsupportedElements.length) return d.unsupportedElements.slice(0, 6).join(', ') + (d.unsupportedElements.length > 6 ? ' +' + (d.unsupportedElements.length - 6) + L.edUnsupportedMore : '');
    const s = d && d.unsupportedSummary;
    return s ? s.replace(' lainnya', L.edUnsupportedMore) : L.edUnsupportedDefault;
  };
  const gpuOn = (!prefs || prefs.gpu !== false) && renderCfg.backendOverride !== 'svg';
  const say = m => {
    if (!full && flash) flash(m);
    /* Pesan status editor (ved-toast) diterjemahkan di sini; toast App
       diterjemahkan saat render di App.jsx. */
    setLmsg(translateToast(m, prefs && prefs.lang));
    clearTimeout(lmT.current);
    lmT.current = setTimeout(() => setLmsg(''), 2200);
  };
  const first = React.useMemo(() => {
    if (initialDoc && Array.isArray(initialDoc.objects) && Array.isArray(initialDoc.viewBox)) return initialDoc;
    return initialSvg ? VE.parseSVG(initialSvg) : {
      viewBox: [0, 0, 800, 600],
      objects: []
    };
  }, []);
  const initZ = initialViewState && typeof initialViewState.zoom === 'number' && isFinite(initialViewState.zoom) ? initialViewState.zoom : 1;
  const initP = initialViewState && initialViewState.pan && typeof initialViewState.pan.x === 'number' ? {
    x: initialViewState.pan.x,
    y: initialViewState.pan.y
  } : {
    x: 40,
    y: 40
  };
  const [doc, setDocS] = useState(first);
  const docRef = useRef(first);
  const hist = useRef({
    s: [first],
    p: 0,
    key: null,
    t: 0
  });
  const [sel, setSelS] = useState({
    objs: new Set(),
    nodes: new Set()
  });
  const selRef = useRef(sel);
  const setSel = s => {
    selRef.current = s;
    setSelS(s);
  };
  const [tool, setTool] = useState('select');
  const [zoom, setZoom] = useState(initZ),
    [pan, setPan] = useState(initP);
  const [curveDragOn, setCurveDragOn] = useState(true); /* Aktif secara default agar handle No Mirroring bisa digeser melengkung */
  const zoomRef = useRef(initZ),
    panRef = useRef(initP),
    vpRef = useRef(null),
    viewPend = useRef(0),
    viewSettleTimer = useRef(0);
  const zoomPctRef = useRef(null),
    zoomSliderDomRef = useRef(null),
    pixelModeZoomLblRef = useRef(null);
  const displayZoomRef = useRef(initZ),
    zoomUiRafRef = useRef(0);
  const sceneCanvasRef = useRef(null),
    sceneRendererRef = useRef(null),
    liveRafRef = useRef(0),
    docRevRef = useRef(1);
  const [viewInteracting, setViewInteracting] = useState(false);
  const syncZoomSidebarDom = zVal => {
    if (zoomPctRef.current) {
      zoomPctRef.current.textContent = zFmt(zVal);
    }
    if (pixelModeZoomLblRef.current) {
      const m = RENDER_CONFIG.pixelPreviewMode;
      pixelModeZoomLblRef.current.textContent = `${m === 'hard' ? 'Hard Pixel Solid' : m === 'coverage' ? 'Pixel Coverage AA' : 'Smooth Vector'} (${Math.max(1, Math.round(zVal))}×)`;
    }
    const slEl = zoomSliderDomRef.current;
    if (slEl && !slEl.classList.contains('drag')) {
      const slVal = clampN(vzToSl(zVal), 0, 1000);
      const pct = slVal / 1000 * 100;
      const fillEl = slEl.querySelector('.sl-f');
      const thumbEl = slEl.querySelector('.sl-h');
      if (fillEl) {
        fillEl.style.transition = 'none';
        fillEl.style.width = pct + '%';
      }
      if (thumbEl) {
        thumbEl.style.transition = 'none';
        thumbEl.style.left = pct + '%';
      }
    }
  };
  const zoomUiLastTsRef = useRef(0);
  const scheduleSmoothZoomReadout = (snapImmediate = false) => {
    if (zoomUiRafRef.current) {
      cancelAnimationFrame(zoomUiRafRef.current);
      zoomUiRafRef.current = 0;
    }
    zoomUiLastTsRef.current = 0;
    displayZoomRef.current = zoomRef.current;
    syncZoomSidebarDom(zoomRef.current);
  };

  /* Helper format matriks kamera <g ref={vpRef}>:
     matrix(z 0 0 z px py) memetakan titik dokumen (x,y) -> (x*z + px, y*z + py)
     identik 100% dengan translate(px, py) scale(z) tanpa string parsing ganda. */
  const fmtVpMat = (z, px, py) => {
    const r = v => Math.round(v * 1e5) / 1e5;
    return 'matrix(' + r(z) + ' 0 0 ' + r(z) + ' ' + r(px) + ' ' + r(py) + ')';
  };
  const applyVP = (syncRender = false, snapReadout = false, isPanOnly = false) => {
    const g = vpRef.current;
    const z = zoomRef.current,
      p = panRef.current;
    if (g) {
      g.setAttribute('transform', fmtVpMat(z, p.x, p.y));
      /* Editor teks DOM berada di atas SVG, jadi sinkronkan dengan matriks kamera
         pada frame yang sama agar tidak tertinggal saat zoom/pan berlangsung. */
      const textEditor = boxRef.current && boxRef.current.querySelector('.ct-canvas-editor[data-doc-x]');
      if (textEditor) {
        const docX = Number(textEditor.dataset.docX),
          docY = Number(textEditor.dataset.docY),
          fontSize = Number(textEditor.dataset.baseFontSize),
          scaleX = Number(textEditor.dataset.scaleX),
          scaleY = Number(textEditor.dataset.scaleY),
          boxW = Number(textEditor.dataset.boxWidth),
          boxH = Number(textEditor.dataset.boxHeight),
          letterSpacing = Number(textEditor.dataset.letterSpacing),
          wordSpacing = Number(textEditor.dataset.wordSpacing);
        if ([docX, docY, fontSize, scaleX, scaleY, boxW, boxH].every(Number.isFinite)) {
          textEditor.style.left = (docX * z + p.x) + 'px';
          textEditor.style.top = (docY * z + p.y) + 'px';
          textEditor.style.width = Math.max(0.1, boxW * z) + 'px';
          textEditor.style.height = Math.max(0.1, boxH * z) + 'px';
          textEditor.style.fontSize = Math.max(0.1, fontSize * scaleY * z) + 'px';
          textEditor.style.letterSpacing = (letterSpacing * scaleX * z) + 'px';
          textEditor.style.wordSpacing = (wordSpacing * scaleX * z) + 'px';
          const canvasInput = textEditor.querySelector('textarea.ct-canvas-inline');
          if (canvasInput) {
            const textWidth = Number(textEditor.dataset.measuredWidth),
              sx = Math.abs(scaleX),
              sy = Math.abs(scaleY),
              safeSy = Math.max(0.0001, sy);
            canvasInput.style.width = Math.max(0.1, textWidth * sy * z) + 'px';
            canvasInput.style.transform = 'scaleX(' + sx / safeSy + ')';
            canvasInput.style.letterSpacing = (letterSpacing * sy * z) + 'px';
            canvasInput.style.wordSpacing = (wordSpacing * sy * z) + 'px';
          }
        }
      }
      if (!isPanOnly) {
        const bbG = g.querySelector('.vc-bbox-overlay');
        if (bbG) {
          const hs = 6 / z,
            h2 = hs * 0.5;
          const rects = bbG.querySelectorAll('rect[data-hx]');
          for (let i = 0; i < rects.length; i++) {
            const rEl = rects[i];
            const hx = parseFloat(rEl.getAttribute('data-hx'));
            const hy = parseFloat(rEl.getAttribute('data-hy'));
            if (isFinite(hx) && isFinite(hy)) {
              rEl.setAttribute('x', String(hx - h2));
              rEl.setAttribute('y', String(hy - h2));
              rEl.setAttribute('width', String(hs));
              rEl.setAttribute('height', String(hs));
            }
          }
        }
        if (containerBoxes.length) {
          /* Nama Frame & Group membesar saat di-zoom out (z < 1) namun dibatasi maksimal 36px (rentang 32-48px) */
          const zLbl = Math.max(1e-4, Math.min(1, z));
          const fFs = String(Math.min(36, Math.max(15, Math.round(15 / zLbl * 100) / 100)));
          if (g._lastFrameFs !== fFs) {
            g._lastFrameFs = fFs;
            const fOff = Math.min(19.2, Math.max(8, Math.round(8 / zLbl * 100) / 100));
            const fLbls = g.querySelectorAll('text[data-frame-lbl]');
            for (let i = 0; i < fLbls.length; i++) {
              const tEl = fLbls[i];
              const by = parseFloat(tEl.getAttribute('data-by'));
              tEl.setAttribute('font-size', fFs);
              if (isFinite(by)) tEl.setAttribute('y', String(Math.round((by - fOff) * 100) / 100));
            }
          }
        }
      }
    }
    if (!isPanOnly) {
      scheduleSmoothZoomReadout(true);
    }
    if (boxRef.current) {
      if (sceneRendererRef.current) {
        const cw = boxRectRef.current && boxRectRef.current.width || boxRef.current.clientWidth || 1280;
        const ch = boxRectRef.current && boxRectRef.current.height || boxRef.current.clientHeight || 800;
        sceneRendererRef.current.isZooming = !isPanOnly && !snapReadout;
        sceneRendererRef.current.setCamera(z, p.x, p.y, cw, ch);
        if (syncRender) sceneRendererRef.current.renderFrame(true);else sceneRendererRef.current.requestRender(true);
      }
      if (!gpuOn) {
        const pat = boxRef.current.querySelector('#vedgrid');
        if (pat) {
          const s = 16 / z,
            l = Math.pow(10, Math.floor(Math.log10(s))),
            n = s / l;
          const rawStep = (n < 2 ? 1 : n < 5 ? 2 : 5) * l;
          const step = RENDER_CONFIG.pixelGrid !== false ? Math.max(1, rawStep) : rawStep;
          const gsz = step * z;
          const gx = (p.x % gsz + gsz) % gsz,
            gy = (p.y % gsz + gsz) % gsz;
          pat.setAttribute('x', String(gx));
          pat.setAttribute('y', String(gy));
          pat.setAttribute('width', String(gsz));
          pat.setAttribute('height', String(gsz));
          if (pat.firstChild) pat.firstChild.setAttribute('d', 'M' + gsz + ' 0H0V' + gsz);
        }
      }
    }
  };
  const lastReactZoomRef = useRef(initZ);
  const flushView = (snapReadout = true) => {
    if (viewPend.current) {
      cancelAnimationFrame(viewPend.current);
      viewPend.current = 0;
    }
    if (viewSettleTimer.current) {
      clearTimeout(viewSettleTimer.current);
      viewSettleTimer.current = 0;
    }
    if (sceneRendererRef.current) {
      sceneRendererRef.current.isPanning = false;
      sceneRendererRef.current.isZooming = false;
    }
    setSceneInteractingZoom(false);
    if (boxRef.current) boxRef.current.removeAttribute('data-zooming');
    const z = zoomRef.current,
      p = {
        x: panRef.current.x,
        y: panRef.current.y
      };
    lastReactZoomRef.current = z;
    applyVP(true, snapReadout);
    setViewInteracting(false);
    setZoom(prevZ => Math.abs(prevZ - z) > 1e-6 ? z : prevZ);
    if (vcSimpRef.current || renamingId || renderCfg.debugMode !== 'none' || selRef.current && selRef.current.objs.size > 64) {
      setPan(prevP => Math.abs(prevP.x - p.x) > 0.5 || Math.abs(prevP.y - p.y) > 0.5 ? p : prevP);
    }
  };
  /* Zoom & Pan 60fps–120fps Bebas Jank (Fast-Path DOM + WebGL2 Sinkron):
     - Selama wheel zoom / pinch / drag slider zoom berlangsung, TIDAK memicu React re-render (setZoom/setPan) di tengah-tengah frame, bahkan saat objek/grup/frame/node dipilih.
     - applyVP(true) langsung memperbarui transform matriks <g ref={vpRef}>, handle seleksi .vc-bbox-overlay, angka persentase zoom, slider zoom, dan WebGL2 SceneRenderer (< 0.5ms, 120Hz/240Hz+).
     - State React (setZoom/setPan) HANYA disinkronkan sekali setelah gerakan zoom/slider benar-benar berhenti (settleFn). */
  const softView = () => {
    PERF_TELEMETRY.markInteractionFrame();
    displayZoomRef.current = zoomRef.current;
    syncZoomSidebarDom(zoomRef.current);
    if (sceneRendererRef.current) sceneRendererRef.current.isZooming = true;
    setSceneInteractingZoom(true);
    if (boxRef.current && !boxRef.current.hasAttribute('data-zooming')) {
      boxRef.current.setAttribute('data-zooming', '1');
    }
    if (!viewPend.current) {
      viewPend.current = requestAnimationFrame(() => {
        viewPend.current = 0;
        const isPanDrag = !!(dragRef.current && dragRef.current.type === 'pan');
        applyVP(true, false, isPanDrag);
      });
    }
    if (viewSettleTimer.current) clearTimeout(viewSettleTimer.current);
    const settleFn = () => {
      viewSettleTimer.current = 0;
      if (dragRef.current && dragRef.current.type === 'pan') return;
      const slNow = zoomSliderDomRef.current;
      if (slNow && slNow.classList.contains('drag')) {
        viewSettleTimer.current = setTimeout(settleFn, 60);
        return;
      }
      if (sceneRendererRef.current) sceneRendererRef.current.isZooming = false;
      setSceneInteractingZoom(false);
      if (boxRef.current) {
        boxRef.current.removeAttribute('data-zooming');
        boxRef.current.setAttribute('data-fast-render', gpuOn && nTotal > 800 ? '1' : '0');
      }
      const z = zoomRef.current,
        p = {
          x: panRef.current.x,
          y: panRef.current.y
        };
      lastReactZoomRef.current = z;
      displayZoomRef.current = z;
      syncZoomSidebarDom(z);
      applyVP(true, true, false);
      setViewInteracting(false);
      const selCnt = selRef.current ? selRef.current.objs.size : 0;
      if (tool !== 'select' && tool !== 'hand' || indivCornerOpen || vcSimpRef.current || renamingId || renderCfg.debugMode !== 'none' || selCnt > 0) {
        setZoom(prevZ => Math.abs(prevZ - z) > 1e-6 ? z : prevZ);
      } else {
        setZoom(prevZ => prevZ >= 6 !== z >= 6 ? z : prevZ);
      }
      if (vcSimpRef.current || renamingId || renderCfg.debugMode !== 'none' || selCnt > 64) {
        setPan(prevP => Math.abs(prevP.x - p.x) > 0.5 || Math.abs(prevP.y - p.y) > 0.5 ? p : prevP);
      }
    };
    viewSettleTimer.current = setTimeout(settleFn, 120);
  };
  /* ukuran grid adaptif: kelipatan 10, dan terkunci minimal 1 piksel dokumen saat mode Grid Piksel aktif */
  const gridStep = () => {
    const raw = Math.pow(10, Math.ceil(Math.log10(8 / zoomRef.current) - 1e-9));
    return RENDER_CONFIG.pixelGrid !== false ? Math.max(1, raw) : raw;
  };
  const pixelHoverRectRef = useRef(null);
  const pixelCoordReadoutRef = useRef(null);
  const [snapOn, setSnapOn] = useState(true),
    [gridOn, setGridOn] = useState(false);
  const [customFonts, setCustomFonts] = useState(() => FontManager.getCustomFonts());
  const [fontUrlInput, setFontUrlInput] = useState('');
  const [fontUrlStatus, setFontUrlStatus] = useState(null);
  const [fontSearch, setFontSearch] = useState('');
  useEffect(() => FontManager.subscribe(list => {
    setCustomFonts(list);
    /* Perbarui bounding box objek teks di kanvas setelah font baru selesai dimuat */
    if (docRef.current && docRef.current.objects.some(o => o && o.text)) {
      const nextObjs = docRef.current.objects.map(o => o && o.text ? VE.updateTextObj(o, {}) : o);
      const nextDoc = {
        ...docRef.current,
        objects: nextObjs
      };
      docRef.current = nextDoc;
      setDocS(nextDoc);
    }
  }), []);
  const [snapCfg, setSnapCfgS] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('svgpeak-snap-cfg') || '{}');
      if (!s._v2NoJump) {
        s.grid = false;
        s.axial = false;
        s._v2NoJump = true;
        try {
          localStorage.setItem('svgpeak-snap-cfg', JSON.stringify({
            ...DEFAULT_SNAP_CFG,
            ...s
          }));
        } catch (e) {}
      }
      return {
        ...DEFAULT_SNAP_CFG,
        ...s
      };
    } catch (e) {
      return {
        ...DEFAULT_SNAP_CFG
      };
    }
  });
  const setSnapCfg = patch => setSnapCfgS(prev => {
    const next = {
      ...prev,
      ...(typeof patch === 'function' ? patch(prev) : patch)
    };
    try {
      localStorage.setItem('svgpeak-snap-cfg', JSON.stringify(next));
    } catch (e) {}
    return next;
  });
  const [snapMenuOpen, setSnapMenuOpen] = useState(false),
    snapMenuBtn = useRef(null),
    snapCacheRef = useRef(null);
  const [mirrorOpen, setMirrorOpen] = useState(false),
    mirrorBtn = useRef(null);
  const [boolOpen, setBoolOpen] = useState(false),
    boolBtn = useRef(null);
  const [activeStopId, setActiveStopId] = useState(null);
  const [bg, setBg] = useState({
      mode: 'transparent',
      color: '#ffffff'
    }),
    [exportArea, setExportArea] = useState('board');
  const [expFmt, setExpFmt] = useState('svg'),
    [expScale, setExpScale] = useState(2);
  /* Warna default shape & teks mengikuti accent color Pengaturan: fill = accent,
     stroke = varian gelap accent (value HSV x 0.45, senada indigo lama). */
  const accentStroke = acc => {
    try {
      if (typeof acc !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(acc)) return '#312e81';
      const [h, sv, v] = hex2hsv(acc);
      return hsv2hex(h, sv, Math.max(0.05, v * 0.45));
    } catch (e) {
      return '#312e81';
    }
  };
  const [shapeKind, setShapeKind] = useState('rect'),
    [shapeOpen, setShapeOpen] = useState(false),
    [shapeSty, setShapeSty] = useState(() => {
      const acc = prefs && prefs.accent || '#13b152';
      return {
        fill: acc,
        stroke: accentStroke(acc),
        sw: 2
      };
    }),
    shapeBtn = useRef(null);
  /* Sinkronkan warna default shape/teks saat accent color di Pengaturan berubah. */
  useEffect(() => {
    const acc = prefs && prefs.accent || '#13b152';
    setShapeSty(s => ({ ...s, fill: acc, stroke: accentStroke(acc) }));
  }, [prefs && prefs.accent]);
  const [openGrp, setOpenGrp] = useState(null);
  const [openRailGrp, setOpenRailGrp] = useState(null);
  const [lastRailAct, setLastRailAct] = useState({
    visGrp: 'veShowNodeGlobal',
    objGrp: 'veDup',
    pathGrp: 'veClose'
  });
  const railGrpRefs = {
    visGrp: useRef(null),
    objGrp: useRef(null),
    pathGrp: useRef(null)
  };
  const [leftOpen, setLeftOpen] = useState(true);
  const [indivCornerOpen, setIndivCornerOpen] = useState(false);
  const [pickedCornerKeys, setPickedCornerKeys] = useState(() => new Set());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pasteSvgDraft, setPasteSvgDraft] = useState('');
  useEffect(() => {
    const fn = () => setImportModalOpen(true);
    window.addEventListener('svgpeak-open-import', fn);
    return () => window.removeEventListener('svgpeak-open-import', fn);
  }, []);
  const [lastGrpTool, setLastGrpTool] = useState({
    nodeGrp: 'node',
    geoGrp: 'straighten'
  });
  const grpBtnRefs = {
    nodeGrp: useRef(null),
    geoGrp: useRef(null)
  };
  useEffect(() => {
    if (VE_NODE_GROUP.some(x => x[0] === tool)) setLastGrpTool(s => s.nodeGrp === tool ? s : {
      ...s,
      nodeGrp: tool
    });else if (VE_GEO_GROUP.some(x => x[0] === tool)) setLastGrpTool(s => s.geoGrp === tool ? s : {
      ...s,
      geoGrp: tool
    });
  }, [tool]);
  const [addHov, setAddHov] = useState(null),
    addRaf = useRef(0),
    addEv = useRef(null);
  const [hhHov, setHhHov] = useState(null);
  /* ---- v4.6: Resize interaktif, Pen Tool, Auto-Handle ---- */
  const [ahHov, setAhHov] = useState(null),
    [ahOpt, setAhOpt] = useState({
      tau: 1 / 3,
      scope: 'sub',
      minAng: 0
    });
  const [boxHov, setBoxHov] = useState(null),
    [vcTransforming, setVcTransforming] = useState(false),
    [isMovingObj, setIsMovingObj] = useState(false),
    [measureBadge, setMeasureBadge] = useState(null);
  const [altMeasure, setAltMeasure] = useState(null),
    lastPtr = useRef(null),
    activeBoxRef = useRef(null);
  const [pen, setPenS] = useState(null),
    penRef = useRef(null),
    penRaf = useRef(0),
    penEv = useRef(null);
  const setPen = s => {
    penRef.current = s;
    setPenS(s);
  };
  const [penSty, setPenSty] = useState({
    fill: 'none',
    stroke: '#111827',
    sw: 2
  });
  useEffect(() => {
    if (tool !== 'addnode') setAddHov(null);
    if (tool !== 'addhandle') setHhHov(null);
    if (tool !== 'autohandle') setAhHov(null);
    if (tool !== 'select') {
      setBoxHov(null);
      setVcTransforming(false);
      setMeasureBadge(null);
    }
    if (tool !== 'pen' && penRef.current) finishPen();
  }, [tool]);
  const [showSelNodes, setShowSelNodes] = useState(() => {
    try {
      const v = localStorage.getItem('ve-global-show-nodes');
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  });
  const [showSelHandles, setShowSelHandles] = useState(() => {
    try {
      const v = localStorage.getItem('ve-global-show-handles');
      return v === null ? true : v === '1';
    } catch (e) {
      return true;
    }
  });
  const [pruneOpt, setPruneOpt] = useState({
      tol: 0.75,
      cornerDeg: 28
    }),
    [sOpt, setSOpt] = useState({
      maxDev: 1,
      angTol: 3
    }),
    [cornerR, setCornerR] = useState(12),
    [cornerMode, setCornerMode] = useState('circular'),
    [cornerSm, setCornerSm] = useState(0.8);
  const [alOpt, setAlOpt] = useState({
      mode: 'custom',
      deg: 0,
      anchor: 'center',
      slide: true,
      collapse: false
    }),
    [bevelDeg, setBevelDeg] = useState(null);
  /* ---- Transform, Alignment & Auto Layout (v4.4) ---- */
  const [pin, setPin] = useState([0, 0]),
    [lockAR, setLockAR] = useState(false),
    [scaleStk, setScaleStk] = useState(false),
    [rotPivot, setRotPivot] = useState('center');
  const [lay, setLay] = useState({
      dir: 'row',
      cols: 3,
      gap: 12,
      pt: 0,
      pr: 0,
      pb: 0,
      pl: 0,
      split: false,
      ax: 0,
      ay: 0.5,
      frame: true,
      radius: 8
    }),
    alMem = useRef(null);
  const [collapsedGrps, setCollapsedGrps] = useState(new Set()),
    [layerLimit, setLayerLimit] = useState(150);
  const [groupSameColor, setGroupSameColor] = useState(false);
  const [clipFrames, setClipFrames] = useState(true);
  const layerAnchor = useRef(null),
    [layerIns, setLayerIns] = useState(null); /* jangkar Shift+klik & garis sisip drag-drop layer */
  const [dropFrameId, setDropFrameId] = useState(null),
    [dropNoNest, setDropNoNest] = useState(false),
    [renamingId, setRenamingId] = useState(null),
    [renameVal, setRenameVal] = useState('');
  const [dragLayerIds, setDragLayerIds] = useState(null),
    [overFrameId, setOverFrameId] = useState(null),
    renameSkip = useRef(false);
  const layerClickSkipExpandRef = useRef(false);
  const layerScrollRef = useRef(null);
  const layerTreeDomRef = useRef(null);
  const layerScrollRafRef = useRef(0);
  const toggleCollapseGrp = (gid, e) => {
    e.stopPropagation();
    setCollapsedGrps(prev => {
      const n = new Set(prev);
      n.has(gid) ? n.delete(gid) : n.add(gid);
      return n;
    });
  };
  /* ala Figma: memilih objek DI DALAM Frame/Group dari kanvas otomatis membuka Frame/Grup induknya di panel Layer
     (termasuk grup berisi 1 objek) dan menggulir panel Layer agar objek yang diklik langsung terlihat. */
  useEffect(() => {
    if (layerClickSkipExpandRef.current) {
      return;
    }
    if (!sel.objs.size || !collapsedGrps.size) return;
    const got = new Map(),
      hasBgSel = new Set();
    docRef.current.objects.forEach(o => {
      if (!o.group) return;
      if (o.isFrameBg || o.isAutoFrame) {
        if (sel.objs.has(o.id)) hasBgSel.add(o.group);
        return;
      }
      if (sel.objs.has(o.id)) got.set(o.group, (got.get(o.group) || 0) + 1);
    });
    const need = [...got.keys()].filter(g => !hasBgSel.has(g) && got.get(g) > 0);
    if (!need.length) return;
    setCollapsedGrps(prev => {
      if (!need.some(g => prev.has(g))) return prev;
      const n = new Set(prev);
      need.forEach(g => n.delete(g));
      return n;
    });
  }, [sel]);
  const [vcSimpRetain, setVcSimpRetain] = useState(() => {
    try {
      return localStorage.getItem('vc-simplify-retain') === '1';
    } catch (e) {
      return false;
    }
  });
  const [vcSimpSaved, setVcSimpSaved] = useState(() => {
    try {
      const r = JSON.parse(localStorage.getItem('vc-simplify-opts') || 'null');
      if (r && typeof r.tolerance === 'number') return {
        tolerance: clampN(r.tolerance, 0.001, 10000),
        angleThreshold: clampN(r.angleThreshold != null ? r.angleThreshold : 150, 0, 180),
        straightLines: !!r.straightLines,
        showOriginal: !!r.showOriginal
      };
    } catch (e) {}
    return {
      tolerance: 1.0,
      angleThreshold: 150.0,
      straightLines: false,
      showOriginal: false
    };
  });
  const [vcSimp, setVcSimp] = useState(null); /* { mode: 'slider' | 'dialog', baseDoc, baseSel, level, tolerance, angleThreshold, straightLines, showOriginal, retain, preview, before, after } */
  const vcSimpRef = useRef(null);
  vcSimpRef.current = vcSimp;
  const [offStrip, setOffStrip] = useState(null); /* { baseDoc, baseSel, dist, join, miterLimit, before, after, lastRes } */
  const offStripRef = useRef(null);
  offStripRef.current = offStrip;
  const [marq, setMarq] = useState(null),
    [snapInd, setSnapInd] = useState(null),
    [space, setSpace] = useState(false),
    [panning, setPanning] = useState(false);
  const boxRef = useRef(null),
    coordRef = useRef(null),
    dragRef = useRef(null),
    spaceRef = useRef(false),
    loaded = useRef(initialSvg);
  const rootRef = useRef(null),
    [lmsg, setLmsg] = useState(''),
    lmT = useRef(0);
  const fullInitRef = useRef(full);
  useEffect(() => {
    if (fullInitRef.current === full) return;
    fullInitRef.current = full;
    const id = requestAnimationFrame(() => api.current.fitView && api.current.fitView());
    return () => cancelAnimationFrame(id);
  }, [full]);
  const api = useRef({});
  const [ctx, setCtx] = useState(null),
    clipRef = useRef(null);
  const [dock, setDockS] = useState(() => {
    try {
      const r = JSON.parse(localStorage.getItem('svgpeak-dock2') || 'null');
      if (r && (r.dir === 'h' || r.dir === 'v') && r.size >= 24 && r.size <= 56) return r;
    } catch (e) {}
    try {
      const o = JSON.parse(localStorage.getItem('svgpeak-dock') || 'null');
      if (o && o.size >= 24 && o.size <= 56) return {
        dir: 'v',
        size: o.size
      };
    } catch (e) {}
    return {
      dir: 'v',
      size: 34
    };
  });
  const setDock = p => setDockS(d => {
    const n = {
      ...d,
      ...p
    };
    try {
      localStorage.setItem('svgpeak-dock2', JSON.stringify(n));
    } catch (e) {}
    return n;
  });
  /* lebar panel Aksi (a) & Layer (l) yang bisa diseret; disimpan saat pointer dilepas */
  const PW_DEF = {
      a: 260,
      l: 250
    },
    PW_LIM = {
      a: [200, 480],
      l: [180, 520]
    };
  const [pw, setPwS] = useState(() => {
    try {
      const r = JSON.parse(localStorage.getItem('svgpeak-panelw') || 'null');
      if (r) return {
        a: clampN(+r.a || PW_DEF.a, ...PW_LIM.a),
        l: clampN(+r.l || PW_DEF.l, ...PW_LIM.l)
      };
    } catch (e) {}
    return {
      ...PW_DEF
    };
  });
  const pwRef = useRef(pw),
    rzRef = useRef(null);
  pwRef.current = pw;
  const savePw = () => {
    try {
      localStorage.setItem('svgpeak-panelw', JSON.stringify(pwRef.current));
    } catch (e) {}
  };
  const setPwNow = (k, v) => {
    const n = {
      ...pwRef.current,
      [k]: clampN(Math.round(v), ...PW_LIM[k])
    };
    pwRef.current = n;
    setPwS(n);
  };
  const rzProps = k => ({
    role: 'separator',
    'aria-orientation': 'vertical',
    tabIndex: 0,
    'aria-label': k === 'a' ? L.edResizeActions : L.edResizeLayers,
    'data-tip': 'veResizePanel',
    onPointerDown: e => {
      if (e.button !== 0) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (x) {}
      rzRef.current = {
        k,
        x: e.clientX,
        w: pwRef.current[k]
      };
    },
    onPointerMove: e => {
      const r = rzRef.current;
      if (r && r.k === k) setPwNow(k, r.w + e.clientX - r.x);
    },
    onPointerUp: e => {
      if (!rzRef.current) return;
      rzRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (x) {}
      savePw();
    },
    onPointerCancel: () => {
      rzRef.current = null;
      savePw();
    },
    onDoubleClick: () => {
      setPwNow(k, PW_DEF[k]);
      savePw();
    },
    onKeyDown: e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      setPwNow(k, pwRef.current[k] + (e.key === 'ArrowRight' ? 16 : -16) * (e.shiftKey ? 2 : 1));
      savePw();
    }
  });

  /* Tahap 1 (D): Satu scheduler RAF bersama untuk pembaruan dokumen, rendering WebGL2 <canvas>, dan overlay React!
     Saat drag node/handle, live(d) TIDAK merender sinkron di tiap pointermove, melainkan dijadwalkan tepat 1x per frame */
  const flushLive = () => {
    if (liveRafRef.current) {
      cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = 0;
    }
    if (sceneRendererRef.current) {
      sceneRendererRef.current.setScene(docRef.current, ++docRevRef.current);
      sceneRendererRef.current.renderFrame();
    }
    setDocS(docRef.current);
  };
  const live = d => {
    docRef.current = d;
    const rev = ++docRevRef.current;
    if (sceneRendererRef.current) {
      sceneRendererRef.current.setScene(d, rev, {
        deferSpatialIndex: !!dragRef.current
      });
    }
    if (!dragRef.current) {
      if (liveRafRef.current) {
        cancelAnimationFrame(liveRafRef.current);
        liveRafRef.current = 0;
      }
      if (sceneRendererRef.current) sceneRendererRef.current.requestRender();
      setDocS(d);
      return;
    }
    if (!liveRafRef.current) {
      liveRafRef.current = requestAnimationFrame(() => {
        liveRafRef.current = 0;
        if (sceneRendererRef.current) sceneRendererRef.current.renderFrame();
        setDocS(docRef.current);
      });
    }
  };
  useEffect(() => () => {
    if (liveRafRef.current) cancelAnimationFrame(liveRafRef.current);
    if (zoomUiRafRef.current) cancelAnimationFrame(zoomUiRafRef.current);
    if (viewSettleTimer.current) clearTimeout(viewSettleTimer.current);
  }, []);
  const notifyCommitRef = useRef(onDocumentCommit);
  notifyCommitRef.current = onDocumentCommit;
  const notifyDocCommit = d => {
    if (notifyCommitRef.current) {
      notifyCommitRef.current(d, {
        zoom: zoomRef.current,
        pan: {
          x: panRef.current.x,
          y: panRef.current.y
        }
      });
    }
  };
  /* GV-A24: Byte-budgeted Undo/Redo History Stack (max 100 steps AND max device history byte budget, min 5 steps retained) */
  const estimateDocSnapshotBytes = d => {
    if (!d || !Array.isArray(d.objects)) return 256;
    let bytes = 256;
    for (let i = 0; i < d.objects.length; i++) {
      const o = d.objects[i];
      if (!o) continue;
      bytes += 160;
      if (o.subs) {
        for (let s = 0; s < o.subs.length; s++) {
          const ns = o.subs[s] && o.subs[s].nodes;
          if (ns) bytes += ns.length * 64;
        }
      }
      if (o.clipPathD) bytes += o.clipPathD.length * 2;
    }
    return bytes;
  };
  const push = (d, key) => {
    const h = hist.current,
      now = Date.now();
    if (!h.sz) h.sz = h.s.map(estimateDocSnapshotBytes);
    const snapBytes = estimateDocSnapshotBytes(d);
    if (key && h.key === key && now - h.t < 900 && h.p === h.s.length - 1 && h.p > 0) {
      h.s[h.p] = d;
      h.sz[h.p] = snapBytes;
    } else {
      h.s = h.s.slice(0, h.p + 1);
      h.sz = h.sz.slice(0, h.p + 1);
      h.s.push(d);
      h.sz.push(snapBytes);
      const maxSteps = 100;
      const maxBytes = ACTIVE_DEVICE_PROFILE && ACTIVE_DEVICE_PROFILE.maxHistoryBytes || 32 * 1024 * 1024;
      let totalBytes = h.sz.reduce((a, b) => a + b, 0);
      while ((h.s.length > maxSteps || totalBytes > maxBytes) && h.s.length > 5) {
        h.s.shift();
        const removed = h.sz.shift() || 0;
        totalBytes = Math.max(0, totalBytes - removed);
      }
      h.p = h.s.length - 1;
      PERF_TELEMETRY.updateSceneMetrics({
        historyBytes: totalBytes
      });
    }
    h.key = key || null;
    h.t = now;
    notifyDocCommit(d);
  };
  const commit = (d, key) => {
    docRef.current = d;
    const rev = ++docRevRef.current;
    if (liveRafRef.current) {
      cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = 0;
    }
    if (sceneRendererRef.current) {
      sceneRendererRef.current.setDragOffset(null, 0, 0);
      sceneRendererRef.current.setScene(d, rev);
      sceneRendererRef.current.requestRender();
    }
    setDocS(d);
    push(d, key);
  };
  const commitObjs = (fn, key) => {
    const d = docRef.current;
    let ch = false;
    const objs = [];
    d.objects.forEach(o => {
      const r = fn(o);
      if (r !== o) ch = true;
      if (r) objs.push(r);
    });
    if (ch) commit({
      ...d,
      objects: objs
    }, key);
    return ch;
  };
  /* ganti nama Frame/Group (isGroup) atau objek; nama group disanitasi sama seperti id SVG & dicek bentrok */
  const commitRename = (targetId, isGroup, directVal) => {
    setRenamingId(null);
    if (renameSkip.current) {
      renameSkip.current = false;
      return;
    } /* Escape = batal */
    if (isGroup === 'text') {
      const txtVal = String(directVal !== undefined ? directVal : renameVal);
      const finalTxt = txtVal.trim() ? txtVal : 'Teks';
      commitObjs(o => o.id === targetId && o.text ? VE.updateTextObj(o, {
        content: finalTxt
      }) : o, 'p:text-content');
      return;
    }
    const raw = String(directVal !== undefined ? directVal : renameVal).trim();
    if (!raw) return;
    const d = docRef.current;
    if (isGroup) {
      if (!d.objects.some(o => o.group === targetId)) return; /* sudah diganti (Enter lalu blur) */
      const name = raw.replace(/[^\w\-.:]/g, '-');
      if (name === targetId) return;
      if (d.objects.some(o => o.group === name)) {
        say('Nama "' + name + '" sudah dipakai Frame/Group lain');
        return;
      }
      commitObjs(o => o.group === targetId ? {
        ...o,
        group: name,
        name: o.isFrameBg ? name + '-bg' : o.name
      } : o);
      setCollapsedGrps(prev => {
        if (!prev.has(targetId)) return prev;
        const n = new Set(prev);
        n.delete(targetId);
        n.add(name);
        return n;
      });
    } else {
      commitObjs(o => o.id === targetId && o.name !== raw ? {
        ...o,
        name: raw
      } : o);
    }
  };
  /* pindahkan objek ke Frame/Group tujuan (targetGroup null = keluar ke kanvas) dari Panel Layer */
  const moveObjsToGroup = (ids, targetGroup) => {
    if (!ids || !ids.length) return;
    const S = new Set(ids),
      d = docRef.current;
    // Jangan pernah memindahkan latar Frame (isFrameBg / isAutoFrame) agar Frame kosong tetap di posisi awalnya
    const moving = d.objects.filter(o => S.has(o.id) && !o.isFrameBg && !o.isAutoFrame);
    if (!moving.length || moving.every(o => (o.group || null) === (targetGroup || null))) return;
    const isF = !!targetGroup && d.objects.some(o => o.group === targetGroup && (o.containerType === 'frame' || o.isFrameBg || o.isAutoFrame || /^frame/i.test(targetGroup)));

    // Jika dikeluarkan dari Frame (targetGroup === null), tetap taruh di posisi indeks aslinya (jangan dilempar ke ujung/tengah)
    if (!targetGroup) {
      const nextObjs = d.objects.map(o => S.has(o.id) && !o.isFrameBg && !o.isAutoFrame ? {
        ...o,
        group: null,
        containerType: null
      } : o);
      commit({
        ...d,
        objects: VE.compactGroups(nextObjs)
      });
      setSel({
        objs: new Set(moving.map(o => o.id)),
        nodes: new Set()
      });
      say(moving.length + ' objek dikeluarkan dari Frame');
      return;
    }
    const rest = d.objects.filter(o => !moving.includes(o));
    const updated = moving.map(o => ({
      ...o,
      group: targetGroup,
      containerType: isF ? 'frame' : null
    }));
    let last = -1;
    rest.forEach((o, i) => {
      if (o.group === targetGroup) last = i;
    });
    rest.splice(last + 1, 0, ...updated);
    commit({
      ...d,
      objects: VE.compactGroups(rest)
    });
    setSel({
      objs: new Set(updated.map(o => o.id)),
      nodes: new Set()
    });
    say(updated.length + ' objek dipindahkan ke ' + targetGroup);
  };
  /* Seret layer ke atas/bawah layer lain di panel: ubah urutan z DAN ikut Frame/Group layer tujuan.
     pos 'top' = di atas baris tujuan pada panel (indeks array lebih besar), 'bot' = di bawahnya */
  const reorderLayerTo = (ids, targetObj, pos) => {
    if (!ids || !ids.length || !targetObj) return;
    const S = new Set(ids),
      d = docRef.current;
    if (S.has(targetObj.id)) return;
    const moving = d.objects.filter(o => S.has(o.id) && !o.isFrameBg && !o.isAutoFrame);
    if (!moving.length) return;
    const tg = targetObj.group || null;
    const isF = !!tg && d.objects.some(o => o.group === tg && (o.containerType === 'frame' || o.isFrameBg || o.isAutoFrame || /^frame/i.test(tg)));
    const updated = moving.map(o => ({
      ...o,
      group: tg,
      containerType: isF ? 'frame' : null
    }));
    const rest = d.objects.filter(o => !S.has(o.id) || o.isFrameBg || o.isAutoFrame);
    const tIdx = rest.findIndex(o => o.id === targetObj.id);
    if (tIdx < 0) return;
    rest.splice(pos === 'top' ? tIdx + 1 : tIdx, 0, ...updated);
    const nd = VE.compactGroups(rest);
    if (nd.length === d.objects.length && nd.every((o, i) => o === d.objects[i])) return;
    commit({
      ...d,
      objects: nd
    });
    setSel({
      objs: new Set(updated.map(o => o.id)),
      nodes: new Set()
    });
    say(tg ? updated.length + ' layer dipindah di dalam ' + tg : updated.length + ' layer dipindah ke kanvas');
  };
  const undo = () => {
    const h = hist.current;
    if (h.p > 0) {
      h.p--;
      h.key = null;
      const nextD = h.s[h.p];
      live(nextD);
      notifyDocCommit(nextD);
    }
  };
  const redo = () => {
    const h = hist.current;
    if (h.p < h.s.length - 1) {
      h.p++;
      h.key = null;
      const nextD = h.s[h.p];
      live(nextD);
      notifyDocCommit(nextD);
    }
  };
  const canUndo = hist.current.p > 0,
    canRedo = hist.current.p < hist.current.s.length - 1;
  const selObjs = React.useMemo(() => doc.objects.filter(o => sel.objs.has(o.id)), [doc.objects, sel.objs]),
    primary = selObjs[0];
  /* pohon Layer ala Figma: Frame/Group + Color Bucket (objek sewarna dalam satu container jadi satu baris seleksi) */
  const layerTree = React.useMemo(() => {
    const items = [],
      grpMap = new Map(),
      objs = doc.objects;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (!o.group) {
        items.push({
          kind: 'single',
          obj: o
        });
        continue;
      }
      let g = grpMap.get(o.group);
      if (!g) {
        g = {
          kind: 'container',
          id: o.group,
          isFrame: /^frame/i.test(o.group),
          objs: [],
          buckets: [],
          bg: null
        };
        grpMap.set(o.group, g);
        items.push(g);
      }
      g.objs.push(o);
      if (o.containerType === 'frame' || o.isAutoFrame || o.isFrameBg) g.isFrame = true;
      if (o.isFrameBg || o.isAutoFrame) g.bg = o;
    }
    grpMap.forEach(g => {
      const byHex = new Map(),
        gObjs = g.objs;
      for (let j = 0, L = gObjs.length; j < L; j++) {
        const o = gObjs[j];
        if (o === g.bg) continue;
        const hex = o.img ? 'IMAGE' : o.fill === 'none' ? 'NONE' : cssToHex(o.fill);
        let b = byHex.get(hex);
        if (!b) byHex.set(hex, b = {
          hex,
          fill: o.fill,
          objs: [],
          ids: [],
          nodes: 0
        });
        b.objs.push(o);
        b.ids.push(o.id);
        b.nodes += vinfo(o).n;
      }
      g.buckets = [...byHex.values()];
    });
    return items;
  }, [doc.objects]);
  /* GV-A20 + Isolated Flat Row Virtualization:
     State posisi scroll layer diisolasi sepenuhnya di dalam komponen <LayerTreeViewport> (bukan di VectorEditor!)
     sehingga saat pengguna melakukan scroll cepat di tab Layer, VectorEditor & Canvas TIDAK PERNAH re-render! */
  const layerViewportCtrlRef = useRef(null);
  const {
    virtualLayerRows,
    objIdToLayerRowIdx
  } = React.useMemo(() => {
    const rows = [];
    const idMap = new Map();
    for (let i = 0; i < layerTree.length; i++) {
      const it = layerTree[i];
      if (it.kind === 'single') {
        const rIdx = rows.length;
        rows.push({
          kind: 'single',
          key: it.obj.id,
          obj: it.obj,
          nodeCount: vinfo(it.obj).n
        });
        idMap.set(it.obj.id, rIdx);
      } else {
        const hdrIdx = rows.length;
        const gObjs = it.objs,
          gLen = gObjs.length;
        const allIds = new Array(gLen);
        const childObjs = [];
        let allHidden = gLen > 0,
          allLocked = gLen > 0;
        for (let gi = 0; gi < gLen; gi++) {
          const go = gObjs[gi];
          allIds[gi] = go.id;
          if (go !== it.bg) childObjs.push(go);
          if (!go.hidden) allHidden = false;
          if (!go.locked) allLocked = false;
        }
        const isCollapsed = collapsedGrps.has(it.id);
        rows.push({
          kind: 'group-hdr',
          key: 'grp-hdr-' + it.id,
          item: it,
          allIds,
          childCount: childObjs.length,
          gKey: 'grp:' + it.id,
          isCollapsed,
          allHidden,
          allLocked
        });
        if (it.bg) idMap.set(it.bg.id, hdrIdx);
        if (isCollapsed) {
          for (let k = 0; k < allIds.length; k++) idMap.set(allIds[k], hdrIdx);
        } else if (childObjs.length === 0) {
          rows.push({
            kind: 'group-empty',
            key: 'grp-empty-' + it.id,
            groupId: it.id
          });
        } else if (groupSameColor) {
          for (let bi = 0; bi < it.buckets.length; bi++) {
            const b = it.buckets[bi];
            const bIdx = rows.length;
            if (b.ids.length === 1) {
              rows.push({
                kind: 'child',
                key: b.objs[0].id,
                groupId: it.id,
                obj: b.objs[0],
                nodeCount: vinfo(b.objs[0]).n
              });
            } else {
              rows.push({
                kind: 'bucket',
                key: it.id + '-' + b.hex,
                groupId: it.id,
                bucket: b
              });
            }
            for (let k = 0; k < b.ids.length; k++) idMap.set(b.ids[k], bIdx);
          }
        } else {
          for (let ci = 0; ci < childObjs.length; ci++) {
            const co = childObjs[ci];
            const cIdx = rows.length;
            rows.push({
              kind: 'child',
              key: co.id,
              groupId: it.id,
              obj: co,
              nodeCount: vinfo(co).n
            });
            idMap.set(co.id, cIdx);
          }
        }
      }
    }
    return {
      virtualLayerRows: rows,
      objIdToLayerRowIdx: idMap
    };
  }, [layerTree, collapsedGrps, groupSameColor]);

  /* Auto-scroll panel Layer ke objek yang diklik di kanvas agar langsung terlihat & terpilih */
  useEffect(() => {
    if (layerClickSkipExpandRef.current) {
      layerClickSkipExpandRef.current = false;
      return;
    }
    if (!sel.objs.size || !leftOpen) return;
    const sc = layerScrollRef.current;
    if (!sc) return;
    const selArr = [...sel.objs];
    const targetId = selArr[selArr.length - 1] || selArr[0];
    if (!targetId) return;
    const rowIdx = objIdToLayerRowIdx.get(targetId);
    if (rowIdx == null || rowIdx < 0) return;
    const treeEl = layerTreeDomRef.current;
    const treeOffsetTop = treeEl ? treeEl.offsetTop : 0;
    const rowTop = treeOffsetTop + rowIdx * LAYER_ROW_EST_PX;
    const rowBot = rowTop + LAYER_ROW_EST_PX;
    const viewTop = sc.scrollTop;
    const viewH = sc.clientHeight || 360;
    const viewBot = viewTop + viewH;
    if (rowTop < viewTop + 12 || rowBot > viewBot - 12) {
      const nextScrollTop = Math.max(0, Math.round(rowTop - (viewH - LAYER_ROW_EST_PX) * 0.5));
      sc.scrollTop = nextScrollTop;
      if (layerViewportCtrlRef.current) {
        layerViewportCtrlRef.current.syncScroll(Math.max(0, nextScrollTop - treeOffsetTop));
      }
    }
  }, [sel.objs, leftOpen]);
  /* urutan datar layer sesuai tampilan panel (untuk Shift+klik range) */
  const layerFlatIds = React.useMemo(() => layerTree.flatMap(it => it.kind === 'single' ? [it.obj.id] : groupSameColor ? it.buckets.flatMap(b => b.ids) : it.objs.filter(o => o !== it.bg).map(o => o.id)), [layerTree, groupSameColor]);
  /* kotak Frame & Grup untuk label nama & highlight di kanvas (berfungsi untuk Frame maupun Group) */
  const containerBoxes = React.useMemo(() => layerTree.filter(it => it.kind === 'container').map(f => ({
    id: f.id,
    isFrame: !!f.isFrame,
    ids: f.objs.map(o => o.id),
    first: f.bg || f.objs[0],
    bb: f.bg ? VE.tightBBox(f.bg) : VE.docBounds({
      objects: f.objs
    })
  })).filter(f => f.bb && isFinite(f.bb[0]) && f.bb[2] > f.bb[0] && f.bb[3] > f.bb[1]), [layerTree]);
  const frameBoxes = React.useMemo(() => containerBoxes.filter(f => f.isFrame), [containerBoxes]);
  /* Selection Colors ala Figma: palet unik fill & stroke dari objek terpilih */
  const selectionColors = React.useMemo(() => {
    const map = new Map();
    for (let i = 0, L = selObjs.length; i < L; i++) {
      const o = selObjs[i];
      if (!o || o.img || o.locked) continue;
      if (VE.gradOn(o) && o.grad) {
        const stops = o.grad.rawStops && o.grad.rawStops.length ? o.grad.rawStops : o.grad.stops || [];
        for (let stIdx = 0; stIdx < stops.length; stIdx++) {
          const st = stops[stIdx];
          if (!st.color || st.color === 'none') continue;
          const hex = cssToHex(st.color),
            sid = o.id + '#' + (st.id || stIdx),
            k = 'grad:' + hex;
          let e = map.get(k);
          if (!e) map.set(k, e = {
            kind: 'grad',
            hex,
            raw: hex,
            ids: [],
            stopKeys: [],
            _idSet: new Set(),
            _skSet: new Set()
          });
          if (!e._idSet.has(o.id)) {
            e._idSet.add(o.id);
            e.ids.push(o.id);
          }
          if (!e._skSet.has(sid)) {
            e._skSet.add(sid);
            e.stopKeys.push(sid);
          }
        }
      } else if (o.fill && o.fill !== 'none') {
        const hex = cssToHex(o.fill),
          k = 'fill:' + o.fill.toLowerCase();
        let e = map.get(k);
        if (!e) map.set(k, e = {
          kind: 'fill',
          hex,
          raw: o.fill,
          ids: []
        });
        e.ids.push(o.id);
      }
      if (o.stroke && o.stroke !== 'none') {
        const hex = cssToHex(o.stroke),
          k = 'stroke:' + o.stroke.toLowerCase();
        let e = map.get(k);
        if (!e) map.set(k, e = {
          kind: 'stroke',
          hex,
          raw: o.stroke,
          ids: []
        });
        e.ids.push(o.id);
      }
    }
    const out = [];
    map.forEach(e => {
      out.push({
        kind: e.kind,
        hex: e.hex,
        raw: e.raw,
        ids: e.ids,
        ...(e.stopKeys ? { stopKeys: e.stopKeys } : {}),
        stableKey: e.kind + ':' + (e.stopKeys ? e.stopKeys[0] : e.ids[0])
      });
    });
    return out;
  }, [selObjs]);
  const selNodes = React.useMemo(() => {
    const s = new Set();
    if (sel.nodes.size) selObjs.forEach(o => o.subs.forEach(sp => sp.nodes.forEach(n => sel.nodes.has(n.id) && s.add(n.id))));
    return s;
  }, [selObjs, sel.nodes]);
  const selHandles = React.useMemo(() => {
    const s = new Set();
    if (sel.handles && sel.handles.size) selObjs.forEach(o => o.subs.forEach(sp => sp.nodes.forEach(n => {
      if (n.handleIn && sel.handles.has(n.id + ':in')) s.add(n.id + ':in');
      if (n.handleOut && sel.handles.has(n.id + ':out')) s.add(n.id + ':out');
    })));
    return s;
  }, [selObjs, sel.handles]);
  /* mode mirroring node terpilih: 'corner' | 'smooth' | 'symmetric' | null (campuran / tidak ada seleksi) */
  const mirrorCur = React.useMemo(() => {
    if (!selNodes.size) return null;
    const mirrorTypes = new Set();
    selObjs.forEach(o => o.subs.forEach(sp => sp.nodes.forEach(n => {
      if (selNodes.has(n.id)) mirrorTypes.add(n.type === 'smooth' || n.type === 'symmetric' ? n.type : 'corner');
    })));
    return mirrorTypes.size === 1 ? [...mirrorTypes][0] : null;
  }, [selObjs, selNodes]);
  /* kotak batas gabungan objek terpilih (dipakai untuk Resize, Rotate, & Multi-Object Selection Box) */
  const allSelBBox = React.useMemo(() => selObjs.length ? (() => {
    let b = null;
    for (let i = 0; i < selObjs.length; i++) {
      const t = VE.tightBBox(selObjs[i]);
      if (!isFinite(t[0]) || Math.abs(t[0]) > 1e15 || t[0] > t[2]) continue;
      if (!b) b = [t[0], t[1], t[2], t[3]];else {
        if (t[0] < b[0]) b[0] = t[0];
        if (t[1] < b[1]) b[1] = t[1];
        if (t[2] > b[2]) b[2] = t[2];
        if (t[3] > b[3]) b[3] = t[3];
      }
    }
    return b;
  })() : null, [selObjs]);
  const activeBox = React.useMemo(() => tool === 'select' && selObjs.length > 0 && sel.nodes.size === 0 ? VE.selectionOrientedBox({
    objects: selObjs
  }, sel.objs) : null, [tool, selObjs, sel.objs, sel.nodes]);
  activeBoxRef.current = activeBox;
  const imgSel = null;
  /* Penampil node dan Bézier handle berlaku global pada objek yang dipilih pengguna, termasuk saat dalam mode Pilih (select) */
  const shown = React.useMemo(() => (showSelNodes || showSelHandles) && !imgSel ? selObjs.filter(o => !o.img && !o.text && !o.hidden) : [], [showSelNodes, showSelHandles, imgSel, selObjs]);
  /* ---- logika panel Transform / Alignment / Auto Layout (v4.4) ---- */
  const xfNodes = selNodes.size ? selNodes : null;
  const xm = React.useMemo(() => selObjs.length ? VE.selectionMetrics({
    objects: selObjs
  }, sel.objs, xfNodes) : null, [selObjs, sel.objs, sel.nodes]);
  const xp = xm ? VE.pinPoint(xm, pin) : null;
  const xfDone = (nd, key) => {
    if (nd && nd !== docRef.current) commit(nd, key);
  };
  const alignDo = mode => {
    if (selNodes.size === 1) return say('Pilih 2+ node untuk meratakan node');
    const isDist = mode === 'distH' || mode === 'distV';
    if (isDist && (selNodes.size || selObjs.length < 3)) return say('Distribusi butuh minimal 3 objek');
    const nd = VE.alignSelection(docRef.current, sel.objs, selNodes.size >= 2 ? selNodes : null, mode);
    if (nd === docRef.current) return say(isDist ? 'Jarak sudah sama rata' : 'Sudah rata');
    commit(nd);
  };
  const setXfPos = (axis, v) => xfDone(VE.setSelectionPosition(docRef.current, sel.objs, xfNodes, axis, v, pin), 'xf');
  const setXfDim = (axis, v) => {
    if (!(v > 0)) return say('Ukuran harus lebih dari 0');
    xfDone(VE.setSelectionDimension(docRef.current, sel.objs, axis, v, {
      pin,
      constrain: lockAR,
      scaleStroke: scaleStk
    }), 'xf');
  };
  const rotPin = () => rotPivot === 'pin' ? pin : [0.5, 0.5];
  const setXfRot = v => xfDone(VE.setSelectionRotation(docRef.current, sel.objs, v, false, rotPin()), 'xf');
  const flipXf = axis => xfDone(VE.flipSelection(docRef.current, sel.objs, axis, rotPin()));
  const layItems = selObjs.filter(o => !o.isAutoFrame);
  /* Real-time: ada seleksi → slider Padding/Gap/arah langsung menata ulang (alMem diinisialisasi otomatis, riwayat digabung 'alayout');
     tanpa seleksi → HANYA slider padding yang mengubah Artboard secara langsung (gap/arah tidak menyentuh Artboard). */
  /* Sinkronkan nilai slider Padding dengan Frame terpilih saat seleksi berpindah */
  useEffect(() => {
    const d = docRef.current,
      S = sel.objs;
    if (!S.size) return;
    const picked = d.objects.filter(o => S.has(o.id));
    const fg = picked.find(o => o.group && d.objects.some(q => q.group === o.group && (q.isFrameBg || q.isAutoFrame)));
    if (!fg || !fg.group) return;
    const bgObj = d.objects.find(o => o.group === fg.group && (o.isFrameBg || o.isAutoFrame));
    const kids = d.objects.filter(o => o.group === fg.group && !o.isFrameBg && !o.isAutoFrame && !o.hidden);
    if (!bgObj || !kids.length) return;
    const fb = VE.tightBBox(bgObj),
      kb = VE.docBounds(d, new Set(kids.map(o => o.id)));
    if (!fb || !kb) return;
    const pl = Math.max(0, Math.round(kb[0] - fb[0]));
    const pt = Math.max(0, Math.round(kb[1] - fb[1]));
    const pr = Math.max(0, Math.round(fb[2] - kb[2]));
    const pb = Math.max(0, Math.round(fb[3] - kb[3]));
    setLay(prev => prev.pt === pt && prev.pr === pr && prev.pb === pb && prev.pl === pl ? prev : {
      ...prev,
      pt,
      pr,
      pb,
      pl,
      split: !(pt === pr && pr === pb && pb === pl)
    });
  }, [sel.objs]);
  const runLayout = (cfg, force, padOnly) => {
    const d = docRef.current,
      S = selRef.current.objs;
    if (!S.size) {
      if (!force && !padOnly) return;
      const nd = VE.applyArtboardPadding(d, null, cfg),
        a = nd.viewBox,
        b = d.viewBox;
      if (a.every((v, k) => v === b[k])) return;
      commit(nd, 'ab-pad');
      return;
    }
    /* Jika pengguna hanya mengubah Padding atau Radius pada Frame yang sudah ada (tanpa menekan tombol Terapkan Auto Layout),
       ubah ukuran kotak latar Frame saja mengelilingi objek anak TANPA mengacak posisi objek di dalamnya! */
    if (padOnly && !force) {
      const fp = VE.applyFramePadding(d, S, {
        pt: cfg.pt,
        pr: cfg.pr,
        pb: cfg.pb,
        pl: cfg.pl,
        frameRadius: cfg.radius
      });
      if (fp) {
        commit(fp.doc, 'frame-pad');
        return;
      }
      if (!alMem.current) return;
    }
    const items = d.objects.filter(o => S.has(o.id) && !o.isAutoFrame && !o.isFrameBg);
    if (!items.length && !d.objects.some(o => S.has(o.id) && (o.isAutoFrame || o.isFrameBg))) return;
    const key = items.map(o => o.id).sort().join(','),
      live = !!(alMem.current && alMem.current.key === key);
    if (!force && !live) return;
    const res = VE.applyAutoLayout(d, S, {
      dir: cfg.dir,
      cols: cfg.cols,
      gap: cfg.gap,
      pt: cfg.pt,
      pr: cfg.pr,
      pb: cfg.pb,
      pl: cfg.pl,
      alignX: cfg.ax,
      alignY: cfg.ay,
      frame: cfg.frame,
      frameRadius: cfg.radius,
      mem: live ? alMem.current : null
    });
    if (!res) return;
    alMem.current = res.mem;
    commit(res.doc, 'alayout');
    setSel({
      objs: res.selIds,
      nodes: new Set()
    });
    if (force) say('Auto Layout diterapkan · ' + (items.length || 1) + ' objek' + (cfg.frame ? ' + frame latar' : ''));
  };
  const layUpd = patch => {
    const n = {
      ...lay,
      ...patch
    };
    setLay(n);
    const isPadOrRad = Object.keys(patch).every(k => /^p[trbl]$|^radius$/.test(k));
    runLayout(n, false, isPadOrRad);
  };
  const layPad = (k, v) => {
    const val = Math.max(0, v);
    layUpd(k === 'all' ? {
      pt: val,
      pr: val,
      pb: val,
      pl: val
    } : {
      [k]: val
    });
  };
  const padToArtboard = () => {
    const nd = VE.applyArtboardPadding(docRef.current, selRef.current.objs, lay);
    if (nd === docRef.current) return say('Tidak ada konten');
    commit(nd, 'ab-pad');
    say('Padding diterapkan ke Artboard');
    requestAnimationFrame(() => api.current.fitView && api.current.fitView());
  };
  /* Fungsi baru Visibilitas Node & Handle Global:
     Menampilkan node dan handle Bézier pada objek yang dipilih pengguna (berlaku global untuk semua seleksi objek,
     dan berfungsi baik di mode Pilih / Select maupun mode Edit Node). */
  const hOk = () => true;
  const toggleGlobalNodes = () => {
    setShowSelNodes(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ve-global-show-nodes', next ? '1' : '0');
      } catch (e) {}
      say('Tampilan Node pada objek terpilih (Global): ' + (next ? 'AKTIF' : 'MATI'));
      return next;
    });
  };
  const toggleGlobalHandles = () => {
    setShowSelHandles(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ve-global-show-handles', next ? '1' : '0');
      } catch (e) {}
      say('Tampilan Handle Bézier pada objek terpilih (Global): ' + (next ? 'AKTIF' : 'MATI'));
      return next;
    });
  };
  /* ---- Alat Tambah Node: hover pada garis objek mana pun; snap ke titik tengah / grid / node & tepi objek lain ---- */
  const segAt = (a, b, p) => {
    if (!a.handleOut && !b.handleIn) {
      const ab = VE.sub(b, a),
        L2 = VE.dot(ab, ab),
        t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, VE.dot(VE.sub(p, a), ab) / L2)),
        q = {
          x: a.x + ab.x * t,
          y: a.y + ab.y * t
        };
      return {
        t,
        x: q.x,
        y: q.y,
        d: VE.dist(p, q)
      };
    }
    let bt = 0,
      bd = 1e18;
    const N = 24;
    for (let k = 0; k <= N; k++) {
      const q = VE.segPoint(a, b, k / N),
        d = VE.dist(p, q);
      if (d < bd) {
        bd = d;
        bt = k / N;
      }
    }
    let lo = Math.max(0, bt - 1 / N),
      hi = Math.min(1, bt + 1 / N);
    for (let it = 0; it < 18; it++) {
      const m1 = lo + (hi - lo) / 3,
        m2 = hi - (hi - lo) / 3;
      if (VE.dist(p, VE.segPoint(a, b, m1)) < VE.dist(p, VE.segPoint(a, b, m2))) hi = m2;else lo = m1;
    }
    const t = (lo + hi) / 2,
      q = VE.segPoint(a, b, t);
    return {
      t,
      x: q.x,
      y: q.y,
      d: VE.dist(p, q)
    };
  };
  const findSegAt = (p, tol) => {
    let best = null;
    const os = docRef.current.objects;
    const searchObj = (o, maxDist) => {
      let localBest = null;
      o.subs.forEach(sp => {
        const ns = sp.nodes,
          n = ns.length;
        if (n < 2) return;
        for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
          const a = ns[i],
            b = ns[(i + 1) % n];
          if (maxDist < 1e9) {
            let x0 = Math.min(a.x, b.x),
              x1 = Math.max(a.x, b.x),
              y0 = Math.min(a.y, b.y),
              y1 = Math.max(a.y, b.y);
            for (const q of [a.handleOut, b.handleIn]) {
              if (q) {
                x0 = Math.min(x0, q.x);
                x1 = Math.max(x1, q.x);
                y0 = Math.min(y0, q.y);
                y1 = Math.max(y1, q.y);
              }
            }
            if (p.x < x0 - maxDist || p.x > x1 + maxDist || p.y < y0 - maxDist || p.y > y1 + maxDist) continue;
          }
          const r = segAt(a, b, p);
          if (r.d < maxDist && (!localBest || r.d <= localBest.d + 1e-9)) {
            localBest = {
              ...r,
              o,
              sp,
              i,
              a,
              b
            };
          }
        }
      });
      return localBest;
    };

    /* 1. Prioritas utama: kursor berada dekat garis kontur objek (dalam toleransi piksel layar) */
    os.forEach(o => {
      if (o.hidden || o.locked || o.img) return;
      const bb = vinfo(o).bb;
      if (p.x < bb[0] - tol || p.x > bb[2] + tol || p.y < bb[1] - tol || p.y > bb[3] + tol) return;
      const cand = searchObj(o, tol);
      if (cand && (!best || cand.d <= best.d + 1e-9)) best = cand;
    });
    if (best) return best;

    /* 2. Jika kursor berada di bagian dalam/badan objek mana pun: proyeksikan ke segmen terdekat dari objek tersebut */
    const hit = hitObj(p);
    if (hit && !hit.img) {
      const cand = searchObj(hit, Infinity);
      if (cand) return cand;
    }

    /* 3. Jika ada objek yang sedang dipilih dan kursor di dekatnya, proyeksikan ke segmen terdekat objek terpilih */
    if (selRef.current.objs.size) {
      os.forEach(o => {
        if (!selRef.current.objs.has(o.id) || o.hidden || o.locked || o.img) return;
        const cand = searchObj(o, Infinity);
        if (cand && (!best || cand.d < best.d)) best = cand;
      });
    }
    return best;
  };
  const ADD_LBL = {
    mid: L.edSnapLblMid,
    grid: L.edSnapLblGrid,
    node: L.edSnapLblNode,
    edge: L.edSnapLblEdge
  };
  const addSnap = (sg, p, alt) => {
    const res = {
      t: sg.t,
      kind: null
    };
    if (!snapOn || alt) return res;
    const thr = VE.SNAP_PX / zoomRef.current,
      cs = [];
    if (snapCfg.midpoint) {
      const mid = VE.segPoint(sg.a, sg.b, .5);
      cs.push({
        t: .5,
        x: mid.x,
        y: mid.y,
        kind: 'mid',
        pr: 1
      });
    }
    if (snapCfg.node || snapCfg.edge) {
      const r = VE.snapPt(p, docRef.current.objects, new Set([sg.o.id]), null, thr, 0, !snapCfg.edge, false, false, !snapCfg.node);
      if (r.ind) {
        const q = segAt(sg.a, sg.b, r);
        if (q.d < thr) cs.push({
          t: q.t,
          x: q.x,
          y: q.y,
          kind: r.kind,
          pr: r.kind === 'node' ? 0 : 3
        });
      }
    }
    if (gridOn && snapCfg.grid) {
      const G = gridStep(),
        N = 64,
        pts = [];
      for (let k = 0; k <= N; k++) pts.push(VE.segPoint(sg.a, sg.b, k / N));
      for (let k = 0; k < N; k++) {
        const p0 = pts[k],
          p1 = pts[k + 1];
        if (Math.min(p0.x, p1.x) - thr > p.x || Math.max(p0.x, p1.x) + thr < p.x || Math.min(p0.y, p1.y) - thr > p.y || Math.max(p0.y, p1.y) + thr < p.y) continue;
        for (const ax of ['x', 'y']) {
          const v0 = p0[ax],
            v1 = p1[ax];
          if (v0 === v1) continue;
          const lo = Math.min(v0, v1),
            hi = Math.max(v0, v1),
            up = v1 > v0;
          for (let g = Math.ceil(lo / G); g * G <= hi; g++) {
            const gv = g * G;
            let tl = k / N,
              th = (k + 1) / N;
            for (let it = 0; it < 20; it++) {
              const tm = (tl + th) / 2,
                vm = VE.segPoint(sg.a, sg.b, tm)[ax];
              if (vm < gv === up) tl = tm;else th = tm;
            }
            const t = (tl + th) / 2,
              q = VE.segPoint(sg.a, sg.b, t);
            cs.push({
              t,
              x: q.x,
              y: q.y,
              kind: 'grid',
              pr: 2
            });
          }
        }
      }
    }
    let best = null;
    for (const c of cs) {
      if (c.t < 0.02 || c.t > 0.98) continue;
      const d = VE.dist(c, p);
      if (d >= thr) continue;
      if (!best || c.pr < best.pr || c.pr === best.pr && d < best.d) best = {
        ...c,
        d
      };
    }
    return best ? {
      t: best.t,
      kind: best.kind
    } : res;
  };
  const computeAdd = ev => {
    const p = toDoc(ev.x, ev.y),
      sg = findSegAt(p, 10 / zoomRef.current);
    if (!sg) return null;
    const r = addSnap(sg, p, ev.alt),
      t = Math.max(0.02, Math.min(0.98, r.t)),
      q = VE.segPoint(sg.a, sg.b, t),
      h1 = sg.a.handleOut || sg.a,
      h2 = sg.b.handleIn || sg.b;
    const d = 'M' + sg.a.x + ' ' + sg.a.y + (sg.a.handleOut || sg.b.handleIn ? 'C' + h1.x + ' ' + h1.y + ' ' + h2.x + ' ' + h2.y + ' ' : 'L') + sg.b.x + ' ' + sg.b.y;
    return {
      oid: sg.o.id,
      spid: sg.sp.id,
      i: sg.i,
      t,
      x: q.x,
      y: q.y,
      kind: r.kind,
      label: r.kind ? ADD_LBL[r.kind] : '',
      d
    };
  };
  /* handle bawaan yang akan ditambahkan pada node ke-i (hanya sisi yang belum punya handle) */
  const defHandles = (sp, i) => {
    const ns = sp.nodes,
      n = ns.length,
      nd = ns[i];
    if (n < 2) return {};
    const pv = sp.closed || i > 0 ? ns[(i - 1 + n) % n] : null,
      nx = sp.closed || i < n - 1 ? ns[(i + 1) % n] : null;
    let dir;
    if (nd.handleOut && !nd.handleIn) dir = VE.nrm(VE.sub(nd.handleOut, nd));else if (nd.handleIn && !nd.handleOut) dir = VE.nrm(VE.sub(nd, nd.handleIn));else if (pv && nx) dir = VE.nrm(VE.sub(nx, pv));else if (nx) dir = VE.nrm(VE.sub(nx, nd));else if (pv) dir = VE.nrm(VE.sub(nd, pv));else return {};
    const r = {};
    if (pv && !nd.handleIn) {
      const l = VE.dist(pv, nd) / 3;
      if (l > 1e-6) r.in = {
        x: nd.x - dir.x * l,
        y: nd.y - dir.y * l
      };
    }
    if (nx && !nd.handleOut) {
      const l = VE.dist(nx, nd) / 3;
      if (l > 1e-6) r.out = {
        x: nd.x + dir.x * l,
        y: nd.y + dir.y * l
      };
    }
    return r;
  };
  const hoverNodeAt = ev => {
    const p = toDoc(ev.x, ev.y),
      tol = 10 / zoomRef.current;
    let best = null;
    docRef.current.objects.forEach(o => {
      const bb = vinfo(o).bb;
      if (p.x < bb[0] - tol || p.x > bb[2] + tol || p.y < bb[1] - tol || p.y > bb[3] + tol) return;
      o.subs.forEach(sp => sp.nodes.forEach((nd, i) => {
        const d = VE.dist(p, nd);
        if (d < tol && (!best || d < best.d)) best = {
          d,
          o,
          sp,
          i,
          nd
        };
      }));
    });
    if (!best) return null;
    const prev = defHandles(best.sp, best.i);
    return {
      x: best.nd.x,
      y: best.nd.y,
      oid: best.o.id,
      spid: best.sp.id,
      nid: best.nd.id,
      prev,
      can: !!(prev.in || prev.out)
    };
  };
  const updateAddHover = e => {
    addEv.current = {
      x: e.clientX,
      y: e.clientY,
      alt: e.altKey
    };
    if (addRaf.current) return;
    addRaf.current = requestAnimationFrame(() => {
      addRaf.current = 0;
      const ev = addEv.current;
      if (ev && dragRef.current === null) {
        if (tool === 'addhandle') setHhHov(hoverNodeAt(ev));else if (tool === 'autohandle') setAhHov(hoverAuto(ev));else setAddHov(computeAdd(ev));
      }
    });
  };
  const makeShape = (kind, x, y, w, h, id) => {
    const S = SHAPES.find(q => q[0] === kind) || SHAPES[0],
      st = shapeSty;
    const r = VE.parseSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="' + S[2](x, y, w, h) + '" fill="' + st.fill + '" stroke="' + (st.sw > 0 ? st.stroke : 'none') + '" stroke-width="' + st.sw + '"' + (S[3] ? ' fill-rule="evenodd"' : '') + '/></svg>');
    const o = r.objects[0];
    if (!o) return null;
    const names = new Set(docRef.current.objects.map(q => q.name));
    let n = 1;
    while (names.has(S[1] + '-' + n)) n++;
    return {
      ...o,
      id: id || o.id,
      name: S[1] + '-' + n
    };
  };
  const [vx, vy, vw, vh] = doc.viewBox;

  /* ---- zoom / pan ---- */
  const clampZ = z => Math.max(VZMIN, Math.min(VZMAX, z));
  const setZ = (nz, cx, cy, soft) => {
    const b = boxRef.current;
    if (!b) return;
    const r = soft && boxRectRef.current && boxRectRef.current.width > 0 && (viewPend.current || viewSettleTimer.current) ? boxRectRef.current : boxRectRef.current = b.getBoundingClientRect();
    if (!r.width || !r.height) return;
    nz = clampZ(nz);
    const px = cx == null ? r.width / 2 : cx - r.left,
      py = cy == null ? r.height / 2 : cy - r.top;
    const s0 = zoomRef.current,
      p0 = panRef.current,
      wx = (px - p0.x) / s0,
      wy = (py - p0.y) / s0,
      np = {
        x: px - wx * nz,
        y: py - wy * nz
      };
    zoomRef.current = nz;
    panRef.current = np;
    if (dragRef.current && dragRef.current.type === 'pan') {
      dragRef.current.px = np.x;
      dragRef.current.py = np.y;
      if (cx != null) dragRef.current.lx = cx;
      if (cy != null) dragRef.current.ly = cy;
    }
    if (soft) softView();else flushView();
  };
  const zoomBy = (f, cx, cy) => setZ(zoomRef.current * f, cx, cy, true);
  const fitTo = (bx, by, bw, bh, pad) => {
    const b = boxRef.current;
    if (!b || !b.clientWidth) return;
    const s = clampZ(Math.min((b.clientWidth - pad * 2) / Math.max(1e-6, bw), (b.clientHeight - pad * 2) / Math.max(1e-6, bh)));
    const np = {
      x: (b.clientWidth - bw * s) / 2 - bx * s,
      y: (b.clientHeight - bh * s) / 2 - by * s
    };
    zoomRef.current = s;
    panRef.current = np;
    flushView(true);
  };
  const fitView = () => {
    /* pas = artboard + semua konten (termasuk yang di luar artboard) */
    const [x, y, w, h] = docRef.current.viewBox,
      bb = VE.docBounds(docRef.current);
    if (!bb) return fitTo(x, y, w, h, 24);
    const x0 = Math.min(x, bb[0]),
      y0 = Math.min(y, bb[1]),
      x1 = Math.max(x + w, bb[2]),
      y1 = Math.max(y + h, bb[3]);
    fitTo(x0, y0, x1 - x0, y1 - y0, 24);
  };
  const fitSel = () => {
    if (!selObjs.length) return fitView();
    let x0 = 1e18,
      y0 = 1e18,
      x1 = -1e18,
      y1 = -1e18;
    selObjs.forEach(o => {
      const b = vinfo(o).bb;
      x0 = Math.min(x0, b[0]);
      y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]);
      y1 = Math.max(y1, b[3]);
    });
    fitTo(x0, y0, x1 - x0 || 1, y1 - y0 || 1, 60);
  };
  /* Fungsi Toggle & Inspeksi Mode Piksel (Mode 3 — Hard Pixel Preview):
     Saat tombol Piksel ditekan tanpa argumen (targetZ == null):
     - Mengaktifkan / menonaktifkan Mode Piksel langsung pada posisi & zoom saat ini tanpa memindahkan kamera,
       sehingga ketika pengguna zoom in pada objek, objek tetap berada tepat di layar dalam tampilan piksel! */
  const zoomToPixels = (targetZ, forceMode) => {
    const b = boxRef.current;
    if (!b || !b.clientWidth) return;
    const curZ = zoomRef.current;
    const nextMode = forceMode || 'hard';
    if (targetZ == null && !forceMode) {
      if (RENDER_CONFIG.pixelPreviewMode !== 'smooth') {
        setRenderCfg({
          pixelPreviewMode: 'smooth'
        });
        say('Mode Piksel dinonaktifkan (kembali ke Smooth Vector)');
      } else {
        setRenderCfg({
          pixelPreviewMode: nextMode,
          pixelGrid: true
        });
        say('Mode Piksel aktif — silakan zoom in untuk melihat grid & piksel 1×1 secara tajam');
      }
      return;
    }
    const nz = clampZ(targetZ != null ? targetZ : curZ < 16 ? 32 : curZ < 48 ? 64 : curZ < 96 ? 128 : 32);
    setRenderCfg({
      pixelPreviewMode: nextMode,
      pixelGrid: true
    });
    let wx = (b.clientWidth / 2 - panRef.current.x) / curZ;
    let wy = (b.clientHeight / 2 - panRef.current.y) / curZ;
    if (selObjs.length > 0) {
      let sx = 0,
        sy = 0,
        sc = 0;
      if (sel.nodes && sel.nodes.size > 0) {
        selObjs.forEach(o => o.subs.forEach(sp => sp.nodes.forEach(n => {
          if (sel.nodes.has(n.id)) {
            sx += n.x;
            sy += n.y;
            sc++;
          }
        })));
      }
      if (sc > 0) {
        wx = sx / sc;
        wy = sy / sc;
      } else {
        let x0 = 1e18,
          y0 = 1e18,
          x1 = -1e18,
          y1 = -1e18;
        selObjs.forEach(o => {
          const bb = vinfo(o).bb;
          x0 = Math.min(x0, bb[0]);
          y0 = Math.min(y0, bb[1]);
          x1 = Math.max(x1, bb[2]);
          y1 = Math.max(y1, bb[3]);
        });
        wx = (x0 + x1) / 2;
        wy = (y0 + y1) / 2;
      }
    } else {
      const dbb = VE.docBounds(docRef.current);
      if (dbb) {
        const [bx0, by0, bx1, by1] = dbb;
        if (wx < bx0 || wx > bx1 || wy < by0 || wy > by1) {
          wx = (bx0 + bx1) / 2;
          wy = (by0 + by1) / 2;
        }
      }
    }
    const np = {
      x: b.clientWidth / 2 - wx * nz,
      y: b.clientHeight / 2 - wy * nz
    };
    zoomRef.current = nz;
    panRef.current = np;
    flushView();
    say(`Zoom Piksel ${Math.round(nz * 100).toLocaleString(prefs.lang === 'en' ? 'en-US' : 'id-ID')}% aktif (1 px = ${Math.round(nz)}×${Math.round(nz)} px layar)`);
  };
  /* Section 7.2: Document Lifecycle Operations (createDocument, loadDocument, replaceDocument) */
  const replaceDocument = (nextDoc, nextViewState) => {
    const validDoc = nextDoc && Array.isArray(nextDoc.objects) && Array.isArray(nextDoc.viewBox) ? nextDoc : {
      viewBox: [0, 0, 800, 600],
      objects: []
    };
    if (liveRafRef.current) {
      cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = 0;
    }
    docRef.current = validDoc;
    const rev = ++docRevRef.current;
    hist.current = {
      s: [validDoc],
      p: 0,
      key: null,
      t: 0
    };
    setSel({
      objs: new Set(),
      nodes: new Set()
    });
    setPen(null);
    setVcSimp(null);
    alMem.current = null;
    snapCacheRef.current = null;
    loaded.current = null;
    setDocS(validDoc);
    if (sceneRendererRef.current) {
      sceneRendererRef.current.setDragOffset(null, 0, 0);
      sceneRendererRef.current.setScene(validDoc, rev);
    }
    if (nextViewState && typeof nextViewState.zoom === 'number' && nextViewState.pan) {
      zoomRef.current = nextViewState.zoom;
      panRef.current = {
        x: nextViewState.pan.x,
        y: nextViewState.pan.y
      };
      flushView();
    } else {
      requestAnimationFrame(() => fitView());
    }
  };
  const createDocument = (vb = [0, 0, 800, 600]) => {
    const blank = {
      viewBox: Array.isArray(vb) && vb.length === 4 ? vb : [0, 0, 800, 600],
      objects: []
    };
    replaceDocument(blank, null);
    return blank;
  };
  const loadDocument = (nextDoc, nextViewState) => {
    replaceDocument(nextDoc, nextViewState);
  };
  const activeProjRef = useRef(projectId);
  useEffect(() => {
    if (projectId && projectId !== activeProjRef.current) {
      activeProjRef.current = projectId;
      if (initialDoc) replaceDocument(initialDoc, initialViewState);
    }
  }, [projectId, initialDoc]);
  api.current = {
    setZ,
    fitView,
    zoomToPixels,
    createDocument,
    loadDocument,
    replaceDocument,
    getDoc: () => docRef.current,
    getViewState: () => ({
      zoom: zoomRef.current,
      pan: {
        ...panRef.current
      }
    })
  };
  useEffect(() => {
    const b = boxRef.current;
    if (!b) return;
    const sr = new SceneRenderer().init(b, {
      gpu: gpuOn,
      canvasEl: sceneCanvasRef.current
    });
    sr.setScene(docRef.current, docRevRef.current);
    sr.setRenderEnv({
      bg,
      showGrid: gridOn,
      clipFrames,
      frameBoxes,
      frameBgByGroup
    });
    sr.setCamera(zoomRef.current, panRef.current.x, panRef.current.y, b.clientWidth, b.clientHeight);
    sr.renderFrame(true);
    sceneRendererRef.current = sr;
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (boxRef.current) boxRectRef.current = boxRef.current.getBoundingClientRect();
        if (sceneRendererRef.current && boxRef.current) {
          sceneRendererRef.current.setCamera(zoomRef.current, panRef.current.x, panRef.current.y, boxRef.current.clientWidth, boxRef.current.clientHeight);
          sceneRendererRef.current.requestRender();
        }
      });
      ro.observe(b);
    }
    return () => {
      if (ro) ro.disconnect();
      sr.dispose();
      sceneRendererRef.current = null;
    };
  }, [gpuOn, renderCfg.backendOverride]);
  useEffect(() => {
    const b = boxRef.current;
    if (!b) return;
    const wh = e => {
      e.preventDefault();
      if (dragRef.current && dragRef.current.type !== 'pan') return;
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;else if (e.deltaMode === 2) d *= b.clientHeight;
      d = Math.max(-240, Math.min(240, d));
      api.current.setZ(zoomRef.current * Math.exp(-d * (e.ctrlKey && Math.abs(d) < 50 ? 0.01 : 0.0018)), e.clientX, e.clientY, true);
    };
    const noMidScroll = e => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    b.addEventListener('wheel', wh, {
      passive: false
    });
    b.addEventListener('mousedown', noMidScroll, {
      passive: false
    });
    b.addEventListener('auxclick', noMidScroll, {
      passive: false
    });
    return () => {
      b.removeEventListener('wheel', wh);
      b.removeEventListener('mousedown', noMidScroll);
      b.removeEventListener('auxclick', noMidScroll);
    };
  }, []);
  React.useLayoutEffect(() => {
    if (active) {
      const id = requestAnimationFrame(() => api.current.fitView());
      return () => cancelAnimationFrame(id);
    }
  }, [active]);

  /* ---- muat dokumen baru dari Trace (jadi langkah undo, bukan reset) ---- */
  const loadDoc = (d, note) => {
    if (d.error) return say('File SVG tidak valid');
    commit(d, null);
    setSel({
      objs: new Set(),
      nodes: new Set()
    });
    requestAnimationFrame(() => api.current.fitView());
    if (d.unsupported) say('Elemen SVG dilewati: ' + unsSummary(d));else if (note) say(note);
  };
  useEffect(() => {
    if (initialSvg && initialSvg !== loaded.current) {
      loaded.current = initialSvg;
      loadDoc(VE.parseSVG(initialSvg), hist.current.p > 0 ? 'SVG baru dimuat (Ctrl+Z untuk kembali)' : null);
    }
  }, [initialSvg]);

  /* ---- impor banyak file (SVG + gambar) → ditambahkan ke kanvas, tidak menggantikan isi ---- */
  const readAs = (f, how) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    how === 'text' ? r.readAsText(f) : r.readAsDataURL(f);
  });
  const imgSize = url => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res({
      w: im.naturalWidth,
      h: im.naturalHeight
    });
    im.onerror = rej;
    im.src = url;
  });
  /* Magic-byte sniffer: tipe ditentukan dari isi file (bukan sekadar ekstensi), ekstensi/MIME hanya cadangan */
  const sniffKind = async f => {
    let u8 = new Uint8Array(0);
    try {
      u8 = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
    } catch (e) {}
    const hd = String.fromCharCode.apply(null, u8.subarray(0, 16)),
      txt = new TextDecoder('utf-8').decode(u8.subarray(0, 2048));
    if (u8[0] === 0x89 && hd.slice(1, 4) === 'PNG') return 'img';
    if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'img';
    if (hd.startsWith('GIF8') || hd.startsWith('RIFF') && hd.slice(8, 12) === 'WEBP') return 'img';
    if (hd.startsWith('%PDF-') || hd.startsWith('%!PS') || u8[0] === 0xC5 && u8[1] === 0xD0 && u8[2] === 0xD3 && u8[3] === 0xC6) return 'ps';
    if (/<svg[\s>]/i.test(txt)) return 'svg';
    const ext = ((f.name || '').split('.').pop() || '').toLowerCase(),
      ty = f.type || '';
    if (ext === 'svg' || ty === 'image/svg+xml') return 'svg';
    if (['ai', 'ps', 'eps', 'pdf'].includes(ext) || ty === 'application/postscript' || ty === 'application/pdf') return 'ps';
    if (ty.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'img';
    return null;
  };
  const importFiles = async (list, at) => {
    const files = Array.from(list || []).filter(Boolean);
    if (!files.length || !boxRef.current) return;
    say('Memuat ' + files.length + ' file…');
    const r = boxRef.current.getBoundingClientRect(),
      visW = r.width / zoomRef.current,
      visH = r.height / zoomRef.current;
    const ctr = toDoc(at ? at.x : r.left + r.width / 2, at ? at.y : r.top + r.height / 2),
      items = [];
    let bad = 0,
      warn = false;
    for (const f of files) {
      try {
        const base = (f.name || 'gambar').replace(/\.[^.]+$/, '') || 'gambar';
        const kind = await sniffKind(f);
        if (kind === 'svg') {
          const d = VE.parseSVG(await readAs(f, 'text'));
          if (d.error || !d.objects.length) {
            bad++;
            continue;
          }
          if (d.unsupported) warn = true;
          items.push({
            kind: 'svg',
            d,
            name: base,
            W: d.viewBox[2],
            H: d.viewBox[3]
          });
        } else if (kind === 'ps') {
          const d = await VE.parsePSorAI(await f.arrayBuffer());
          if (d.error || !d.objects.length) {
            bad++;
            continue;
          }
          if (d.unsupported) warn = true;
          items.push({
            kind: 'svg',
            d,
            name: base,
            W: d.viewBox[2],
            H: d.viewBox[3]
          });
        } else if (kind === 'img') {
          let url,
            assetId = null;
          if (projectId && typeof AssetManager !== 'undefined') {
            const saved = await AssetManager.ingestBlob(projectId, f, f.name || base + '.png');
            url = saved.href;
            assetId = saved.assetId;
          } else {
            url = await readAs(f, 'url');
          }
          const sz = await imgSize(url),
            k = Math.min(1, visW * 0.8 / sz.w, visH * 0.8 / sz.h);
          items.push({
            kind: 'img',
            url,
            assetId,
            name: base,
            w: sz.w,
            h: sz.h,
            k,
            W: sz.w * k,
            H: sz.h * k
          });
        } else bad++;
      } catch (x) {
        bad++;
      }
    }
    if (!items.length) return say('Tidak ada file yang bisa dimuat (gunakan SVG, AI, EPS, PS, PDF, PNG, JPG, WebP, GIF)');
    const cur = docRef.current,
      empty = !cur.objects.length,
      gap = 16 / zoomRef.current;
    let base0 = cur;
    const first = items[0],
      useFrame = empty && first.kind === 'svg';
    if (useFrame) base0 = {
      ...cur,
      viewBox: first.d.viewBox
    };
    const total = items.reduce((a, it) => a + it.W, 0) + gap * (items.length - 1);
    let px = useFrame ? first.d.viewBox[0] : ctr.x - total / 2;
    const used = new Set(cur.objects.map(o => o.name)),
      uniq = n => {
        let k = n,
          i = 2;
        while (used.has(k)) k = n + '-' + i++;
        used.add(k);
        return k;
      },
      news = [];
    items.forEach((it, idx) => {
      const py = useFrame && idx === 0 ? first.d.viewBox[1] : ctr.y - it.H / 2;
      if (it.kind === 'img') {
        const o = VE.makeImageObj(it.url, it.w, it.h, 0, 0, uniq(it.name), 'none');
        if (it.assetId) o.img.assetId = it.assetId;
        news.push({
          ...VE.scaleObj(VE.translate(o, px, py), px, py, it.k),
          name: o.name
        });
      } else {
        const vb = it.d.viewBox,
          gm = new Map(),
          gused = new Set([...cur.objects, ...news].map(o => o.group).filter(Boolean));
        it.d.objects.forEach(o => {
          const dx = px - vb[0],
            dy = py - vb[1];
          const q = Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12 ? o : VE.translate(o, dx, dy);
          let g = null;
          if (o.group) {
            if (!gm.has(o.group)) {
              const isF = o.containerType === 'frame' || o.isFrameBg || o.isAutoFrame || /^frame/i.test(o.group);
              let cand = o.group;
              if (gused.has(cand)) {
                const prefix = isF ? 'Frame-' : 'grup-';
                let k = 1;
                while (gused.has(prefix + k)) k++;
                cand = prefix + k;
              }
              gused.add(cand);
              gm.set(o.group, cand);
            }
            g = gm.get(o.group);
          }
          const nextName = o.isFrameBg && g ? uniq(g + '-bg') : uniq(o.name);
          news.push({
            ...q,
            name: nextName,
            group: g
          });
        });
      }
      px += it.W + gap;
    });
    commit({
      ...base0,
      objects: [...cur.objects, ...news]
    }, null);
    setSel({
      objs: new Set(news.length > 24 ? [] : news.map(o => o.id)),
      nodes: new Set()
    });
    const bb = VE.docBounds({
        objects: news
      }),
      vb = base0.viewBox;
    let note = '';
    if (bb) {
      if (bb[0] < vb[0] - 0.5 || bb[1] < vb[1] - 0.5 || bb[2] > vb[0] + vb[2] + 0.5 || bb[3] > vb[1] + vb[3] + 0.5) {
        setExportArea('content');
        note = prefs.lang === 'en' ? ' · export area: all content' : ' · area ekspor: semua konten';
      }
      if (empty || bb[2] - bb[0] > visW || bb[3] - bb[1] > visH) requestAnimationFrame(() => fitTo(empty ? Math.min(bb[0], vb[0]) : bb[0], empty ? Math.min(bb[1], vb[1]) : bb[1], Math.max(1e-6, empty ? Math.max(bb[2], vb[0] + vb[2]) - Math.min(bb[0], vb[0]) : bb[2] - bb[0]), Math.max(1e-6, empty ? Math.max(bb[3], vb[1] + vb[3]) - Math.min(bb[1], vb[1]) : bb[3] - bb[1]), 60));
    }
    const warnDetails = items.map(it => it.d && unsSummary(it.d)).filter(Boolean).join(', ');
    say(items.length + ' file ditambahkan' + (bad ? ' · ' + bad + ' dilewati' : '') + (warn ? ' · elemen dilewati: ' + (warnDetails || L.edUnsupportedDefault) : '') + note);
  };
  /* teks clipboard → objek internal / SVG / PostScript / data-URL gambar. true bila ditangani */
  const pasteText = (tx, at) => {
    tx = String(tx || '').replace(/^\uFEFF/, '').trim();
    if (!tx) return false;
    const c = clipRef.current;
    if (c && c.objs.length && (tx === c.svg || tx.startsWith('svgpeak-clip:'))) {
      pasteClip(at);
      return true;
    }
    const svgMatch = tx.match(/<svg[\s>][\s\S]*<\/svg>/i);
    if (svgMatch) {
      importFiles([new File([svgMatch[0]], 'tempel.svg', {
        type: 'image/svg+xml'
      })], at);
      return true;
    }
    if (/^%!PS-Adobe/.test(tx) || /\b(moveto|curveto|setrgbcolor|setcmykcolor)\b/.test(tx)) {
      importFiles([new File([tx], 'tempel.ps', {
        type: 'application/postscript'
      })], at);
      return true;
    }
    if (/^data:image\/svg\+xml/i.test(tx)) {
      try {
        const comma = tx.indexOf(',');
        if (comma > 0) {
          const meta = tx.slice(0, comma),
            raw = tx.slice(comma + 1);
          const decoded = /;base64/i.test(meta) ? atob(raw) : decodeURIComponent(raw);
          if (/<svg[\s>]/i.test(decoded)) {
            importFiles([new File([decoded], 'tempel.svg', {
              type: 'image/svg+xml'
            })], at);
            return true;
          }
        }
      } catch (e) {}
    }
    if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);/i.test(tx)) {
      fetch(tx).then(r => r.blob()).then(b => importFiles([new File([b], 'tempel.' + (b.type.split('/')[1] || 'png').replace('svg+xml', 'svg'), {
        type: b.type
      })], at)).catch(() => say('Data gambar tidak valid'));
      return true;
    }
    return false;
  };
  /* membaca clipboard sistem secara aktif (tombol Paste di menu klik-kanan) */
  const pasteFromSystem = async at => {
    const cb = navigator.clipboard;
    if (cb && cb.read) {
      try {
        const items = await cb.read();
        for (const it of items) {
          const tx = it.types.includes('text/plain') ? await (await it.getType('text/plain')).text() : '';
          if (pasteText(tx, at)) return;
          if (it.types.includes('image/svg+xml')) {
            const bl = await it.getType('image/svg+xml');
            return importFiles([new File([bl], 'clipboard.svg', {
              type: 'image/svg+xml'
            })], at);
          }
          const it0 = it.types.find(t => t === 'image/png' || t === 'image/jpeg' || t === 'image/webp');
          if (it0) {
            const bl = await it.getType(it0);
            return importFiles([new File([bl], 'clipboard.' + it0.split('/')[1], {
              type: it0
            })], at);
          }
        }
      } catch (e) {}
    }
    if (clipRef.current && clipRef.current.objs.length) return pasteClip(at);
    say('Tekan Ctrl+V untuk menempel gambar/vektor dari clipboard');
  };
  /* GV-007: Listener paste memakai ref stabil dan dependency [active] agar tidak dipasang ulang tiap render */
  const pasteHandlerRef = useRef(null);
  pasteHandlerRef.current = e => {
    const t = e.target;
    if (t && t.closest && t.closest('[data-custom-input="true"],[role="textbox"],[contenteditable="true"]')) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const g = k => {
      try {
        return cd.getData(k) || '';
      } catch (x) {
        return '';
      }
    };
    let done = pasteText(g('text/plain')) || pasteText(g('image/svg+xml'));
    if (!done) {
      const hm = g('text/html').match(/<svg[\s\S]*<\/svg>/i);
      if (hm) done = pasteText(hm[0]);
    }
    if (!done) {
      let fl = Array.from(cd.files || []).filter(f => (f.type || '').startsWith('image/') || /\.(svg|ai|ps|eps|pdf|png|jpe?g|webp|gif)$/i.test(f.name || ''));
      if (!fl.length && cd.items) fl = Array.from(cd.items).filter(i => i.kind === 'file' && ((i.type || '').startsWith('image/') || i.type === 'application/pdf' || i.type === 'application/postscript')).map(i => i.getAsFile()).filter(Boolean);
      const vecFl = fl.filter(f => f.type === 'image/svg+xml' || f.type === 'application/postscript' || f.type === 'application/pdf' || /\.(svg|ai|ps|eps|pdf)$/i.test(f.name || ''));
      if (vecFl.length) fl = vecFl;
      if (fl.length) {
        importFiles(fl);
        done = true;
      }
    }
    if (!done && clipRef.current && clipRef.current.objs.length) {
      pasteClip();
      done = true;
    }
    if (done) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  useEffect(() => {
    if (!active) return;
    const ps = e => pasteHandlerRef.current && pasteHandlerRef.current(e);
    window.addEventListener('paste', ps, true);
    return () => window.removeEventListener('paste', ps, true);
  }, [active]);

  /* ---- hit-test via Spatial Index (GV-006) ---- */
  const boxRectRef = useRef(null);
  const toDoc = (cx, cy) => {
    const r = boxRectRef.current && boxRectRef.current.width > 0 ? boxRectRef.current : boxRectRef.current = boxRef.current.getBoundingClientRect(),
      p = panRef.current,
      s = zoomRef.current;
    return {
      x: (cx - r.left - p.x) / s,
      y: (cy - r.top - p.y) / s
    };
  };
  /* GV-A16: Hit-test kanonik yang menghormati opacity, groupOpacity, clipPathD & Frame clipping */
  const hitObj = pt => {
    const tol = 6 / zoomRef.current,
      os = docRef.current.objects;
    const frameRectMap = new Map((frameBoxes || []).map(f => [f.id, f.bb]));
    const hitOpts = {
      clipFrames,
      frameRectMap
    };
    const sIdx = VE.getDocSpatialIndex(os);
    const cands = sIdx ? sIdx.queryObjectsInRect(pt.x - tol, pt.y - tol, pt.x + tol, pt.y + tol) : null;
    if (cands) {
      for (let i = cands.length - 1; i >= 0; i--) {
        const o = cands[i].o;
        if (VE.hitTestObject(o, pt, tol, hitOpts)) return o;
      }
      return null;
    }
    for (let i = os.length - 1; i >= 0; i--) {
      const o = os[i];
      if (VE.hitTestObject(o, pt, tol, hitOpts)) return o;
    }
    return null;
  };
  const pickNode = pt => {
    const s = Math.max(1, zoomRef.current),
      hTol = 7 / s,
      nTol = 8 / s;
    if (showSelHandles) {
      for (let k = shown.length - 1; k >= 0; k--) {
        const o = shown[k];
        for (const sp of o.subs) for (const n of sp.nodes) for (const w of ['in', 'out']) {
          const h = w === 'in' ? n.handleIn : n.handleOut;
          if (h && hOk(o, n) && Math.abs(pt.x - h.x) <= hTol && Math.abs(pt.y - h.y) <= hTol && VE.dist(h, n) > 1e-6 && VE.dist(pt, h) < hTol) return {
            kind: 'handle',
            o,
            n,
            w,
            h
          };
        }
      }
    }
    if (showSelNodes) {
      for (let k = shown.length - 1; k >= 0; k--) {
        const o = shown[k];
        const bb = vinfo(o).bb;
        if (pt.x < bb[0] - nTol || pt.x > bb[2] + nTol || pt.y < bb[1] - nTol || pt.y > bb[3] + nTol) continue;
        for (const sp of o.subs) for (const n of sp.nodes) if (Math.abs(pt.x - n.x) <= nTol && Math.abs(pt.y - n.y) <= nTol && VE.dist(pt, n) < nTol) return {
          kind: 'node',
          o,
          n
        };
      }
    }
    return null;
  };
  const nearestSeg = (objs, pt, tol) => {
    let best = null;
    const sIdx = objs === docRef.current.objects ? VE.getDocSpatialIndex(objs) : null;
    if (sIdx) {
      sIdx.querySegments(pt.x, pt.y, tol, sg => {
        if (sg.o.hidden || sg.o.locked || sg.o.img) return;
        const r = VE.nearOnSeg(sg.a, sg.b, pt);
        if (r.d < tol && (!best || r.d < best.d)) best = {
          o: sg.o,
          sp: sg.sp,
          i: sg.i,
          t: Math.min(0.98, Math.max(0.02, r.t)),
          d: r.d
        };
      });
      return best;
    }
    objs.forEach(o => {
      const b = vinfo(o).bb;
      if (pt.x < b[0] - tol || pt.x > b[2] + tol || pt.y < b[1] - tol || pt.y > b[3] + tol) return;
      o.subs.forEach(sp => {
        const ns = sp.nodes,
          n = ns.length;
        for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
          const r = VE.nearOnSeg(ns[i], ns[(i + 1) % n], pt);
          if (r.d < tol && (!best || r.d < best.d)) best = {
            o,
            sp,
            i,
            t: Math.min(0.98, Math.max(0.02, r.t)),
            d: r.d
          };
        }
      });
    });
    return best;
  };

  /* ---- pointer & SN-006 tool-aware snapAt ---- */
  const snapAt = (p, e, exObjs, exNodes, objs, opt) => {
    if (!snapOn || e.ctrlKey || e.metaKey) {
      setSnapInd(null);
      return p;
    }
    opt = opt || {};
    const thr = VE.SNAP_PX / zoomRef.current,
      objects = objs || docRef.current.objects;
    const toolCap = SNAP_TOOL_CAPABILITIES[tool] || SNAP_TOOL_CAPABILITIES.select;
    const allowSpacing = !!(snapCfg.spacing && (opt.allowSpacing || toolCap.spacing) && opt.dragBBox);
    const allowPerp = !!(snapCfg.perp && (opt.allowPerp || toolCap.perp));
    const cfg = {
      ...snapCfg,
      bbox: !!(snapCfg.bbox && toolCap.bbox),
      spacing: allowSpacing,
      artboard: !!(snapCfg.artboard && toolCap.artboard),
      node: !!(snapCfg.node && toolCap.node),
      axial: !!(snapCfg.axial && toolCap.axial),
      midpoint: !!(snapCfg.midpoint && toolCap.midpoint),
      edge: !!(snapCfg.edge && toolCap.edge),
      perp: allowPerp,
      grid: !!(snapCfg.grid && gridOn && toolCap.grid)
    };
    const key = ['bbox', 'spacing', 'artboard', 'node', 'axial', 'midpoint', 'perp'].map(k => +!!cfg[k]).join('') + '|' + (exObjs ? 'S' + [...exObjs].join(',') : 'N') + '|' + (exNodes ? 'S' + [...exNodes].join(',') : 'N');
    const vb = docRef.current.viewBox,
      c0 = snapCacheRef.current;
    let cache;
    if (c0 && c0.objects === objects && c0.vb === vb && c0.key === key) cache = c0.cache;else {
      cache = VE.buildSnapCache({
        viewBox: vb,
        objects
      }, exObjs, exNodes, cfg, null);
      snapCacheRef.current = {
        objects,
        vb,
        key,
        cache
      };
    }
    let extra = opt.extra || null;
    if (allowPerp && opt.perpAnchor && opt.perpPrev) {
      const u = VE.nrm(VE.sub(opt.perpAnchor, opt.perpPrev));
      const dynRays = [{
        o: opt.perpAnchor,
        d: u,
        src: p,
        label: '180°',
        kind: 'perp'
      }, {
        o: opt.perpAnchor,
        d: {
          x: -u.y,
          y: u.x
        },
        src: p,
        label: '90°',
        kind: 'perp'
      }];
      cache = {
        ...cache,
        rays: [...(cache.rays || []), ...dynRays]
      };
    }
    const r = VE.solveMultiSnap(p, cache, objects, exObjs, exNodes, thr, cfg.grid ? gridStep() : 0, cfg, opt.dragBBox || null, extra);
    setSnapInd(r.ind ? {
      x: r.ix,
      y: r.iy,
      kind: r.kind,
      cross: r.cross,
      guides: r.guides
    } : null);
    return r;
  };
  /* titik kandidat yang ikut bergerak: jika seluruh objek kanvas dipilih (!hasOtherObjs), cukup anchor + bbox;
     jika jumlah node sangat besar (> 48), ambil sampel merata + titik kunci bbox agar drag 9.000+ node tetap 60fps */
  const dragCands = dg => {
    const bbPts = [];
    if (dg.bb0) {
      const [x0, y0, x1, y1] = dg.bb0;
      const cx = (x0 + x1) * 0.5,
        cy = (y0 + y1) * 0.5;
      bbPts.push({
        x: cx,
        y: cy
      }, {
        x: x0,
        y: y0
      }, {
        x: x1,
        y: y0
      }, {
        x: x1,
        y: y1
      }, {
        x: x0,
        y: y1
      });
    }
    if (dg.hasOtherObjs === false) {
      return bbPts.length ? bbPts : dg.anchor ? [{
        x: dg.anchor.x,
        y: dg.anchor.y
      }] : [];
    }
    const allPts = [];
    dg.base.objects.forEach(o => {
      if (dg.type === 'obj' && !dg.ids.has(o.id)) return;
      o.subs.forEach(sp => sp.nodes.forEach(n => {
        if (dg.type === 'node' && !dg.ids.has(n.id)) return;
        allPts.push({
          x: n.x,
          y: n.y
        });
      }));
    });
    const MAX_CANDS = dg.type === 'obj' ? 12 : 48;
    if (allPts.length <= MAX_CANDS) {
      return dg.type === 'obj' ? bbPts.concat(allPts) : allPts;
    }
    const pts = bbPts.slice();
    if (dg.anchor && dg.type !== 'obj') pts.push({
      x: dg.anchor.x,
      y: dg.anchor.y
    });
    const step = allPts.length / MAX_CANDS;
    for (let i = 0; i < MAX_CANDS; i++) {
      pts.push(allPts[Math.min(allPts.length - 1, Math.floor(i * step))]);
    }
    return pts;
  };
  /* kontur objek yang digeser: dievaluasi untuk seleksi kecil/menengah agar tidak membekukan drag ribuan kurva */
  const dragOutline = dg => {
    if (dg.hasOtherObjs === false || dg.dragNodeCount > 24 || dg.ids && dg.ids.size > 2) {
      return {
        segs: [],
        samples: []
      };
    }
    const segs = [];
    dg.base.objects.forEach(o => {
      if (!dg.ids.has(o.id)) return;
      o.subs.forEach(sp => {
        const ns = sp.nodes,
          n = ns.length;
        for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
          const a = ns[i],
            b = ns[(i + 1) % n];
          let x0 = Math.min(a.x, b.x),
            x1 = Math.max(a.x, b.x),
            y0 = Math.min(a.y, b.y),
            y1 = Math.max(a.y, b.y);
          for (const q of [a.handleOut, b.handleIn]) if (q) {
            x0 = Math.min(x0, q.x);
            x1 = Math.max(x1, q.x);
            y0 = Math.min(y0, q.y);
            y1 = Math.max(y1, q.y);
          }
          segs.push({
            a,
            b,
            bb: [x0, y0, x1, y1],
            curved: !!(a.handleOut || b.handleIn)
          });
        }
      });
    });
    const per = 4,
      samples = [];
    segs.forEach(sg => {
      const k = sg.curved ? per : 2;
      for (let j = 1; j < k; j++) samples.push(VE.segPoint(sg.a, sg.b, j / k));
    });
    return {
      segs,
      samples
    };
  };
  /* ================= v4.6: Resize interaktif · Pen Tool · Auto-Handle ================= */
  const quant45 = (a, p) => {
    const vx = p.x - a.x,
      vy = p.y - a.y,
      L = Math.hypot(vx, vy),
      g = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
    return {
      x: a.x + Math.cos(g) * L,
      y: a.y + Math.sin(g) * L
    };
  };
  const penFind = (d, s) => {
    if (!s) return null;
    const o = d.objects.find(q => q.id === s.oid),
      sp = o && o.subs.find(q => q.id === s.spid);
    return sp ? {
      o,
      sp
    } : null;
  };
  const penMap = (d, oid, spid, fn) => ({
    ...d,
    objects: d.objects.map(o => o.id !== oid ? o : {
      ...o,
      subs: o.subs.map(sp => sp.id !== spid ? sp : fn(sp))
    })
  });
  const penNodeMap = (d, oid, spid, nid, fn) => penMap(d, oid, spid, sp => ({
    ...sp,
    nodes: sp.nodes.map(n => n.id === nid ? fn(n) : n)
  }));
  const replaceTop = d => {
    const h = hist.current;
    h.s[h.p] = d;
    h.key = null;
    notifyDocCommit(d);
  };
  /* titik target kursor Pen: menutup path (dekat node pertama) > Shift 45° > Multi-Snap */
  const penTarget = (e, pt, f) => {
    if (f && f.sp.nodes.length >= 2 && !f.sp.closed && VE.dist(pt, f.sp.nodes[0]) < 8 / zoomRef.current) {
      setSnapInd(null);
      return {
        x: f.sp.nodes[0].x,
        y: f.sp.nodes[0].y,
        close: true
      };
    }
    let q;
    if (e.shiftKey && f && f.sp.nodes.length) {
      q = quant45(f.sp.nodes[f.sp.nodes.length - 1], pt);
      setSnapInd(null);
    } else {
      const ns = f && f.sp && f.sp.nodes;
      const perpOpt = ns && ns.length >= 2 ? {
        allowPerp: true,
        perpAnchor: ns[ns.length - 1],
        perpPrev: ns[ns.length - 2]
      } : {
        allowPerp: true
      };
      q = snapAt(pt, e, null, null, docRef.current.objects, perpOpt);
    }
    return {
      x: q.x,
      y: q.y,
      close: false
    };
  };
  const updatePenHover = e => {
    penEv.current = {
      x: e.clientX,
      y: e.clientY,
      shiftKey: e.shiftKey,
      altKey: e.altKey
    };
    if (penRaf.current) return;
    penRaf.current = requestAnimationFrame(() => {
      penRaf.current = 0;
      const ev = penEv.current;
      if (!ev || dragRef.current) return;
      const s = penRef.current,
        f = penFind(docRef.current, s),
        tg = penTarget(ev, toDoc(ev.x, ev.y), f);
      if (s && f) setPen({
        ...s,
        cur: {
          x: tg.x,
          y: tg.y
        },
        close: tg.close
      });
    });
  };
  const finishPen = () => {
    const s = penRef.current;
    if (!s) return;
    setPen(null);
    setSnapInd(null);
    const d = docRef.current,
      f = penFind(d, s);
    if (!f) return;
    if (f.sp.nodes.length < 2) {
      commit({
        ...d,
        objects: d.objects.filter(o => o.id !== s.oid)
      });
      setSel({
        objs: new Set(),
        nodes: new Set()
      });
      return;
    }
    if (!f.sp.closed && f.sp.nodes[0].handleIn) {
      const nd = penNodeMap(d, s.oid, s.spid, f.sp.nodes[0].id, n => ({
        ...n,
        handleIn: null
      }));
      live(nd);
      replaceTop(nd);
    }
    setSel({
      objs: new Set([s.oid]),
      nodes: new Set()
    });
    say(f.sp.closed ? 'Path tertutup' : 'Path selesai (' + f.sp.nodes.length + ' node)');
  };
  const penUndoLast = () => {
    const s = penRef.current,
      d = docRef.current,
      f = penFind(d, s);
    if (!f) {
      setPen(null);
      return;
    }
    if (f.sp.nodes.length <= 1) {
      setPen(null);
      commit({
        ...d,
        objects: d.objects.filter(o => o.id !== s.oid)
      });
      setSel({
        objs: new Set(),
        nodes: new Set()
      });
      return;
    }
    const nodes = f.sp.nodes.slice(0, -1);
    commit(penMap(d, s.oid, s.spid, sp => ({
      ...sp,
      closed: false,
      nodes
    })));
    setSel({
      objs: new Set([s.oid]),
      nodes: new Set([nodes[nodes.length - 1].id])
    });
  };
  /* FSM Pen: IDLE -> (down) DRAGGING_HANDLE -> (up) RUBBER_BAND -> CLOSING / FINISHING */
  const penDown = (e, pt, base) => {
    let s = penRef.current,
      f = penFind(base, s);
    if (!f) {
      s = null;
      f = null;
    }
    const tol = 8 / zoomRef.current,
      mk = (mode, oid, spid, n, nb) => ({
        type: 'pen',
        mode,
        base: nb,
        oid,
        spid,
        nid: n.id,
        P: {
          x: n.x,
          y: n.y
        },
        sx: e.clientX,
        sy: e.clientY,
        drag: false,
        moved: false
      });
    if (f) {
      const ns = f.sp.nodes,
        L = ns[ns.length - 1];
      if (ns.length >= 2 && !f.sp.closed && VE.dist(pt, ns[0]) < tol) {
        /* menutup path */
        const nd = penMap(base, s.oid, s.spid, sp => ({
          ...sp,
          closed: true
        }));
        commit(nd);
        setSel({
          objs: new Set([s.oid]),
          nodes: new Set([ns[0].id])
        });
        dragRef.current = mk('close', s.oid, s.spid, ns[0], nd);
        return;
      }
      if (VE.dist(pt, L) < tol) {
        setSel({
          objs: new Set([s.oid]),
          nodes: new Set([L.id])
        });
        dragRef.current = mk('last', s.oid, s.spid, L, base);
        return;
      } /* klik node terakhir */
    }

    const tg = penTarget(e, pt, f),
      node = {
        id: VE.uid(),
        x: tg.x,
        y: tg.y,
        type: 'corner',
        handleIn: null,
        handleOut: null
      };
    let nd, oid, spid;
    if (f) {
      oid = s.oid;
      spid = s.spid;
      nd = penMap(base, oid, spid, sp => ({
        ...sp,
        nodes: [...sp.nodes, node]
      }));
    } else {
      const names = new Set(base.objects.map(q => q.name));
      let k = 1;
      while (names.has('Pen-' + k)) k++;
      oid = VE.uid();
      spid = VE.uid();
      nd = {
        ...base,
        objects: [...base.objects, {
          id: oid,
          name: 'Pen-' + k,
          type: 'path',
          fill: penSty.fill,
          stroke: penSty.stroke,
          strokeWidth: penSty.sw,
          opacity: 1,
          fillRule: 'nonzero',
          group: null,
          subs: [{
            id: spid,
            closed: false,
            nodes: [node]
          }]
        }]
      };
    }
    commit(nd);
    setPen({
      oid,
      spid,
      cur: null,
      close: false
    });
    setSel({
      objs: new Set([oid]),
      nodes: new Set([node.id])
    });
    dragRef.current = mk('new', oid, spid, node, nd);
  };
  const penMove = (e, pt, dg) => {
    if (!dg.drag && VE.dist(pt, dg.P) * zoomRef.current < 4) return; /* hysteresis jarak layar */
    dg.drag = true;
    let T = pt;
    if (e.shiftKey) {
      T = quant45(dg.P, pt);
      setSnapInd(null);
    } else T = snapAt(pt, e, null, new Set([dg.nid]), dg.base.objects);
    const out = {
        x: T.x,
        y: T.y
      },
      nd = penNodeMap(dg.base, dg.oid, dg.spid, dg.nid, n => {
        const mir = {
          x: 2 * n.x - T.x,
          y: 2 * n.y - T.y
        };
        if (dg.mode === 'close') return n.handleOut ? {
          ...n,
          fil: null,
          handleIn: mir,
          type: 'corner'
        } : {
          ...n,
          fil: null,
          handleIn: mir,
          handleOut: out,
          type: 'symmetric'
        };
        if (e.altKey) return {
          ...n,
          fil: null,
          handleOut: out,
          handleIn: dg.curIn !== undefined ? dg.curIn : n.handleIn,
          type: 'corner'
        }; /* Alt = cusp */
        dg.curIn = mir;
        return {
          ...n,
          fil: null,
          handleOut: out,
          handleIn: mir,
          type: 'symmetric'
        }; /* H_in = 2P - H_out */
      });

    dg.moved = true;
    live(nd);
  };
  const penUp = dg => {
    if (dg.moved) {
      if (dg.mode === 'last') push(docRef.current, null);else replaceTop(docRef.current);
    }
    if (dg.mode === 'close') {
      finishPen();
      return;
    }
    if (dg.mode === 'last' && !dg.moved) {
      /* klik node terakhir = putus handle keluar */
      const f = penFind(docRef.current, dg),
        nn = f && f.sp.nodes.find(n => n.id === dg.nid);
      if (nn && nn.handleOut) commit(penNodeMap(docRef.current, dg.oid, dg.spid, dg.nid, n => ({
        ...n,
        handleOut: null,
        type: 'corner'
      })));
    }
  };
  /* Auto-Handle */
  const hoverAuto = ev => {
    const p = toDoc(ev.x, ev.y),
      tol = 10 / zoomRef.current;
    let best = null;
    docRef.current.objects.forEach(o => {
      if (o.img) return;
      const bb = vinfo(o).bb;
      if (p.x < bb[0] - tol || p.x > bb[2] + tol || p.y < bb[1] - tol || p.y > bb[3] + tol) return;
      o.subs.forEach(sp => sp.nodes.forEach(nd => {
        const d = VE.dist(p, nd);
        if (d < tol && (!best || d < best.d)) best = {
          d,
          o,
          sp,
          nd
        };
      }));
    });
    if (best) return {
      kind: 'node',
      oid: best.o.id,
      spid: best.sp.id,
      nid: best.nd.id,
      x: best.nd.x,
      y: best.nd.y
    };
    const o = hitObj(p);
    return o && !o.img ? {
      kind: 'obj',
      oid: o.id,
      spid: null,
      nid: null,
      x: p.x,
      y: p.y
    } : null;
  };
  const ahDown = (e, base) => {
    const hv = hoverAuto({
      x: e.clientX,
      y: e.clientY
    });
    if (!hv) {
      say('Klik sebuah node atau badan objek (bukan gambar) untuk menambahkan handle otomatis');
      return;
    }
    const spid = ahOpt.scope === 'obj' ? null : hv.spid;
    const o0 = base.objects.find(q => q.id === hv.oid);
    /* Klik langsung menambahkan handle Bézier TANPA mengubah bentuk objek (preserveShape: true) */
    const o1 = VE.autoHandles(o0, spid, {
      preserveShape: true
    });
    setSel({
      objs: new Set([hv.oid]),
      nodes: new Set(hv.nid ? [hv.nid] : [])
    });
    live({
      ...base,
      objects: base.objects.map(q => q.id === hv.oid ? o1 : q)
    });
    dragRef.current = {
      type: 'autoh',
      base,
      oid: hv.oid,
      spid,
      tau0: ahOpt.tau,
      sx: e.clientX,
      dragged: false,
      moved: o1 !== o0
    };
    if (o1 !== o0) say('Handle Bézier ditambahkan (bentuk tetap) · seret kanan/kiri bila ingin melengkungkan');
  };

  /* Terapkan Auto-Handle ke Objek Terpilih (preserveShape = true menjaga bentuk 100% tetap) */
  const autoSel = (clear, preserveShape = true) => {
    if (!selObjs.length) {
      say('Pilih objek terlebih dahulu');
      return;
    }
    const ids = selNodes.size ? selNodes : null;
    const ok = commitObjs(o => sel.objs.has(o.id) && !o.img ? VE.autoHandles(o, null, {
      tau: ahOpt.tau,
      minAngle: ahOpt.minAng,
      ids,
      clear,
      preserveShape
    }) : o);
    say(ok ? clear ? 'Handle dihapus dari objek terpilih' : preserveShape ? 'Handle Bézier ditambahkan ke objek terpilih (tanpa merubah bentuk)' : 'Kurva dihaluskan dengan Catmull-Rom' : 'Semua segmen pada objek terpilih sudah memiliki handle');
  };

  /* Terapkan Auto-Handle ke SEMUA Objek di Kanvas tanpa mengubah bentuk */
  const autoAll = (clear, preserveShape = true) => {
    if (!docRef.current.objects.length) {
      say('Kanvas masih kosong');
      return;
    }
    const ok = commitObjs(o => !o.img && !o.locked && !o.hidden && !o.isFrameBg && !o.isAutoFrame ? VE.autoHandles(o, null, {
      tau: ahOpt.tau,
      minAngle: ahOpt.minAng,
      clear,
      preserveShape
    }) : o);
    say(ok ? clear ? 'Handle dihapus dari semua objek' : 'Handle Bézier ditambahkan ke semua objek (tanpa merubah bentuk)' : 'Semua objek sudah memiliki handle Bézier');
  };
  /* ---- Figma: rotasi di kanvas, Alt+drag duplikat, Alt+hover redline, shortcut ---- */
  const selBoxNow = () => {
    let b = null;
    docRef.current.objects.forEach(o => {
      if (!selRef.current.objs.has(o.id)) return;
      const t = VE.tightBBox(o);
      if (!isFinite(t[0]) || Math.abs(t[0]) > 1e15 || t[0] > t[2]) return;
      b = b ? [Math.min(b[0], t[0]), Math.min(b[1], t[1]), Math.max(b[2], t[2]), Math.max(b[3], t[3])] : t.slice();
    });
    return b;
  };
  const updateAltMeasure = e => {
    lastPtr.current = {
      clientX: e.clientX,
      clientY: e.clientY
    };
    const pt = toDoc(e.clientX, e.clientY);
    const sb = e.altKey && tool === 'select' ? selBoxNow() : null;
    if (!sb) {
      setAltMeasure(m => m ? null : m);
      return;
    }
    const hov = hitObj(pt);
    if (hov && !selRef.current.objs.has(hov.id)) {
      const tb = VE.tightBBox(hov);
      setAltMeasure({
        targetBox: tb,
        lines: VE.measureDistanceGuides(sb, tb, false)
      });
    } else {
      const [vx, vy, vw, vh] = docRef.current.viewBox;
      setAltMeasure({
        targetBox: null,
        lines: VE.measureDistanceGuides(sb, [vx, vy, vx + vw, vy + vh], true)
      });
    }
  };
  /* Alt + drag objek = duplikat langsung (asli tetap, salinan mengikuti kursor) */
  const cloneWithGroups = (baseObjs, pickIds, offsetDx = 0, offsetDy = 0) => {
    const effIds = new Set(pickIds);
    baseObjs.forEach(o => {
      if (effIds.has(o.id) && (o.isFrameBg || o.isAutoFrame) && o.group) {
        baseObjs.forEach(ch => {
          if (ch.group === o.group) effIds.add(ch.id);
        });
      }
    });
    const picked = baseObjs.filter(o => effIds.has(o.id) && !o.locked);
    const used = new Set(baseObjs.map(o => o.name));
    const uniq = n => {
      let k = n + '-salin',
        i = 2;
      while (used.has(k)) k = n + '-salin-' + i++;
      used.add(k);
      return k;
    };
    const gused = new Set(baseObjs.map(o => o.group).filter(Boolean)),
      gm = new Map();
    const wholeGrps = new Set();
    picked.forEach(o => {
      if (!o.group) return;
      const allMem = baseObjs.filter(q => q.group === o.group);
      if (o.isFrameBg || o.isAutoFrame || allMem.every(q => effIds.has(q.id))) wholeGrps.add(o.group);
    });
    wholeGrps.forEach(g => {
      const isF = /^frame/i.test(g) || baseObjs.some(q => q.group === g && (q.containerType === 'frame' || q.isFrameBg || q.isAutoFrame));
      const prefix = isF ? 'Frame-' : 'grup-';
      let k = 1;
      while (gused.has(prefix + k)) k++;
      gused.add(prefix + k);
      gm.set(g, prefix + k);
    });
    return picked.map(o => {
      const cl = VE.cloneObj(o);
      const moved = offsetDx || offsetDy ? VE.translate(cl, offsetDx, offsetDy) : cl;
      const ng = o.group && gm.has(o.group) ? gm.get(o.group) : o.group;
      let nm;
      if ((o.isFrameBg || o.isAutoFrame) && ng) {
        nm = ng + '-bg';
        used.add(nm);
      } else nm = uniq(o.name);
      return {
        ...moved,
        name: nm,
        group: ng
      };
    });
  };
  const clearFastDragDom = dg => {
    if (boxRef.current) {
      boxRef.current.removeAttribute('data-dragging');
      boxRef.current.removeAttribute('data-dragging-obj');
    }
    if (sceneRendererRef.current) sceneRendererRef.current.setDragOffset(null, 0, 0);
    if (!dg || !dg.domEls) return;
    for (let i = 0; i < dg.domEls.length; i++) {
      const {
        el,
        baseTf,
        clipGroupEl,
        baseClip
      } = dg.domEls[i];
      if (baseTf) el.setAttribute('transform', baseTf);else el.removeAttribute('transform');
      if (clipGroupEl && baseClip) clipGroupEl.setAttribute('clip-path', baseClip);
    }
  };
  const flushFastObjDrag = dg => {
    if (!dg || !dg.fastTx) return;
    const {
      dx,
      dy
    } = dg.fastTx;
    dg.fastTx = null;
    clearFastDragDom(dg);
    docRef.current = {
      ...dg.base,
      objects: dg.base.objects.map(o => dg.ids.has(o.id) ? VE.translate(o, dx, dy) : o)
    };
  };
  const queryFastDragDomEls = dg => {
    if (!boxRef.current || !dg) return null;
    let partialBatch = false;
    const els = [];
    boxRef.current.querySelectorAll('[data-drag-id]').forEach(el => {
      if (dg.ids.has(el.getAttribute('data-drag-id'))) {
        const p = el.parentElement;
        const pClip = p && p.tagName === 'g' ? p.getAttribute('clip-path') : null;
        const ownClip = el.getAttribute('clip-path');
        els.push({
          el,
          baseTf: el.getAttribute('data-base-tf') || '',
          clipGroupEl: pClip && /^url\(#ved-clip-/.test(pClip) ? p : ownClip ? el : null,
          baseClip: pClip && /^url\(#ved-clip-/.test(pClip) ? pClip : ownClip || ''
        });
      }
    });
    boxRef.current.querySelectorAll('[data-drag-batch]').forEach(el => {
      const p = el.parentElement;
      const pClip = p && p.tagName === 'g' ? p.getAttribute('clip-path') : null;
      const clipGroupEl = pClip && /^url\(#ved-clip-/.test(pClip) ? p : null;
      const baseClip = clipGroupEl ? pClip : '';
      if (dg.allObjsSelected) {
        els.push({
          el,
          baseTf: el.getAttribute('data-base-tf') || '',
          clipGroupEl,
          baseClip
        });
        return;
      }
      const ids = (el.getAttribute('data-drag-batch') || '').split(',').filter(Boolean);
      const hitCount = ids.reduce((c, id) => c + (dg.ids.has(id) ? 1 : 0), 0);
      if (hitCount === ids.length && ids.length > 0) {
        els.push({
          el,
          baseTf: el.getAttribute('data-base-tf') || '',
          clipGroupEl,
          baseClip
        });
      } else if (hitCount > 0) {
        partialBatch = true;
      }
    });
    if (partialBatch) return {
      partialBatch: true,
      els: null
    };
    boxRef.current.querySelectorAll('[data-drag-container]').forEach(el => {
      const ids = (el.getAttribute('data-drag-container') || '').split(',').filter(Boolean);
      if (ids.length > 0 && ids.every(id => dg.ids.has(id))) {
        els.push({
          el,
          baseTf: el.getAttribute('data-base-tf') || ''
        });
      }
    });
    boxRef.current.querySelectorAll('[data-drag-extra="1"]').forEach(el => {
      els.push({
        el,
        baseTf: el.getAttribute('data-base-tf') || ''
      });
    });
    return {
      partialBatch: false,
      els
    };
  };
  const altDupMove = (e, dg, dx, dy) => {
    if (e.altKey) {
      if (dg.fastTx) {
        dg.fastTx = null;
        clearFastDragDom(dg);
      }
      if (!dg.dupClones) {
        dg.dupClones = cloneWithGroups(dg.base.objects, dg.ids, 0, 0);
        dg.dupIds = new Set(dg.dupClones.map(o => o.id));
      }
      live({
        ...dg.base,
        objects: VE.compactGroups([...dg.base.objects, ...dg.dupClones.map(o => VE.translate(o, dx, dy))])
      });
      if (!dg.selSwitched) {
        dg.selSwitched = true;
        setSel({
          objs: dg.dupIds,
          nodes: new Set()
        });
      }
    } else {
      if (dg.selSwitched) {
        dg.selSwitched = false;
        dg.domEls = null;
        setSel({
          objs: dg.ids,
          nodes: new Set()
        });
        live({
          ...dg.base,
          objects: dg.base.objects.map(o => dg.ids.has(o.id) ? VE.translate(o, dx, dy) : o)
        });
        return;
      }
      /* Jika jumlah node yang digeser > 350 (mis. ilustrasi kompleks), sembunyikan overlay ribuan node/handle via CSS
         selama gerakan drag agar browser tidak merasterisasi ulang ribuan path SVG di CPU tiap frame */
      if (dg.hideHeavyOverlay === undefined) {
        dg.hideHeavyOverlay = (dg.dragNodeCount || 0) > 350 || dg.ids.size > 32;
        if (dg.hideHeavyOverlay && boxRef.current) {
          boxRef.current.setAttribute('data-dragging', '1');
        }
      }
      /* Fast GPU/DOM translation selama drag objek: mendukung elemen tunggal [data-drag-id] & batch komposit [data-drag-batch] */
      if (dg.domEls && (!dg.domEls.length || dg.domEls.some(x => !x.el.isConnected))) {
        dg.domEls = null;
      }
      if (!dg.domEls && boxRef.current) {
        const q = queryFastDragDomEls(dg);
        if (q && q.partialBatch) {
          live({
            ...dg.base,
            objects: dg.base.objects.map(o => dg.ids.has(o.id) ? VE.translate(o, dx, dy) : o)
          });
          return;
        }
        dg.domEls = q ? q.els : null;
      }
      dg.fastTx = {
        dx,
        dy
      };
      if (sceneRendererRef.current && gpuOn) {
        sceneRendererRef.current.setDragOffset(dg.ids, dx, dy);
        sceneRendererRef.current.requestRender();
      }
      const tr = 'translate(' + VE.rd(dx) + ' ' + VE.rd(dy) + ')';
      if (dg.domEls) {
        for (let i = 0; i < dg.domEls.length; i++) {
          const {
            el,
            baseTf,
            clipGroupEl
          } = dg.domEls[i];
          el.setAttribute('transform', baseTf ? tr + ' ' + baseTf : tr);
          if (clipGroupEl) clipGroupEl.removeAttribute('clip-path');
        }
      }
    }
  };
  /* ---- FIX Z-ORDER TEKS vs OBJEK ----
     Teks digambar di layer SVG yang selalu berada di atas canvas WebGL, sehingga objek lain (WebGL) tidak pernah bisa
     tampil di atas teks. Solusi: objek yang urutan Z-nya di atas sebuah teks DAN tumpang-tindih dengannya (serta objek
     yang sedang diseret) ikut dirender di layer SVG sesuai urutan dokumen; GPU melewatkan objek tersebut. */
  const svgOverlayIds = React.useMemo(() => {
    const out = new Set();
    if (!gpuOn || renderCfg.pixelPreviewMode !== 'smooth') return out;
    const objs = doc.objects;
    const textBoxes = [];
    let firstText = -1;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (!o || o.hidden || !o.text) continue;
      if (firstText < 0) firstText = i;
      if (textBoxes.length < 200) {
        try {
          const bb = vinfo(o).bb;
          if (bb && isFinite(bb[0])) textBoxes.push({ i, bb });
        } catch (e) {}
      }
    }
    if (firstText < 0) return out;
    for (let i = firstText + 1; i < objs.length; i++) {
      const o = objs[i];
      if (!o || o.hidden || o.text || o.isFrameBg || o.isAutoFrame) continue;
      if (out.size >= 600) break;
      let bb = null;
      try {
        bb = vinfo(o).bb;
      } catch (e) {}
      if (!bb || !isFinite(bb[0])) continue;
      const pad = (o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 : 0) + 1;
      for (let k = 0; k < textBoxes.length; k++) {
        const t = textBoxes[k];
        if (t.i >= i) break;
        if (bb[2] + pad >= t.bb[0] && bb[0] - pad <= t.bb[2] && bb[3] + pad >= t.bb[1] && bb[1] - pad <= t.bb[3]) {
          out.add(o.id);
          break;
        }
      }
    }
    return out;
  }, [doc.objects, gpuOn, renderCfg.pixelPreviewMode]);
  React.useLayoutEffect(() => {
    const sr = sceneRendererRef.current;
    if (sr && sr.setSvgOverlayIds) sr.setSvgOverlayIds(svgOverlayIds);
  }, [svgOverlayIds, gpuOn, renderCfg.backendOverride]);
  /* PERF: daftar objek overlay SVG mode-GPU di-memo agar tiap render VectorEditor
     tidak lagi mengalokasikan N elemen React (doc.objects.map) + memindai
     seluruh dokumen (doc.objects.some) hanya untuk menemukan segelintir
     objek teks/overlay. Pada dokumen 2000 objek ini memangkas ribuan alokasi
     per render (tiap klik layer, undo, zoom-settle). */
  const gpuOverlayObjs = React.useMemo(() => {
    if (!gpuOn || renderCfg.pixelPreviewMode !== 'smooth') return [];
    const out = [];
    for (let i = 0, L = doc.objects.length; i < L; i++) {
      const o = doc.objects[i];
      if (o && !o.hidden && (o.text || svgOverlayIds.has(o.id))) out.push(o);
    }
    return out;
  }, [doc.objects, svgOverlayIds, gpuOn, renderCfg.pixelPreviewMode]);
  const hasTextObj = React.useMemo(() => {
    for (let i = 0, L = doc.objects.length; i < L; i++) {
      const o = doc.objects[i];
      if (o && !o.hidden && o.text) return true;
    }
    return false;
  }, [doc.objects]);
  React.useLayoutEffect(() => {
    const dg = dragRef.current;
    if (!dg || dg.type !== 'obj' || !dg.moved) return;
    const q = queryFastDragDomEls(dg);
    dg.domEls = q && !q.partialBatch ? q.els : null;
    if (dg.fastTx && dg.domEls) {
      const tr = 'translate(' + VE.rd(dg.fastTx.dx) + ' ' + VE.rd(dg.fastTx.dy) + ')';
      for (let i = 0; i < dg.domEls.length; i++) {
        const {
          el,
          baseTf,
          clipGroupEl
        } = dg.domEls[i];
        el.setAttribute('transform', baseTf ? tr + ' ' + baseTf : tr);
        if (clipGroupEl) clipGroupEl.removeAttribute('clip-path');
      }
    }
  }, [doc, sel.objs]);
  /* Shortcut ala Figma (dikembalikan true jika ditangani) */
  const figmaKeys = e => {
    if (e.key === 'Alt') {
      if (lastPtr.current) updateAltMeasure({
        altKey: true,
        ...lastPtr.current
      });
      return false;
    }
    const mod = e.ctrlKey || e.metaKey,
      shift = e.shiftKey,
      alt = e.altKey,
      k = e.key.toLowerCase(),
      S = selRef.current.objs,
      hasSel = S.size > 0;
    if (mod && alt && k === 'g') {
      e.preventDefault();
      createFrameSel();
      return true;
    }
    if (!mod && !alt && shift && k === 'a' && hasSel) {
      e.preventDefault();
      const fo = docRef.current.objects.find(o => S.has(o.id) && o.group);
      if (fo) convertFrameToAutoLayout(fo.group);else {
        createFrameSel();
        setTimeout(() => convertFrameToAutoLayout(), 0);
      }
      return true;
    }
    if (mod && shift && k === 'h' && hasSel) {
      e.preventDefault();
      const allHid = docRef.current.objects.filter(o => S.has(o.id)).every(o => o.hidden);
      commitObjs(o => S.has(o.id) ? {
        ...o,
        hidden: !allHid
      } : o);
      say(allHid ? 'Layer ditampilkan' : 'Layer disembunyikan');
      return true;
    }
    if (mod && shift && k === 'l' && hasSel) {
      e.preventDefault();
      const allLock = docRef.current.objects.filter(o => S.has(o.id)).every(o => o.locked);
      commitObjs(o => S.has(o.id) ? {
        ...o,
        locked: !allLock
      } : o);
      say(allLock ? 'Kunci layer dibuka' : 'Layer dikunci');
      return true;
    }
    if (mod && (e.key === ']' || e.key === '[') && hasSel) {
      e.preventDefault();
      const md = e.key === ']' ? 'front' : 'back';
      commit(VE.arrangeZOrder(docRef.current, S, md));
      say(md === 'front' ? 'Dipindah ke paling depan (Bring to Front)' : 'Dipindah ke paling belakang (Send to Back)');
      return true;
    }
    if (!mod && !alt && shift && (k === 'h' || k === 'v') && hasSel) {
      e.preventDefault();
      flipXf(k);
      say(k === 'h' ? 'Flip Horizontal' : 'Flip Vertikal');
      return true;
    }
    if (!mod && alt && !shift && hasSel) {
      const al = {
        w: 'top',
        a: 'left',
        s: 'bottom',
        d: 'right',
        h: 'hcenter',
        v: 'vcenter'
      };
      if (al[k]) {
        e.preventDefault();
        alignDo(al[k]);
        return true;
      }
    }
    if (!mod && !alt && shift && (e.code === 'Digit1' || e.code === 'Digit0')) {
      e.preventDefault();
      fitView();
      return true;
    }
    if (!mod && !alt && shift && e.code === 'Digit2') {
      e.preventDefault();
      fitSel();
      return true;
    }
    if (!mod && !alt && !shift && e.key === 'Enter' && hasSel && tool === 'select') {
      e.preventDefault();
      const firstSel = docRef.current.objects.find(o => S.has(o.id));
      if (firstSel && firstSel.text) {
        renameSkip.current = false;
        setRenamingId('ct:' + firstSel.id);
        setRenameVal(firstSel.text.content || '');
        return true;
      }
      setTool('node');
      say('Mode Edit Node (tekan Esc untuk kembali)');
      return true;
    }
    if (!mod && !alt && !shift && hasSel && /^[0-9]$/.test(e.key) && !(tool === 'pen' && penRef.current)) {
      e.preventDefault();
      const d = parseInt(e.key, 10),
        op = d === 0 ? 1 : d / 10;
      commitObjs(o => S.has(o.id) ? {
        ...o,
        opacity: op
      } : o, 'p:opacity');
      say('Opacity ' + Math.round(op * 100) + '%');
      return true;
    }
    return false;
  };
  /* Native VectorCraft Resize & Rotate (crates/tools/src/bbox.rs & select.rs) */
  const vcBoxDown = (pt, base, e) => {
    const bx0 = activeBoxRef.current;
    if (tool !== 'select' || !bx0 || sel.nodes.size > 0) return false;
    const bh = VE.boxHit(bx0, pt, zoomRef.current);
    if (!bh) return false;
    const dragIds = new Set(sel.objs);
    base.objects.forEach(it => {
      if (sel.objs.has(it.id) && (it.isFrameBg || it.isAutoFrame) && it.group) {
        base.objects.forEach(ch => {
          if (ch.group === it.group && !ch.locked) dragIds.add(ch.id);
        });
      }
    });
    const bx = bx0;
    if (bh.kind === 'handle') {
      dragRef.current = {
        type: 'scale',
        base,
        ids: dragIds,
        bx,
        handle: bh.handle,
        start: pt,
        sx: e ? e.clientX : null,
        sy: e ? e.clientY : null,
        moved: false
      };
      setBoxHov({
        kind: 'handle',
        handle: bh.handle,
        cur: VE.handleCursor(bh.handle, bx.angle)
      });
      setAltMeasure(null);
      return true;
    }
    if (bh.kind === 'rotate') {
      const center = bx.center();
      dragRef.current = {
        type: 'rotate',
        base,
        ids: dragIds,
        bx,
        center,
        start: pt,
        sx: e ? e.clientX : null,
        sy: e ? e.clientY : null,
        moved: false
      };
      setBoxHov({
        kind: 'rotate',
        corner: bh.corner,
        cur: VE.rotateCursorForPt(center, pt)
      });
      setAltMeasure(null);
      return true;
    }
    return false;
  };
  const vcScaleMove = (e, pt, dg) => {
    if (!dg.moved && dg.sx != null && Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) < 3) return;
    if (!dg.moved) {
      dg.moved = true;
      setVcTransforming(true);
    }
    const lp = dg.bx.toLocal(pt);
    let localA = VE.scaleForDrag(dg.bx.rect, dg.handle, lp, e.shiftKey, e.altKey);
    if (snapOn) {
      const rawDocPt = dg.bx.toDocPt(VE.affinePt(localA, dg.handle.pos(dg.bx.rect)));
      const q = snapAt(rawDocPt, e, dg.ids, null, dg.base.objects);
      if (Math.abs(q.x - rawDocPt.x) > 1e-6 || Math.abs(q.y - rawDocPt.y) > 1e-6) {
        localA = VE.scaleForDrag(dg.bx.rect, dg.handle, dg.bx.toLocal(q), e.shiftKey, e.altKey);
      }
    } else {
      setSnapInd(null);
    }
    const docM = dg.bx.conjugate(localA);
    live({
      ...dg.base,
      objects: dg.base.objects.map(o => dg.ids.has(o.id) && !o.locked ? VE.transformObject(o, docM, scaleStk) : o)
    });
    const nr = VE.transformRectBbox(localA, dg.bx.rect);
    const w = Math.abs(nr.x1 - nr.x0),
      h = Math.abs(nr.y1 - nr.y0);
    setMeasureBadge({
      x: pt.x,
      y: pt.y,
      text: 'W: ' + VE.rd(w) + '  H: ' + VE.rd(h)
    });
  };
  const vcRotateMove = (e, pt, dg) => {
    if (!dg.moved && dg.sx != null && Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) < 3) return;
    if (!dg.moved) {
      dg.moved = true;
      setVcTransforming(true);
    }
    const {
      matrix,
      deg
    } = VE.rotateForDrag(dg.center, dg.start, pt, e.shiftKey);
    live({
      ...dg.base,
      objects: dg.base.objects.map(o => dg.ids.has(o.id) && !o.locked ? VE.transformObject(o, matrix, false) : o)
    });
    const c = VE.rotateCursorForPt(dg.center, pt);
    setBoxHov(prev => !prev || prev.cur !== c ? {
      kind: 'rotate',
      cur: c
    } : prev);
    const dispDeg = Math.round(-deg * 10) / 10;
    setMeasureBadge({
      x: pt.x,
      y: pt.y,
      text: dispDeg.toFixed(1) + '°'
    });
  };
  const onPointerDown = e => {
    if (boxRef.current) boxRectRef.current = boxRef.current.getBoundingClientRect();
    if (e.button === 1 || e.button === 0 && (tool === 'hand' || spaceRef.current)) {
      e.preventDefault();
      e.stopPropagation();
      if (viewSettleTimer.current) {
        clearTimeout(viewSettleTimer.current);
        viewSettleTimer.current = 0;
      }
      document.body.classList.add('grabbing');
      if (sceneRendererRef.current) sceneRendererRef.current.isPanning = true;
      dragRef.current = {
        type: 'pan',
        button: e.button,
        pointerId: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        px: panRef.current.x,
        py: panRef.current.y,
        moved: false
      };
      try {
        boxRef.current.setPointerCapture(e.pointerId);
      } catch (x) {}
      return;
    }
    if (viewPend.current || viewSettleTimer.current) flushView();
    if (e.button !== 0) return;
    if (vcSimpRef.current && vcSimpRef.current.mode === 'slider') confirmVcSimplify();
    try {
      boxRef.current.setPointerCapture(e.pointerId);
    } catch (x) {}
    const pt = toDoc(e.clientX, e.clientY),
      add = e.shiftKey || e.ctrlKey || e.metaKey,
      base = docRef.current;
    if (tool === 'addnode') {
      const h = computeAdd({
          x: e.clientX,
          y: e.clientY,
          alt: e.altKey
        }),
        o0 = h && base.objects.find(q => q.id === h.oid);
      if (!o0) return;
      const nn = VE.insertNode(o0, h.spid, h.i, h.t),
        old = o0.subs.find(q => q.id === h.spid),
        sp2 = nn.subs.find(q => q.id === h.spid),
        added = sp2.nodes.find(n => !old.nodes.some(m => m.id === n.id));
      const nd = {
        ...base,
        objects: base.objects.map(q => q.id === o0.id ? nn : q)
      };
      commit(nd);
      if (added) {
        setSel({
          objs: new Set([o0.id]),
          nodes: new Set([added.id])
        });
        dragRef.current = {
          type: 'node',
          base: nd,
          ids: new Set([added.id]),
          anchor: {
            x: added.x,
            y: added.y
          },
          start: pt,
          sx: e.clientX,
          sy: e.clientY,
          moved: false
        };
      }
      return;
    }
    if (tool === 'addhandle') {
      const hv = hoverNodeAt({
        x: e.clientX,
        y: e.clientY
      });
      if (!hv) return;
      setSel({
        objs: new Set([hv.oid]),
        nodes: new Set([hv.nid])
      });
      if (!hv.can) {
        say('Node ini sudah punya handle');
        return;
      }
      const nd = {
        ...base,
        objects: base.objects.map(q => q.id !== hv.oid ? q : {
          ...q,
          subs: q.subs.map(sp => sp.id !== hv.spid ? sp : {
            ...sp,
            nodes: sp.nodes.map(n => n.id !== hv.nid ? n : {
              ...n,
              fil: null,
              handleIn: hv.prev.in || n.handleIn,
              handleOut: hv.prev.out || n.handleOut,
              type: n.type === 'symmetric' ? 'symmetric' : 'smooth'
            })
          })
        })
      };
      commit(nd);
      const hp = hv.prev.out || hv.prev.in;
      dragRef.current = {
        type: 'handle',
        base: nd,
        objId: hv.oid,
        nodeId: hv.nid,
        w: hv.prev.out ? 'out' : 'in',
        initH: {
          x: hp.x,
          y: hp.y
        },
        off: {
          x: hp.x - pt.x,
          y: hp.y - pt.y
        },
        sx: e.clientX,
        sy: e.clientY,
        moved: false
      };
      return;
    }
    if (tool === 'pen') {
      penDown(e, pt, base);
      return;
    }
    if (tool === 'autohandle') {
      ahDown(e, base);
      return;
    }
    if (tool === 'text') {
      const hitExisting = hitObj(pt);
      if (hitExisting && hitExisting.text) {
        setSel({
          objs: new Set([hitExisting.id]),
          nodes: new Set()
        });
        setTool('select');
        renameSkip.current = false;
        setRenamingId('ct:' + hitExisting.id);
        setRenameVal(hitExisting.text.content || '');
        /* Cegah mousedown kompatibilitas mencuri fokus dari editor teks yang
           baru dibuka (pointerdown membuat editor, mousedown sesudahnya
           memindahkan fokus ke kanvas -> blur -> editor langsung tertutup). */
        e.preventDefault();
        return;
      }
      const p0 = snapAt(pt, e, null, null, base.objects);
      const names = new Set(base.objects.map(q => q.name));
      let idx = 1;
      while (names.has('Text-' + idx)) idx++;
      const newTxtObj = VE.makeTextObj({
        name: 'Text-' + idx,
        content: 'Teks Baru',
        x: Math.round(p0.x),
        y: Math.round(p0.y),
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        fontSize: 36,
        fill: shapeSty.fill || '#18181b',
        stroke: 'none',
        strokeWidth: 0
      });
      const rNest = VE.reparentDroppedObjects({
        ...base,
        objects: [...base.objects, newTxtObj]
      }, new Set([newTxtObj.id]), {
        preventNest: e.ctrlKey || e.metaKey
      });
      const nextDoc = rNest.action === 'in' ? rNest.doc : {
        ...base,
        objects: [...base.objects, newTxtObj]
      };
      commit(nextDoc);
      setSel({
        objs: new Set([newTxtObj.id]),
        nodes: new Set()
      });
      setTool('select');
      renameSkip.current = false;
      setRenamingId('ct:' + newTxtObj.id);
      setRenameVal(newTxtObj.text.content);
      say('Ketik teks langsung di kanvas (Enter = selesai, Shift+Enter = baris baru)');
      /* Sama seperti di atas: mousedown kompatibilitas tidak boleh mencuri fokus. */
      e.preventDefault();
      return;
    }
    if (tool === 'shape') {
      const p0 = snapAt(pt, e, null, null, base.objects);
      dragRef.current = {
        type: 'shape',
        base,
        start: {
          x: p0.x,
          y: p0.y
        },
        sx: e.clientX,
        sy: e.clientY,
        id: 'n' + Math.random().toString(36).slice(2, 9),
        moved: false
      };
      return;
    }
    if (tool === 'frame') {
      const p0 = snapAt(pt, e, null, null, base.objects);
      dragRef.current = {
        type: 'frame',
        base,
        start: {
          x: p0.x,
          y: p0.y
        },
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
        rect: null
      };
      return;
    }
    if (!add && vcBoxDown(pt, base, e)) return;
    if (imgSel) {
      const ns = imgSel.subs[0].nodes,
        tol = 9 / zoomRef.current;
      for (let i = 0; i < 4; i++) if (VE.dist(pt, ns[i]) < tol) {
        const A = ns[(i + 2) % 4];
        dragRef.current = {
          type: 'imgscale',
          base,
          objId: imgSel.id,
          ax: A.x,
          ay: A.y,
          cx0: ns[i].x - A.x,
          cy0: ns[i].y - A.y,
          sx: e.clientX,
          sy: e.clientY,
          moved: false
        };
        return;
      }
    }
    /* Di mode Pilih (select), jangan intersep klik dengan pickNode agar klik & geser pada objek terpilih
       (termasuk ilustrasi dengan ribuan node) selalu menggeser posisi objek, bukan menarik 1 node/handle! */
    const hit = tool === 'node' || tool === 'corner' ? pickNode(pt) : null;
    if (hit && hit.kind === 'handle') {
      const hkey = hit.n.id + ':' + hit.w,
        sameObj = sel.objs.size === 1 && sel.objs.has(hit.o.id);
      let hs = new Set(sameObj ? selHandles : []);
      if (add) {
        hs.has(hkey) ? hs.delete(hkey) : hs.add(hkey);
      } /* Shift/Ctrl+klik handle = tambah/lepas dari seleksi handle */else if (!hs.has(hkey)) hs = new Set([hkey]);
      const hn = new Set([...hs].map(k => k.slice(0, k.lastIndexOf(':'))));
      setSel({
        objs: new Set([hit.o.id]),
        nodes: hn.size ? hn : new Set([hit.n.id]),
        handles: hs
      });
      if (add) {
        dragRef.current = null;
        return;
      }
      dragRef.current = {
        type: 'handle',
        base,
        objId: hit.o.id,
        nodeId: hit.n.id,
        w: hit.w,
        initH: {
          x: hit.h.x,
          y: hit.h.y
        },
        off: {
          x: hit.h.x - pt.x,
          y: hit.h.y - pt.y
        },
        sx: e.clientX,
        sy: e.clientY,
        moved: false
      };
      return;
    }
    if (hit && hit.kind === 'node') {
      let nodes = new Set(selNodes),
        objs = new Set(sel.objs),
        id = hit.n.id;
      if (add) {
        nodes.has(id) ? nodes.delete(id) : nodes.add(id);
        objs.add(hit.o.id);
      } else if (!nodes.has(id)) {
        nodes = new Set([id]);
        objs = new Set([hit.o.id]);
      }
      const sameSel = objs.size === sel.objs.size && nodes.size === sel.nodes.size && [...objs].every(k => sel.objs.has(k));
      if (!sameSel) setSel({
        objs,
        nodes
      });
      if (!nodes.has(id)) {
        dragRef.current = null;
        return;
      }
      /* Jika seluruh node pada objek terpilih ikut dipilih (mis. Ctrl+A di mode Node), gunakan fast object drag */
      const allObjNodesSelected = objs.size > 0 && base.objects.every(q => !objs.has(q.id) || q.subs.every(sp => sp.nodes.every(nd => nodes.has(nd.id))));
      if (allObjNodesSelected) {
        dragRef.current = {
          type: 'obj',
          base,
          ids: objs,
          anchor: P2(hit.n),
          start: pt,
          sx: e.clientX,
          sy: e.clientY,
          moved: false,
          emptyBoxHit: false
        };
      } else {
        dragRef.current = {
          type: 'node',
          base,
          ids: nodes,
          anchor: P2(hit.n),
          start: pt,
          sx: e.clientX,
          sy: e.clientY,
          moved: false
        };
      }
      return;
    }
    const unlockedCount = base.objects.reduce((c, q) => c + (!q.hidden && !q.locked ? 1 : 0), 0);
    let o = hitObj(pt),
      emptyBoxHit = false;
    if (o) {
      let objs;
      if (add) {
        objs = new Set(sel.objs);
        objs.has(o.id) ? objs.delete(o.id) : objs.add(o.id);
      } else objs = sel.objs.has(o.id) ? sel.objs : new Set([o.id]);
      const nextNodes = !add && sel.objs.has(o.id) ? selNodes : new Set();
      const sameSel = objs === sel.objs && nextNodes.size === sel.nodes.size;
      if (!emptyBoxHit && !sameSel) setSel({
        objs: new Set(objs),
        nodes: nextNodes
      });
      if (!objs.has(o.id)) {
        dragRef.current = null;
        return;
      }
      /* klik latar Frame → seluruh isi Frame ikut bergeser (parent-child coupled drag) */
      const dragIds = new Set(objs);
      base.objects.forEach(it => {
        if (objs.has(it.id) && (it.isFrameBg || it.isAutoFrame) && it.group) base.objects.forEach(ch => {
          if (ch.group === it.group) dragIds.add(ch.id);
        });
      });
      dragRef.current = {
        type: 'obj',
        base,
        ids: dragIds,
        anchor: {
          x: pt.x,
          y: pt.y
        },
        start: pt,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
        emptyBoxHit,
        allObjsSelected: dragIds.size >= unlockedCount
      };
      return;
    }
    const isNodeTool = tool === 'node' || tool === 'corner';
    const nodeTargets = isNodeTool ? shown.length ? shown.slice() : base.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.isFrameBg && !o.isAutoFrame) : null;
    dragRef.current = {
      type: 'marquee',
      start: pt,
      cur: pt,
      add,
      sx: e.clientX,
      sy: e.clientY,
      prev: sel,
      nodeTargets
    };
    if (!add) {
      if (isNodeTool && shown.length) setSel({
        objs: new Set(shown.map(o => o.id)),
        nodes: new Set()
      });else setSel({
        objs: new Set(),
        nodes: new Set()
      });
    }
  };
  const P2 = n => ({
    x: n.x,
    y: n.y
  });
  const onPointerMove = e => {
    /* GV-A18 & Bab 6: Gunakan sampel terbaru dari getCoalescedEvents() untuk responsivitas drag 120Hz+ tanpa antrean event basi */
    const dg = dragRef.current;
    let ev = e;
    if (dg && typeof e.getCoalescedEvents === 'function') {
      const coal = e.getCoalescedEvents();
      if (coal && coal.length > 0) ev = coal[coal.length - 1];
    }
    if (dg && dg.type === 'pan') {
      const dx = ev.clientX - dg.lx,
        dy = ev.clientY - dg.ly;
      dg.lx = ev.clientX;
      dg.ly = ev.clientY;
      if (dx === 0 && dy === 0) return;
      if (!dg.moved) {
        dg.moved = true;
        if (boxRef.current) {
          boxRef.current.setAttribute('data-fast-render', '1');
          const selCnt = selRef.current ? selRef.current.objs.size : 0;
          if ((selCnt > 0 || shown.length > 0) && !boxRef.current.hasAttribute('data-zooming')) {
            boxRef.current.setAttribute('data-zooming', '1');
          }
        }
      }
      panRef.current = {
        x: dg.px + (ev.clientX - dg.sx),
        y: dg.py + (ev.clientY - dg.sy)
      };
      if (!viewPend.current) {
        viewPend.current = requestAnimationFrame(() => {
          viewPend.current = 0;
          applyVP(true, false, true);
        });
      }
      return;
    }
    const pt = boxRef.current ? toDoc(ev.clientX, ev.clientY) : {
      x: 0,
      y: 0
    };
    if (coordRef.current) coordRef.current.textContent = 'X ' + Math.round(pt.x * 10) / 10 + '  Y ' + Math.round(pt.y * 10) / 10;
    if (zoomRef.current >= 6) {
      const pxX = Math.floor(pt.x),
        pxY = Math.floor(pt.y);
      if (pixelHoverRectRef.current) {
        pixelHoverRectRef.current.setAttribute('x', String(pxX));
        pixelHoverRectRef.current.setAttribute('y', String(pxY));
        pixelHoverRectRef.current.setAttribute('stroke-width', String(1.5 / zoomRef.current));
      }
      if (pixelCoordReadoutRef.current) {
        pixelCoordReadoutRef.current.textContent = `${L.edPixel} [${pxX}, ${pxY}]`;
      }
    }
    if (!dg) {
      if (tool === 'addnode' || tool === 'addhandle' || tool === 'autohandle') updateAddHover(e);else if (tool === 'pen') updatePenHover(e);
      if (tool === 'select' && activeBoxRef.current) {
        const bh = VE.boxHit(activeBoxRef.current, pt, zoomRef.current);
        if (bh && bh.kind === 'handle') {
          const c = VE.handleCursor(bh.handle, activeBoxRef.current.angle);
          setBoxHov(prev => prev && prev.kind === 'handle' && prev.handle.idx === bh.handle.idx && prev.cur === c ? prev : {
            kind: 'handle',
            handle: bh.handle,
            cur: c
          });
        } else if (bh && bh.kind === 'rotate') {
          const c = VE.rotateCursorForPt(activeBoxRef.current.center(), pt);
          setBoxHov(prev => prev && prev.kind === 'rotate' && prev.cur === c ? prev : {
            kind: 'rotate',
            corner: bh.corner,
            cur: c
          });
        } else {
          setBoxHov(prev => prev ? null : prev);
        }
      } else {
        setBoxHov(prev => prev ? null : prev);
      }
      updateAltMeasure(e);
      return;
    }
    if (dg.type === 'rotate') {
      vcRotateMove(e, pt, dg);
      return;
    }
    if (dg.type === 'scale') {
      vcScaleMove(e, pt, dg);
      return;
    }
    if (dg.type === 'marquee') {
      dg.cur = pt;
      setMarq({
        x0: Math.min(dg.start.x, pt.x),
        y0: Math.min(dg.start.y, pt.y),
        x1: Math.max(dg.start.x, pt.x),
        y1: Math.max(dg.start.y, pt.y)
      });
      return;
    }
    if (dg.type === 'pen') {
      penMove(e, pt, dg);
      return;
    }
    if (dg.type === 'autoh') {
      const dxs = e.clientX - dg.sx;
      if (!dg.dragged && Math.abs(dxs) < 3) return;
      dg.dragged = true;
      const tau = clampN(dg.tau0 + dxs / 400, 0, 0.5);
      setAhOpt(o => ({
        ...o,
        tau: Math.round(tau * 100) / 100
      })); /* seret kanan/kiri = tension live */
      live({
        ...dg.base,
        objects: dg.base.objects.map(o => o.id === dg.oid ? VE.autoHandles(o, dg.spid, {
          tau,
          minAngle: ahOpt.minAng,
          preserveShape: false
        }) : o)
      });
      return;
    }
    if (dg.type === 'shape') {
      if (!dg.moved && Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) < 4) return;
      const r0 = shapeRect(dg.start, pt, e.shiftKey);
      const q = snapAt(pt, e, null, null, dg.base.objects, {
        allowSpacing: true,
        dragBBox: [r0.x, r0.y, r0.x + r0.w, r0.y + r0.h]
      });
      const r = shapeRect(dg.start, q, e.shiftKey),
        o = makeShape(shapeKind, r.x, r.y, r.w, r.h, dg.id);
      dg.moved = true;
      if (o) live({
        ...dg.base,
        objects: [...dg.base.objects, o]
      });
      return;
    }
    if (dg.type === 'frame') {
      if (!dg.moved && Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) < 4) return;
      const r0 = shapeRect(dg.start, pt, e.shiftKey);
      const q = snapAt(pt, e, null, null, dg.base.objects, {
        allowSpacing: true,
        dragBBox: [r0.x, r0.y, r0.x + r0.w, r0.y + r0.h]
      });
      const r = shapeRect(dg.start, q, e.shiftKey);
      dg.rect = [r.x, r.y, r.x + r.w, r.y + r.h];
      dg.moved = true;
      live(VE.createFrame(dg.base, new Set(), {
        rect: dg.rect,
        radius: lay.radius
      }).doc);
      return;
    }
    if (dg.type === 'imgscale') {
      if (!dg.moved && dg.sx != null && Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) < 5) return;
      let q = pt;
      if (snapOn && !(e.ctrlKey || e.metaKey)) q = snapAt(pt, e, new Set([dg.objId]), null, dg.base.objects);else setSnapInd(null);
      const den = dg.cx0 * dg.cx0 + dg.cy0 * dg.cy0,
        k = Math.max(0.001, ((q.x - dg.ax) * dg.cx0 + (q.y - dg.ay) * dg.cy0) / den);
      dg.moved = true;
      live({
        ...dg.base,
        objects: dg.base.objects.map(o => o.id === dg.objId ? VE.scaleObj(o, dg.ax, dg.ay, k) : o)
      });
      return;
    }
    if (!dg.moved) {
      const distPx = dg.sx != null ? Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) : Math.hypot(pt.x - dg.start.x, pt.y - dg.start.y) * zoomRef.current;
      if (distPx < 5) return;
      /* Re-baseline titik awal drag tepat saat melewati deadzone 5px agar objek/node/handle tidak melompat */
      if (dg.type === 'handle' && dg.initH) {
        dg.off = {
          x: dg.initH.x - pt.x,
          y: dg.initH.y - pt.y
        };
      } else if (dg.start) {
        dg.start = {
          x: pt.x,
          y: pt.y
        };
      }
    }
    if (dg.type === 'handle') {
      let tg = {
        x: pt.x + dg.off.x,
        y: pt.y + dg.off.y
      };
      const alt = e.altKey,
        free = e.altKey;
      const hbuild = (n, t) => VE.rebuildHandle(n, dg.w, t, free);
      if (dg.parent === undefined) {
        dg.parent = null;
        const po = dg.base.objects.find(o => o.id === dg.objId);
        if (po) {
          for (const sp of po.subs) {
            const f = sp.nodes.find(n => n.id === dg.nodeId);
            if (f) {
              dg.parent = {
                x: f.x,
                y: f.y,
                type: f.type
              };
              break;
            }
          }
        }
      }
      const parentNode = dg.parent;
      const isNoMirror = free || !parentNode || parentNode.type === 'corner';
      if (e.shiftKey && parentNode) {
        /* Shift: kunci sudut handle ke kelipatan 45° terhadap node induk */
        const vx = tg.x - parentNode.x,
          vy = tg.y - parentNode.y,
          L = Math.hypot(vx, vy);
        const ang = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
        tg = {
          x: parentNode.x + Math.cos(ang) * L,
          y: parentNode.y + Math.sin(ang) * L
        };
        setSnapInd({
          x: tg.x,
          y: tg.y,
          kind: 'axial',
          guides: [{
            type: 'line',
            x1: parentNode.x,
            y1: parentNode.y,
            x2: tg.x,
            y2: tg.y,
            kind: 'axial'
          }]
        });
      } else if (!snapOn || alt) {
        setSnapInd(null);
      } else {
        const thr = VE.SNAP_PX / zoomRef.current,
          cfg = snapCfg,
          gOn = gridOn && cfg.grid,
          exN = new Set([dg.nodeId]);
        let activeSegNodes = exN;
        const po = dg.base.objects.find(o => o.id === dg.objId);
        if (po) {
          for (const sp of po.subs) {
            const ns = sp.nodes,
              L = ns.length,
              idx = ns.findIndex(n => n.id === dg.nodeId);
            if (idx >= 0) {
              const adj = new Set([dg.nodeId]);
              if (idx > 0 || sp.closed) adj.add(ns[(idx - 1 + L) % L].id);
              if (idx < L - 1 || sp.closed) adj.add(ns[(idx + 1) % L].id);
              activeSegNodes = adj;
              break;
            }
          }
        }
        /* Saat mode No Mirroring / Geser Melengkung aktif, matikan hLines (`false`) pada node sekitar
           agar handle TIDAK terkunci lurus ke garis handle sendiri saat digeser melengkung! */
        const rN = cfg.node ? VE.snapPt(tg, dg.base.objects, null, activeSegNodes, thr, 0, true, false, false, false, false) : {
          ind: false
        };
        const r0 = rN.ind ? rN : cfg.node || cfg.midpoint || cfg.edge ? VE.snapPt(tg, dg.base.objects, new Set([dg.objId]), activeSegNodes, thr, 0, !cfg.edge, false, !isNoMirror && cfg.node, !cfg.node, !!cfg.midpoint) : {
          ind: false
        };
        if (r0.ind) {
          tg = {
            x: r0.x,
            y: r0.y
          };
          setSnapInd({
            x: r0.x,
            y: r0.y,
            kind: r0.kind,
            cross: true
          });
        } else {
          const cs = cfg.edge ? VE.snapHandleCurve(dg.base.objects, dg.objId, dg.nodeId, dg.w, tg, free, thr, !cfg.node) : null;
          if (cs) {
            tg = cs.tg;
            setSnapInd({
              x: cs.x,
              y: cs.y,
              kind: cs.kind
            });
          } else {
            /* Saat mode Geser Melengkung (curveDragOn) aktif, jangan kunci sumbu axial ke parentNode sendiri
               kecuali sangat dekat (thr * 0.35), supaya gerakan melengkung bebas dan tidak patah ke garis lurus */
            const hCfg = {
              ...cfg,
              node: false,
              edge: false,
              perp: false,
              spacing: false,
              axial: curveDragOn ? false : cfg.axial,
              grid: gOn
            };
            if (!dg.sc || dg.scCurve !== curveDragOn) {
              dg.sc = VE.buildSnapCache(dg.base, new Set([dg.objId]), exN, hCfg, null);
              dg.scCurve = curveDragOn;
              if (hCfg.axial && parentNode) {
                dg.sc.xLines.unshift({
                  v: parentNode.x,
                  a: parentNode.y,
                  b: parentNode.y,
                  kind: 'axial'
                });
                dg.sc.yLines.unshift({
                  v: parentNode.y,
                  a: parentNode.x,
                  b: parentNode.x,
                  kind: 'axial'
                });
              }
            }
            const sr = VE.solveMultiSnap(tg, dg.sc, dg.base.objects, new Set([dg.objId]), exN, thr, gOn ? gridStep() : 0, hCfg, null, null);
            tg = {
              x: sr.x,
              y: sr.y
            };
            setSnapInd(sr.ind ? {
              x: sr.ix,
              y: sr.iy,
              kind: sr.kind,
              cross: sr.cross,
              guides: sr.guides
            } : null);
          }
        }
      }
      const objects = dg.base.objects.map(o => {
        if (o.id !== dg.objId) return o;
        return {
          ...o,
          subs: o.subs.map(sp => {
            const idx = sp.nodes.findIndex(n => n.id === dg.nodeId);
            if (idx < 0) return sp;
            const ns = sp.nodes.slice(),
              L = ns.length;
            const updatedNode = hbuild(ns[idx], tg);
            ns[idx] = updatedNode;

            /* FITUR GESER MELENGKUNG (AUTO-CURVE) PADA MODE NO MIRRORING:
               Jika curveDragOn aktif dan node berada dalam mode No Mirroring ('corner'),
               saat kita menggeser handle keluar/masuk, apabila node tetangga di ujung segmen
               itu belum punya handle (atau handle-nya masih kaku lurus di atas garis chord),
               bentuk busur kurva kuadratik-ke-kubik secara otomatis pada segmen tersebut
               TANPA mengubah handle di sisi belakang node! */
            if (curveDragOn && updatedNode.type === 'corner') {
              const isOut = dg.w === 'out';
              const nbIdx = isOut ? sp.closed || idx < L - 1 ? (idx + 1) % L : -1 : sp.closed || idx > 0 ? (idx - 1 + L) % L : -1;
              if (nbIdx >= 0 && nbIdx !== idx) {
                const nbOrig = sp.nodes[nbIdx];
                const oppKey = isOut ? 'handleIn' : 'handleOut';
                const origOpp = nbOrig[oppKey];
                /* Cek apakah ujung tetangga awalnya belum punya handle atau masih kolinier dengan chord */
                const chord = VE.sub(nbOrig, ns[idx]);
                const chordLen = Math.hypot(chord.x, chord.y) || 1;
                const wasCollinear = !origOpp || Math.abs(VE.cross(chord, VE.sub(origOpp, ns[idx]))) / chordLen < 0.5;
                if (wasCollinear) {
                  /* Proyeksi titik puncak kontrol kuadratik Q dari tarikan handle tg, lalu petakan
                     handle pendamping di node tetangga sebesar 1/2 vektor lengkung agar busur melengkung mulus */
                  const anchor = ns[idx];
                  const qCtrl = {
                    x: anchor.x + (tg.x - anchor.x) * 1.5,
                    y: anchor.y + (tg.y - anchor.y) * 1.5
                  };
                  const companion = {
                    x: nbOrig.x + (qCtrl.x - nbOrig.x) * 0.5,
                    y: nbOrig.y + (qCtrl.y - nbOrig.y) * 0.5
                  };
                  ns[nbIdx] = {
                    ...nbOrig,
                    fil: null,
                    [oppKey]: companion
                  };
                }
              }
            }
            return {
              ...sp,
              nodes: ns
            };
          })
        };
      });
      dg.moved = true;
      live({
        ...dg.base,
        objects
      });
      return;
    }
    let raw = {
      x: dg.anchor.x + pt.x - dg.start.x,
      y: dg.anchor.y + pt.y - dg.start.y
    };
    let shiftAxis = null;
    if (e.shiftKey) {
      if (Math.abs(raw.x - dg.anchor.x) > Math.abs(raw.y - dg.anchor.y)) {
        raw.y = dg.anchor.y;
        shiftAxis = 'x';
      } else {
        raw.x = dg.anchor.x;
        shiftAxis = 'y';
      }
    }
    let dx = raw.x - dg.anchor.x,
      dy = raw.y - dg.anchor.y;
    const isObj = dg.type === 'obj';
    if (dg.dragNodeCount === undefined) {
      let bb = null,
        k = 0,
        hasOtherObjs = false,
        dragNodeCount = 0;
      const grow = b => {
        if (!b || !isFinite(b[0]) || b[0] > b[2]) return;
        if (!bb) bb = [b[0], b[1], b[2], b[3]];else {
          if (b[0] < bb[0]) bb[0] = b[0];
          if (b[1] < bb[1]) bb[1] = b[1];
          if (b[2] > bb[2]) bb[2] = b[2];
          if (b[3] > bb[3]) bb[3] = b[3];
        }
      };
      const baseObjs = dg.base.objects;
      for (let oi = 0, L = baseObjs.length; oi < L; oi++) {
        const o = baseObjs[oi];
        if (isObj) {
          const inDrag = dg.ids.has(o.id);
          if (inDrag) {
            grow(VE.tightBBox(o));
            dragNodeCount += vinfo(o).n;
          } else if (!hasOtherObjs && !o.hidden && !o.isFrameBg && !o.isAutoFrame) {
            hasOtherObjs = true;
          }
        } else {
          let anyIn = false,
            allIn = true;
          for (let si = 0; si < o.subs.length; si++) {
            const ns = o.subs[si].nodes;
            for (let ni = 0; ni < ns.length; ni++) {
              const n = ns[ni];
              if (dg.ids.has(n.id)) {
                grow([n.x, n.y, n.x, n.y]);
                k++;
                anyIn = true;
              } else {
                allIn = false;
              }
            }
          }
          if (anyIn) dragNodeCount += vinfo(o).n;
          if (!hasOtherObjs && !o.hidden && !o.isFrameBg && !o.isAutoFrame && !allIn) {
            hasOtherObjs = true;
          }
        }
      }
      if (!isObj && k < 2) bb = null;
      dg.bb0 = bb;
      dg.hasOtherObjs = hasOtherObjs;
      dg.dragNodeCount = dragNodeCount;
    }
    if (!snapOn || e.ctrlKey || e.metaKey) {
      if (dg.lastSnapSig) {
        dg.lastSnapSig = null;
        setSnapInd(null);
      }
    } else {
      const thr = VE.SNAP_PX / zoomRef.current,
        gOn = gridOn && snapCfg.grid;
      const cfg = isObj ? snapCfg : {
        ...snapCfg,
        spacing: false
      };
      const exO = isObj ? dg.ids : null,
        exN = isObj ? null : dg.ids;
      if (!dg.sc) {
        /* Pre-drag spatial indexing: target statis dibangun SEKALI saat drag dimulai */
        let noBox = null;
        if (!isObj) {
          noBox = new Set();
          dg.base.objects.forEach(o => {
            if (o.subs.some(sp => sp.nodes.some(n => dg.ids.has(n.id)))) noBox.add(o.id);
          });
        }
        dg.sc = VE.buildSnapCache(dg.base, exO, exN, cfg, noBox);
      }
      if (!dg.cand) dg.cand = dragCands(dg);
      let probes = dg._probes;
      if (!probes || probes.length !== dg.cand.length) {
        probes = dg.cand.map(q => ({
          x: q.x + dx,
          y: q.y + dy
        }));
        dg._probes = probes;
      } else {
        for (let pi = 0; pi < dg.cand.length; pi++) {
          probes[pi].x = dg.cand[pi].x + dx;
          probes[pi].y = dg.cand[pi].y + dy;
        }
      }
      const bbx = dg.bb0 ? [dg.bb0[0] + dx, dg.bb0[1] + dy, dg.bb0[2] + dx, dg.bb0[3] + dy] : null;
      const edgeFn = !dg.hasOtherObjs ? null : () => {
        let m = cfg.edge ? VE.snapMany(probes, dg.base.objects, exO, exN, thr, {
          noNode: true
        }) : null;
        if (isObj && (cfg.edge || cfg.node) && dg.dragNodeCount <= 24 && dg.ids.size <= 2) {
          if (!dg.outl) dg.outl = dragOutline(dg);
          if (dg.outl.samples.length || dg.outl.segs.length) {
            const m2 = VE.snapOutline(dg.outl.samples, dg.outl.segs, dg.base.objects, dg.ids, thr, dx, dy, {
              noNode: !cfg.node,
              noEdge: !cfg.edge
            });
            if (m2 && (!m || Math.hypot(m2.dx, m2.dy) < Math.hypot(m.dx, m.dy))) m = m2;
          }
        }
        return m;
      };
      const primarySnapPt = isObj && bbx ? {
        x: (bbx[0] + bbx[2]) * 0.5,
        y: (bbx[1] + bbx[3]) * 0.5
      } : {
        x: dg.anchor.x + dx,
        y: dg.anchor.y + dy
      };
      const r = VE.solveMultiSnap(primarySnapPt, dg.sc, dg.base.objects, exO, exN, thr, gOn ? gridStep() : 0, {
        ...cfg,
        grid: gOn
      }, bbx, {
        probes,
        delta: {
          dx,
          dy
        },
        edgeFn,
        lockAxis: shiftAxis,
        figmaObjectMode: isObj
      });
      dx += r.dx;
      dy += r.dy;
      const hasVisSnap = !!(r.ind && (r.guides && r.guides.length > 0 || r.cross !== false && r.ix != null));
      if (!hasVisSnap) {
        if (dg.lastSnapSig) {
          dg.lastSnapSig = null;
          setSnapInd(null);
        }
      } else {
        const g0 = r.guides && r.guides[0] ? VE.rd(r.guides[0].x1) + ':' + VE.rd(r.guides[0].y1) + ':' + VE.rd(r.guides[0].x2) + ':' + VE.rd(r.guides[0].y2) : '';
        const sig = VE.rd(r.ix) + ',' + VE.rd(r.iy) + ',' + r.kind + ',' + (r.guides ? r.guides.length : 0) + ',' + g0;
        if (dg.lastSnapSig !== sig) {
          dg.lastSnapSig = sig;
          setSnapInd({
            x: r.ix,
            y: r.iy,
            kind: r.kind,
            cross: r.cross,
            guides: r.guides
          });
        }
      }
    }
    if (!dg.moved && dg.type === 'obj') {
      if (boxRef.current) boxRef.current.setAttribute('data-dragging-obj', '1');
    }
    dg.moved = true;
    if (dg.type === 'obj') altDupMove(e, dg, dx, dy);else live({
      ...dg.base,
      objects: dg.base.objects.map(o => VE.moveNodes(o, dg.ids, dx, dy))
    });
    if (dg.type === 'obj') {
      /* highlight Frame target: daftar Frame & bbox objek di-cache SEKALI per drag (tidak dihitung ulang tiap pointermove) */
      if (!dg.frm) {
        const hasAnyFrames = dg.base.objects.some(q => q.isFrameBg || q.isAutoFrame || q.containerType === 'frame' || /^frame/i.test(q.group || ''));
        if (!hasAnyFrames) {
          dg.frm = {
            frames: [],
            cand: [],
            bb: null
          };
        } else {
          const mv = dg.base.objects.filter(q => dg.ids.has(q.id)),
            bgG = new Set(mv.filter(q => (q.isFrameBg || q.isAutoFrame) && q.group).map(q => q.group));
          const cand = mv.filter(q => !q.isFrameBg && !q.isAutoFrame && !(q.group && bgG.has(q.group)));
          dg.frm = {
            frames: VE.listFrames(dg.base, dg.ids),
            cand,
            bb: cand.length ? dg.bb0 || VE.docBounds(dg.base, new Set(cand.map(q => q.id))) : null
          };
        }
      }
      let hid = null;
      if (dg.frm.bb) {
        const cx = (dg.frm.bb[0] + dg.frm.bb[2]) / 2 + dx,
          cy = (dg.frm.bb[1] + dg.frm.bb[3]) / 2 + dy;
        const hf = dg.frm.frames.find(f => cx >= f.bb[0] && cx <= f.bb[2] && cy >= f.bb[1] && cy <= f.bb[3]);
        if (hf && !dg.frm.cand.every(q => q.group === hf.id)) hid = hf.id;
      }
      const noNest = !!(e.ctrlKey || e.metaKey);
      if (dg.lastHid !== hid) {
        dg.lastHid = hid;
        setDropFrameId(hid);
      }
      if (dg.lastNoNest !== noNest) {
        dg.lastNoNest = noNest;
        setDropNoNest(noNest);
      }
    }
  };
  const onPointerUp = e => {
    const dg = dragRef.current;
    dragRef.current = null;
    document.body.classList.remove('grabbing');
    if (boxRef.current) {
      boxRef.current.removeAttribute('data-dragging');
      boxRef.current.removeAttribute('data-dragging-obj');
    }
    try {
      boxRef.current.releasePointerCapture(e.pointerId);
    } catch (x) {}
    if (dg && dg.type === 'pan') {
      if (viewPend.current) {
        cancelAnimationFrame(viewPend.current);
        viewPend.current = 0;
      }
      if (viewSettleTimer.current) {
        clearTimeout(viewSettleTimer.current);
        viewSettleTimer.current = 0;
      }
      setSceneInteractingZoom(false);
      if (sceneRendererRef.current) {
        sceneRendererRef.current.isPanning = false;
        sceneRendererRef.current.isZooming = false;
      }
      if (boxRef.current) {
        boxRef.current.removeAttribute('data-zooming');
        boxRef.current.setAttribute('data-fast-render', gpuOn && nTotal > 800 ? '1' : '0');
      }
      if (dg.moved) {
        applyVP(true, false, true);
        const selCnt = selRef.current ? selRef.current.objs.size : 0;
        if (vcSimpRef.current || renamingId || renderCfg.debugMode !== 'none' || selCnt > 64 || shown.length > 64) {
          const p = {
            x: panRef.current.x,
            y: panRef.current.y
          };
          setPan(prevP => Math.abs(prevP.x - p.x) > 0.5 || Math.abs(prevP.y - p.y) > 0.5 ? p : prevP);
        }
      }
      return;
    }
    if (dg && dg.type === 'obj' && dg.fastTx) flushFastObjDrag(dg);
    if (liveRafRef.current) flushLive();
    if (viewPend.current || viewSettleTimer.current) flushView();
    setSnapInd(null);
    setPanning(false);
    setMarq(null);
    setAddHov(null);
    setHhHov(null);
    setVcTransforming(false);
    setIsMovingObj(false);
    setMeasureBadge(null);
    setDropFrameId(null);
    setDropNoNest(false);
    if (!dg) return;
    if (dg.type === 'pen') {
      penUp(dg);
      return;
    }
    if (dg.type === 'shape') {
      let o = null,
        inF = null;
      /* shape baru yang pusatnya jatuh di dalam Frame otomatis menjadi anak Frame itu (Ctrl/Cmd = jangan masuk) */
      const nest = d => {
        const r = VE.reparentDroppedObjects(d, new Set([o.id]), {
          preventNest: e.ctrlKey || e.metaKey
        });
        if (r.action === 'in') {
          inF = r.targetFrame;
          return r.doc;
        }
        return d;
      };
      if (dg.moved) {
        o = docRef.current.objects.find(q => q.id === dg.id) || null;
        if (o) {
          const nd = nest(docRef.current);
          if (nd !== docRef.current) live(nd);
          push(docRef.current, null);
        }
      } else {
        const vb = dg.base.viewBox,
          sz = Math.max(10, Math.min(vb[2], vb[3]) * 0.2);
        o = makeShape(shapeKind, dg.start.x - sz / 2, dg.start.y - sz / 2, sz, sz, dg.id);
        if (o) commit(nest({
          ...dg.base,
          objects: [...dg.base.objects, o]
        }));
      }
      if (o) {
        setSel({
          objs: new Set([o.id]),
          nodes: new Set()
        });
        setTool('select');
        say(o.name + (inF ? ' ditambahkan ke ' + inF : ' ditambahkan'));
      }
      return;
    }
    if (dg.type === 'frame') {
      if (!dg.moved) {
        // Jika pengguna tidak sengaja mengklik di atas Frame yang sudah ada (termasuk Frame kosong),
        // cukup pilih Frame tersebut tanpa membuat/memindahkan posisi layer-nya!
        const hitF = VE.listFrames(dg.base, null).find(f => dg.start.x >= f.bb[0] && dg.start.x <= f.bb[2] && dg.start.y >= f.bb[1] && dg.start.y <= f.bb[3]);
        if (selRef.current.objs.size > 0) {
          createFrameSel();
          setTool('select');
          return;
        }
        const clickRect = [dg.start.x - 120, dg.start.y - 80, dg.start.x + 120, dg.start.y + 80];
        const res = VE.createFrame(dg.base, new Set(), {
          rect: clickRect,
          radius: lay.radius
        });
        commit(res.doc);
        setSel({
          objs: res.selIds,
          nodes: new Set()
        });
        alMem.current = null;
        setTool('select');
        say(res.frameId + ' dibuat');
        return;
      }
      const [fx0, fy0, fx1, fy1] = dg.rect;
      /* Tangkap semua objek tidak terkunci yang berada di dalam area tarikan Frame (termasuk objek dari grup SVG impor) */
      const ids = new Set();
      dg.base.objects.forEach(o => {
        if (o.isAutoFrame || o.isFrameBg || o.hidden || o.locked) return;
        const bb = vinfo(o).bb,
          cx = (bb[0] + bb[2]) / 2,
          cy = (bb[1] + bb[3]) / 2;
        if (cx >= fx0 && cx <= fx1 && cy >= fy0 && cy <= fy1) ids.add(o.id);
      });
      const res = VE.createFrame(dg.base, ids, {
        rect: dg.rect,
        radius: lay.radius
      });
      commit(res.doc);
      setSel({
        objs: res.selIds,
        nodes: new Set()
      });
      alMem.current = null;
      setTool('select');
      say(res.frameId + ' dibuat');
      return;
    }
    if (dg.type === 'marquee') {
      const a = dg.start,
        b = dg.cur;
      if (Math.hypot(e.clientX - dg.sx, e.clientY - dg.sy) < 4) {
        if (!dg.add && (tool === 'node' || tool === 'corner') && dg.prev && dg.prev.nodes.size === 0) {
          setSel({
            objs: new Set(),
            nodes: new Set()
          });
        }
        return;
      }
      const x0 = Math.min(a.x, b.x),
        x1 = Math.max(a.x, b.x),
        y0 = Math.min(a.y, b.y),
        y1 = Math.max(a.y, b.y);
      const inside = n => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1;
      const nTargets = tool === 'node' || tool === 'corner' ? dg.nodeTargets && dg.nodeTargets.length ? dg.nodeTargets : shown : null;
      if (nTargets && nTargets.length) {
        const nodes = new Set(dg.add && dg.prev ? dg.prev.nodes : []);
        const hitObjIds = new Set(dg.add && dg.prev ? dg.prev.objs : shown.length ? shown.map(o => o.id) : []);
        nTargets.forEach(o => {
          if (!showSelNodes || o.hidden || o.locked) return;
          o.subs.forEach(sp => sp.nodes.forEach(n => {
            if (inside(n)) {
              nodes.add(n.id);
              hitObjIds.add(o.id);
            }
          }));
        });
        setSel({
          objs: hitObjIds,
          nodes
        });
      } else {
        const objs = new Set(dg.add && dg.prev ? dg.prev.objs : []);
        docRef.current.objects.forEach(o => {
          if (o.hidden || o.locked) return;
          const bb = vinfo(o).bb;
          if (bb[0] <= x1 && bb[2] >= x0 && bb[1] <= y1 && bb[3] >= y0) objs.add(o.id);
        });
        setSel({
          objs,
          nodes: new Set()
        });
      }
      return;
    }
    if (dg.type === 'obj' && !dg.moved && dg.emptyBoxHit) {
      setSel({
        objs: new Set(),
        nodes: new Set()
      });
      return;
    }
    if (dg.moved && docRef.current !== dg.base) {
      let curDoc = docRef.current;
      if (dg.type === 'obj') {
        const movedIds = dg.selSwitched && dg.dupIds ? dg.dupIds : dg.ids;
        if (curDoc.objects.some(q => q.isFrameBg || q.isAutoFrame || q.containerType === 'frame' || /^frame/i.test(q.group || ''))) {
          const rep = VE.reparentDroppedObjects(curDoc, movedIds, {
            preventNest: e.ctrlKey || e.metaKey
          });
          if (rep.action === 'in') {
            curDoc = rep.doc;
            say('Objek dimasukkan ke ' + rep.targetFrame);
          } else if (rep.action === 'out') {
            curDoc = rep.doc;
            say('Objek dikeluarkan dari Frame');
          }
        }
        /* Selalu posisikan objek yang dipindahkan ke tumpukan teratas (z-index front) */
        const arranged = VE.arrangeZOrder(curDoc, movedIds, 'front');
        if (arranged !== curDoc) {
          curDoc = arranged;
        }
        live(curDoc);
      }
      push(curDoc, null);
    }
  };
  const onDoubleClick = e => {
    if (e.button !== 0) return;
    if (tool === 'pen') {
      finishPen();
      return;
    }
    if (tool === 'autohandle') return;
    if (tool === 'hand' || tool === 'shape' || tool === 'frame' || tool === 'addnode' || tool === 'addhandle' || spaceRef.current) return;
    const pt = toDoc(e.clientX, e.clientY),
      hit = pickNode(pt);
    if (hit && hit.kind === 'node') {
      const t = hit.n.type === 'corner' ? 'smooth' : 'corner';
      commitObjs(o => o.id === hit.o.id ? VE.typeNodes(o, new Set([hit.n.id]), t) : o);
      return;
    }
    const sg = nearestSeg(selObjs, pt, 9 / zoomRef.current);
    if (sg) {
      const nn = VE.insertNode(sg.o, sg.sp.id, sg.i, sg.t);
      commitObjs(o => o.id === sg.o.id ? nn : o);
      const added = nn.subs.find(s => s.id === sg.sp.id).nodes.find(n => !sg.sp.nodes.some(m => m.id === n.id));
      if (added) setSel({
        objs: new Set([sg.o.id]),
        nodes: new Set([added.id])
      });
      return;
    }
    const o = hitObj(pt);
    if (o) {
      setSel({
        objs: new Set([o.id]),
        nodes: new Set()
      });
      if (o.text) {
        setTool('select');
        renameSkip.current = false;
        setRenamingId('ct:' + o.id);
        setRenameVal(o.text.content || '');
        say('Ketik teks langsung di kanvas (Enter = selesai)');
      } else {
        setTool('node');
      }
    }
  };

  /* ---- aksi ---- */
  const setProp = (k, v) => commitObjs(o => sel.objs.has(o.id) && !o.locked && o[k] !== v ? {
    ...o,
    [k]: v
  } : o, 'p:' + k);
  const delSel = () => {
    if (selNodes.size) {
      commitObjs(o => sel.objs.has(o.id) && !o.locked ? VE.deleteNodes(o, selNodes) : o);
      setSel({
        objs: sel.objs,
        nodes: new Set()
      });
    } else if (sel.objs.size) {
      const d = docRef.current;
      const delBgGrps = new Set();
      d.objects.forEach(o => {
        if (sel.objs.has(o.id) && !o.locked && (o.isFrameBg || o.isAutoFrame) && o.group) delBgGrps.add(o.group);
      });
      commitObjs(o => {
        if (sel.objs.has(o.id) && !o.locked) return null;
        if (o.group && delBgGrps.has(o.group)) return {
          ...o,
          group: null,
          containerType: null
        };
        return o;
      });
      setSel({
        objs: new Set(),
        nodes: new Set()
      });
    }
  };
  const dup = () => {
    if (!selObjs.length) return;
    const d = docRef.current,
      cp = cloneWithGroups(d.objects, sel.objs, 10, 10);
    if (!cp.length) return;
    commit({
      ...d,
      objects: VE.compactGroups([...d.objects, ...cp])
    });
    setSel({
      objs: new Set(cp.map(o => o.id)),
      nodes: new Set()
    });
  };
  /* [ ] naik/turun satu langkah: menggunakan VE.arrangeZOrder('forward' / 'backward') yang sadar-Frame */
  const reorder = up => {
    const nd = VE.arrangeZOrder(docRef.current, sel.objs, up ? 'forward' : 'backward');
    if (nd !== docRef.current) commit(nd);
  };
  const cntNodes = () => docRef.current.objects.reduce((s, o) => s + vinfo(o).n, 0);
  /* Luruskan seleksi: handle terpilih → rapikan handle; ≥2 node terpilih → jajarkan node (dan luruskan segmen di antaranya) */
  const alignSel = soft => {
    if (selHandles.size) {
      const ok = commitObjs(o => sel.objs.has(o.id) ? VE.alignHandles(o, selHandles, {}) : o);
      say(ok ? selHandles.size + ' handle diluruskan' : 'Handle sudah lurus');
      return true;
    }
    if (selNodes.size >= 2) {
      const ok = commitObjs(o => sel.objs.has(o.id) ? VE.alignNodes(o, selNodes, {
        soft
      }) : o);
      say(ok ? selNodes.size + ' node diluruskan' : 'Node sudah lurus');
      return true;
    }
    return false;
  };
  const applyStraight = () => {
    if (!selObjs.length) return say('Pilih objek dulu');
    if (alignSel(false)) return;
    const b = cntNodes();
    commitObjs(o => sel.objs.has(o.id) ? VE.straighten(o, sOpt.maxDev, sOpt.angTol) : o);
    say('Garis diluruskan · ' + Math.max(0, b - cntNodes()) + ' node dihapus');
  };
  const applyAutoRefine = () => {
    if (!selObjs.length) return say('Pilih objek dulu');
    const res = VE.autoRefineGeometry(docRef.current, {
      only: sel.objs,
      lineTol: sOpt.maxDev
    });
    if (!res.changed) return say('Tidak ada segmen/sudut yang perlu dirapikan');
    const mp = new Map(res.doc.objects.map(o => [o.id, o]));
    commitObjs(o => mp.get(o.id) || o, 'auto-refine');
    say(`Dirapikan · ${res.straightenedCount} segmen diluruskan, ${res.smoothedCornerCount} sudut di-smooth`);
  };
  const applyPruneNodes = () => {
    if (!selObjs.length) return say('Pilih objek dulu');
    const before = cntNodes();
    const res = VE.deleteNonCornerNodes(docRef.current, {
      only: sel.objs,
      tol: pruneOpt.tol,
      cornerDeg: pruneOpt.cornerDeg
    });
    if (!res.changed) return say('Tidak ada node non-sudut yang bisa dihapus (' + res.cornerCount + ' sudut terdeteksi)');
    const mp = new Map(res.doc.objects.map(o => [o.id, o]));
    commitObjs(o => mp.get(o.id) || o, 'prune-non-corner');
    say(`${res.removedCount} node non-sudut dihapus · ${res.cornerCount} sudut dipertahankan · ${before} → ${cntNodes()} node`);
  };
  const applyNodeAngleAlign = (overrideDeg, overrideMode) => {
    if (!selObjs.length) return say('Pilih objek dulu');
    if (selHandles.size) {
      const ok = commitObjs(o => sel.objs.has(o.id) ? VE.alignHandles(o, selHandles, {}) : o);
      return say(ok ? selHandles.size + ' handle diluruskan' : 'Handle sudah lurus');
    }
    if (selNodes.size < 2) return say('Pilih minimal 2 node yang ingin disejajarkan');
    const mode = overrideMode || alOpt.mode;
    const deg = overrideDeg != null ? overrideDeg : alOpt.deg;
    const ok = commitObjs(o => sel.objs.has(o.id) ? VE.alignNodesAtAngle(o, selNodes, {
      angleMode: mode,
      angleDeg: deg,
      anchor: alOpt.anchor,
      slideEdges: alOpt.slide,
      collapse: alOpt.collapse
    }) : o, 'node-al');
    say(ok ? `${selNodes.size} node disejajarkan (${mode === 'custom' ? deg + '°' : mode === 'perp' ? (prefs.lang === 'en' ? '⊥ 90° Perpendicular' : '⊥ 90° Batang') : mode === 'parallel' ? (prefs.lang === 'en' ? '∥ Parallel' : '∥ Seberang') : 'Auto'})` : 'Node sudah sejajar pada sudut tersebut');
  };
  const applySharpen = () => {
    if (!selObjs.length) return say('Pilih objek / node sudut dulu');
    const ids = selNodes.size ? selNodes : null,
      b = cntNodes();
    commitObjs(o => sel.objs.has(o.id) ? VE.sharpenCorners(o, ids) : o);
    const k = b - cntNodes();
    say(k > 0 ? k + ' sudut tumpul dilancipkan' : ids ? 'Node dijadikan corner tajam' : 'Tidak ada sudut tumpul yang terdeteksi');
  };
  const applySmoothNodes = () => {
    if (!selNodes.size) return say('Pilih node yang mau dihaluskan');
    commitObjs(o => sel.objs.has(o.id) ? VE.smoothSelectedNodes(o, selNodes, .6) : o);
    say(selNodes.size + ' node dihaluskan (Taubin + handle G1)');
  };
  const applyType = t => {
    if (!selNodes.size) return say('Pilih node dulu');
    if (t === 'corner' && selHandles.size) {
      alignSel(true);
      return;
    } /* Corner pada handle terpilih = luruskan handle */
    let al = false;
    commitObjs(o => {
      if (!sel.objs.has(o.id)) return o;
      const r = VE.typeNodes(o, selNodes, t);
      if (t !== 'corner' || selNodes.size < 2) return r;
      const r2 = VE.alignNodes(r, selNodes, {
        soft: true
      });
      if (r2 !== r) al = true;
      return r2;
    });
    if (al) say(selNodes.size + ' node dijadikan corner & diluruskan');
  };
  const MIRROR_OPTS = [['corner', 'veMirrorNone', L.edMirrorFree, 'M4.5 7.5L10 11 M14 11l5.5-3.5 M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M3 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0 M18 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'], ['freeCurve', 'veMirrorCurve', L.edMirrorCurve, 'M4 16.5C6.5 8.5 9.5 8.5 10.5 11 M13.5 13C15 16 18 16 20 7.5 M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0'], ['smooth', 'veMirrorAngle', 'Mirror angle', 'M3.5 14.5L10 12.4 M14 11.6L19.5 9.8 M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M2.5 15a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'], ['symmetric', 'veMirrorAL', 'Mirror angle and length', 'M4.5 14.5L10 12.6 M14 11.4L19.5 9.5 M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M3 15a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0 M18 9a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0']];
  const applyMirror = m => {
    setMirrorOpen(false);
    if (!selNodes.size) return say('Pilih node atau handle dulu untuk mengatur mirroring');
    const nm = (MIRROR_OPTS.find(q => q[0] === m) || [])[2];
    const ok = commitObjs(o => sel.objs.has(o.id) ? VE.mirrorNodes(o, selNodes, m, selHandles) : o);
    say(ok ? nm + ': ' + selNodes.size + ' node' : 'Sudah ' + nm);
  };
  const doInsert = () => {
    if (selNodes.size < 2) return say('Pilih dua node yang bersebelahan, atau klik dua kali pada garis path');
    let c = 0;
    commitObjs(o => {
      if (!sel.objs.has(o.id)) return o;
      const r = VE.insertMid(o, selNodes);
      c += r.cnt;
      return r.cnt ? r.o : o;
    });
    say(c ? c + ' node disisipkan' : 'Node terpilih tidak bersebelahan');
  };
  const setClosed = v => commitObjs(o => sel.objs.has(o.id) ? {
    ...o,
    subs: o.subs.map(sp => ({
      ...sp,
      closed: v
    }))
  } : o);
  const expOk = () => exportArea !== 'sel' || selRef.current.objs.size > 0 || (say('Pilih objek yang akan diekspor'), false);
  const isRasterFmt = f => f === 'png' || f === 'jpg' || f === 'webp';
  const hasImgs = () => docRef.current.objects.some(o => o.img);
  const triggerDl = (blob, ext) => {
    const u = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = u;
    a.download = 'geovanta-edit.' + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  };
  const copyTextFb = (s, ok) => {
    const d = document.createElement('div');
    d.textContent = s;
    d.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;user-select:text';
    document.body.appendChild(d);
    const sel = window.getSelection(),
      rng = document.createRange();
    rng.selectNodeContents(d);
    sel.removeAllRanges();
    sel.addRange(rng);
    try {
      document.execCommand('copy');
      say(ok);
    } catch (x) {
      say('Gagal menyalin');
    }
    sel.removeAllRanges();
    d.remove();
  };
  /* Salin ke clipboard sesuai format terpilih: SVG/AI/EPS/PS sebagai teks, PNG/JPG/WEBP sebagai gambar (clipboard browser hanya menerima PNG) */
  const exportSvg = async () => {
    if (!expOk()) return;
    const opt = {
      bg,
      area: exportArea,
      only: selRef.current.objs
    };
    try {
      const exportDoc = typeof AssetManager !== 'undefined' && projectId ? await AssetManager.resolveDocForStandaloneExport(projectId, docRef.current) : docRef.current;
      if (isRasterFmt(expFmt)) {
        if (!(navigator.clipboard && window.ClipboardItem && navigator.clipboard.write)) return say('Browser ini tidak bisa menyalin gambar — gunakan tombol Unduh');
        await navigator.clipboard.write([new ClipboardItem({
          'image/png': VE.exportRaster(exportDoc, opt, 'png', expScale)
        })]);
        return say('Gambar PNG (' + expScale + 'x) disalin' + (expFmt !== 'png' ? ' · clipboard hanya mendukung PNG' : ''));
      }
      const txt = expFmt === 'ai' ? VE.exportAI(exportDoc, opt) : expFmt === 'eps' ? VE.exportEPS(exportDoc, opt) : VE.serializeDoc(exportDoc, opt),
        lb = expFmt.toUpperCase() + ' disalin';
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(txt).then(() => say(lb), () => copyTextFb(txt, lb));else copyTextFb(txt, lb);
    } catch (e) {
      say('Gagal menyalin: ' + (e && e.message || 'tidak diizinkan'));
    }
  };
  /* Unduh file sesuai format: .svg .png .jpg .webp .ai .eps */
  const downloadSvg = async () => {
    if (!expOk()) return;
    const opt = {
        bg,
        area: exportArea,
        only: selRef.current.objs
      },
      note = hasImgs() && ['ai', 'eps'].includes(expFmt) ? ' · gambar raster hanya tersimpan di data round-trip Geovanta' : '';
    try {
      const d = typeof AssetManager !== 'undefined' && projectId ? await AssetManager.resolveDocForStandaloneExport(projectId, docRef.current) : docRef.current;
      if (isRasterFmt(expFmt)) {
        triggerDl(await VE.exportRaster(d, opt, expFmt, expScale), expFmt);
        return say('Diunduh sebagai .' + expFmt.toUpperCase() + ' (' + expScale + 'x)');
      }
      if (expFmt === 'ai') {
        triggerDl(new Blob([VE.exportAI(d, opt)], {
          type: 'application/pdf'
        }), 'ai');
        return say('Diunduh sebagai Adobe Illustrator (.AI)' + note);
      }
      if (expFmt === 'eps') {
        triggerDl(new Blob([VE.exportEPS(d, opt)], {
          type: 'application/postscript'
        }), 'eps');
        return say('Diunduh sebagai Encapsulated PostScript (.EPS)' + note);
      }
      triggerDl(new Blob([VE.serializeDoc(d, opt)], {
        type: 'image/svg+xml'
      }), 'svg');
      say('Diunduh sebagai .SVG');
    } catch (e) {
      say('Gagal mengekspor: ' + (e && e.message || 'kesalahan tak dikenal'));
    }
  };

  /* pan & fokus ke koordinat objek/anomali */
  const panTo = (wx, wy) => {
    const b = boxRef.current;
    if (!b || !b.clientWidth) return;
    const s = zoomRef.current;
    const np = {
      x: b.clientWidth / 2 - wx * s,
      y: b.clientHeight / 2 - wy * s
    };
    panRef.current = np;
    flushView();
  };

  /* ---- VectorCraft Object › Path › Simplify (Slider Strip + More Options Dialog + Live Preview) ---- */
  const computeVcSimpPreview = (baseDoc, baseSel, nextState) => {
    if (!nextState.preview) {
      const targetObjs = baseDoc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.isFrameBg && !o.isAutoFrame && (!baseSel.objs.size || baseSel.objs.has(o.id)));
      const cnt = targetObjs.reduce((s, o) => s + o.subs.reduce((a, sp) => a + sp.nodes.length, 0), 0);
      live(baseDoc);
      return {
        ...nextState,
        before: cnt,
        after: cnt,
        lastRes: null
      };
    }
    const params = nextState.mode === 'slider' ? {
      level: nextState.level,
      cornerAngle: 180.0 - nextState.angleThreshold,
      straightLines: nextState.straightLines
    } : {
      tolerance: nextState.tolerance,
      cornerAngle: 180.0 - nextState.angleThreshold,
      straightLines: nextState.straightLines
    };
    const res = VE.simplifyDoc(baseDoc, params, baseSel.objs, baseSel.nodes);
    live(res.doc);
    return {
      ...nextState,
      before: res.before,
      after: res.after,
      lastRes: res
    };
  };
  const openVcSimplify = (forceMode = null) => {
    const curS = vcSimpRef.current;
    const baseDoc = curS ? curS.baseDoc : docRef.current;
    const baseSel = curS ? curS.baseSel : {
      objs: new Set(selRef.current.objs),
      nodes: new Set(selRef.current.nodes)
    };
    const editableObjs = baseDoc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.isFrameBg && !o.isAutoFrame && (!baseSel.objs.size || baseSel.objs.has(o.id)));
    if (!editableObjs.length) {
      say('Pilih atau buat objek path vektor terlebih dahulu untuk Simplify');
      return;
    }
    const bb = VE.docBounds({
      objects: editableObjs
    });
    const size = bb ? Math.max(bb[2] - bb[0], bb[3] - bb[1]) : 0;
    const autoLvl = VE.autoSimplifyLevel(size);
    const mode = forceMode || (vcSimpRetain ? 'dialog' : 'slider');
    const tol = mode === 'dialog' && vcSimpRetain ? vcSimpSaved.tolerance : VE.simplifyLevelTolerance(autoLvl);
    const init = {
      mode,
      baseDoc,
      baseSel,
      autoLevel: autoLvl,
      level: autoLvl,
      tolerance: Math.round(tol * 1000) / 1000,
      angleThreshold: vcSimpRetain ? vcSimpSaved.angleThreshold : 150.0,
      straightLines: vcSimpRetain ? vcSimpSaved.straightLines : false,
      showOriginal: vcSimpRetain ? vcSimpSaved.showOriginal : false,
      retain: vcSimpRetain,
      preview: true,
      before: 0,
      after: 0,
      lastRes: null
    };
    const next = computeVcSimpPreview(baseDoc, baseSel, init);
    setVcSimp(next);
  };
  const updateVcSimplify = patch => {
    const curS = vcSimpRef.current;
    if (!curS) return;
    const merged = {
      ...curS,
      ...patch
    };
    if (patch.level !== undefined && patch.tolerance === undefined) {
      merged.tolerance = Math.round(VE.simplifyLevelTolerance(patch.level) * 1000) / 1000;
    } else if (patch.tolerance !== undefined && patch.level === undefined) {
      const l = 50.0 - 10.0 * Math.log2(Math.max(1e-4, patch.tolerance));
      merged.level = clampN(Math.round(l), 0, 100);
    }
    const next = computeVcSimpPreview(curS.baseDoc, curS.baseSel, merged);
    setVcSimp(next);
  };
  const triggerAutoSimplifyLevel = () => {
    const curS = vcSimpRef.current;
    if (!curS) {
      openVcSimplify('slider');
      return;
    }
    const editableObjs = curS.baseDoc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.isFrameBg && !o.isAutoFrame && (!curS.baseSel.objs.size || curS.baseSel.objs.has(o.id)));
    const bb = editableObjs.length ? VE.docBounds({
      objects: editableObjs
    }) : null;
    const size = bb ? Math.max(bb[2] - bb[0], bb[3] - bb[1]) : 0;
    const autoLvl = VE.autoSimplifyLevel(size);
    updateVcSimplify({
      level: autoLvl,
      tolerance: Math.round(VE.simplifyLevelTolerance(autoLvl) * 1000) / 1000
    });
    say(`Auto-Simplify: Level ${autoLvl} (${VE.rd(VE.simplifyLevelTolerance(autoLvl))} pt)`);
  };
  const openVcMoreOptions = () => {
    const curS = vcSimpRef.current;
    if (!curS) {
      openVcSimplify('dialog');
      return;
    }
    const tol = Math.round(VE.simplifyLevelTolerance(curS.level) * 1000) / 1000;
    const merged = {
      ...curS,
      mode: 'dialog',
      tolerance: tol,
      preview: true
    };
    const next = computeVcSimpPreview(curS.baseDoc, curS.baseSel, merged);
    setVcSimp(next);
  };
  const confirmVcSimplify = () => {
    const curS = vcSimpRef.current;
    if (!curS) return;
    const params = curS.mode === 'slider' ? {
      level: curS.level,
      cornerAngle: 180.0 - curS.angleThreshold,
      straightLines: curS.straightLines
    } : {
      tolerance: curS.tolerance,
      cornerAngle: 180.0 - curS.angleThreshold,
      straightLines: curS.straightLines
    };
    const res = VE.simplifyDoc(curS.baseDoc, params, curS.baseSel.objs, curS.baseSel.nodes);
    if (curS.mode === 'dialog') {
      setVcSimpRetain(curS.retain);
      try {
        localStorage.setItem('vc-simplify-retain', curS.retain ? '1' : '0');
      } catch (e) {}
      if (curS.retain) {
        const saved = {
          tolerance: curS.tolerance,
          angleThreshold: curS.angleThreshold,
          straightLines: curS.straightLines,
          showOriginal: curS.showOriginal
        };
        setVcSimpSaved(saved);
        try {
          localStorage.setItem('vc-simplify-opts', JSON.stringify(saved));
        } catch (e) {}
      }
    }
    setVcSimp(null);
    if (res.changed) {
      /* Reset ke baseDoc terlebih dahulu agar push() merekam baseDoc ke Undo stack dalam satu langkah */
      docRef.current = curS.baseDoc;
      commit(res.doc, null);
      setSel({
        objs: curS.baseSel.objs,
        nodes: res.nextSelNodes || new Set()
      });
      say(`Simplify diterapkan · Anchor Points: ${res.before} → ${res.after}`);
    } else {
      live(curS.baseDoc);
      say(`Simplify: tidak ada perubahan (${res.before} anchor points)`);
    }
    if (tool === 'simplify') setTool('select');
  };
  const cancelVcSimplify = () => {
    const curS = vcSimpRef.current;
    if (!curS) return;
    live(curS.baseDoc);
    setSel(curS.baseSel);
    setVcSimp(null);
    if (tool === 'simplify') setTool('select');
    say('Simplify dibatalkan');
  };

  /* ---- Boolean / Pathfinder: gabung 2+ objek path tertutup jadi satu ---- */
  const BOOL_LABEL = { union: 'Union', subtract: 'Subtract', intersect: 'Intersect', exclude: 'Exclude' };
  const applyBoolean = op => {
    const res = VE.booleanDoc(docRef.current, op, selRef.current.objs);
    if (!res.changed) {
      if (res.reason === 'need2') return say('Pilih 2+ objek path untuk Boolean');
      if (res.reason === 'need2closed') return say('Boolean butuh 2+ objek path tertutup');
      if (res.reason === 'empty') return say('Boolean: hasil kosong (bentuk saling meniadakan)');
      return say('Boolean: tidak ada perubahan');
    }
    commit(res.doc, null);
    setSel({ objs: new Set([res.resultId]), nodes: new Set() });
    const st = res.stats;
    say(`Boolean ${BOOL_LABEL[op]}: ${st.inObjects} objek → ${st.outRings} ring, ${st.outNodes} node${st.skippedOpen ? ` · ${st.skippedOpen} subpath terbuka dilewati` : ''}`);
  };
  /* ---- Outline Stroke: ubah stroke jadi bentuk berisi (fill = warna stroke) ---- */
  const applyOutlineStroke = () => {
    const res = VE.outlineStrokeDoc(docRef.current, selRef.current.objs);
    if (!res.changed) {
      if (res.reason === 'nostroke') return say('Pilih objek dengan stroke (lebar > 0) untuk Outline Stroke');
      if (res.reason === 'needpath') return say('Pilih objek path dulu');
      return say('Outline Stroke: tidak ada perubahan');
    }
    commit(res.doc, null);
    setSel({ objs: new Set(selRef.current.objs), nodes: new Set() });
    const st = res.stats;
    say(`Outline Stroke: ${st.objects} objek → ${st.outSubs} subpath${st.droppedFill ? ` · fill lama ${st.droppedFill} objek dibuang` : ''}`);
  };
  /* ---- Offset Path: strip pratinjau langsung (mirip Simplify slider) ---- */
  const countNodesIn = (doc, ids) => doc.objects.filter(o => ids.has(o.id)).reduce((s, o) => s + (o.subs || []).reduce((a, sp) => a + (sp.nodes || []).length, 0), 0);
  const computeOffPreview = (baseDoc, baseSel, nextState) => {
    const res = VE.offsetDoc(baseDoc, baseSel.objs, nextState.dist, nextState.join, nextState.miterLimit);
    live(res.doc);
    return {
      ...nextState,
      before: countNodesIn(baseDoc, baseSel.objs),
      after: countNodesIn(res.doc, baseSel.objs),
      lastRes: res
    };
  };
  const openOffsetStrip = () => {
    const curS = offStripRef.current;
    const baseDoc = curS ? curS.baseDoc : docRef.current;
    const baseSel = curS ? curS.baseSel : { objs: new Set(selRef.current.objs), nodes: new Set() };
    const editableObjs = baseDoc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.text && o.subs && o.subs.length && (!baseSel.objs.size || baseSel.objs.has(o.id)));
    if (!editableObjs.length) {
      say('Pilih objek path dulu');
      return;
    }
    const init = {
      baseDoc,
      baseSel,
      dist: 10,
      join: 'miter',
      miterLimit: 4,
      before: 0,
      after: 0,
      lastRes: null
    };
    const next = computeOffPreview(baseDoc, baseSel, init);
    setOffStrip(next);
  };
  const updateOffsetStrip = patch => {
    const curS = offStripRef.current;
    if (!curS) return;
    const merged = { ...curS, ...patch };
    const next = computeOffPreview(curS.baseDoc, curS.baseSel, merged);
    setOffStrip(next);
  };
  const confirmOffsetStrip = () => {
    const curS = offStripRef.current;
    if (!curS) return;
    const res = VE.offsetDoc(curS.baseDoc, curS.baseSel.objs, curS.dist, curS.join, curS.miterLimit);
    setOffStrip(null);
    if (res.changed) {
      /* Reset ke baseDoc terlebih dahulu agar push() merekam baseDoc ke Undo stack dalam satu langkah */
      docRef.current = curS.baseDoc;
      commit(res.doc, null);
      setSel({ objs: curS.baseSel.objs, nodes: new Set() });
      const st = res.stats;
      say(`Offset ${curS.dist}pt diterapkan: ${st.objects} objek${st.droppedSubs ? ` · ${st.droppedSubs} subpath lenyap` : ''}`);
    } else {
      live(curS.baseDoc);
      say('Offset: tidak ada perubahan');
    }
  };
  const cancelOffsetStrip = () => {
    const curS = offStripRef.current;
    if (!curS) return;
    live(curS.baseDoc);
    setSel(curS.baseSel);
    setOffStrip(null);
    say('Offset dibatalkan');
  };

  /* ---- context menu: copy / paste / undo / redo / duplicate / flatten / group ---- */
  const selected = () => docRef.current.objects.filter(o => selRef.current.objs.has(o.id));
  /* Salin multi-MIME: text/plain (kode SVG) + image/png dalam SATU ClipboardItem; objek internal tetap utuh via clipRef */
  const writeSysClip = (txt, svg, ids) => {
    const cb = navigator.clipboard;
    if (!cb) return;
    const plain = () => {
      try {
        const p = cb.writeText(txt);
        p && p.catch && p.catch(() => {});
      } catch (x) {}
    };
    if (svg && window.ClipboardItem && cb.write) {
      try {
        const png = VE.exportRaster(docRef.current, {
          bg: {
            mode: 'transparent'
          },
          area: 'sel',
          only: ids
        }, 'png', 2);
        png.catch(() => {});
        cb.write([new ClipboardItem({
          'text/plain': new Blob([txt], {
            type: 'text/plain'
          }),
          'image/png': png
        })]).catch(plain);
        return;
      } catch (x) {}
    }
    plain();
  };
  const copySel = () => {
    const d = docRef.current,
      effIds = new Set(selRef.current.objs);
    d.objects.forEach(o => {
      if (effIds.has(o.id) && (o.isFrameBg || o.isAutoFrame) && o.group) {
        d.objects.forEach(ch => {
          if (ch.group === o.group) effIds.add(ch.id);
        });
      }
    });
    const s = d.objects.filter(o => effIds.has(o.id));
    if (!s.length) return say('Pilih objek dulu');
    const id = VE.uid(),
      ids = new Set(s.map(o => o.id));
    let svg = '';
    try {
      svg = VE.serializeDoc(d, {
        bg: {
          mode: 'transparent'
        },
        area: 'sel',
        only: ids
      }).trim();
    } catch (x) {}
    clipRef.current = {
      objs: s,
      id,
      n: 0,
      svg
    };
    writeSysClip(svg || 'svgpeak-clip:' + id, svg, ids);
    say(s.length + ' objek disalin (SVG + PNG)');
  };
  const pasteClip = at => {
    const c = clipRef.current;
    if (!c || !c.objs.length) return say('Clipboard kosong');
    const d = docRef.current,
      used = new Set(d.objects.map(o => o.name)),
      gused = new Set(d.objects.map(o => o.group).filter(Boolean)),
      gm = new Map();
    const uniq = n => {
      let k = n,
        i = 2;
      while (used.has(k)) k = n + '-' + i++;
      used.add(k);
      return k;
    };
    let dx = 10 * (c.n + 1),
      dy = dx;
    if (at) {
      const bb = VE.docBounds({
        objects: c.objs
      });
      if (bb) {
        dx = at.x - (bb[0] + bb[2]) / 2;
        dy = at.y - (bb[1] + bb[3]) / 2;
      }
    }
    c.n++;
    const cp = c.objs.map(o => {
      const q = VE.translate(VE.cloneObj(o), dx, dy);
      let g = null;
      if (o.group) {
        if (!gm.has(o.group)) {
          const isF = /^frame/i.test(o.group) || c.objs.some(it => it.group === o.group && (it.containerType === 'frame' || it.isFrameBg || it.isAutoFrame));
          const prefix = isF ? 'Frame-' : 'grup-';
          let k = 1;
          while (gused.has(prefix + k)) k++;
          gused.add(prefix + k);
          gm.set(o.group, prefix + k);
        }
        g = gm.get(o.group);
      }
      const nm = (o.isFrameBg || o.isAutoFrame) && g ? (used.add(g + '-bg'), g + '-bg') : uniq(o.name);
      return {
        ...q,
        name: nm,
        group: g
      };
    });
    commit({
      ...d,
      objects: VE.compactGroups([...d.objects, ...cp])
    });
    setSel({
      objs: new Set(cp.map(o => o.id)),
      nodes: new Set()
    });
    say(cp.length + ' objek ditempel');
  };
  /* Flatten: gabungkan objek path terpilih menjadi satu compound path (gaya objek paling atas); satu objek bergrup = lepas dari grup */
  const flattenSel = () => {
    const d = docRef.current,
      S = selRef.current.objs,
      paths = d.objects.filter(o => S.has(o.id) && !o.img);
    if (!paths.length) return say('Pilih objek path dulu');
    if (paths.length < 2) {
      const o = paths[0];
      if (o.group) {
        commitObjs(q => q.id === o.id ? {
          ...q,
          group: null
        } : q);
        say('Objek dilepas dari grup');
      } else say('Pilih 2+ objek untuk di-flatten');
      return;
    }
    const top = paths[paths.length - 1],
      merged = {
        ...top,
        id: VE.uid(),
        subs: paths.flatMap(o => VE.cloneObj(o).subs),
        group: null
      },
      ids = new Set(paths.map(o => o.id)),
      out = [];
    d.objects.forEach(o => {
      if (o.id === top.id) out.push(merged);else if (!ids.has(o.id)) out.push(o);
    });
    commit({
      ...d,
      objects: out
    });
    setSel({
      objs: new Set([merged.id]),
      nodes: new Set()
    });
    say(paths.length + ' objek di-flatten menjadi 1 path');
  };
  /* Group: objek terpilih dijadikan satu grup (dikumpulkan berurutan di posisi objek paling atas); jika seleksi = satu grup utuh → Ungroup */
  /* Bungkus objek terpilih menjadi Frame ala Figma (atau Frame kosong bila tak ada seleksi) */
  const createFrameSel = () => {
    const res = VE.createFrame(docRef.current, selRef.current.objs, {
      pad: 0,
      radius: lay.radius
    });
    commit(res.doc);
    setSel({
      objs: res.selIds,
      nodes: new Set()
    });
    alMem.current = null;
    setLay(l => ({
      ...l,
      pt: 0,
      pr: 0,
      pb: 0,
      pl: 0
    }));
    say('Dibungkus ke dalam ' + res.frameId);
  };
  /* Frame terpilih → Auto Layout: arah/gap/padding disimpulkan dari posisi saat ini sehingga objek tidak melompat */
  const convertFrameToAutoLayout = frameName => {
    const d = docRef.current,
      fo = selRef.current.objs.size ? d.objects.find(o => selRef.current.objs.has(o.id) && o.group) : null;
    const targetGrp = frameName || fo && fo.group;
    if (!targetGrp) return say('Pilih sebuah Frame atau buat Frame terlebih dahulu');
    const inf = VE.inferFrameAutoLayout(d, targetGrp);
    const nextLay = {
      ...lay,
      ...inf,
      split: !(inf.pt === inf.pr && inf.pr === inf.pb && inf.pb === inf.pl)
    };
    const memberIds = new Set(d.objects.filter(o => o.group === targetGrp).map(o => o.id));
    const res = VE.applyAutoLayout(d, memberIds, {
      dir: nextLay.dir,
      cols: nextLay.cols,
      gap: nextLay.gap,
      pt: nextLay.pt,
      pr: nextLay.pr,
      pb: nextLay.pb,
      pl: nextLay.pl,
      alignX: nextLay.ax,
      alignY: nextLay.ay,
      frame: true,
      frameRadius: nextLay.radius
    });
    if (!res) return say('Frame kosong');
    setLay(nextLay);
    alMem.current = res.mem;
    commit(res.doc, 'alayout');
    setSel({
      objs: res.selIds,
      nodes: new Set()
    });
    say(targetGrp + ' diubah menjadi Auto Layout (' + nextLay.dir.toUpperCase() + ')');
  };
  const groupSel = noToggle => {
    const d = docRef.current,
      S = selRef.current.objs;
    const s = d.objects.filter(o => S.has(o.id) && !o.isFrameBg && !o.isAutoFrame);
    const g0 = s.length && s[0].group;
    if (noToggle !== true && g0 && s.every(o => o.group === g0) && d.objects.filter(o => o.group === g0 && !o.isFrameBg && !o.isAutoFrame).length === s.length) {
      return ungroupIds(new Set([g0]), (isFrameGid(d, g0) ? 'Frame "' : L.edGroupWord + ' "') + g0 + '"');
    }
    if (!s.length) return say('Pilih objek untuk dikelompokkan');
    const gu = new Set(d.objects.map(o => o.group).filter(Boolean));
    let k = 1;
    while (gu.has('grup-' + k)) k++;
    const gid = 'grup-' + k;
    const sIds = new Set(s.map(o => o.id));
    let last = 0;
    d.objects.forEach((o, i) => {
      if (sIds.has(o.id)) last = i;
    });
    const rest = d.objects.filter(o => !sIds.has(o.id));
    const at = d.objects.slice(0, last).filter(o => !sIds.has(o.id)).length;
    const grouped = s.map(o => ({
      ...o,
      group: gid,
      containerType: null
    }));
    rest.splice(at, 0, ...grouped);
    commit({
      ...d,
      objects: VE.compactGroups(rest)
    });
    setSel({
      objs: sIds,
      nodes: new Set()
    });
    say(s.length + ' objek dikelompokkan (' + gid + ')');
  };
  /* Ungroup (v7.1): mendukung grup biasa MAUPUN Frame; kotak latar otomatis Frame ikut dihapus, semua child tetap terpilih */
  const isFrameGid = (d, g) => /^frame/i.test(g) || d.objects.some(o => o.group === g && (o.containerType === 'frame' || o.isFrameBg || o.isAutoFrame));
  const ungroupIds = (gids, label) => {
    const d = docRef.current,
      fs = new Set(d.objects.filter(o => gids.has(o.group) && !o.isFrameBg && !o.isAutoFrame).map(o => o.id));
    const hasBg = d.objects.some(o => gids.has(o.group) && (o.isFrameBg || o.isAutoFrame));
    if (!fs.size && !hasBg) return false;
    commitObjs(o => {
      if (!gids.has(o.group)) return o;
      if (o.isFrameBg || o.isAutoFrame) return null;
      return {
        ...o,
        group: null,
        containerType: null
      };
    });
    setSel({
      objs: fs,
      nodes: new Set()
    });
    say((label || gids.size + ' kontainer') + ' dilepas (' + fs.size + ' objek)');
    return true;
  };
  const ungroupSel = () => {
    const d = docRef.current,
      S = selRef.current.objs,
      gids = new Set();
    d.objects.forEach(o => {
      if (S.has(o.id) && o.group) gids.add(o.group);
    });
    if (!gids.size) return say('Seleksi tidak berada di dalam Grup atau Frame');
    const g1 = [...gids][0];
    ungroupIds(gids, gids.size === 1 ? (isFrameGid(d, g1) ? 'Frame "' : L.edGroupWord + ' "') + g1 + '"' : null);
  };
  const onCtx = e => {
    if (viewPend.current) flushView();
    e.preventDefault();
    const pt = toDoc(e.clientX, e.clientY),
      o = hitObj(pt);
    if (o && !selRef.current.objs.has(o.id)) setSel({
      objs: new Set([o.id]),
      nodes: new Set()
    });
    setCtx({
      x: e.clientX,
      y: e.clientY,
      pt
    });
  };
  const openLayerCtx = (e, o) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selRef.current.objs.has(o.id)) setSel({
      objs: new Set([o.id]),
      nodes: new Set()
    });
    setCtx({
      x: e.clientX,
      y: e.clientY,
      pt: null
    });
  };

  /* ---- GV-A20: Stable keyboard listener (tidak dipasang/dilepas ulang pada setiap render/drag frame) ---- */
  const kbHandlersRef = useRef({
    kd: null,
    ku: null
  });
  kbHandlersRef.current.kd = e => {
    const t = e.target;
    if (t && t.closest && t.closest('[data-custom-input="true"],[role="textbox"],[contenteditable="true"]')) return;
    if (document.querySelector('.ov, [role="dialog"]')) return;
    if (figmaKeys(e)) return;
    const mod = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase();
    if (mod && k === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (mod && k === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && k === 'a') {
      e.preventDefault();
      if ((tool === 'node' || tool === 'corner') && shown.length) {
        const allN = new Set();
        shown.forEach(o => {
          if (!o.locked && !o.hidden) o.subs.forEach(sp => sp.nodes.forEach(n => allN.add(n.id)));
        });
        setSel({
          objs: new Set(shown.map(o => o.id)),
          nodes: allN
        });
      } else {
        setSel({
          objs: new Set(docRef.current.objects.filter(o => !o.hidden && !o.locked).map(o => o.id)),
          nodes: new Set()
        });
      }
      return;
    }
    if (mod && k === 'd') {
      e.preventDefault();
      dup();
      return;
    }
    if (mod && k === 'c' && !e.shiftKey) {
      if (selRef.current.objs.size) {
        e.preventDefault();
        copySel();
      }
      return;
    }
    if (mod && k === 'g') {
      e.preventDefault();
      e.shiftKey ? ungroupSel() : groupSel();
      return;
    }
    if (mod && k === 'e') {
      e.preventDefault();
      flattenSel();
      return;
    }
    if (mod && e.altKey && (k === 'u' || k === 's' || k === 'i' || k === 'x' || k === 'o')) {
      e.preventDefault();
      if (k === 'u') applyBoolean('union');
      else if (k === 's') applyBoolean('subtract');
      else if (k === 'i') applyBoolean('intersect');
      else if (k === 'x') applyBoolean('exclude');
      else if (k === 'o') applyOutlineStroke();
      return;
    }
    if (mod && k === 's') {
      e.preventDefault();
      downloadSvg();
      return;
    }
    if (mod || e.altKey) return;
    if (tool === 'pen' && penRef.current) {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        finishPen();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        penUndoLast();
        return;
      }
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        setSpace(true);
      }
      return;
    }
    if (vcSimpRef.current) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmVcSimplify();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelVcSimplify();
        return;
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      delSel();
    } else if (e.key === 'Escape') {
      setSel({
        objs: new Set(),
        nodes: new Set()
      });
    } else if (k === 'v') {
      if (vcSimpRef.current) confirmVcSimplify();
      setTool('select');
    } else if (k === 'a' || k === 'n') {
      if (vcSimpRef.current) confirmVcSimplify();
      setTool('node');
    } else if (k === 'h') {
      if (vcSimpRef.current) confirmVcSimplify();
      setTool('hand');
    } else if (k === 's') {
      setTool('simplify');
      openVcSimplify();
    } else if (k === 'p') setTool('pen');else if (k === 'b') setTool('autohandle');else if (k === 't') {
      if (vcSimpRef.current) confirmVcSimplify();
      setTool('text');
      say('Alat Teks (T): klik di kanvas untuk membuat teks');
    } else if (e.key === ']') reorder(true);else if (e.key === '[') reorder(false);else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(1.25);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(1 / 1.25);
    } else if (e.key === '0') {
      e.preventDefault();
      fitView();
    } else if (e.key === '2') {
      e.preventDefault();
      fitSel();
    } else if (e.key.startsWith('Arrow') && sel.objs.size && !(t.closest && t.closest('[role=slider]'))) {
      e.preventDefault();
      const st = e.shiftKey ? 10 : 1,
        dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0,
        dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      commitObjs(o => !sel.objs.has(o.id) ? o : selNodes.size ? VE.moveNodes(o, selNodes, dx, dy) : VE.translate(o, dx, dy), 'nudge');
    }
  };
  kbHandlersRef.current.ku = e => {
    if (e.key === 'Alt') setAltMeasure(null);
    if (e.key === ' ' && spaceRef.current) {
      spaceRef.current = false;
      setSpace(false);
    }
  };
  useEffect(() => {
    if (!active) return;
    const onKd = e => kbHandlersRef.current.kd && kbHandlersRef.current.kd(e);
    const onKu = e => kbHandlersRef.current.ku && kbHandlersRef.current.ku(e);
    window.addEventListener('keydown', onKd);
    window.addEventListener('keyup', onKu);
    return () => {
      window.removeEventListener('keydown', onKd);
      window.removeEventListener('keyup', onKu);
    };
  }, [active]);
  const grpUn = (() => {
    const g = selObjs.length && selObjs[0].group;
    return !!g && selObjs.every(o => o.group === g) && doc.objects.filter(o => o.group === g).length === selObjs.length;
  })();
  const canUngroup = selObjs.some(o => !!o.group);
  const IC_PASTE = 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6v4H9z M9 12h6 M9 16h4';
  const allSelHidden = selObjs.length > 0 && selObjs.every(o => o.hidden);
  const allSelLocked = selObjs.length > 0 && selObjs.every(o => o.locked);
  const toggleSelHidden = () => {
    if (!selObjs.length) return;
    commitObjs(o => sel.objs.has(o.id) ? {
      ...o,
      hidden: !allSelHidden
    } : o);
    say(allSelHidden ? 'Layer ditampilkan' : 'Layer disembunyikan');
  };
  const toggleSelLocked = () => {
    if (!selObjs.length) return;
    commitObjs(o => sel.objs.has(o.id) ? {
      ...o,
      locked: !allSelLocked
    } : o);
    say(allSelLocked ? 'Kunci layer dibuka' : 'Layer dikunci');
  };

  /* Context menu bergaya gelap Figma, HANYA berisi fitur nyata yang dimiliki Vector Editor ini */
  const ctxItems = [{
    k: 'copy',
    label: 'Copy',
    ic: ICONS.copy,
    kbd: 'Ctrl+C',
    dis: !selObjs.length,
    act: copySel
  }, {
    k: 'paste',
    label: 'Paste',
    ic: IC_PASTE,
    kbd: 'Ctrl+V',
    dis: false,
    act: () => pasteFromSystem(ctx && ctx.pt)
  }, {
    k: 'dup',
    label: 'Duplicate',
    ic: 'M8 8h12v12H8z M4 16V4h12',
    kbd: 'Ctrl+D',
    dis: !selObjs.length,
    act: dup
  }, {
    k: 'del',
    label: selNodes.size ? L.edCtxDelNode : 'Delete',
    ic: ICONS.trash,
    kbd: 'Del',
    tip: 'veDelObj',
    dis: !selObjs.length && !selNodes.size,
    act: delSel
  }, {
    sep: 1
  }, {
    k: 'undo',
    label: 'Undo',
    ic: 'M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.36 2.64L3 13',
    kbd: 'Ctrl+Z',
    dis: !canUndo,
    act: undo
  }, {
    k: 'redo',
    label: 'Redo',
    ic: 'M21 7v6h-6M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 13',
    kbd: 'Ctrl+Y',
    dis: !canRedo,
    act: redo
  }, {
    sep: 1
  }, {
    k: 'front',
    label: 'Bring to front',
    ic: 'M12 19V5 M5 12l7-7 7 7',
    kbd: 'Ctrl+]',
    tip: 'veUp',
    dis: !selObjs.length,
    act: () => {
      commit(VE.arrangeZOrder(docRef.current, sel.objs, 'front'));
      say('Dipindah ke paling depan');
    }
  }, {
    k: 'up',
    label: 'Bring forward',
    ic: 'M12 19V5 M5 12l7-7 7 7',
    kbd: ']',
    tip: 'veUp',
    dis: !selObjs.length,
    act: () => reorder(true)
  }, {
    k: 'down',
    label: 'Send backward',
    ic: 'M12 5v14 M19 12l-7 7-7-7',
    kbd: '[',
    tip: 'veDown',
    dis: !selObjs.length,
    act: () => reorder(false)
  }, {
    k: 'back',
    label: 'Send to back',
    ic: 'M12 5v14 M19 12l-7 7-7-7',
    kbd: 'Ctrl+[',
    tip: 'veDown',
    dis: !selObjs.length,
    act: () => {
      commit(VE.arrangeZOrder(docRef.current, sel.objs, 'back'));
      say('Dipindah ke paling belakang');
    }
  }, {
    sep: 1
  }, {
    k: 'grp',
    label: 'Group selection',
    ic: 'M3 7V3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M9 9h6v6H9z',
    kbd: 'Ctrl+G',
    tip: 'veCtxGroup',
    dis: !selObjs.length,
    act: () => groupSel(true)
  }, {
    k: 'frm-sel',
    label: 'Frame selection',
    ic: 'M6 2v20M18 2v20M2 6h20M2 18h20',
    kbd: 'Ctrl+Alt+G',
    tip: 'veFrameTool',
    dis: false,
    act: createFrameSel
  }, {
    k: 'ungrp',
    label: 'Ungroup',
    ic: 'M3 7V3h4 M17 3h4v4 M21 17v4h-4 M7 21H3v-4 M9 9h2v2H9z M13 13h2v2h-2z',
    kbd: 'Ctrl+Shift+G',
    tip: 'veCtxUngroup',
    dis: !canUngroup,
    act: ungroupSel
  }, {
    k: 'flat',
    label: 'Flatten',
    ic: 'M3 12h18 M12 3v6 M9 6l3 3 3-3 M12 21v-6 M9 18l3-3 3 3',
    kbd: 'Ctrl+E',
    tip: 'veCtxFlatten',
    dis: !selObjs.some(o => !o.img),
    act: flattenSel
  }, {
    sep: 1
  }, {
    k: 'ah-sel',
    label: L.edAhSel,
    ic: 'M3 18C7 18 8 6 12 6s5 12 9 12 M9 6h6',
    tip: 'veAutoHandle',
    dis: !selObjs.some(o => !o.img),
    act: () => autoSel(false, true)
  }, {
    k: 'ah-all',
    label: L.edAhAll,
    ic: 'M3 18C7 18 8 6 12 6s5 12 9 12 M9 6h6 M3 21h4 M17 21h4',
    tip: 'veAutoHandle',
    dis: !doc.objects.some(o => !o.img),
    act: () => autoAll(false, true)
  }, {
    k: 'vc-simplify',
    label: 'Simplify…',
    ic: ICONS.wand,
    kbd: 'S',
    tip: 'veSimplify',
    dis: !selObjs.some(o => !o.img),
    act: () => {
      setTool('simplify');
      openVcSimplify();
    }
  }, {
    sep: 1
  }, {
    k: 'bool-union',
    label: L.edBoolUnion,
    ic: 'M3 3h10v10H3z M11 11h10v10H11z',
    kbd: 'Ctrl+Alt+U',
    tip: 'veBoolUnion',
    dis: selObjs.filter(o => !o.img && !o.text).length < 2,
    act: () => applyBoolean('union')
  }, {
    k: 'bool-subtract',
    label: L.edBoolSubtract,
    ic: 'M3 3h18v18H3z M10 10h8v8h-8z',
    kbd: 'Ctrl+Alt+S',
    tip: 'veBoolSubtract',
    dis: selObjs.filter(o => !o.img && !o.text).length < 2,
    act: () => applyBoolean('subtract')
  }, {
    k: 'bool-intersect',
    label: L.edBoolIntersect,
    ic: 'M8 3h8v18H8z M3 8h18v8H3z',
    kbd: 'Ctrl+Alt+I',
    tip: 'veBoolIntersect',
    dis: selObjs.filter(o => !o.img && !o.text).length < 2,
    act: () => applyBoolean('intersect')
  }, {
    k: 'bool-exclude',
    label: L.edBoolExclude,
    ic: 'M3 3h8v8H3z M13 13h8v8h-8z',
    kbd: 'Ctrl+Alt+X',
    tip: 'veBoolExclude',
    dis: selObjs.filter(o => !o.img && !o.text).length < 2,
    act: () => applyBoolean('exclude')
  }, {
    k: 'outline-stroke',
    label: L.edOutlineStroke,
    ic: 'M4 4h16v16H4z M8 8h8v8H8z',
    kbd: 'Ctrl+Alt+O',
    tip: 'veOutlineStroke',
    dis: !selObjs.some(o => !o.img && o.stroke && o.stroke !== 'none' && o.strokeWidth > 0),
    act: applyOutlineStroke
  }, {
    k: 'offset-path',
    label: L.edOffsetPath,
    ic: 'M7 7h10v10H7z M3 3h18v18H3z',
    tip: 'veOffsetPath',
    dis: !selObjs.some(o => !o.img),
    act: openOffsetStrip
  }, {
    sep: 1
  }, {
    k: 'show-hide',
    label: 'Show/Hide',
    ic: ICONS.eye,
    kbd: 'Ctrl+Shift+H',
    dis: !selObjs.length,
    act: toggleSelHidden
  }, {
    k: 'lock-unlock',
    label: 'Lock/Unlock',
    ic: ICONS.settings,
    kbd: 'Ctrl+Shift+L',
    dis: !selObjs.length,
    act: toggleSelLocked
  }, {
    sep: 1
  }, {
    k: 'flip-h',
    label: 'Flip horizontal',
    ic: 'M12 3v18 M8 7 3 12l5 5V7z M16 7l5 5-5 5V7z',
    kbd: 'Shift+H',
    dis: !selObjs.length,
    act: () => flipXf('h')
  }, {
    k: 'flip-v',
    label: 'Flip vertical',
    ic: 'M3 12h18 M7 8l5-5 5 5H7z M7 16l5 5 5-5H7z',
    kbd: 'Shift+V',
    dis: !selObjs.length,
    act: () => flipXf('v')
  }];

  /* ---- render ---- */
  const cur = panning ? 'var(--cur-grabbing)' : tool === 'hand' || space ? 'var(--cur-grab)' : tool === 'select' && boxHov && boxHov.cur ? boxHov.cur : tool === 'shape' || tool === 'frame' || tool === 'addnode' || tool === 'addhandle' || tool === 'pen' || tool === 'autohandle' ? 'var(--cur-crosshair)' : 'var(--cur-default)';
  const gs = gridStep(),
    showGrid = gridOn,
    ck = 8;
  const nsz = 2.5 / Math.max(2.5, zoom);
  const nTotal = React.useMemo(() => doc.objects.reduce((s, o) => s + vinfo(o).n, 0), [doc.objects]);
  /* GV-002 & GV-003: Viewport Frustum Culling Bounds + Memoized Defs & Scopes */
  const cullPanQx = Math.round((pan.x || 0) / 256);
  const cullPanQy = Math.round((pan.y || 0) / 256);
  const cullBounds = React.useMemo(() => {
    const zNow = zoomRef.current || zoom || 1;
    const pNow = panRef.current || pan || {
      x: 0,
      y: 0
    };
    const bw = boxRectRef.current && boxRectRef.current.width || boxRef.current && boxRef.current.clientWidth || 1920;
    const bh = boxRectRef.current && boxRectRef.current.height || boxRef.current && boxRef.current.clientHeight || 1080;
    /* Margin besar (65% ukuran layar di ruang dunia) agar pan cepat tidak berkedip sebelum state tenang */
    const padX = bw * 0.65 / zNow + 120 / zNow;
    const padY = bh * 0.65 / zNow + 120 / zNow;
    return [-pNow.x / zNow - padX, -pNow.y / zNow - padY, (bw - pNow.x) / zNow + padX, (bh - pNow.y) / zNow + padY];
  }, [zoom, cullPanQx, cullPanQy, doc.objects.length]);
  const gradientDefs = React.useMemo(() => {
    const defs = [];
    for (let i = 0, L = doc.objects.length; i < L; i++) {
      const o = doc.objects[i];
      if (o.hidden) continue;
      if (VE.gradOn(o)) {
        defs.push(o.grad.type === 'radial' ? <radialGradient key={'gr-' + o.id} id={'vgr-' + o.id} gradientUnits="userSpaceOnUse" cx={o.grad.cx} cy={o.grad.cy} r={o.grad.r} fx={o.grad.fx != null ? o.grad.fx : o.grad.cx} fy={o.grad.fy != null ? o.grad.fy : o.grad.cy} spreadMethod={o.grad.spread || 'pad'}>{o.grad.stops.map((t, idx) => <stop key={idx} offset={t.offset} stopColor={t.color} stopOpacity={t.op == null ? 1 : t.op} />)}</radialGradient> : <linearGradient key={'gr-' + o.id} id={'vgr-' + o.id} gradientUnits="userSpaceOnUse" x1={o.grad.x1} y1={o.grad.y1} x2={o.grad.x2} y2={o.grad.y2} spreadMethod={o.grad.spread || 'pad'}>{o.grad.stops.map((t, idx) => <stop key={idx} offset={t.offset} stopColor={t.color} stopOpacity={t.op == null ? 1 : t.op} />)}</linearGradient>);
      }
      if (VE.strokeGradOn(o)) {
        defs.push(o.strokeGrad.type === 'radial' ? <radialGradient key={'sgr-' + o.id} id={'vsgr-' + o.id} gradientUnits="userSpaceOnUse" cx={o.strokeGrad.cx} cy={o.strokeGrad.cy} r={o.strokeGrad.r} fx={o.strokeGrad.fx != null ? o.strokeGrad.fx : o.strokeGrad.cx} fy={o.strokeGrad.fy != null ? o.strokeGrad.fy : o.strokeGrad.cy} spreadMethod={o.strokeGrad.spread || 'pad'}>{o.strokeGrad.stops.map((t, idx) => <stop key={idx} offset={t.offset} stopColor={t.color} stopOpacity={t.op == null ? 1 : t.op} />)}</radialGradient> : <linearGradient key={'sgr-' + o.id} id={'vsgr-' + o.id} gradientUnits="userSpaceOnUse" x1={o.strokeGrad.x1} y1={o.strokeGrad.y1} x2={o.strokeGrad.x2} y2={o.strokeGrad.y2} spreadMethod={o.strokeGrad.spread || 'pad'}>{o.strokeGrad.stops.map((t, idx) => <stop key={idx} offset={t.offset} stopColor={t.color} stopOpacity={t.op == null ? 1 : t.op} />)}</linearGradient>);
      }
      if (o.clipPathD) {
        defs.push(<clipPath key={'ocp-' + o.id} id={'vcp-obj-' + o.id} clipPathUnits="userSpaceOnUse"><path d={o.clipPathD} /></clipPath>);
      }
    }
    return defs;
  }, [doc.objects]);
  const frameBgByGroup = React.useMemo(() => {
    const map = new Map();
    for (let i = 0, L = doc.objects.length; i < L; i++) {
      const o = doc.objects[i];
      if (o.group && !o.hidden && (o.isFrameBg || o.isAutoFrame) && !map.has(o.group)) map.set(o.group, o);
    }
    return map;
  }, [doc.objects]);
  const frameClipDefs = React.useMemo(() => {
    if (!clipFrames) return null;
    return frameBoxes.map(f => {
      const bgObj = frameBgByGroup.get(f.id);
      return <clipPath key={'cp-' + f.id} id={'ved-clip-' + String(f.id).replace(/[^\w-]/g, '_')} clipPathUnits="userSpaceOnUse">{bgObj ? <path data-drag-id={bgObj.id} d={vinfo(bgObj).d} /> : <rect x={f.bb[0]} y={f.bb[1]} width={f.bb[2] - f.bb[0]} height={f.bb[3] - f.bb[1]} />}</clipPath>;
    });
  }, [clipFrames, frameBoxes, frameBgByGroup]);

  /* Saat gpuOn aktif, seluruh scene digambar ke <canvas className="ved-scene-canvas"> (0 DOM <path> di <svg>!) */
  React.useLayoutEffect(() => {
    const sr = sceneRendererRef.current;
    if (!sr || !gpuOn) return;
    sr.setRenderEnv({
      bg,
      showGrid: gridOn,
      clipFrames,
      frameBoxes,
      frameBgByGroup
    });
    sr.setScene(doc, docRevRef.current);
    if (boxRef.current) {
      sr.setCamera(zoomRef.current, panRef.current.x, panRef.current.y, boxRef.current.clientWidth, boxRef.current.clientHeight);
    }
    sr.requestRender();
  }, [doc, bg, gridOn, clipFrames, frameBoxes, frameBgByGroup, gpuOn, prefs && prefs.accent, prefs && prefs.theme]);
  const renderedSceneScopes = React.useMemo(() => {
    /* Jika mode GPU Single-Canvas aktif, JANGAN membuat ratusan/ribuan elemen <path> DOM di dalam <svg>! */
    if (gpuOn) return [];
    const frameSet = new Set(frameBoxes.map(f => f.id));
    let totalVis = 0;
    const scopes = [];
    for (let i = 0, L = doc.objects.length; i < L; i++) {
      const o = doc.objects[i];
      if (o.hidden) continue;
      totalVis++;
      const fid = clipFrames && o.group && !o.isFrameBg && !o.isAutoFrame && frameSet.has(o.group) ? o.group : null;
      const last = scopes[scopes.length - 1];
      if (last && last.fid === fid) last.objs.push(o);else scopes.push({
        fid,
        objs: [o]
      });
    }
    const out = scopes.map(sc => ({
      fid: sc.fid,
      batches: buildScopeBatches(sc.objs, sel.objs)
    }));
    const domPaths = out.reduce((s, sc) => s + sc.batches.length, 0);
    PERF_TELEMETRY.updateSceneMetrics({
      totalObjects: doc.objects.length,
      visibleObjects: totalVis,
      culledObjects: 0,
      domPathCount: domPaths
    });
    return out;
  }, [doc.objects, frameBoxes, clipFrames, sel.objs, gpuOn]);
  const isBgObj = o => o.isFrameBg || o.isAutoFrame;
  /* Deteksi semua sudut (tidak terbatas 4 sudut — mendukung segitiga, persegi, poligon, bintang, dan path kompleks) */
  const cornerTargets = React.useMemo(() => selObjs.some(o => !isBgObj(o) && !o.img && !o.text) ? selObjs.filter(o => !isBgObj(o) && !o.img && !o.text) : selObjs.filter(o => !o.img && !o.text), [selObjs]);
  const detectedCorners = React.useMemo(() => {
    const list = [];
    if (!cornerTargets.length) return list;
    /* Guard performa: jika panel Individual Corner tertutup dan seleksi punya >64 objek, cukup baca dari objek utama */
    const scanObjs = !indivCornerOpen && cornerTargets.length > 16 ? cornerTargets.slice(0, 16) : cornerTargets;
    scanObjs.forEach(o => {
      const bb = vinfo(o).bb;
      const cx = (bb[0] + bb[2]) / 2,
        cy = (bb[1] + bb[3]) / 2;
      const dirArrow = (x, y) => {
        if (!indivCornerOpen) return '';
        const dx = x - cx,
          dy = y - cy;
        if (Math.hypot(dx, dy) < 1e-3) return '•';
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        if (ang >= -22.5 && ang < 22.5) return '→';
        if (ang >= 22.5 && ang < 67.5) return '↘';
        if (ang >= 67.5 && ang < 112.5) return '↓';
        if (ang >= 112.5 && ang < 157.5) return '↙';
        if (ang >= -67.5 && ang < -22.5) return '↗';
        if (ang >= -112.5 && ang < -67.5) return '↑';
        if (ang >= -157.5 && ang < -112.5) return '↖';
        return '←';
      };
      o.subs.forEach(sp => {
        const ns = sp.nodes,
          n = ns.length;
        if (n < 3) return;
        const isPair = (A, B) => A && B && A.fil && B.fil && A.fil.role === 'a' && B.fil.role === 'b' && A.fil.gid === B.fil.gid;
        const wrapPair = sp.closed && n > 2 && isPair(ns[n - 1], ns[0]);
        let cIdx = 0;
        if (wrapPair) {
          const A = ns[n - 1],
            B = ns[0];
          const ap = A.fil.c || {
            x: (A.x + B.x) / 2,
            y: (A.y + B.y) / 2
          };
          const key = o.id + ':' + sp.id + ':' + cIdx++;
          list.push({
            idx: list.length + 1,
            key,
            objId: o.id,
            spId: sp.id,
            nodeIds: [A.id, B.id],
            r: Math.round((A.fil.r || 0) * 10) / 10,
            x: ap.x,
            y: ap.y,
            dir: dirArrow(ap.x, ap.y)
          });
        }
        const startI = wrapPair ? 1 : 0;
        const endI = wrapPair ? n - 1 : n;
        for (let i = startI; i < endI; i++) {
          if (i + 1 < endI && isPair(ns[i], ns[i + 1])) {
            const A = ns[i],
              B = ns[i + 1];
            const ap = A.fil.c || {
              x: (A.x + B.x) / 2,
              y: (A.y + B.y) / 2
            };
            const key = o.id + ':' + sp.id + ':' + cIdx++;
            list.push({
              idx: list.length + 1,
              key,
              objId: o.id,
              spId: sp.id,
              nodeIds: [A.id, B.id],
              r: Math.round((A.fil.r || 0) * 10) / 10,
              x: ap.x,
              y: ap.y,
              dir: dirArrow(ap.x, ap.y)
            });
            i++;
            continue;
          }
          if (!sp.closed && (i === 0 || i === n - 1)) continue;
          const nd = ns[i];
          if (nd.type === 'corner') {
            const key = o.id + ':' + sp.id + ':' + cIdx++;
            list.push({
              idx: list.length + 1,
              key,
              objId: o.id,
              spId: sp.id,
              nodeIds: [nd.id],
              r: 0,
              x: nd.x,
              y: nd.y,
              dir: dirArrow(nd.x, nd.y)
            });
          }
        }
      });
    });
    return list;
  }, [indivCornerOpen, cornerTargets]);

  /* Pastikan pilihan sudut tetap sinkron saat objek berganti */
  useEffect(() => {
    if (!indivCornerOpen) return;
    if (!detectedCorners.length) {
      if (pickedCornerKeys.size) setPickedCornerKeys(new Set());
      return;
    }
    const valid = new Set(detectedCorners.map(c => c.key));
    const filtered = [...pickedCornerKeys].filter(k => valid.has(k));
    if (!filtered.length) {
      setPickedCornerKeys(new Set(detectedCorners.map(c => c.key)));
    } else if (filtered.length !== pickedCornerKeys.size) {
      setPickedCornerKeys(new Set(filtered));
    }
  }, [indivCornerOpen, indivCornerOpen ? detectedCorners.map(c => c.key).join('|') : '']);
  const activeCorners = detectedCorners.filter(c => pickedCornerKeys.has(c.key));
  const curR = (() => {
    if (sel.nodes && sel.nodes.size > 0 && detectedCorners.length) {
      const nodeMatched = detectedCorners.filter(c => c.nodeIds.some(id => sel.nodes.has(id)));
      if (nodeMatched.length) {
        const pos = nodeMatched.filter(c => c.r > 0);
        if (pos.length) return Math.round(pos.reduce((s, c) => s + c.r, 0) / pos.length * 10) / 10;
        return 0;
      }
    }
    const pool = indivCornerOpen && activeCorners.length ? activeCorners : detectedCorners;
    const pos = pool.filter(c => c.r > 0);
    if (pos.length) return Math.round(pos.reduce((s, c) => s + c.r, 0) / pos.length * 10) / 10;
    return 0;
  })();
  const applyRadiusToCorners = (cornersList, r, histKey = 'cr-indiv') => {
    const rad = Math.max(0, Number(r) || 0);
    const byObj = new Map();
    cornersList.forEach(c => {
      let s = byObj.get(c.objId);
      if (!s) byObj.set(c.objId, s = new Set());
      c.nodeIds.forEach(id => s.add(id));
    });
    if (!byObj.size) return;
    let nextSelNodes = new Set(selRef.current.nodes);
    let nodesChanged = false;
    const ch = commitObjs(o => {
      const nids = byObj.get(o.id);
      if (!nids || !nids.size || o.img || o.locked) return o;
      const res = VE.setSelectedNodesRadius(o, nids, rad, {
        mode: cornerMode,
        bevelDeg,
        smooth: cornerSm
      });
      if (nextSelNodes.size) {
        nids.forEach(id => {
          if (nextSelNodes.delete(id)) nodesChanged = true;
        });
        res.newSelIds.forEach(id => {
          if (!nextSelNodes.has(id)) {
            nextSelNodes.add(id);
            nodesChanged = true;
          }
        });
      }
      return res.o;
    }, histKey);
    if (nodesChanged || nextSelNodes.size !== selRef.current.nodes.size) {
      setSel({
        objs: selRef.current.objs,
        nodes: nextSelNodes
      });
    }
    if (!ch && rad > 0) say('Sudut tidak cukup panjang untuk radius tersebut');
  };
  const setRadius = r => {
    const rad = Math.max(0, Number(r) || 0);
    if (sel.nodes && sel.nodes.size > 0) {
      const nodeMatched = detectedCorners.filter(c => c.nodeIds.some(id => sel.nodes.has(id)));
      if (nodeMatched.length > 0) {
        applyRadiusToCorners(nodeMatched, rad, 'cr-nodes');
        return;
      }
    }
    if (indivCornerOpen && activeCorners.length > 0) {
      applyRadiusToCorners(activeCorners, rad, 'cr-sel');
      return;
    }
    if (detectedCorners.length > 0) {
      applyRadiusToCorners(detectedCorners, rad, 'cr');
      return;
    }
    const targets = selObjs.some(o => !isBgObj(o)) ? new Set(selObjs.filter(o => !isBgObj(o)).map(o => o.id)) : sel.objs;
    const ch = commitObjs(o => targets.has(o.id) && !o.img ? VE.setCornerRadius(o, rad, {
      mode: cornerMode,
      bevelDeg,
      smooth: cornerSm
    }) : o, 'cr');
    if (!ch && rad > 0) say('Tidak ada sudut (node corner) yang bisa dibulatkan');
  };
  /* Jika seleksi berisi latar Frame sekaligus anak-anak Frame yang sama (saat memilih Frame utuh),
     targetkan perubahan Fill/Stroke/Gradient ke latar Frame agar tidak menimpa warna seluruh anak di dalamnya */
  const paintObjs = React.useMemo(() => {
    const unlocked = selObjs.filter(o => !o.locked);
    const bgs = unlocked.filter(isBgObj);
    if (bgs.length && unlocked.some(o => !isBgObj(o)) && unlocked.every(o => isBgObj(o) || o.group && bgs.some(b => b.group === o.group))) {
      return bgs;
    }
    return unlocked;
  }, [selObjs]);
  const paintTargetIds = React.useMemo(() => new Set(paintObjs.map(o => o.id)), [paintObjs]);
  const cp = paintObjs.find(o => !o.img) || selObjs.find(o => !o.img) || primary;
  const replaceSelectionColor = (sc, v) => {
    const S = new Set(sc.ids);
    const stopSet = sc.stopKeys && sc.stopKeys.length ? new Set(sc.stopKeys) : null;
    commitObjs(o => {
      if (!S.has(o.id) || o.locked) return o;
      if (sc.kind === 'grad' && VE.gradOn(o) && o.grad) {
        const m = VE.ensureGradModel(o);
        const p = v === 'none' ? {
          hex: sc.hex,
          a: 0
        } : parseColorWithAlpha(v);
        const nextRaw = m.grad.rawStops.map((st, stIdx) => {
          const match = stopSet ? stopSet.has(o.id + '#' + (st.id || stIdx)) : cssToHex(st.color) === sc.hex;
          return match ? {
            ...st,
            color: p.hex,
            op: v === 'none' ? 0 : p.a < 1 ? p.a : st.op ?? 1
          } : st;
        });
        return VE.updateGradStops(m, nextRaw);
      }
      return o[sc.kind] !== v ? {
        ...o,
        [sc.kind]: v
      } : o;
    }, 'selcol:' + sc.kind + ':' + sc.ids[0]);
  };

  /* 3 Grup Aksi Cepat dengan Dropdown (seperti Floating Bar) */
  const SL = ' M4 20L20 4',
    ND = 'M7 7h10v10H7z',
    HD = 'M4 20l7-7 M11 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    ALL = ' M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5';
  const hasObj = selObjs.length > 0;
  const railGroups = [{
    id: 'visGrp',
    title: L.edRailVis,
    items: [{
      tip: 'veShowNodeGlobal',
      d: ND + (showSelNodes ? '' : SL),
      act: toggleGlobalNodes,
      dis: false,
      on: showSelNodes
    }, {
      tip: 'veShowHandleGlobal',
      d: HD + (showSelHandles ? '' : SL),
      act: toggleGlobalHandles,
      dis: false,
      on: showSelHandles
    }]
  }, {
    id: 'objGrp',
    title: L.edRailObj,
    items: [{
      tip: 'veDup',
      d: 'M8 8h12v12H8z M4 16V4h12',
      act: dup,
      dis: !hasObj
    }, {
      tip: 'veDelObj',
      d: ICONS.trash,
      act: delSel,
      dis: !hasObj
    }, {
      tip: 'veUp',
      d: 'M12 19V5 M5 12l7-7 7 7',
      act: () => reorder(true),
      dis: !hasObj
    }, {
      tip: 'veDown',
      d: 'M12 5v14 M19 12l-7 7-7-7',
      act: () => reorder(false),
      dis: !hasObj
    }]
  }, {
    id: 'pathGrp',
    title: L.edRailPath,
    items: [{
      tip: 'veClose',
      d: 'M4 18L10 5L20 13L16 19Z',
      act: () => setClosed(true),
      dis: !hasObj
    }, {
      tip: 'veOpen',
      d: 'M4 18L10 5L20 13L16 19',
      act: () => setClosed(false),
      dis: !hasObj
    }, {
      tip: 'veInsert',
      d: 'M12 7v6 M9 10h6 M3 18h18',
      act: doInsert,
      dis: selNodes.size < 2
    }, {
      tip: 'veDelNode',
      d: 'M9 10h6 M3 18h18',
      act: delSel,
      dis: !selNodes.size
    }, {
      tip: 'veTypeCorner',
      d: 'M4 20L12 5l8 15',
      act: () => applyType('corner'),
      dis: !selNodes.size
    }, {
      tip: 'veAlignSel',
      d: 'M3 12h18 M7 8l-4 4 4 4 M17 8l4 4-4 4',
      act: () => alignSel(false),
      dis: selNodes.size < 2 && !selHandles.size
    }, {
      tip: 'veTypeSmooth',
      d: 'M3 15c3-9 15-9 18 0',
      act: () => applyType('smooth'),
      dis: !selNodes.size
    }, {
      tip: 'veTypeSym',
      d: 'M3 15c3-9 15-9 18 0 M12 6v14',
      act: () => applyType('symmetric'),
      dis: !selNodes.size
    }, {
      tip: 'veSharpen',
      d: 'M5 20V6l14 14',
      act: applySharpen,
      dis: !hasObj
    }, {
      tip: 'veSmoothTb',
      d: 'M3 16c4-10 6-10 9-4s5 6 9-4',
      act: applySmoothNodes,
      dis: !selNodes.size
    }]
  }];
  const renderRailDropdowns = () => railGroups.map(grp => {
    const {
      id,
      title,
      items
    } = grp;
    const curItem = items.find(x => x.tip === lastRailAct[id]) || items.find(x => x.on) || items[0];
    const isOpen = openRailGrp === id;
    const btnRef = railGrpRefs[id];
    return <React.Fragment key={id}><div ref={btnRef} className="fig-rail-grp"><button type="button" className={'dk-b' + (curItem.on ? ' on' : '')} data-tip={curItem.tip} aria-label={TT[curItem.tip] ? TT[curItem.tip].t : curItem.tip} onClick={() => {
          if (curItem.dis) {
            setOpenRailGrp(isOpen ? null : id);
          } else {
            curItem.act();
            setOpenRailGrp(null);
          }
        }}><Vi d={curItem.d} s={19} /></button><button type="button" className="dk-b chev-b" aria-label={L.edChoose + ' ' + title} data-tip-text={L.edChoose + ' ' + title} aria-expanded={isOpen} onClick={e => {
          e.stopPropagation();
          setOpenRailGrp(isOpen ? null : id);
        }}><Chev open={isOpen} /></button></div><Float anchor={btnRef} open={isOpen} onClose={() => setOpenRailGrp(null)} w={252}><div className="text-[10.5px] mut px-2.5 py-1 font-semibold uppercase tracking-wider">{title}</div>{items.map(it => {
          const info = TT[it.tip] || {
            t: it.tip
          };
          const isCur = curItem.tip === it.tip;
          return <div key={it.tip} role="option" aria-selected={!!it.on} className={'opt' + (it.on ? ' on' : '') + (it.dis ? ' opacity-40 pointer-events-none' : '')} data-tip={it.tip} onClick={() => {
            if (it.dis) return;
            setLastRailAct(s => ({
              ...s,
              [id]: it.tip
            }));
            it.act();
            setOpenRailGrp(null);
          }}><span className="sel-l"><Vi d={it.d} s={17} /><span>{info.t}</span></span><span className="flex items-center gap-1.5">{info.k && <span className="text-[10px] font-mono mut px-1.5 py-0.5 rounded bg-[var(--sub)]">{info.k}</span>}<svg className="ck" style={{
                opacity: it.on || isCur ? 1 : 0
              }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></span></div>;
        })}</Float></React.Fragment>;
  });
  return <div ref={rootRef} className={'ved-root' + (full ? ' ved-full' : '')}><div className="fig-workspace"><div className="flex h-full min-h-0 relative select-none order-2 lg:order-none" style={{
        '--lw': pw.l + 'px'
      }}><EditorActionRail L={L} renderRailDropdowns={renderRailDropdowns} />{leftOpen && <EditorLeftSidebar L={L} lang={prefs && prefs.lang || 'id'} onBackToWorkspace={onBackToWorkspace} docRef={docRef} zoomRef={zoomRef} panRef={panRef} saveStatus={saveStatus} onRetrySave={onRetrySave} onRenameProject={onRenameProject} projectName={projectName} doc={doc} nTotal={nTotal} sel={sel} selNodes={selNodes} createFrameSel={createFrameSel} groupSel={groupSel} clipFrames={clipFrames} setClipFrames={setClipFrames} groupSameColor={groupSameColor} setGroupSameColor={setGroupSameColor} layerScrollRef={layerScrollRef} layerTreeDomRef={layerTreeDomRef} layerViewportCtrlRef={layerViewportCtrlRef} tool={tool} pen={pen} penSty={penSty} setPenSty={setPenSty} penRef={penRef} commitObjs={commitObjs} finishPen={finishPen} selObjs={selObjs} autoSel={autoSel} autoAll={autoAll} ahOpt={ahOpt} setAhOpt={setAhOpt} primary={primary} alOpt={alOpt} setAlOpt={setAlOpt} applyNodeAngleAlign={applyNodeAngleAlign} selHandles={selHandles} applyStraight={applyStraight} applyAutoRefine={applyAutoRefine} applyPruneNodes={applyPruneNodes} pruneOpt={pruneOpt} setPruneOpt={setPruneOpt} sOpt={sOpt} setSOpt={setSOpt} vcSimp={vcSimp} vcSimpRetain={vcSimpRetain} openVcSimplify={openVcSimplify} triggerAutoSimplifyLevel={triggerAutoSimplifyLevel} openVcMoreOptions={openVcMoreOptions} updateVcSimplify={updateVcSimplify} cancelVcSimplify={cancelVcSimplify} confirmVcSimplify={confirmVcSimplify} virtualLayerRows={virtualLayerRows} dragLayerIds={dragLayerIds} moveObjsToGroup={moveObjsToGroup} setDragLayerIds={setDragLayerIds} setOverFrameId={setOverFrameId} layerAnchor={layerAnchor} layerFlatIds={layerFlatIds} setSel={setSel} setLayerIns={setLayerIns} renameVal={renameVal} setRenameVal={setRenameVal} renameSkip={renameSkip} setRenamingId={setRenamingId} renamingId={renamingId} layerIns={layerIns} openLayerCtx={openLayerCtx} overFrameId={overFrameId} reorderLayerTo={reorderLayerTo} layerClickSkipExpandRef={layerClickSkipExpandRef} commitRename={commitRename} say={say} dropFrameId={dropFrameId} toggleCollapseGrp={toggleCollapseGrp} ungroupIds={ungroupIds} rzProps={rzProps} />}<button type="button" className={'fig-sidebar-edge-toggle' + (leftOpen ? ' on' : '')} data-tip={leftOpen ? 'veSidebarHide' : 'veSidebarShow'} aria-label={leftOpen ? L.edSidebarHide : L.edSidebarShow} aria-expanded={leftOpen} onPointerDown={e => e.stopPropagation()} onClick={e => {
          e.stopPropagation();
          setLeftOpen(o => !o);
        }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3.5" y="4" width="17" height="16" rx="3.2" /><path d="M9.5 4v16" /><path d={leftOpen ? 'M15 9.5L12.5 12l2.5 2.5' : 'M13 9.5L15.5 12 13 14.5'} /></svg></button></div><div className={'min-w-0 relative order-1 lg:order-none' + (full ? ' ved-fmid' : '')}><div ref={boxRef} className="ved-canvas" data-gpu={gpuOn ? 'on' : 'off'} data-fast-render={gpuOn && (panning || !!dragRef.current || nTotal > 800) ? '1' : '0'} style={full ? {
          flex: 1,
          minHeight: 0,
          cursor: cur,
          userSelect: 'none'
        } : {
          height: 'clamp(360px, 74vh, 840px)',
          cursor: cur,
          userSelect: 'none'
        }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={() => {
          setAddHov(null);
          setHhHov(null);
          setAhHov(null);
        }} onDoubleClick={onDoubleClick} onContextMenu={onCtx} onDragOver={e => {
          if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }} onDrop={e => {
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            e.preventDefault();
            importFiles(e.dataTransfer.files, {
              x: e.clientX,
              y: e.clientY
            });
          }
        }}><canvas key={renderCfg.backendOverride === 'canvas2d' ? 'cv-2d' : 'cv-gl2'} ref={sceneCanvasRef} className="ved-scene-canvas" style={{
            display: gpuOn ? 'block' : 'none',
            zIndex: 0
          }} /><svg width="100%" height="100%" className="ved-svg-host" style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            zIndex: 1
          }}><defs><pattern id="vedchk" width={ck * 2} height={ck * 2} patternUnits="userSpaceOnUse"><rect width={ck * 2} height={ck * 2} fill="var(--card)" /><rect width={ck} height={ck} fill="var(--line)" /><rect x={ck} y={ck} width={ck} height={ck} fill="var(--line)" /></pattern><radialGradient id="hm-lo"><stop offset="0" stopColor="#10b981" stopOpacity="0.9" /><stop offset="1" stopColor="#10b981" stopOpacity="0" /></radialGradient><radialGradient id="hm-mid"><stop offset="0" stopColor="#f59e0b" stopOpacity="0.95" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0" /></radialGradient><radialGradient id="hm-hi"><stop offset="0" stopColor="#ef4444" stopOpacity="1" /><stop offset="1" stopColor="#ef4444" stopOpacity="0" /></radialGradient><pattern id="vedgrid" x={(panRef.current.x % (gs * zoomRef.current) + gs * zoomRef.current) % (gs * zoomRef.current)} y={(panRef.current.y % (gs * zoomRef.current) + gs * zoomRef.current) % (gs * zoomRef.current)} width={gs * zoomRef.current} height={gs * zoomRef.current} patternUnits="userSpaceOnUse"><path d={'M' + gs * zoomRef.current + ' 0H0V' + gs * zoomRef.current} fill="none" stroke="var(--acc)" strokeOpacity="0.14" strokeWidth="1" shapeRendering="crispEdges" /></pattern></defs>{!gpuOn && <rect width="100%" height="100%" fill={bg.mode === 'solid' ? bg.color : 'url(#vedchk)'} pointerEvents="none" />}{!gpuOn && showGrid && <rect width="100%" height="100%" fill="url(#vedgrid)" pointerEvents="none" />}<g ref={vpRef} className="ved-vp-gpu" transform={fmtVpMat(zoomRef.current, panRef.current.x, panRef.current.y)}>{exportArea === 'sel' && selObjs.length > 0 && (() => {
                const bb = VE.docBounds({
                  objects: selObjs
                });
                return bb ? <rect data-drag-extra="1" x={bb[0]} y={bb[1]} width={bb[2] - bb[0]} height={bb[3] - bb[1]} fill="none" stroke="var(--acc)" strokeOpacity="0.8" strokeWidth="1" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null;
              })()}{(!gpuOn || hasTextObj) && <defs>{gradientDefs}{frameClipDefs}</defs>}{gpuOverlayObjs.map(o => {
                if (renamingId === 'ct:' + o.id) return null;
                const safeFid = clipFrames && o.group && !o.isFrameBg && !o.isAutoFrame && frameBoxes.some(f => f.id === o.group) ? 'url(#ved-clip-' + String(o.group).replace(/[^\w-]/g, '_') + ')' : undefined;
                return <CanvasObj key={(o.text ? 'vec-txt-' : 'vec-ovl-') + o.id} o={o} clipAttr={safeFid} />;
              })}{!gpuOn && (() => {
                const renderBatches = batches => batches.map(b => {
                  if (b.objs.length === 1) {
                    const o = b.objs[0];
                    if (o && o.text && renamingId === 'ct:' + o.id) return null;
                    return <CanvasObj key={o.id} o={o} />;
                  }
                  return <CompositePathObj key={'batch-' + b.objs[0].id + '-' + b.objs.length} objs={b.objs} dCombined={b.dCombined} idsStr={b.idsStr} />;
                });
                return renderedSceneScopes.map((sc, sIdx) => {
                  if (!sc.fid) return renderBatches(sc.batches);
                  const safeFid = String(sc.fid).replace(/[^\w-]/g, '_');
                  const bgObj = frameBgByGroup.get(sc.fid);
                  const hasBgStroke = bgObj && bgObj.stroke !== 'none' && bgObj.strokeWidth > 0;
                  const bgStrokeAttr = bgObj && VE.strokeGradOn(bgObj) ? 'url(#vsgr-' + bgObj.id + ')' : bgObj ? bgObj.stroke : 'none';
                  return <React.Fragment key={'fscope-' + safeFid + '-' + sIdx}><g clipPath={'url(#ved-clip-' + safeFid + ')'}>{renderBatches(sc.batches)}</g>{hasBgStroke && <path data-drag-id={bgObj.id} d={vinfo(bgObj).d} fill="none" stroke={bgStrokeAttr} strokeWidth={bgObj.strokeWidth} strokeLinejoin={bgObj.strokeLinejoin || 'round'} strokeLinecap={bgObj.strokeLinecap || 'round'} opacity={bgObj.opacity} pointerEvents="none" />}</React.Fragment>;
                });
              })()}{containerBoxes.map(f => {
                const bb = f.bb,
                  isSel = f.ids.every(id => sel.objs.has(id)),
                  isDrop = dropFrameId === f.id;
                const strokeCol = isDrop ? dropNoNest ? '#f59e0b' : 'var(--acc)' : 'var(--acc)';
                /* Nama Frame & Group membesar saat di-zoom out (zoom < 1) namun dibatasi maksimal 36px (rentang 32-48px) */
                const zLbl = Math.max(1e-4, Math.min(1, zoom));
                const lblFs = Math.min(36, Math.max(15, Math.round(15 / zLbl * 100) / 100));
                const lblOff = Math.min(19.2, Math.max(8, Math.round(8 / zLbl * 100) / 100));
                const dropScale = Math.min(2.4, 1 / zLbl);
                const prefix = f.isFrame ? '# ' : '⧉ ';
                return <g key={'fh-' + f.id} data-drag-container={f.ids.join(',')}><rect x={bb[0]} y={bb[1]} width={bb[2] - bb[0]} height={bb[3] - bb[1]} fill={isDrop && !dropNoNest ? 'var(--acc)' : 'none'} fillOpacity={isDrop && !dropNoNest ? 0.10 : 0} stroke={strokeCol} strokeOpacity={isSel || isDrop ? 1 : f.isFrame ? 0.45 : 0.32} strokeWidth={isDrop ? 1.8 : isSel ? 1.25 : 0.9} strokeDasharray={isDrop && dropNoNest ? '5 3' : !f.isFrame && !isSel ? '4 3' : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" /><text data-frame-lbl="1" data-by={bb[1]} x={bb[0]} y={bb[1] - lblOff} fontSize={lblFs} fontWeight="600" fontFamily="Inter, sans-serif" fill={isSel || isDrop ? strokeCol : 'var(--mut)'} style={{
                    cursor: 'pointer',
                    userSelect: 'none'
                  }} onDoubleClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragRef.current = null;
                    renameSkip.current = false;
                    setRenamingId('cg:' + f.id);
                    setRenameVal(f.id);
                  }} onPointerDown={e => {
                    if (e.button !== 0 || !f.first) return;
                    e.stopPropagation();
                    if (e.detail >= 2) {
                      dragRef.current = null;
                      renameSkip.current = false;
                      setRenamingId('cg:' + f.id);
                      setRenameVal(f.id);
                      return;
                    }
                    if (tool !== 'select') return;
                    const objs = new Set(f.ids);
                    setSel({
                      objs,
                      nodes: new Set()
                    });
                    try {
                      boxRef.current.setPointerCapture(e.pointerId);
                    } catch (x) {}
                    if (viewPend.current || viewSettleTimer.current) flushView();
                    const pStart = toDoc(e.clientX, e.clientY);
                    dragRef.current = {
                      type: 'obj',
                      base: docRef.current,
                      ids: objs,
                      anchor: {
                        x: pStart.x,
                        y: pStart.y
                      },
                      start: pStart,
                      sx: e.clientX,
                      sy: e.clientY,
                      moved: false
                    };
                  }}>{prefix + f.id}</text>{isDrop && <g pointerEvents="none"><rect x={bb[0]} y={bb[1] - 32 * dropScale} width={(dropNoNest ? 240 : 190) * dropScale} height={22 * dropScale} rx={4 * dropScale} fill={dropNoNest ? '#f59e0b' : 'var(--acc)'} /><text x={bb[0] + 7 * dropScale} y={bb[1] - 17 * dropScale} fontSize={Math.min(28.8, 12 * dropScale)} fontWeight="600" fontFamily="sans-serif" fill="#ffffff">{dropNoNest ? 'Ctrl: tidak dimasukkan ke ' + f.id : 'Lepas untuk masuk ke ' + f.id}</text></g>}</g>;
              })}{imgSel && <g data-drag-extra="1" pointerEvents="none">{imgSel.subs[0].nodes.slice(0, 4).map((n, i) => <rect key={'is' + i} x={n.x - 4.5 / zoom} y={n.y - 4.5 / zoom} width={9 / zoom} height={9 / zoom} fill="#fff" stroke="var(--acc)" strokeWidth={1.5 / zoom} pointerEvents="none" />)}</g>}{React.useMemo(() => {
                if (!selObjs.length) return null;
                const [cx0, cy0, cx1, cy1] = cullBounds;
                const visSel = [];
                let visNodeTotal = 0;
                const skipSelCull = selObjs.length <= 64;
                for (let i = 0; i < selObjs.length; i++) {
                  const o = selObjs[i];
                  if (o.text) continue;
                  const info = vinfo(o),
                    bb = info.bb;
                  if (skipSelCull || bb[2] >= cx0 && bb[0] <= cx1 && bb[3] >= cy0 && bb[1] <= cy1) {
                    visSel.push(o);
                    visNodeTotal += info.n;
                  }
                }
                const groupBoxEl = selObjs.length >= 1 && allSelBBox && !activeBox && !isMovingObj ? <rect key="sel-group-bbox" data-drag-extra="1" x={allSelBBox[0]} y={allSelBBox[1]} width={Math.max(0, allSelBBox[2] - allSelBBox[0])} height={Math.max(0, allSelBBox[3] - allSelBBox[1])} fill="none" stroke="var(--acc)" strokeOpacity="0.85" strokeWidth="1" strokeDasharray={selObjs.length > 1 ? '4 3' : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null;
                if (!visSel.length) return groupBoxEl;
                if (visNodeTotal > 600) {
                  /* Untuk seleksi masif (mis. 455 objek / 9.200+ node), hindari merasterisasi 9.200 kurva Bézier non-scaling-stroke di CPU SVG:
                     cukup tampilkan group bounding box agar seleksi & drag tetap instan */
                  return groupBoxEl;
                }
                if (visSel.length > 64) {
                  const dSelCombined = visSel.map(o => vinfo(o).d).join(' ');
                  const idsSelStr = visSel.map(o => o.id).join(',');
                  return <React.Fragment key="sel-batch-frag">{groupBoxEl}<path key="sel-batch-outline" data-drag-batch={idsSelStr} data-sel-heavy="1" d={dSelCombined} fill="none" stroke="var(--acc)" strokeOpacity={isMovingObj ? '1' : '0.75'} strokeWidth={isMovingObj ? '1.5' : '1'} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" /></React.Fragment>;
                }
                return <React.Fragment key="sel-indiv-frag">{groupBoxEl}{visSel.map(o => <path key={'s' + o.id} data-drag-id={o.id} data-sel-heavy="1" d={vinfo(o).d} fill="none" stroke="var(--acc)" strokeOpacity="0.65" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />)}</React.Fragment>;
              }, [selObjs, selObjs.length > 64 ? cullBounds : null, allSelBBox, activeBox])}{selObjs.length === 1 && !pen && (tool === 'select' || tool === 'node') && !selObjs[0].img && VE.gradOn(selObjs[0]) && <GradientCanvasGizmo obj={selObjs[0]} zoom={zoomRef.current || zoom || 1} toDoc={toDoc} commitObjs={commitObjs} live={live} docRef={docRef} push={push} activeStopId={activeStopId} setActiveStopId={setActiveStopId} />}{activeBox && !isMovingObj && (() => {
                const zNow = Math.max(1e-4, zoomRef.current || zoom || 1);
                const corners = activeBox.corners();
                const polyPts = corners.map(p => p.x + ',' + p.y).join(' ');
                const hs = 6 / zNow,
                  hHalf = 3 / zNow;
                return <g className="vc-bbox-overlay" pointerEvents="none"><polygon points={polyPts} fill="none" stroke="var(--acc)" strokeWidth="1" vectorEffect="non-scaling-stroke" />{VE.VC_HANDLES.map(h => {
                    const p = activeBox.toDocPt(h.pos(activeBox.rect));
                    return <rect key={'vch-' + h.idx} data-hx={p.x} data-hy={p.y} x={p.x - hHalf} y={p.y - hHalf} width={hs} height={hs} fill="#ffffff" stroke="var(--acc)" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
                  })}</g>;
              })()}{tool === 'select' && <g data-drag-extra="1"><SelectionRotationAndRedlines zoom={zoom} measureBadge={measureBadge} altMeasure={altMeasure} /></g>}{tool === 'autohandle' && ahHov && (() => {
                const o = doc.objects.find(q => q.id === ahHov.oid);
                if (!o) return null;
                const subs = ahHov.spid && ahOpt.scope !== 'obj' ? o.subs.filter(s => s.id === ahHov.spid) : o.subs;
                return <g pointerEvents="none">{subs.map(sp => <path key={'ah' + sp.id} d={VE.serializeSub(sp)} fill="none" stroke="var(--acc)" strokeWidth={3 / zoom} strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />)}{ahHov.kind === 'node' && <circle cx={ahHov.x} cy={ahHov.y} r={9 / zoom} fill="var(--acc)" fillOpacity="0.16" stroke="var(--acc)" strokeWidth={1.5 / zoom} />}</g>;
              })()}{tool === 'pen' && pen && pen.cur && (() => {
                const f = penFind(doc, pen);
                if (!f || f.sp.closed || !f.sp.nodes.length) return null;
                const L = f.sp.nodes[f.sp.nodes.length - 1],
                  c = pen.cur,
                  P0 = f.sp.nodes[0];
                const d = L.handleOut ? 'M' + L.x + ' ' + L.y + 'C' + L.handleOut.x + ' ' + L.handleOut.y + ' ' + c.x + ' ' + c.y + ' ' + c.x + ' ' + c.y : 'M' + L.x + ' ' + L.y + 'L' + c.x + ' ' + c.y;
                return <g pointerEvents="none"><path d={d} fill="none" stroke="var(--acc)" strokeWidth={1.5 / zoom} strokeDasharray={4 / zoom + ' ' + 3 / zoom} opacity="0.85" /><circle cx={c.x} cy={c.y} r={3 / zoom} fill="var(--acc)" />{pen.close && <circle cx={P0.x} cy={P0.y} r={9 / zoom} fill="var(--acc)" fillOpacity="0.18" stroke="var(--acc)" strokeWidth={1.5 / zoom} />}</g>;
              })()}{React.useMemo(() => {
                if (!shown.length) return null;
                const zNow = Math.max(1e-4, zoomRef.current || zoom || 1);
                /* Ukuran node & bezier handle diperkecil dan dikunci dengan Math.max(2.5, zNow)
                   agar TIDAK PERNAH membesar baik saat di-zoom in maupun saat di-zoom out! */
                const zNodeScale = Math.max(2.5, zNow);
                const r1 = v => Math.round(v * 1e6) / 1e6;
                const nszNow = r1(2.5 / zNodeScale),
                  nsz2 = r1(nszNow * 2);
                const hr = r1(2.1 / zNodeScale),
                  hr2 = r1(hr * 2),
                  hSelR = r1(2.8 / zNodeScale),
                  sr = r1(2.7 / zNodeScale);
                const lineSw = r1(0.85 / zNodeScale),
                  nodeSw = r1(1.0 / zNodeScale);
                const shownNodeCount = shown.reduce((acc, o) => acc + vinfo(o).n, 0);
                if (shownNodeCount > 0) {
                  const pNow = panRef.current || pan || {
                    x: 0,
                    y: 0
                  };
                  const bw = boxRef.current && boxRef.current.clientWidth || 1920;
                  const bh = boxRef.current && boxRef.current.clientHeight || 1080;
                  const padW = bw * 0.85 / zNow + 160 / zNow;
                  const padH = bh * 0.85 / zNow + 160 / zNow;
                  const cx0 = -pNow.x / zNow - padW,
                    cy0 = -pNow.y / zNow - padH;
                  const cx1 = (bw - pNow.x) / zNow + padW,
                    cy1 = (bh - pNow.y) / zNow + padH;
                  /* Matikan deduplikasi sel layar saat zoom >= 1.5x agar semua node & handle yang didekati selalu tampak utuh */
                  const useScreenDedup = shownNodeCount > 800 && zNow < 1.5;
                  const invNodeCell = useScreenDedup ? zNow / (shownNodeCount > 3000 ? 4.5 : 2.8) : 0;
                  const invHandleCell = useScreenDedup ? zNow / (shownNodeCount > 3000 ? 6.5 : 4.0) : 0;
                  const seenNodes = useScreenDedup ? new Set() : null;
                  const seenHandles = useScreenDedup ? new Set() : null;
                  const hLinesArr = [],
                    hDotsArr = [],
                    cRectsArr = [],
                    sCircsArr = [],
                    selRectsArr = [];
                  const selEls = [];
                  const nv = showSelNodes,
                    hVis = showSelHandles;
                  for (let oi = 0; oi < shown.length; oi++) {
                    const o = shown[oi];
                    const bb = vinfo(o).bb;
                    if (shown.length > 64 && (bb[2] < cx0 || bb[0] > cx1 || bb[3] < cy0 || bb[1] > cy1)) continue;
                    for (let si = 0; si < o.subs.length; si++) {
                      const ns = o.subs[si].nodes;
                      for (let ni = 0; ni < ns.length; ni++) {
                        const n = ns[ni];
                        const on = selNodes.has(n.id);
                        if (useScreenDedup && !on) {
                          const nk = (Math.round(n.x * invNodeCell) & 0xffff) << 16 | Math.round(n.y * invNodeCell) & 0xffff;
                          if (seenNodes.has(nk)) continue;
                          seenNodes.add(nk);
                        }
                        const nx = r1(n.x),
                          ny = r1(n.y);
                        const hv = hVis && hOk(o, n);
                        if (hv && n.handleIn) {
                          const isSelH = selHandles.has(n.id + ':in');
                          let drawH = true;
                          if (useScreenDedup && !isSelH) {
                            const hk = (Math.round(n.handleIn.x * invHandleCell) & 0xffff) << 16 | Math.round(n.handleIn.y * invHandleCell) & 0xffff;
                            if (seenHandles.has(hk)) drawH = false;else seenHandles.add(hk);
                          }
                          if (drawH) {
                            const hx = r1(n.handleIn.x),
                              hy = r1(n.handleIn.y);
                            hLinesArr.push(`M${nx} ${ny}L${hx} ${hy}`);
                            if (isSelH) selEls.push(<circle key={n.id + ':in'} cx={hx} cy={hy} r={hSelR} fill="var(--acc)" stroke="var(--acc)" strokeWidth={nodeSw} />);else hDotsArr.push(`M${r1(hx - hr)} ${r1(hy - hr)}h${hr2}v${hr2}h${-hr2}Z`);
                          }
                        }
                        if (hv && n.handleOut) {
                          const isSelH = selHandles.has(n.id + ':out');
                          let drawH = true;
                          if (useScreenDedup && !isSelH) {
                            const hk = (Math.round(n.handleOut.x * invHandleCell) & 0xffff) << 16 | Math.round(n.handleOut.y * invHandleCell) & 0xffff;
                            if (seenHandles.has(hk)) drawH = false;else seenHandles.add(hk);
                          }
                          if (drawH) {
                            const hx = r1(n.handleOut.x),
                              hy = r1(n.handleOut.y);
                            hLinesArr.push(`M${nx} ${ny}L${hx} ${hy}`);
                            if (isSelH) selEls.push(<circle key={n.id + ':out'} cx={hx} cy={hy} r={hSelR} fill="var(--acc)" stroke="var(--acc)" strokeWidth={nodeSw} />);else hDotsArr.push(`M${r1(hx - hr)} ${r1(hy - hr)}h${hr2}v${hr2}h${-hr2}Z`);
                          }
                        }
                        if (nv) {
                          if (on) {
                            if (selNodes.size > 160) {
                              selRectsArr.push(`M${r1(nx - nszNow)} ${r1(ny - nszNow)}h${nsz2}v${nsz2}h${-nsz2}Z`);
                            } else {
                              selEls.push(n.type === 'corner' ? <rect key={'sn-' + n.id} x={nx - nszNow} y={ny - nszNow} width={nsz2} height={nsz2} fill="var(--acc)" stroke="#fff" strokeWidth={nodeSw} /> : <circle key={'sn-' + n.id} cx={nx} cy={ny} r={sr} fill="var(--acc)" stroke="#fff" strokeWidth={nodeSw} />);
                            }
                          } else if (n.type === 'corner') {
                            cRectsArr.push(`M${r1(nx - nszNow)} ${r1(ny - nszNow)}h${nsz2}v${nsz2}h${-nsz2}Z`);
                          } else {
                            sCircsArr.push(`M${nx} ${r1(ny - sr)}l${sr} ${sr}l${-sr} ${sr}l${-sr} ${-sr}Z`);
                          }
                        }
                      }
                    }
                  }
                  const hLines = hLinesArr.join('');
                  const hDots = hDotsArr.join('');
                  const cRects = cRectsArr.join('');
                  const sCircs = sCircsArr.join('');
                  const selRects = selRectsArr.join('');
                  return <g data-drag-nodes="1" pointerEvents="none">{hLines && <path d={hLines} fill="none" stroke="var(--acc)" strokeWidth={lineSw} />}{hDots && <path d={hDots} fill="#ffffff" stroke="var(--acc)" strokeWidth={nodeSw} />}{cRects && <path d={cRects} fill="#ffffff" stroke="var(--acc)" strokeWidth={nodeSw} />}{sCircs && <path d={sCircs} fill="#ffffff" stroke="var(--acc)" strokeWidth={nodeSw} />}{selRects && <path d={selRects} fill="var(--acc)" stroke="#ffffff" strokeWidth={nodeSw} />}{selEls}</g>;
                }
                return <g data-drag-nodes="1">{shown.map(o => o.subs.map(sp => sp.nodes.map(n => {
                    const on = selNodes.has(n.id),
                      hv = showSelHandles && hOk(o, n),
                      nv = showSelNodes;
                    return <g key={n.id}>{hv && n.handleIn && <><line x1={n.x} y1={n.y} x2={n.handleIn.x} y2={n.handleIn.y} stroke="var(--acc)" strokeWidth={lineSw} /><circle cx={n.handleIn.x} cy={n.handleIn.y} r={selHandles.has(n.id + ':in') ? hSelR : hr} fill={selHandles.has(n.id + ':in') ? 'var(--acc)' : '#ffffff'} stroke="var(--acc)" strokeWidth={nodeSw} /></>}{hv && n.handleOut && <><line x1={n.x} y1={n.y} x2={n.handleOut.x} y2={n.handleOut.y} stroke="var(--acc)" strokeWidth={lineSw} /><circle cx={n.handleOut.x} cy={n.handleOut.y} r={selHandles.has(n.id + ':out') ? hSelR : hr} fill={selHandles.has(n.id + ':out') ? 'var(--acc)' : '#ffffff'} stroke="var(--acc)" strokeWidth={nodeSw} /></>}{nv && (n.type === 'corner' ? <rect x={n.x - nszNow} y={n.y - nszNow} width={nszNow * 2} height={nszNow * 2} fill={on ? 'var(--acc)' : '#fff'} stroke={on ? '#fff' : 'var(--acc)'} strokeWidth={nodeSw} /> : <circle cx={n.x} cy={n.y} r={sr} fill={on ? 'var(--acc)' : '#fff'} stroke={on ? '#fff' : 'var(--acc)'} strokeWidth={nodeSw} />)}</g>;
                  })))}</g>;
              }, [shown, zoom > 2.5 ? Math.round(zoom * 2) : 0, shown.length > 64 ? cullBounds : null, showSelNodes, showSelHandles, selNodes, selHandles])}{tool === 'addnode' && addHov && <g pointerEvents="none"><path d={addHov.d} fill="none" stroke="var(--acc)" strokeWidth={3 / zoom} strokeLinecap="round" opacity="0.5" /><circle cx={addHov.x} cy={addHov.y} r={7 / zoom} fill={addHov.kind ? '#f43f5e' : 'var(--acc)'} fillOpacity="0.22" stroke={addHov.kind ? '#f43f5e' : 'var(--acc)'} strokeWidth={1.5 / zoom} /><circle cx={addHov.x} cy={addHov.y} r={2.4 / zoom} fill={addHov.kind ? '#f43f5e' : 'var(--acc)'} />{addHov.kind && <text x={addHov.x + 11 / zoom} y={addHov.y - 9 / zoom} fontSize={10.5 / zoom} fontWeight="600" fontFamily="sans-serif" fill="#f43f5e" stroke="#fff" strokeWidth={3 / zoom} paintOrder="stroke" strokeLinejoin="round">{addHov.label}</text>}</g>}{tool === 'addhandle' && hhHov && <g pointerEvents="none" opacity={hhHov.can ? 1 : 0.55}>{hhHov.prev.in && <><line x1={hhHov.x} y1={hhHov.y} x2={hhHov.prev.in.x} y2={hhHov.prev.in.y} stroke="var(--acc)" strokeWidth={1.2 / zoom} strokeDasharray={3 / zoom} /><circle cx={hhHov.prev.in.x} cy={hhHov.prev.in.y} r={3.5 / zoom} fill="#fff" stroke="var(--acc)" strokeWidth={1.2 / zoom} /></>}{hhHov.prev.out && <><line x1={hhHov.x} y1={hhHov.y} x2={hhHov.prev.out.x} y2={hhHov.prev.out.y} stroke="var(--acc)" strokeWidth={1.2 / zoom} strokeDasharray={3 / zoom} /><circle cx={hhHov.prev.out.x} cy={hhHov.prev.out.y} r={3.5 / zoom} fill="#fff" stroke="var(--acc)" strokeWidth={1.2 / zoom} /></>}<circle cx={hhHov.x} cy={hhHov.y} r={9 / zoom} fill="var(--acc)" fillOpacity="0.16" stroke="var(--acc)" strokeWidth={1.5 / zoom} /><circle cx={hhHov.x} cy={hhHov.y} r={2.6 / zoom} fill="var(--acc)" />{!hhHov.can && <text x={hhHov.x + 12 / zoom} y={hhHov.y - 10 / zoom} fontSize={10.5 / zoom} fontWeight="600" fontFamily="sans-serif" fill="var(--mut)" stroke="#fff" strokeWidth={3 / zoom} paintOrder="stroke" strokeLinejoin="round">Sudah punya handle</text>}</g>}{indivCornerOpen && detectedCorners.length > 0 && <g className="ved-corner-badges">{detectedCorners.map(c => {
                  const on = pickedCornerKeys.has(c.key);
                  const rBadge = 9 / zoom;
                  return <g key={'cb-' + c.key} style={{
                    cursor: 'pointer'
                  }} onPointerDown={e => {
                    e.stopPropagation();
                    setPickedCornerKeys(prev => {
                      const next = new Set(prev);
                      if (next.has(c.key) && next.size > 1) next.delete(c.key);else next.add(c.key);
                      return next;
                    });
                  }}><circle cx={c.x} cy={c.y} r={rBadge} fill={on ? 'var(--acc)' : 'var(--card)'} stroke="var(--acc)" strokeWidth={1.5 / zoom} /><text x={c.x} y={c.y + 3.2 / zoom} textAnchor="middle" fontSize={9.5 / zoom} fontWeight="700" fontFamily="Inter, sans-serif" fill={on ? '#ffffff' : 'var(--acc)'} style={{
                      userSelect: 'none',
                      pointerEvents: 'none'
                    }}>{c.idx}</text></g>;
                })}</g>}{renderCfg.debugMode !== 'none' && <RenderDebugCanvasOverlay doc={doc} zoom={zoom} debugMode={renderCfg.debugMode} cullBounds={cullBounds} />}<rect ref={pixelHoverRectRef} x="0" y="0" width="1" height="1" fill="color-mix(in srgb, var(--acc) 18%, transparent)" stroke="var(--acc)" strokeWidth={1.5 / zoom} style={{
                display: zoom >= 6 && (renderCfg.pixelPreviewMode !== 'smooth' ? renderCfg.pixelGrid !== false : !!renderCfg.pixelGridInSmooth) ? 'block' : 'none',
                pointerEvents: 'none'
              }} />{vcSimp && vcSimp.showOriginal && vcSimp.preview && vcSimp.baseDoc && <g className="vc-original-path-overlay" pointerEvents="none">{vcSimp.baseDoc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.isFrameBg && !o.isAutoFrame && (!vcSimp.baseSel.objs.size || vcSimp.baseSel.objs.has(o.id))).map(o => <path key={'vc-orig-' + o.id} d={VE.serializePath(o)} fill="none" stroke="#f97316" strokeOpacity="0.45" strokeWidth={3 / Math.max(1e-4, zoom)} strokeLinecap="round" strokeLinejoin="round" />)}</g>}{marq && <rect x={marq.x0} y={marq.y0} width={marq.x1 - marq.x0} height={marq.y1 - marq.y0} fill="var(--acc)" fillOpacity="0.12" stroke="var(--acc)" strokeWidth={1 / zoom} strokeDasharray={4 / zoom} pointerEvents="none" />}{snapInd && <g pointerEvents="none">{(snapInd.guides || []).map((g, gi) => {
                  const col = '#F24822';
                  if (g.type === 'line') {
                    const s = 3 / zoom,
                      ends = g.kind !== 'artboard' && g.kind !== 'grid',
                      mx = (g.x1 + g.x2) / 2,
                      my = (g.y1 + g.y2) / 2;
                    return <g key={'gl' + gi} stroke={col} strokeWidth={1 / zoom} fill="none" strokeLinecap="butt"><line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />{ends && <><path d={`M${g.x1 - s} ${g.y1 - s}L${g.x1 + s} ${g.y1 + s}M${g.x1 + s} ${g.y1 - s}L${g.x1 - s} ${g.y1 + s}`} /><path d={`M${g.x2 - s} ${g.y2 - s}L${g.x2 + s} ${g.y2 + s}M${g.x2 + s} ${g.y2 - s}L${g.x2 - s} ${g.y2 + s}`} /></>}{g.label && <><rect x={mx - 12 / zoom} y={my - 7 / zoom} width={24 / zoom} height={14 / zoom} rx={3 / zoom} fill={col} stroke="none" /><text x={mx} y={my + 3.2 / zoom} textAnchor="middle" fontSize={9 / zoom} fontWeight="600" fill="#fff" stroke="none" fontFamily="sans-serif">{g.label}</text></>}</g>;
                  }
                  if (g.type === 'spacing') {
                    const mx = (g.x1 + g.x2) / 2,
                      my = (g.y1 + g.y2) / 2,
                      horiz = Math.abs(g.y2 - g.y1) < 1e-4,
                      tick = 5 / zoom;
                    return <g key={'gs' + gi} stroke="#F24822" strokeWidth={1 / zoom}><line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />{horiz ? <><line x1={g.x1} y1={g.y1 - tick} x2={g.x1} y2={g.y1 + tick} /><line x1={g.x2} y1={g.y2 - tick} x2={g.x2} y2={g.y2 + tick} /></> : <><line x1={g.x1 - tick} y1={g.y1} x2={g.x1 + tick} y2={g.y1} /><line x1={g.x2 - tick} y1={g.y2} x2={g.x2 + tick} y2={g.y2} /></>}<rect x={mx - 14 / zoom} y={my - 7 / zoom} width={28 / zoom} height={14 / zoom} rx={3 / zoom} fill="#F24822" stroke="none" /><text x={mx} y={my + 3.2 / zoom} textAnchor="middle" fontSize={9.5 / zoom} fontWeight="600" fill="#fff" stroke="none" fontFamily="sans-serif">{g.label}</text></g>;
                  }
                  return null;
                })}{snapInd.cross !== false && snapInd.x != null && <g stroke="#F24822" fill="none" strokeWidth={1 / zoom}><path d={'M' + (snapInd.x - 7 / zoom) + ' ' + snapInd.y + 'H' + (snapInd.x + 7 / zoom) + 'M' + snapInd.x + ' ' + (snapInd.y - 7 / zoom) + 'V' + (snapInd.y + 7 / zoom)} />{(snapInd.kind === 'edge' || snapInd.kind === 'hline' || snapInd.kind === 'midpoint' || snapInd.kind === 'perp') && <path d={'M' + snapInd.x + ' ' + (snapInd.y - 6 / zoom) + 'L' + (snapInd.x + 6 / zoom) + ' ' + snapInd.y + 'L' + snapInd.x + ' ' + (snapInd.y + 6 / zoom) + 'L' + (snapInd.x - 6 / zoom) + ' ' + snapInd.y + 'Z'} />}{snapInd.kind === 'node' && <circle cx={snapInd.x} cy={snapInd.y} r={6 / zoom} />}</g>}</g>}</g></svg>{vcSimp && vcSimp.mode === 'slider' && (() => {
            const targetObjs = doc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.isFrameBg && !o.isAutoFrame && (!vcSimp.baseSel.objs.size || vcSimp.baseSel.objs.has(o.id)));
            const bb = targetObjs.length ? VE.docBounds({
              objects: targetObjs
            }) : null;
            const bw = boxRef.current && boxRef.current.clientWidth || 800;
            const bh = boxRef.current && boxRef.current.clientHeight || 600;
            let leftPx = bw / 2,
              topPx = 64;
            if (bb) {
              const cx = (bb[0] + bb[2]) * 0.5 * zoom + pan.x;
              const by = bb[3] * zoom + pan.y + 18;
              leftPx = clampN(cx, 175, Math.max(175, bw - 175));
              topPx = clampN(by, 16, Math.max(16, bh - 128));
            }
            return <EditorSimplifyStrip leftPx={leftPx} topPx={topPx} triggerAutoSimplifyLevel={triggerAutoSimplifyLevel} vcSimp={vcSimp} updateVcSimplify={updateVcSimplify} openVcMoreOptions={openVcMoreOptions} confirmVcSimplify={confirmVcSimplify} cancelVcSimplify={cancelVcSimplify} />;
          })()}{offStrip && (() => {
            const targetObjs = doc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.text && o.subs && o.subs.length && (!offStrip.baseSel.objs.size || offStrip.baseSel.objs.has(o.id)));
            const bb = targetObjs.length ? VE.docBounds({
              objects: targetObjs
            }) : null;
            const bw = boxRef.current && boxRef.current.clientWidth || 800;
            const bh = boxRef.current && boxRef.current.clientHeight || 600;
            let leftPx = bw / 2,
              topPx = 64;
            if (bb) {
              const cx = (bb[0] + bb[2]) * 0.5 * zoom + pan.x;
              const by = bb[3] * zoom + pan.y + 18;
              leftPx = clampN(cx, 175, Math.max(175, bw - 175));
              topPx = clampN(by, 16, Math.max(16, bh - 128));
            }
            return <EditorOffsetStrip leftPx={leftPx} topPx={topPx} offStrip={offStrip} updateOffsetStrip={updateOffsetStrip} confirmOffsetStrip={confirmOffsetStrip} cancelOffsetStrip={cancelOffsetStrip} />;
          })()}{vcSimp && vcSimp.mode === 'dialog' && ReactDOM.createPortal(<div className="ov in" onPointerDown={e => {
            if (e.target === e.currentTarget) cancelVcSimplify();
          }}><div className="hp" role="dialog" aria-label="Simplify" style={{
              maxWidth: 400,
              width: '92vw'
            }} onPointerDown={e => e.stopPropagation()}><div className="flex items-center justify-between mb-3 pb-2" style={{
                borderBottom: '1px solid var(--line)'
              }}><div><div className="text-sm font-semibold">Simplify</div><div className="text-[11px] mut">VectorCraft Least-Squares Cubic Bézier Fitting</div></div><button type="button" className="fig-ibtn" data-tip="uiClose" onClick={cancelVcSimplify} aria-label="Close"><Ico n="x" size={14} /></button></div><div className="space-y-3 text-xs"><div><div className="flex items-center justify-between mb-1"><span className="mut font-medium">Curve Precision / Tolerance</span><button type="button" className="ved-pill text-[10.5px] flex items-center gap-1" style={{
                      padding: '2px 8px'
                    }} onClick={triggerAutoSimplifyLevel}><Ico n="wand" size={12} /><span>Auto</span></button></div><div className="grid grid-cols-[1fr_110px] gap-2 items-center"><Slider min={0} max={100} step={1} value={vcSimp.level} on={lvl => updateVcSimplify({
                      level: lvl,
                      tolerance: Math.round(VE.simplifyLevelTolerance(lvl) * 1000) / 1000
                    })} label="Simplify Level" tip="veSimplifyLevel" /><XfField label="pt" value={vcSimp.tolerance} min={0.001} step={0.1} on={v => updateVcSimplify({
                      tolerance: clampN(v, 0.001, 10000)
                    })} tip="veSimplifyTol" /></div></div><div><div className="flex items-center justify-between mb-1"><span className="mut font-medium">Corner Point Angle Threshold</span><span className="font-mono text-[11px]">{Math.round(vcSimp.angleThreshold)}°</span></div><div className="grid grid-cols-[1fr_110px] gap-2 items-center"><Slider min={0} max={180} step={1} value={vcSimp.angleThreshold} on={v => updateVcSimplify({
                      angleThreshold: v
                    })} label="Angle Threshold" tip="veSimplifyAngle" /><XfField label="\xB0" value={vcSimp.angleThreshold} min={0} step={1} on={v => updateVcSimplify({
                      angleThreshold: clampN(v, 0, 180)
                    })} tip="veSimplifyAngle" /></div></div><div className="space-y-2 pt-1" style={{
                  borderTop: '1px solid var(--line)'
                }}><button type="button" role="checkbox" aria-checked={vcSimp.straightLines} className={'c-chk' + (vcSimp.straightLines ? ' on' : '')} onClick={() => updateVcSimplify({
                    straightLines: !vcSimp.straightLines
                  })}><span className="c-chk-box">{vcSimp.straightLines && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>Convert to Straight Lines</span></button><button type="button" role="checkbox" aria-checked={vcSimp.showOriginal} className={'c-chk' + (vcSimp.showOriginal ? ' on' : '')} onClick={() => updateVcSimplify({
                    showOriginal: !vcSimp.showOriginal
                  })}><span className="c-chk-box">{vcSimp.showOriginal && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>Show Original Path</span></button><button type="button" role="checkbox" aria-checked={vcSimp.retain} className={'c-chk' + (vcSimp.retain ? ' on' : '')} onClick={() => setVcSimp(s => s ? {
                    ...s,
                    retain: !s.retain
                  } : s)}><span className="c-chk-box">{vcSimp.retain && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>Open this dialog with these settings next time</span></button></div><div className="flex items-center justify-between pt-2" style={{
                  borderTop: '1px solid var(--line)'
                }}><div className="flex items-center gap-3"><button type="button" role="checkbox" aria-checked={vcSimp.preview} className={'c-chk' + (vcSimp.preview ? ' on' : '')} onClick={() => updateVcSimplify({
                      preview: !vcSimp.preview
                    })}><span className="c-chk-box">{vcSimp.preview && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}</span><span>Preview</span></button><span className="text-[11px] mut font-mono">Anchor Points: {vcSimp.preview ? `${vcSimp.before} → ${vcSimp.after}` : `${vcSimp.before}`}</span></div><div className="flex items-center gap-1.5"><button type="button" className="btn sec text-xs px-3 py-1.5" onClick={cancelVcSimplify}>Cancel</button><button type="button" className="btn pri text-xs px-4 py-1.5" onClick={confirmVcSimplify}>OK</button></div></div></div></div></div>, document.body)}{renamingId && (renamingId.startsWith('cg:') || renamingId.startsWith('ct:')) && (() => {
            const zNow = zoomRef.current || zoom || 1;
            const pNow = panRef.current || pan || {
              x: 0,
              y: 0
            };
            if (renamingId.startsWith('cg:')) {
              const fid = renamingId.slice(3);
              const fBox = containerBoxes.find(f => f.id === fid);
              if (!fBox) return null;
              const sx = Math.max(8, fBox.bb[0] * zNow + pNow.x);
              const sy = Math.max(8, fBox.bb[1] * zNow + pNow.y - 32);
              return <div className="fld px-2.5 py-1 shadow-lg" style={{
                position: 'absolute',
                left: sx + 'px',
                top: sy + 'px',
                minWidth: 160,
                zIndex: 55,
                background: 'var(--card)',
                border: '1.5px solid var(--acc)'
              }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><CustomTextBox autoFocus={true} selectOnFocus={true} value={renameVal} ariaLabel={L.edRenameFrameGroup} onChange={v => setRenameVal(v)} onCommit={v => commitRename(fid, true, v)} onCancel={() => {
                  renameSkip.current = true;
                  setRenamingId(null);
                }} /></div>;
            }
            const tid = renamingId.slice(3);
            const tObj = doc.objects.find(o => o.id === tid && o.text);
            if (!tObj) return null;
            const t = tObj.text;
            const mb = VE.measureTextBox(t);
            const wx = (t.x || 0) + mb.xOff * (t.scaleX || 1);
            const wy = (t.y || 0) + mb.yTop * (t.scaleY || 1);
            const rawFs = Math.max(1, Number(t.fontSize) || 32);
            const effScaleX = Number(t.scaleX) || 1;
            const effScaleY = Number(t.scaleY) || 1;
            const exactSx = wx * zNow + pNow.x;
            const exactSy = wy * zNow + pNow.y;
            const txtColor = !tObj.fill || tObj.fill === 'none' || tObj.fill === 'transparent' || VE.gradOn(tObj) ? 'var(--ink)' : tObj.fill;
            return <div className="ct-canvas-editor" style={{
              position: 'absolute',
              left: exactSx + 'px',
              top: exactSy + 'px',
              width: Math.max(0.1, mb.w * effScaleX * zNow) + 'px',
              height: Math.max(0.1, mb.h * effScaleY * zNow) + 'px',
              zIndex: 55,
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              padding: 0,
              margin: 0,
              color: txtColor,
              fontFamily: t.fontFamily || 'Inter, system-ui, sans-serif',
              fontWeight: t.fontWeight || 400,
              fontStyle: t.fontStyle === 'oblique' ? 'italic' : t.fontStyle || 'normal',
              fontSize: Math.max(0.1, rawFs * effScaleY * zNow) + 'px',
              lineHeight: Math.max(0.5, Number(t.lineHeight) || 1.2),
              letterSpacing: (Number(t.letterSpacing) || 0) * effScaleX * zNow + 'px',
              wordSpacing: (Number(t.wordSpacing) || 0) * effScaleX * zNow + 'px',
              textAlign: t.textAnchor === 'middle' ? 'center' : t.textAnchor === 'end' ? 'right' : 'left',
              textTransform: t.textTransform && t.textTransform !== 'none' ? t.textTransform : undefined,
              transform: t.rotation ? 'rotate(' + t.rotation + 'deg)' : undefined,
              transformOrigin: '0 0',
              boxSizing: 'border-box',
              overflow: 'visible'
            }} data-doc-x={wx} data-doc-y={wy} data-base-font-size={rawFs} data-scale-x={effScaleX} data-scale-y={effScaleY} data-box-width={mb.w * effScaleX} data-box-height={mb.h * effScaleY} data-measured-width={mb.w} data-letter-spacing={Number(t.letterSpacing) || 0} data-word-spacing={Number(t.wordSpacing) || 0} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><CustomTextBox cls="ct-canvas-inline" canvasScaleX={effScaleX} canvasScaleY={effScaleY} canvasWidth={mb.w} canvasZoom={zNow} canvasLetterSpacing={Number(t.letterSpacing) || 0} canvasWordSpacing={Number(t.wordSpacing) || 0} autoFocus={true} selectOnFocus={true} multiline={true} value={renameVal} ariaLabel={L.edInlineTextPh} onChange={v => {
                setRenameVal(v);
                commitObjs(o => o.id === tid && o.text ? VE.updateTextObj(o, {
                  content: v || ' '
                }) : o, 'p:text-content');
              }} onCommit={v => commitRename(tid, 'text', v)} onCancel={() => {
                renameSkip.current = true;
                setRenamingId(null);
              }} /></div>;
          })()}<EditorFloatingToolbar L={L} lang={prefs && prefs.lang || 'id'} tool={tool} setOpenGrp={setOpenGrp} setTool={setTool} lastGrpTool={lastGrpTool} openGrp={openGrp} grpBtnRefs={grpBtnRefs} vcSimpRef={vcSimpRef} openVcSimplify={openVcSimplify} setShapeOpen={setShapeOpen} say={say} shapeBtn={shapeBtn} shapeOpen={shapeOpen} shapeKind={shapeKind} setShapeKind={setShapeKind} snapMenuBtn={snapMenuBtn} snapOn={snapOn} setSnapOn={setSnapOn} snapMenuOpen={snapMenuOpen} setSnapMenuOpen={setSnapMenuOpen} setSnapCfg={setSnapCfg} snapCfg={snapCfg} gridOn={gridOn} setGridOn={setGridOn} mirrorBtn={mirrorBtn} mirrorCur={mirrorCur} selNodes={selNodes} mirrorOpen={mirrorOpen} setMirrorOpen={setMirrorOpen} MIRROR_OPTS={MIRROR_OPTS} curveDragOn={curveDragOn} setCurveDragOn={setCurveDragOn} commitObjs={commitObjs} sel={sel} selHandles={selHandles} applyMirror={applyMirror} onSettings={onSettings} boolOpen={boolOpen} setBoolOpen={setBoolOpen} boolBtn={boolBtn} selObjs={selObjs} applyBoolean={applyBoolean} applyOutlineStroke={applyOutlineStroke} openOffsetStrip={openOffsetStrip} />{(() => {
            if (typeof window !== 'undefined') {
              window.__geovantaEditorApi = {
                loadTestSvg: (svgStr, label) => {
                  const parsed = VE.parseSVG(svgStr);
                  loadDoc(parsed, label + ' dimuat');
                },
                loadTestDoc: (d, label) => {
                  loadDoc(d, label + ' dimuat');
                },
                setZ: zf => setZ(zf),
                getZoom: () => zoomRef.current,
                runAutomatedBenchmarks: () => {
                  const suites = [[L.edBenchTest01, () => VE.parseSVG(GEOVANTA_BENCHMARK_SUITE.buildCircleSvg()), 1], [L.edBenchTest02, () => VE.parseSVG(GEOVANTA_BENCHMARK_SUITE.buildBezierSvg()), 2], [L.edBenchTest03, () => VE.parseSVG(GEOVANTA_BENCHMARK_SUITE.buildDiagonalSvg()), 1], [L.edBenchTest04, () => VE.parseSVG(GEOVANTA_BENCHMARK_SUITE.buildCompoundSvg()), 1], [L.edBenchDensity1k, () => GEOVANTA_BENCHMARK_SUITE.buildNodeDensityDoc(1000), 1], [L.edBenchDensity10k, () => GEOVANTA_BENCHMARK_SUITE.buildNodeDensityDoc(10000), 1], [L.edBenchZoom, () => VE.parseSVG(GEOVANTA_BENCHMARK_SUITE.buildCircleSvg()), 256], [L.edBenchCoord, () => GEOVANTA_BENCHMARK_SUITE.buildExtremeCoordinateDoc(100000000), 1], [L.edBenchStress, () => GEOVANTA_BENCHMARK_SUITE.buildSeamMosaicDoc(240), 1]];
                  const rows = [];
                  suites.forEach(([name, makeFn, zTest]) => {
                    const d = makeFn();
                    const t0 = performance.now();
                    let verts = 0,
                      fillTris = 0,
                      strokeTris = 0,
                      tolMet = true;
                    d.objects.forEach(o => {
                      const gm = buildObjectGpuBuffers(o, zTest);
                      verts += gm.totalVerts;
                      fillTris += gm.fillTriCount || 0;
                      strokeTris += gm.strokeTriCount || 0;
                      if (gm.tessellationMetadata && !gm.tessellationMetadata.toleranceMet) tolMet = false;
                    });
                    const t1 = performance.now();
                    const hitsBefore = GEOMETRY_CACHE.getStats().hits;
                    if (d.objects[0]) {
                      const colorChangedObj = {
                        ...d.objects[0],
                        fill: '#ff0055'
                      };
                      getObjectTessellationLOD(colorChangedObj, zTest);
                    }
                    const cacheHitVerified = GEOMETRY_CACHE.getStats().hits > hitsBefore;
                    rows.push({
                      name,
                      objs: d.objects.length,
                      zoom: zTest * 100 + '%',
                      lod: Math.floor(Math.log2(zTest)),
                      verts,
                      tris: fillTris + strokeTris,
                      ms: Math.round((t1 - t0) * 100) / 100,
                      tolMet,
                      cacheHitVerified
                    });
                  });
                  if (sceneRendererRef.current) {
                    const prevDoc = sceneRendererRef.current.doc;
                    const testCircleDoc = VE.parseSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="60" fill="#000000" opacity="1"/></svg>');
                    sceneRendererRef.current.doc = testCircleDoc;
                    RENDER_CONFIG.logPartialAlpha = true;
                    const covRes = sceneRendererRef.current._renderSceneToPixelTile(200, 200, 1, 0, 0, -10, -10, 210, 210, 'coverage');
                    const hardRes = sceneRendererRef.current._renderSceneToPixelTile(200, 200, 1, 0, 0, -10, -10, 210, 210, 'hard');
                    RENDER_CONFIG.logPartialAlpha = false;
                    sceneRendererRef.current.doc = prevDoc;
                    rows.push({
                      name: `Bagian 5 — Partial Alpha (Cov:${covRes ? covRes.partialAlphaPixels : 0} vs Hard:${hardRes ? hardRes.partialAlphaPixels : 0})`,
                      objs: 1,
                      zoom: '100%',
                      lod: 0,
                      verts: hardRes ? hardRes.partialAlphaPixels : 0,
                      tris: covRes ? covRes.partialAlphaPixels : 0,
                      ms: 0.1,
                      tolMet: hardRes && hardRes.partialAlphaPixels === 0,
                      cacheHitVerified: true
                    });
                  }
                  setBenchResults(rows);
                  say('Benchmark & Uji Partial Alpha (Bagian 5) selesai dieksekusi');
                  return rows;
                }
              };
            }
            return null;
          })()}{(zoom >= 6 || renderCfg.pixelPreviewMode !== 'smooth') && <div className="ved-panel fade" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 14,
            margin: '0 auto',
            width: 'fit-content',
            maxWidth: 'calc(100% - 28px)',
            zIndex: 42,
            padding: '7px 14px',
            borderRadius: 999,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: 'var(--m3-shadow-md)'
          }}><span className="text-[11px] font-bold flex items-center gap-1.5" style={{
              color: 'var(--acc)'
            }}><Ico n="grid" size={13} /><span ref={pixelModeZoomLblRef}>{renderCfg.pixelPreviewMode === 'hard' ? 'Hard Pixel Solid' : renderCfg.pixelPreviewMode === 'coverage' ? 'Pixel Coverage AA' : 'Smooth Vector'} ({Math.max(1, Math.round(zoom))}×)</span></span><span ref={pixelCoordReadoutRef} className="text-[10.5px] font-mono px-2 py-0.5 rounded-full" style={{
              background: 'var(--sub)',
              border: '1px solid var(--line)'
            }}>{L.edPixel} [0, 0]</span><div className="ved-pills" style={{
              gap: 4
            }}><button type="button" className={'ved-pill text-[10px]' + (renderCfg.pixelPreviewMode === 'smooth' ? ' on' : '')} data-tip="vePxSmooth" onClick={() => setRenderCfg({
                pixelPreviewMode: 'smooth'
              })}>1. Smooth Vector</button><button type="button" className={'ved-pill text-[10px]' + (renderCfg.pixelPreviewMode === 'hard' ? ' on' : '')} data-tip="vePxHard" onClick={() => setRenderCfg({
                pixelPreviewMode: 'hard',
                pixelGrid: true
              })}>3. Hard Pixel (Solid)</button><button type="button" className={'ved-pill text-[10px]' + (renderCfg.pixelPreviewMode === 'coverage' ? ' on' : '')} data-tip="vePxCoverage" onClick={() => setRenderCfg({
                pixelPreviewMode: 'coverage',
                pixelGrid: true
              })}>2. Coverage AA</button></div></div>}</div></div><EditorRightInspector L={L} lang={prefs && prefs.lang || 'id'} canUndo={canUndo} undo={undo} canRedo={canRedo} redo={redo} zoomBy={zoomBy} zoomPctRef={zoomPctRef} displayZoomRef={displayZoomRef} zoom={zoom} zoomSliderDomRef={zoomSliderDomRef} setZ={setZ} zoomToPixels={zoomToPixels} fitView={fitView} selObjs={selObjs} selNodes={selNodes} alignDo={alignDo} xm={xm} xp={xp} setXfPos={setXfPos} xfNodes={xfNodes} setXfDim={setXfDim} lockAR={lockAR} setLockAR={setLockAR} setXfRot={setXfRot} flipXf={flipXf} pin={pin} setPin={setPin} rotPivot={rotPivot} setRotPivot={setRotPivot} scaleStk={scaleStk} setScaleStk={setScaleStk} tool={tool} commitObjs={commitObjs} fontSearch={fontSearch} fontUrlInput={fontUrlInput} setFontUrlStatus={setFontUrlStatus} setFontUrlInput={setFontUrlInput} docRef={docRef} primary={primary} commit={commit} setSel={setSel} say={say} setFontSearch={setFontSearch} fontUrlStatus={fontUrlStatus} customFonts={customFonts} toggleSelHidden={toggleSelHidden} allSelHidden={allSelHidden} setProp={setProp} indivCornerOpen={indivCornerOpen} activeCorners={activeCorners} detectedCorners={detectedCorners} curR={curR} setRadius={setRadius} setIndivCornerOpen={setIndivCornerOpen} cornerMode={cornerMode} setCornerMode={setCornerMode} applyRadiusToCorners={applyRadiusToCorners} setPickedCornerKeys={setPickedCornerKeys} pickedCornerKeys={pickedCornerKeys} paintObjs={paintObjs} isBgObj={isBgObj} paintTargetIds={paintTargetIds} cp={cp} activeStopId={activeStopId} setActiveStopId={setActiveStopId} selectionColors={selectionColors} replaceSelectionColor={replaceSelectionColor} convertFrameToAutoLayout={convertFrameToAutoLayout} lay={lay} layUpd={layUpd} setLay={setLay} layPad={layPad} layItems={layItems} runLayout={runLayout} doc={doc} padToArtboard={padToArtboard} bg={bg} setBg={setBg} importFiles={importFiles} expFmt={expFmt} setExpFmt={setExpFmt} isRasterFmt={isRasterFmt} expScale={expScale} setExpScale={setExpScale} exportArea={exportArea} setExportArea={setExportArea} exportSvg={exportSvg} downloadSvg={downloadSvg} onExportBackup={onExportBackup} /></div>{importModalOpen && ReactDOM.createPortal(<div className="ov in" onPointerDown={e => {
      if (e.target === e.currentTarget) setImportModalOpen(false);
    }}><div className="hp" role="dialog" aria-label="Impor Berkas" style={{
        maxWidth: 480
      }}><div className="flex items-center justify-between mb-3"><div><div className="text-sm font-semibold">{L.impTitle}</div><div className="text-[11px] mut mt-0.5">{L.impHint2}</div></div><button type="button" data-tip="uiClose" className="btn sec" style={{
            padding: 0,
            width: 32,
            height: 32,
            borderRadius: '50%'
          }} onClick={() => setImportModalOpen(false)}><Ico n="x" size={14} /></button></div><div className="drop p-6 rounded-2xl text-center cursor-pointer space-y-2" style={{
          border: '2px dashed var(--line)'
        }} onDragOver={e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }} onDrop={e => {
          e.preventDefault();
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            importFiles(e.dataTransfer.files);
            setImportModalOpen(false);
          }
        }} onClick={async () => {
          if (window.showOpenFilePicker) {
            try {
              const hs = await window.showOpenFilePicker({
                multiple: true
              });
              const fs = await Promise.all(hs.map(h => h.getFile()));
              if (fs.length) {
                importFiles(fs);
                setImportModalOpen(false);
              }
            } catch (e) {}
          } else {
            pasteFromSystem();
            setImportModalOpen(false);
          }
        }}><div className="drop-i inline-flex items-center justify-center w-11 h-11 rounded-xl" style={{
            background: 'var(--sub)',
            color: 'var(--acc)'
          }}><Ico n="upload" size={22} /></div><div className="text-xs font-semibold">{L.impDrop}</div><div className="text-[11px] mut">{L.impSupports}</div></div><div className="mt-3 space-y-2"><div className="text-[11px] mut font-medium">{L.impPaste}</div><div className="fld p-2" style={{
            minHeight: 42
          }}><CustomTextBox value={pasteSvgDraft} ariaLabel={L.impCodeAria} onChange={setPasteSvgDraft} onCommit={v => setPasteSvgDraft(v)} /></div><div className="flex gap-2"><button type="button" className="btn sec flex-1 text-xs" onClick={() => {
              pasteFromSystem();
              setImportModalOpen(false);
            }}><Ico n="copy" size={14} />{L.impPasteClip}</button><button type="button" className="btn pri flex-1 text-xs" disabled={!pasteSvgDraft.trim()} onClick={() => {
              if (pasteText(pasteSvgDraft)) {
                setPasteSvgDraft('');
                setImportModalOpen(false);
              } else say('Kode SVG tidak valid');
            }}>{L.impLoadCode}</button></div></div></div></div>, document.body)}<CtxMenu menu={ctx} items={ctxItems} onClose={() => setCtx(null)} />{full && lmsg && <div className="ved-toast">{lmsg}</div>}</div>;
};
/* ============================================================================
   GEOVANTA WORKSPACE — CORE STORAGE & DATA LAYER (PHASE 1, 2, 3, 7, 9, 10, 11)
   Modules:
   1. WorkspaceDB        — IndexedDB Engine (projects, documents, assets, snapshots, metadata)
   2. AssetManager       — Blob Storage, Object URL Cache, DataURL Migration & Hydration
   3. ThumbnailGenerator — Offscreen Canvas 2D / SVG WebP Preview Generator (max 320x240)
   4. ZipEngine          — Standalone CRC32 + ZIP Archive Reader/Writer for .geovanta
   5. ProjectRepository  — Transactional CRUD, Duplicate, Trash, Snapshots & Backup/Restore
   ============================================================================ */

export { VectorEditor };
export default VectorEditor;
