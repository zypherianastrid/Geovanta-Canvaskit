/**
 * @file src/utils/renderConfigAndTelemetry.jsx
 * @description Konfigurasi pipeline render & telemetri performa frame/memori
 */
import { ACTIVE_DEVICE_PROFILE } from './gpuCapabilities.jsx';
import { GEOMETRY_CACHE } from '../renderer/geometryCache.jsx';

/* =========================================================================
   KONFIGURASI PIPELINE RENDERING HYBRID GEOVANTA (Tahap 1–6)
   - Mengontrol Seam Guard (default: false untuk A/B test), Target Pixel Error (0.25 px),
     Max Bézier Depth (16), Min Segment Length (0.01 px), Local Coordinate Rebasing (Float32),
     Tiered Antialiasing (MSAA / Analytic Edge Coverage / SSAA / FXAA), Backend Override, & 7 Debug Modes.
   ========================================================================= */
const _initDevProf = typeof ACTIVE_DEVICE_PROFILE !== 'undefined' && ACTIVE_DEVICE_PROFILE ? ACTIVE_DEVICE_PROFILE : {
  tier: 'mid-tier',
  maxDpr: 2.0,
  targetPixelError: 0.25,
  maxVerticesPerObject: 32768,
  vramBudgetBytes: 128 * 1024 * 1024
};
const MAX_RENDER_DPR = _initDevProf.maxDpr;
const RENDER_CONFIG = {
  seamGuard: false,
  selectiveSeamGuard: false,
  targetPixelError: _initDevProf.targetPixelError || 0.25,
  maxBezierDepth: 16,
  minSegmentLengthPx: 0.01,
  vertexBudgetPerObject: _initDevProf.maxVerticesPerObject || 65536,
  maxRenderDpr: MAX_RENDER_DPR,
  deviceProfileTier: _initDevProf.tier,
  aaMode: 'msaa',
  // 'msaa' | 'analytic' | 'ssaa' | 'fxaa'
  backendOverride: 'auto',
  // 'auto' | 'webgl2' | 'canvas2d' | 'svg'
  canvasUseCanonicalLOD: true,
  localCoordRebasing: true,
  /* Desain 3 Mode Rendering (Bagian 4 `perbaikan tools geovanta terbaru.md`):
     - 'smooth'   : Mode 1 — Smooth Vector (Default: geometri vektor tetap halus & solid tanpa kotak abu-abu)
     - 'coverage' : Mode 2 — Pixel Coverage Preview (melihat hasil rasterisasi 1x1 beserta partial alpha coverage)
     - 'hard'     : Mode 3 — Hard Pixel Preview (rasterizer biner per-objek: piksel kotak tegas 100% solid tanpa tepi transparan) */
  pixelPreviewMode: 'smooth',
  // 'smooth' | 'hard' | 'coverage'
  pixelBoxZoom: 'smooth',
  // alias sinkron untuk kompatibilitas ('smooth' | 'hard' | 'coverage')
  pixelBoxThreshold: 6,
  pixelGrid: true,
  // Tampilkan garis kotak-kotak piksel 1x1 px saat mode Hard/Coverage aktif
  pixelGridInSmooth: false,
  // Pada Smooth Vector, jangan timpa bentuk solid dengan garis grid kecuali diminta
  logPartialAlpha: false,
  // Log diagnostik `Partial alpha coverage:` ke console saat pengujian Bagian 5
  debugGeometry: false,
  debugMode: 'none' // 'none' | 'original' | 'polyline' | 'mesh' | 'fill_tris' | 'stroke_tris' | 'seam_guard' | 'edge_coverage'
};

const getActivePixelPreviewMode = zoom => {
  const m = RENDER_CONFIG.pixelPreviewMode || RENDER_CONFIG.pixelBoxZoom || 'smooth';
  if (m === 'hard' || m === 'coverage') {
    if (zoom != null && Number.isFinite(zoom) && zoom < 1.5) return 'smooth';
    return m;
  }
  return 'smooth';
};
const isPixelBoxModeActive = zoom => {
  const m = RENDER_CONFIG.pixelPreviewMode || RENDER_CONFIG.pixelBoxZoom || 'smooth';
  return m === 'hard' || m === 'coverage';
};
const updateRenderConfig = patch => {
  if (!patch) return RENDER_CONFIG;
  const geomKeys = ['targetPixelError', 'maxBezierDepth', 'minSegmentLengthPx', 'vertexBudgetPerObject', 'localCoordRebasing', 'seamGuard', 'selectiveSeamGuard'];
  let geomChanged = false;
  if (patch.pixelPreviewMode && !patch.pixelBoxZoom) patch = {
    ...patch,
    pixelBoxZoom: patch.pixelPreviewMode
  };else if (patch.pixelBoxZoom && !patch.pixelPreviewMode) {
    const mapped = patch.pixelBoxZoom === 'off' ? 'smooth' : patch.pixelBoxZoom === 'on' || patch.pixelBoxZoom === 'auto' ? 'hard' : patch.pixelBoxZoom;
    patch = {
      ...patch,
      pixelPreviewMode: mapped,
      pixelBoxZoom: mapped
    };
  }
  for (const k of Object.keys(patch)) {
    if (RENDER_CONFIG[k] !== patch[k]) {
      if (geomKeys.includes(k)) geomChanged = true;
      RENDER_CONFIG[k] = patch[k];
    }
  }
  if (RENDER_CONFIG.debugMode !== 'none') RENDER_CONFIG.debugGeometry = true;
  if (geomChanged && typeof GEOMETRY_CACHE !== 'undefined' && GEOMETRY_CACHE.clearAll) {
    GEOMETRY_CACHE.clearAll();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('geovanta-render-config', {
      detail: {
        ...RENDER_CONFIG,
        geomChanged
      }
    }));
  }
  return {
    ...RENDER_CONFIG
  };
};

/* Real-Time Performance, Tessellation, MSAA Audit & Direct renderFrame() Execution Telemetry */
/* Real-Time Performance, Tessellation, MSAA Audit & Direct renderFrame() Execution Telemetry */
const PERF_TELEMETRY = (() => {
  const MAX_SAMPLES = 120;
  const renderDurations = new Float64Array(MAX_SAMPLES);
  const frameIntervals = new Float64Array(MAX_SAMPLES);
  let rHead = 0,
    rCount = 0,
    fHead = 0,
    fCount = 0,
    lastRenderTs = 0,
    droppedFrames = 0;
  let lastInteractionTs = 0,
    rafProbeActive = false;
  const state = {
    fps: 120,
    nativeHz: 120,
    targetFrameBudgetMs: 8.33,
    uncappedFps: true,
    renderPassMs: 0.4,
    tessellationTimeMs: 0.1,
    lastTessellationMs: 0.1,
    p50: 0.5,
    p95: 1.8,
    p99: 3.2,
    droppedFrames: 0,
    domNodeCount: 0,
    totalObjects: 0,
    visibleObjects: 0,
    culledObjects: 0,
    domPathCount: 0,
    gpuDrawCalls: 0,
    snapQueryMs: 0,
    activeBackend: 'WebGL2 Hardware Engine',
    lodLevel: 0,
    effectiveZoom: 1,
    currentEpsilon: 0.25,
    targetPixelError: 0.25,
    lodSegments: 0,
    totalVertices: 0,
    fillTriangleCount: 0,
    strokeTriangleCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cachedObjectsCount: 0,
    toleranceMet: true,
    partialAlphaPixels: 0,
    pixelPreviewMode: 'smooth',
    maxDepthHitCount: 0,
    budgetHitCount: 0,
    geometryCacheBytes: 0,
    vboBytes: 0,
    textureBytes: 0,
    imageDecodedPixels: 0,
    historyBytes: 0,
    autosaveQueueLagMs: 0,
    lastImportParseMs: 0,
    webglContextLostCount: 0,
    backendFallbackReason: 'none',
    deviceProfileTier: _initDevProf.tier,
    dpr: typeof window !== 'undefined' && window.devicePixelRatio || 1,
    drawingBufferWidth: 0,
    drawingBufferHeight: 0,
    aaDiagnostics: {
      antialiasRequested: true,
      antialiasEnabled: true,
      samples: 4,
      stencilBits: 8,
      drawingBufferWidth: 0,
      drawingBufferHeight: 0
    }
  };
  const recordFrameIntervalSample = dt => {
    if (dt >= 0.4 && dt < 120) {
      frameIntervals[fHead] = dt;
      fHead = (fHead + 1) % MAX_SAMPLES;
      if (fCount < MAX_SAMPLES) fCount++;
      if (fCount >= 3 && (fCount < 8 || (fHead & 15) === 0)) {
        const sub = Array.from(frameIntervals.subarray(0, fCount)).sort((a, b) => a - b);
        /* Gunakan persentil 25% tercepat dari interval frame agar jeda idle tidak menurunkan bacaan Hz native layar 100Hz/120Hz/144Hz/240Hz+ */
        const fastCount = Math.max(1, Math.ceil(sub.length * 0.45));
        let sum = 0;
        for (let i = 0; i < fastCount; i++) sum += sub[i];
        const avgDt = sum / fastCount;
        const measuredFps = Math.max(1, Math.min(1000, Math.round(1000 / Math.max(0.4, avgDt))));
        state.fps = measuredFps;
        if (measuredFps > state.nativeHz || state.nativeHz === 120) {
          state.nativeHz = measuredFps;
          state.targetFrameBudgetMs = Math.round(1000 / measuredFps * 100) / 100;
        }
      }
    }
  };
  const probeNativeRefreshRate = (framesToSample = 28) => {
    if (rafProbeActive || typeof requestAnimationFrame !== 'function') return;
    rafProbeActive = true;
    let prevTs = 0,
      rem = framesToSample;
    const step = ts => {
      const now = ts || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      if (prevTs > 0) recordFrameIntervalSample(now - prevTs);
      prevTs = now;
      if (--rem > 0) requestAnimationFrame(step);else rafProbeActive = false;
    };
    requestAnimationFrame(step);
  };
  if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') {
    probeNativeRefreshRate(32);
  }
  const recordRenderPass = (execMs, nowTs) => {
    const now = nowTs || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    if (execMs >= 0 && execMs < 2000) {
      state.renderPassMs = Math.round(execMs * 100) / 100;
      renderDurations[rHead] = execMs;
      rHead = (rHead + 1) % MAX_SAMPLES;
      if (rCount < MAX_SAMPLES) rCount++;
      const budgetMs = Math.max(16.67, (state.targetFrameBudgetMs || 8.33) * 2.0);
      if (execMs > budgetMs) droppedFrames++;
      state.droppedFrames = droppedFrames;
      if (rCount >= 3 && (rCount < 8 || (rHead & 15) === 0)) {
        const arr = Array.from(renderDurations.subarray(0, rCount)).sort((a, b) => a - b);
        const pick = q => arr[Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * q)))];
        state.p50 = Math.round(pick(0.50) * 100) / 100;
        state.p95 = Math.round(pick(0.95) * 100) / 100;
        state.p99 = Math.round(pick(0.99) * 100) / 100;
      }
    }
    if (lastRenderTs > 0) {
      recordFrameIntervalSample(now - lastRenderTs);
    }
    lastRenderTs = now;
  };
  const recordFrameDelta = dt => recordRenderPass(dt);
  const markInteractionFrame = () => {
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (lastInteractionTs > 0) {
      const dt = now - lastInteractionTs;
      if (dt >= 0.4 && dt < 60) recordFrameIntervalSample(dt);
    }
    lastInteractionTs = now;
    if (!rafProbeActive) probeNativeRefreshRate(12);
  };
  const updateSceneMetrics = metrics => {
    if (!metrics) return;
    if (metrics.totalObjects != null) state.totalObjects = metrics.totalObjects;
    if (metrics.visibleObjects != null) state.visibleObjects = metrics.visibleObjects;
    if (metrics.culledObjects != null) state.culledObjects = metrics.culledObjects;
    if (metrics.domNodeCount != null) state.domNodeCount = metrics.domNodeCount;
    if (metrics.snapQueryMs != null) state.snapQueryMs = Math.round(metrics.snapQueryMs * 100) / 100;
    if (metrics.activeBackend) state.activeBackend = metrics.activeBackend;
    if (metrics.lodLevel != null) state.lodLevel = metrics.lodLevel;
    if (metrics.effectiveZoom != null) state.effectiveZoom = metrics.effectiveZoom;
    if (metrics.currentEpsilon != null) state.currentEpsilon = metrics.currentEpsilon;
    if (metrics.targetPixelError != null) state.targetPixelError = metrics.targetPixelError;
    if (metrics.lodSegments != null) {
      state.lodSegments = metrics.lodSegments;
      state.totalVertices = metrics.lodSegments;
    }
    if (metrics.totalVertices != null) state.totalVertices = metrics.totalVertices;
    if (metrics.fillTriangleCount != null) state.fillTriangleCount = metrics.fillTriangleCount;
    if (metrics.strokeTriangleCount != null) state.strokeTriangleCount = metrics.strokeTriangleCount;
    if (metrics.tessellationTimeMs != null) {
      state.tessellationTimeMs = Math.round(metrics.tessellationTimeMs * 1000) / 1000;
      if (metrics.tessellationTimeMs > 0) state.lastTessellationMs = state.tessellationTimeMs;
    }
    if (metrics.cacheHits != null) state.cacheHits = metrics.cacheHits;
    if (metrics.cacheMisses != null) state.cacheMisses = metrics.cacheMisses;
    if (metrics.cachedObjectsCount != null) state.cachedObjectsCount = metrics.cachedObjectsCount;
    if (metrics.toleranceMet != null) state.toleranceMet = metrics.toleranceMet;
    if (metrics.partialAlphaPixels != null) state.partialAlphaPixels = metrics.partialAlphaPixels;
    if (metrics.pixelPreviewMode != null) state.pixelPreviewMode = metrics.pixelPreviewMode;
    if (metrics.maxDepthHitCount != null) state.maxDepthHitCount = metrics.maxDepthHitCount;
    if (metrics.budgetHitCount != null) state.budgetHitCount = metrics.budgetHitCount;
    if (metrics.dpr != null) state.dpr = Math.round(metrics.dpr * 100) / 100;
    if (metrics.drawingBufferWidth != null) state.drawingBufferWidth = metrics.drawingBufferWidth;
    if (metrics.drawingBufferHeight != null) state.drawingBufferHeight = metrics.drawingBufferHeight;
    if (metrics.aaDiagnostics) state.aaDiagnostics = {
      ...state.aaDiagnostics,
      ...metrics.aaDiagnostics
    };
    if (metrics.domPathCount != null) state.domPathCount = metrics.domPathCount;
    if (metrics.gpuDrawCalls != null) state.gpuDrawCalls = metrics.gpuDrawCalls;
    if (metrics.geometryCacheBytes != null) state.geometryCacheBytes = metrics.geometryCacheBytes;
    if (metrics.vboBytes != null) state.vboBytes = metrics.vboBytes;
    if (metrics.textureBytes != null) state.textureBytes = metrics.textureBytes;
    if (metrics.imageDecodedPixels != null) state.imageDecodedPixels = metrics.imageDecodedPixels;
    if (metrics.historyBytes != null) state.historyBytes = metrics.historyBytes;
    if (metrics.autosaveQueueLagMs != null) state.autosaveQueueLagMs = metrics.autosaveQueueLagMs;
    if (metrics.lastImportParseMs != null) state.lastImportParseMs = metrics.lastImportParseMs;
    if (metrics.webglContextLostCount != null) state.webglContextLostCount = metrics.webglContextLostCount;
    if (metrics.backendFallbackReason != null) state.backendFallbackReason = metrics.backendFallbackReason;
    if (metrics.deviceProfileTier != null) state.deviceProfileTier = metrics.deviceProfileTier;
  };
  const getSnapshot = () => ({
    ...state,
    config: {
      ...RENDER_CONFIG
    }
  });
  const getBadgeText = gpuEnabled => {
    if (!gpuEnabled || RENDER_CONFIG.backendOverride === 'svg') return `SVG DOM · ${state.fps} FPS (Uncapped)`;
    const aa = state.aaDiagnostics && state.aaDiagnostics.antialiasEnabled ? `MSAA ${state.aaDiagnostics.samples || 1}x` : RENDER_CONFIG.aaMode.toUpperCase();
    return `${state.fps} FPS (Uncapped) · p95 ${state.p95.toFixed(2)}ms · ${state.activeBackend} (${aa})`;
  };
  return {
    recordRenderPass,
    recordFrameDelta,
    markInteractionFrame,
    updateSceneMetrics,
    getSnapshot,
    getBadgeText,
    state
  };
})();

export { MAX_RENDER_DPR, RENDER_CONFIG, getActivePixelPreviewMode, isPixelBoxModeActive, updateRenderConfig, PERF_TELEMETRY };
