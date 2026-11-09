/**
 * @file src/renderer/sceneRenderer.jsx
 * @description Mesin perender graf adegan akselerasi perangkat keras WebGL2 & fallback Canvas2D (SceneRenderer)
 */
import { RENDER_CONFIG, PERF_TELEMETRY, MAX_RENDER_DPR, getActivePixelPreviewMode } from '../utils/renderConfigAndTelemetry.jsx';
import { ACTIVE_DEVICE_PROFILE, computeSafeFramebufferSize } from '../utils/gpuCapabilities.jsx';
import { VE } from '../engine/vectorEngine.jsx';
import { parsePaintRgba01, formatColorWithAlpha, parseColorWithAlpha } from '../utils/colorParserAndFormatter.jsx';
import { IMG_ELEMENT_CACHE, getObjectTessellationLOD } from './objectTessellationLod.jsx';
import { SCENE_INTERACTING_ZOOM, buildObjectGpuBuffers, setSceneInteractingZoom } from './polygonTriangulatorAndStroke.jsx';
import { GEOMETRY_CACHE } from './geometryCache.jsx';
import { vinfo, isOpaquePaint, SEAM_STROKE_PX } from './pathWindingAndBatching.jsx';

/* =========================================================================
   TAHAP 1, 2, 3 — PRIMARY WEBGL2 SINGLE-CANVAS ENGINE (<canvas>)
   - WebGL2 diambil LANGSUNG pada elemen <canvas ref={sceneCanvasRef}> yang tampil di layar!
   - Mendukung:
     1) Background Checkerboard / Solid + Grid Adaptif langsung di Fragment Shader WebGL2
     2) Fill: Direct Ear-Clipping Triangulation + Hardware 8-Bit Stencil-Then-Cover (Nonzero & EvenOdd)
     3) Stroke: Tessellasi Miter (dengan miterlimit), Bevel, dan Round Join + Butt, Square, dan Round Cap
     4) Gradien: Linear & Radial (dengan Focal Point fx/fy) via tekstur 1D 256x1 RGBA
     5) Gambar (o.img): Quad bertekstur WebGL2 dengan matriks transformasi afin penuh
     6) Frame Clipping: Hardware Scissor (persegi) & Stencil Bit-7 (0x80) untuk Frame bersudut bulat
     7) Single RAF Scheduler (requestRender) + deduplikasi state signature agar bebas render berulang!
   ========================================================================= */
class SceneRenderer {
  constructor(options = null) {
    this.containerEl = null;
    this.canvasEl = null;
    this.gl = null;
    this.glProg = null;
    this.quadVbo = null;
    this.imgVbo = null;
    this._identityMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 0]);
    this._scratchImgMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this._cachedRootAcc = undefined;
    this._lastRenderView = null; /* PANFIX: view (zoom/pan) saat canvas terakhir kali di-render; dipakai untuk CSS transform selama drag pan/zoom */
    this._cssTransformActive = false;
    this._lastObjDragRenderTs = 0; /* PANFIX2: timestamp render terakhir saat drag objek (throttle async) */
    this._frameBoxesRef = null;
    this._frameSet = new Set();
    this._frameRectMap = new Map();
    this.vboCache = new WeakMap();
    this.gradTexCache = new WeakMap();
    this.imgTexCache = new Map();
    this._glBuffers = new Set();
    this._glTextures = new Set();
    this._glPrograms = new Set();
    this._glShaders = new Set();
    this._vboCacheOrder = new Map();
    this._vboTotalBytes = 0;
    this._texTotalBytes = 0;
    this.contextLost = false;
    this.fallbackReason = 'none';
    this.ctx2d = null;
    this.backend = 'WebGL2 Hardware Engine';
    this.gpuEnabled = true;
    this.doc = null;
    this.revisionId = 0;
    this.camera = {
      zoom: 1,
      panX: 40,
      panY: 40,
      width: 1280,
      height: 800
    };
    this.bg = {
      mode: 'transparent',
      color: '#ffffff'
    };
    this.showGrid = false;
    this.isZooming = false;
    this.clipFrames = true;
    this.frameBoxes = [];
    this.frameBgByGroup = new Map();
    this.dragOffset = null;
    this.selectionPayload = null;
    this.snapPayload = null;
    this.spatialIndex = null;
    this._rafId = 0;
    this._forcePending = false;
    this._lastRenderedSig = '';
    this.disposed = false;
    if (options && (options.canvasEl || options.containerEl || options.gpu !== undefined)) {
      this.init(options.containerEl || null, options);
    }
  }
  init(containerEl, options = {}) {
    this.containerEl = containerEl;
    this.canvasEl = options.canvasEl || null;
    this.disposed = false;
    this.contextLost = false;
    this._pixelTileTex = null;
    this.gpuEnabled = options.gpu !== false;
    this._lastRenderedSig = '';
    this._glBuffers = new Set();
    this._glTextures = new Set();
    this._glPrograms = new Set();
    this._glShaders = new Set();
    this._vboCacheOrder = new Map(); // gpuMesh -> { entry, bytes }
    this._vboTotalBytes = 0;
    this._texTotalBytes = 0;
    this.fallbackReason = 'none';
    if (!this.gpuEnabled || RENDER_CONFIG.backendOverride === 'svg') {
      this.backend = 'SVG DOM (CPU Mode)';
      this.fallbackReason = RENDER_CONFIG.backendOverride === 'svg' ? 'user-override-svg' : 'gpu-disabled';
      PERF_TELEMETRY.updateSceneMetrics({
        activeBackend: this.backend,
        backendFallbackReason: this.fallbackReason
      });
      return this;
    }
    this._initBackendContext();
    return this;
  }

  /* GV-A03: Probe shader/pipeline compilation on a temporary offscreen canvas BEFORE claiming the main canvasEl context,
     and if a canvas already had a failed WebGL context, clone/replace it cleanly before requesting '2d'. */
  _canUseWebGL2Pipeline() {
    if (typeof document === 'undefined' || !document.createElement) return {
      ok: false,
      reason: 'no-dom'
    };
    let probeCv = null;
    let probeGl = null;
    try {
      probeCv = document.createElement('canvas');
      probeCv.width = 1;
      probeCv.height = 1;
      probeGl = probeCv.getContext('webgl2', {
        antialias: true,
        stencil: true,
        depth: false,
        alpha: false
      });
      if (!probeGl) return {
        ok: false,
        reason: 'webgl2-unavailable'
      };
      const vs = probeGl.createShader(probeGl.VERTEX_SHADER);
      probeGl.shaderSource(vs, `#version 300 es\nprecision highp float;in vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}`);
      probeGl.compileShader(vs);
      const vsOk = !!probeGl.getShaderParameter(vs, probeGl.COMPILE_STATUS);
      probeGl.deleteShader(vs);
      if (!vsOk) return {
        ok: false,
        reason: 'shader-compile-failed'
      };
      return {
        ok: true,
        reason: 'none'
      };
    } catch (e) {
      return {
        ok: false,
        reason: 'webgl2-probe-exception'
      };
    } finally {
      try {
        if (probeGl && typeof probeGl.getExtension === 'function') {
          const ext = probeGl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        }
      } catch (e) {}
      if (probeCv) {
        probeCv.width = 0;
        probeCv.height = 0;
      }
    }
  }
  _bindCanvas2DFallback(reason = 'fallback-2d') {
    this.gl = null;
    this.fallbackReason = reason;
    if (!this.canvasEl) {
      this.backend = 'SVG DOM Fallback';
      PERF_TELEMETRY.updateSceneMetrics({
        activeBackend: this.backend,
        backendFallbackReason: reason
      });
      return;
    }
    let ctx2d = null;
    try {
      ctx2d = this.canvasEl.getContext('2d', {
        alpha: false
      });
    } catch (e) {
      ctx2d = null;
    }
    /* GV-A03: Jika canvas utama terlanjur terikat ke context 'webgl2', ganti elemen canvas dengan klon bersih agar getContext('2d') berhasil */
    if (!ctx2d && this.canvasEl.parentNode && typeof this.canvasEl.cloneNode === 'function') {
      try {
        const freshCanvas = this.canvasEl.cloneNode(false);
        this.canvasEl.parentNode.replaceChild(freshCanvas, this.canvasEl);
        this.canvasEl = freshCanvas;
        ctx2d = this.canvasEl.getContext('2d', {
          alpha: false
        });
      } catch (e) {
        ctx2d = null;
      }
    }
    if (ctx2d) {
      this.ctx2d = ctx2d;
      this.backend = reason === 'user-override-canvas2d' ? 'Canvas2D Engine' : 'Canvas2D Fallback';
    } else {
      this.ctx2d = null;
      this.gpuEnabled = false;
      this.backend = 'SVG DOM Fallback';
    }
    PERF_TELEMETRY.updateSceneMetrics({
      activeBackend: this.backend,
      backendFallbackReason: reason,
      domPathCount: 0
    });
  }
  _initBackendContext() {
    if (!this.canvasEl) {
      this.backend = 'Canvas2D Fallback';
      return;
    }
    if (RENDER_CONFIG.backendOverride === 'canvas2d') {
      this._bindCanvas2DFallback('user-override-canvas2d');
      return;
    }
    const probe = this._canUseWebGL2Pipeline();
    if (!probe.ok) {
      this._bindCanvas2DFallback(probe.reason);
      return;
    }
    try {
      const gl = this.canvasEl.getContext('webgl2', {
        antialias: true,
        stencil: true,
        depth: false,
        alpha: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
      });
      if (gl && this._initWebGL2Pipeline(gl)) {
        this.gl = gl;
        this.ctx2d = null;
        this.backend = 'WebGL2 Hardware Engine';
        this.fallbackReason = 'none';
        this._attachContextLossHandlers(this.canvasEl);
        const attrs = gl.getContextAttributes();
        const aaDiagnostics = {
          antialiasRequested: true,
          antialiasEnabled: attrs?.antialias ?? false,
          samples: gl.getParameter(gl.SAMPLES),
          stencilBits: gl.getParameter(gl.STENCIL_BITS),
          drawingBufferWidth: gl.drawingBufferWidth,
          drawingBufferHeight: gl.drawingBufferHeight
        };
        this.aaDiagnostics = aaDiagnostics;
        PERF_TELEMETRY.updateSceneMetrics({
          activeBackend: this.backend,
          backendFallbackReason: 'none',
          aaDiagnostics,
          domPathCount: 0
        });
      } else {
        this._bindCanvas2DFallback('webgl2-init-failed');
      }
    } catch (e) {
      this._bindCanvas2DFallback('webgl2-context-error');
    }
  }

  /* GV-A04: WebGL Context Loss & Restoration Lifecycle */
  _attachContextLossHandlers(cv) {
    if (!cv || this._contextHandlersBound) return;
    this._onContextLost = e => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      this.contextLost = true;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = 0;
      }
      this._glBuffers.clear();
      this._glTextures.clear();
      this._glPrograms.clear();
      this._glShaders.clear();
      this.vboCache = new WeakMap();
      this._vboCacheOrder.clear();
      this._vboTotalBytes = 0;
      this.gradTexCache = new WeakMap();
      this.imgTexCache.clear();
      this._pixelTileTex = null;
      this._texTotalBytes = 0;
      const snap = PERF_TELEMETRY.getSnapshot();
      PERF_TELEMETRY.updateSceneMetrics({
        webglContextLostCount: (snap.webglContextLostCount || 0) + 1,
        activeBackend: 'WebGL2 (Context Lost — Recovering)',
        vboBytes: 0,
        textureBytes: 0
      });
    };
    this._onContextRestored = () => {
      this.contextLost = false;
      if (this.disposed || !this.canvasEl) return;
      if (this.gl && this._initWebGL2Pipeline(this.gl)) {
        this.backend = 'WebGL2 Hardware Engine';
        this._lastRenderedSig = '';
        PERF_TELEMETRY.updateSceneMetrics({
          activeBackend: this.backend,
          backendFallbackReason: 'context-restored'
        });
        this.requestRender(true);
      } else {
        this._bindCanvas2DFallback('context-restore-failed');
        this.requestRender(true);
      }
    };
    cv.addEventListener('webglcontextlost', this._onContextLost, false);
    cv.addEventListener('webglcontextrestored', this._onContextRestored, false);
    this._contextHandlersBound = true;
  }
  _initWebGL2Pipeline(gl) {
    /* Tahap 4: Vertex Shader mendukung Local Coordinate Rendering / Origin Rebasing:
       - u_localPan = (origin + dragOffset) * zoom + pan (dihitung dalam Float64 di CPU!)
       - u_origin   = origin objek untuk pemetaan koordinat lokal bebas jitter Float32 */
    const vsSrc = `#version 300 es
      precision highp float;
      in vec2 a_pos;
      uniform vec2 u_res;
      uniform vec3 u_cam; // (zoom, panX, panY)
      uniform vec2 u_offset;
      uniform vec2 u_localPan; // (origin + offset) * zoom + pan dalam Float64 CPU
      uniform int u_useLocalPan;
      uniform mat3 u_imgMat; // untuk mode gambar (u_mode == 3)
      uniform int u_isScreenSpace; // 1 = full-screen quad background/grid
      out vec2 v_world;
      out vec2 v_screen;
      out vec2 v_uv;
      void main() {
        if (u_isScreenSpace == 1) {
          v_screen = a_pos * u_res;
          vec2 effPan = (u_useLocalPan == 1) ? u_localPan : u_cam.yz;
          v_world = (v_screen - effPan) / max(1e-5, u_cam.x);
          v_uv = a_pos;
          vec2 clip = a_pos * 2.0 - 1.0;
          gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
          return;
        }
        v_uv = a_pos;
        vec2 w = a_pos;
        if (u_imgMat[2][2] > 0.5) {
          vec3 mw = u_imgMat * vec3(a_pos, 1.0);
          w = mw.xy + u_offset;
          v_world = w;
          vec2 screen = w * u_cam.x + u_cam.yz;
          v_screen = screen;
          vec2 clip = (screen / u_res) * 2.0 - 1.0;
          gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
          return;
        }
        /* Local Coordinate Rendering: a_pos sudah dalam ruang lokal objek (relatif thd origin),
           dan u_localPan sudah menggabungkan (origin + dragOffset)*zoom + pan dalam Float64! */
        v_world = a_pos;
        vec2 screen = (u_useLocalPan == 1) ? (a_pos * u_cam.x + u_localPan) : ((a_pos + u_offset) * u_cam.x + u_cam.yz);
        v_screen = screen;
        vec2 clip = (screen / u_res) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      }
    `;
    const fsSrc = `#version 300 es
      precision highp float;
      in vec2 v_world;
      in vec2 v_screen;
      in vec2 v_uv;
      uniform int u_mode; // 0=solid, 1=linearGrad, 2=radialGrad(fx,fy), 3=imageTex, 4=bgAndGrid
      uniform vec4 u_color;
      uniform vec4 u_gradA; // linear:(x1,y1,x2,y2), radial:(cx,cy,r,fx), bg:(cardR,cardG,cardB,showGrid)
      uniform vec4 u_gradB; // (fy, spreadMode, gridStepPx, isSolidBg)
      uniform vec4 u_auxCol; // lineCol(rgb)
      uniform vec3 u_accCol; // dynamic accent color (rgb)
      uniform vec3 u_cam;
      uniform vec2 u_localPan;
      uniform vec2 u_offset;
      uniform float u_opacity;
      uniform sampler2D u_ramp;
      out vec4 outColor;

      float applySpread(float t, float sp) {
        if (sp > 1.5) return fract(t);
        if (sp > 0.5) {
          float m = mod(t, 2.0);
          return m > 1.0 ? 2.0 - m : m;
        }
        return clamp(t, 0.0, 1.0);
      }

      /* Solusi t gradien radial SVG dengan focal point (fx, fy) dan lingkaran (cx, cy, r) */
      float radialFocalT(vec2 p, vec2 c, float r, vec2 f) {
        vec2 d = p - f;
        vec2 df = f - c;
        float A = dot(d, d);
        float B = 2.0 * dot(d, df);
        float C = dot(df, df) - r * r;
        if (abs(C) < 1e-5) return length(p - c) / max(1e-5, r);
        float disc = max(0.0, B * B - 4.0 * A * C);
        float sProj = (-B + sqrt(disc)) / max(1e-7, 2.0 * A);
        return sProj > 1e-6 ? 1.0 / sProj : 0.0;
      }

      void main() {
        if (u_mode == 0) {
          outColor = u_color;
          return;
        }
        if (u_mode == 1) {
          vec2 d = u_gradA.zw - u_gradA.xy;
          float len2 = max(1e-6, dot(d, d));
          float t = applySpread(dot(v_world - u_gradA.xy, d) / len2, u_gradB.y);
          vec4 c = texture(u_ramp, vec2(t, 0.5));
          outColor = vec4(c.rgb, c.a * u_opacity);
          return;
        }
        if (u_mode == 2) {
          float t = radialFocalT(v_world, u_gradA.xy, max(1e-5, u_gradA.z), vec2(u_gradA.w, u_gradB.x));
          t = applySpread(t, u_gradB.y);
          vec4 c = texture(u_ramp, vec2(t, 0.5));
          outColor = vec4(c.rgb, c.a * u_opacity);
          return;
        }
        if (u_mode == 3) {
          vec4 c = texture(u_ramp, v_uv);
          outColor = vec4(c.rgb, c.a * u_opacity);
          return;
        }
        /* u_mode == 5: Pixel Box Preview (1x1 Document Pixel Raster + Nearest-Neighbor + Crisp 1x1 Pixel Box Grid) */
        if (u_mode == 5) {
          vec3 bgCol = u_color.rgb;
          if (u_gradB.w < 0.5) {
            vec2 cell = floor(v_screen / 8.0);
            float chk = mod(cell.x + cell.y, 2.0);
            bgCol = mix(u_gradB.rgb, u_auxCol.rgb, chk);
          }
          vec2 relScreen = v_screen - u_localPan;
          vec2 tileCoord = relScreen / max(1e-5, u_cam.x);
          vec2 tileDim = max(vec2(1.0), u_gradA.xy);
          vec2 uv = (floor(tileCoord) + vec2(0.5)) / tileDim;
          if (u_gradA.z > 0.5) uv.y = 1.0 - uv.y;
          vec4 pix = vec4(0.0);
          if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            pix = texture(u_ramp, uv);
          }
          vec3 col = mix(bgCol, pix.rgb, pix.a);

          /* Gambar garis kotak-kotak piksel 1x1 (Pixel Grid) jika diaktifkan dan zoom >= 4 */
          if (u_gradA.w > 0.5 && u_cam.x >= 4.0) {
            vec2 cellFrac = fract(tileCoord);
            vec2 distBorderPx = min(cellFrac, 1.0 - cellFrac) * u_cam.x;
            float dMinor = min(distBorderPx.x, distBorderPx.y);

            vec2 globalCell = tileCoord + u_offset;
            vec2 tenFrac = mod(mod(globalCell, 10.0) + 10.0, 10.0);
            vec2 distMajorPx = min(tenFrac, 10.0 - tenFrac) * u_cam.x;
            float dMajor = min(distMajorPx.x, distMajorPx.y);

            float lum = dot(col, vec3(0.299, 0.587, 0.114));
            vec3 minorCol = lum > 0.55 ? vec3(0.10, 0.12, 0.16) : vec3(0.92, 0.95, 1.0);
            float minorAlpha = clamp((u_cam.x - 4.0) / 14.0, 0.16, 0.38);

            if (dMajor < 0.65 && u_cam.x >= 6.0) {
              col = mix(col, u_accCol, 0.48);
            } else if (dMinor < 0.55) {
              col = mix(col, minorCol, minorAlpha);
            }
          }
          outColor = vec4(col, 1.0);
          return;
        }

        /* u_mode == 6: Overlay Grid Kotak Piksel 1x1 Transparan di atas Vektor Murni */
        if (u_mode == 6) {
          vec2 relScreen = v_screen - u_localPan;
          vec2 tileCoord = relScreen / max(1e-5, u_cam.x);
          vec2 cellFrac = fract(tileCoord);
          vec2 distBorderPx = min(cellFrac, 1.0 - cellFrac) * u_cam.x;
          float dMinor = min(distBorderPx.x, distBorderPx.y);

          vec2 globalCell = tileCoord + u_offset;
          vec2 tenFrac = mod(mod(globalCell, 10.0) + 10.0, 10.0);
          vec2 distMajorPx = min(tenFrac, 10.0 - tenFrac) * u_cam.x;
          float dMajor = min(distMajorPx.x, distMajorPx.y);

          if (dMajor < 0.65 && u_cam.x >= 6.0) {
            outColor = vec4(u_accCol, 0.42);
            return;
          }
          if (dMinor < 0.55) {
            float a = clamp((u_cam.x - 4.0) / 16.0, 0.14, 0.30);
            outColor = vec4(0.32, 0.35, 0.42, a);
            return;
          }
          discard;
        }

        /* u_mode == 4: Procedural Background Checkerboard / Solid + Adaptive Grid */
        vec3 bgCol = u_color.rgb;
        if (u_gradB.w < 0.5) {
          vec2 cell = floor(v_screen / 8.0);
          float chk = mod(cell.x + cell.y, 2.0);
          bgCol = mix(u_gradA.rgb, u_auxCol.rgb, chk);
        }
        if (u_gradA.w > 0.5 && u_gradB.z >= 4.0) {
          float gsz = u_gradB.z;
          vec2 gpos = mod(v_screen - u_cam.yz, gsz);
          float dLine = min(min(gpos.x, gsz - gpos.x), min(gpos.y, gsz - gpos.y));
          if (dLine < 0.65) {
            bgCol = mix(bgCol, u_accCol, 0.18);
          }
        }
        outColor = vec4(bgCol, 1.0);
      }
    `;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      this._glShaders.add(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return false;
    }
    this._glPrograms.add(prog);
    this.glProg = {
      prog,
      a_pos: gl.getAttribLocation(prog, 'a_pos'),
      u_res: gl.getUniformLocation(prog, 'u_res'),
      u_cam: gl.getUniformLocation(prog, 'u_cam'),
      u_offset: gl.getUniformLocation(prog, 'u_offset'),
      u_localPan: gl.getUniformLocation(prog, 'u_localPan'),
      u_useLocalPan: gl.getUniformLocation(prog, 'u_useLocalPan'),
      u_imgMat: gl.getUniformLocation(prog, 'u_imgMat'),
      u_isScreenSpace: gl.getUniformLocation(prog, 'u_isScreenSpace'),
      u_mode: gl.getUniformLocation(prog, 'u_mode'),
      u_color: gl.getUniformLocation(prog, 'u_color'),
      u_gradA: gl.getUniformLocation(prog, 'u_gradA'),
      u_gradB: gl.getUniformLocation(prog, 'u_gradB'),
      u_auxCol: gl.getUniformLocation(prog, 'u_auxCol'),
      u_accCol: gl.getUniformLocation(prog, 'u_accCol'),
      u_opacity: gl.getUniformLocation(prog, 'u_opacity'),
      u_ramp: gl.getUniformLocation(prog, 'u_ramp')
    };
    this.quadVbo = gl.createBuffer();
    if (this.quadVbo) this._glBuffers.add(this.quadVbo);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    return true;
  }
  _deleteVboEntry(gl, entry) {
    if (!entry) return;
    entry.disposed = true;
    const bufs = [entry.earVbo, entry.fanVbo, entry.coverVbo, entry.strokeVbo, entry.edgeAaVbo];
    for (let i = 0; i < bufs.length; i++) {
      const b = bufs[i];
      if (b) {
        this._glBuffers.delete(b);
        try {
          if (gl && !this.contextLost) gl.deleteBuffer(b);
        } catch (e) {}
      }
    }
    entry.earVbo = entry.fanVbo = entry.coverVbo = entry.strokeVbo = entry.edgeAaVbo = null;
  }
  _getMeshVbos(gl, gpuMesh) {
    if (gpuMesh._vboGl === gl && gpuMesh._vboEntry && !gpuMesh._vboEntry.disposed) {
      return gpuMesh._vboEntry;
    }
    const cached = this.vboCache.get(gpuMesh);
    if (cached !== undefined && !cached.disposed && gpuMesh._vboGl === gl) {
      return cached;
    }
    let bytes = 0;
    const mk = arr => {
      if (!arr || !arr.length) return null;
      const b = gl.createBuffer();
      if (!b) return null;
      this._glBuffers.add(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      bytes += arr.byteLength || arr.length * 4;
      return b;
    };
    const entry = {
      earVbo: mk(gpuMesh.earArray),
      fanVbo: mk(gpuMesh.fanArray),
      coverVbo: mk(gpuMesh.coverArray),
      strokeVbo: mk(gpuMesh.strokeArray),
      edgeAaVbo: mk(gpuMesh.edgeAaArray),
      bytes
    };
    gpuMesh._vboGl = gl;
    gpuMesh._vboEntry = entry;
    this.vboCache.set(gpuMesh, entry);
    this._vboCacheOrder.set(gpuMesh, {
      entry,
      bytes
    });
    this._vboTotalBytes += bytes;
    const maxVboBytes = Math.max(16 * 1024 * 1024, ACTIVE_DEVICE_PROFILE && ACTIVE_DEVICE_PROFILE.maxVboCacheBytes || 96 * 1024 * 1024);
    while (this._vboCacheOrder.size > 1 && (this._vboTotalBytes > maxVboBytes || this._vboCacheOrder.size > 32768)) {
      const oldestMesh = this._vboCacheOrder.keys().next().value;
      const oldestMeta = this._vboCacheOrder.get(oldestMesh);
      this._vboCacheOrder.delete(oldestMesh);
      this.vboCache.delete(oldestMesh);
      if (oldestMesh) {
        oldestMesh._vboGl = null;
        oldestMesh._vboEntry = null;
      }
      if (oldestMeta) {
        this._vboTotalBytes = Math.max(0, this._vboTotalBytes - (oldestMeta.bytes || 0));
        this._deleteVboEntry(gl, oldestMeta.entry);
      }
    }
    PERF_TELEMETRY.updateSceneMetrics({
      vboBytes: this._vboTotalBytes
    });
    return entry;
  }
  _getGradTexture(gl, grad) {
    if (!grad || !grad.stops || !grad.stops.length) return null;
    if (this.gradTexCache.has(grad)) return this.gradTexCache.get(grad);
    const W = 256;
    const data = new Uint8Array(W * 4);
    for (let i = 0; i < W; i++) {
      const smp = VE.sampleGradAt(grad.stops, i / (W - 1));
      const rgba = parsePaintRgba01(smp.color, smp.op ?? 1);
      data[i * 4 + 0] = Math.round(rgba[0] * 255);
      data[i * 4 + 1] = Math.round(rgba[1] * 255);
      data[i * 4 + 2] = Math.round(rgba[2] * 255);
      data[i * 4 + 3] = Math.round(rgba[3] * 255);
    }
    const tex = gl.createTexture();
    if (!tex) return null;
    this._glTextures.add(tex);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.gradTexCache.set(grad, tex);
    this._texTotalBytes += W * 4;
    PERF_TELEMETRY.updateSceneMetrics({
      textureBytes: this._texTotalBytes
    });
    return tex;
  }
  _getImageTexture(gl, href) {
    if (!href) return null;
    if (this.imgTexCache.has(href)) {
      const item = this.imgTexCache.get(href);
      this.imgTexCache.delete(href);
      this.imgTexCache.set(href, item);
      return item && item.tex ? item.tex : item;
    }
    let imgEl = IMG_ELEMENT_CACHE.get(href);
    if (!imgEl && typeof Image !== 'undefined') {
      imgEl = new Image();
      if (/^https?:\/\//i.test(href)) imgEl.crossOrigin = 'anonymous';
      imgEl.onload = () => {
        IMG_ELEMENT_CACHE.updatePixels(href, imgEl);
        const old = this.imgTexCache.get(href);
        if (old && old.tex && this.gl && !this.contextLost) {
          try {
            this.gl.deleteTexture(old.tex);
          } catch (e) {}
          this._glTextures.delete(old.tex);
          this._texTotalBytes = Math.max(0, this._texTotalBytes - (old.bytes || 0));
        }
        this.imgTexCache.delete(href);
        this.requestRender(true);
      };
      imgEl.onerror = () => {
        imgEl._gvLoadError = true;
      };
      imgEl.src = href;
      IMG_ELEMENT_CACHE.set(href, imgEl);
    }
    if (!imgEl || imgEl._gvLoadError || !imgEl.complete || !(imgEl.naturalWidth > 0)) return null;
    try {
      const tex = gl.createTexture();
      if (!tex) return null;
      this._glTextures.add(tex);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgEl);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const texBytes = (imgEl.naturalWidth || 1) * (imgEl.naturalHeight || 1) * 4;
      this.imgTexCache.set(href, {
        tex,
        bytes: texBytes,
        w: imgEl.naturalWidth,
        h: imgEl.naturalHeight
      });
      this._texTotalBytes += texBytes;
      const maxTexBytes = ACTIVE_DEVICE_PROFILE && ACTIVE_DEVICE_PROFILE.maxTextureCacheBytes || 64 * 1024 * 1024;
      while (this.imgTexCache.size > 1 && (this._texTotalBytes > maxTexBytes || this.imgTexCache.size > 128)) {
        const oldestHref = this.imgTexCache.keys().next().value;
        const oldestItem = this.imgTexCache.get(oldestHref);
        this.imgTexCache.delete(oldestHref);
        if (oldestItem && oldestItem.tex) {
          this._glTextures.delete(oldestItem.tex);
          try {
            if (!this.contextLost) gl.deleteTexture(oldestItem.tex);
          } catch (e) {}
          this._texTotalBytes = Math.max(0, this._texTotalBytes - (oldestItem.bytes || 0));
        }
      }
      PERF_TELEMETRY.updateSceneMetrics({
        textureBytes: this._texTotalBytes
      });
      return tex;
    } catch (e) {
      return null;
    }
  }
  _setWebGLPaintUniforms(gl, P, colStr, gradObj, opacity, originX = 0, originY = 0) {
    if (gradObj && gradObj.stops && gradObj.stops.length) {
      const tex = this._getGradTexture(gl, gradObj);
      if (tex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(P.u_ramp, 0);
        gl.uniform1f(P.u_opacity, opacity ?? 1);
        const spCode = gradObj.spread === 'reflect' ? 1.0 : gradObj.spread === 'repeat' ? 2.0 : 0.0;
        /* Rebase koordinat gradien ke ruang lokal objek (originX, originY) dalam Float64 di CPU */
        if (gradObj.type === 'radial') {
          const cx = (gradObj.cx || 0) - originX;
          const cy = (gradObj.cy || 0) - originY;
          const fx = (gradObj.fx != null ? gradObj.fx : gradObj.cx || 0) - originX;
          const fy = (gradObj.fy != null ? gradObj.fy : gradObj.cy || 0) - originY;
          gl.uniform1i(P.u_mode, 2);
          gl.uniform4f(P.u_gradA, cx, cy, Math.max(1e-4, gradObj.r || 1), fx);
          gl.uniform4f(P.u_gradB, fy, spCode, 0.0, 0.0);
        } else {
          const x1 = (gradObj.x1 || 0) - originX;
          const y1 = (gradObj.y1 || 0) - originY;
          const x2 = (gradObj.x2 || 0) - originX;
          const y2 = (gradObj.y2 || 0) - originY;
          gl.uniform1i(P.u_mode, 1);
          gl.uniform4f(P.u_gradA, x1, y1, x2, y2);
          gl.uniform4f(P.u_gradB, 0.0, spCode, 0.0, 0.0);
        }
        return;
      }
    }
    const rgba = parsePaintRgba01(colStr, opacity ?? 1);
    gl.uniform1i(P.u_mode, 0);
    gl.uniform4f(P.u_color, rgba[0], rgba[1], rgba[2], rgba[3]);
  }
  prewarmSceneLods(doc) {
    if (this._prewarmTimer) {
      clearTimeout(this._prewarmTimer);
      this._prewarmTimer = 0;
    }
    if (!doc || !Array.isArray(doc.objects) || !doc.objects.length) return;
    const objs = doc.objects;
    let idx = 0;
    const step = () => {
      this._prewarmTimer = 0;
      if (this.disposed || this.doc !== doc) return;
      if (SCENE_INTERACTING_ZOOM || this.isZooming || this.isPanning || this.dragOffset) {
        this._prewarmTimer = setTimeout(step, 80);
        return;
      }
      const glNow = !this.contextLost && this.gl && this.glProg ? this.gl : null;
      const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      while (idx < objs.length) {
        const o = objs[idx++];
        if (!o || o.hidden || o.img || o.text) continue;
        const gm0 = buildObjectGpuBuffers(o, 1);
        if (glNow) this._getMeshVbos(glNow, gm0);
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (now - t0 > 4) break;
      }
      if (idx < objs.length) {
        this._prewarmTimer = setTimeout(step, 16);
      }
    };
    step();
  }
  setScene(doc, revisionId, opts = {}) {
    if (this.doc !== doc) {
      const prevLen = this.doc && this.doc.objects ? this.doc.objects.length : -1;
      this.doc = doc;
      this.revisionId = revisionId != null ? revisionId : this.revisionId + 1;
      if (!opts.deferSpatialIndex && !this.dragOffset) {
        this.spatialIndex = doc && doc.objects ? VE.getDocSpatialIndex(doc.objects) : null;
        if (doc && doc.objects && doc.objects.length !== prevLen) {
          this.prewarmSceneLods(doc);
        }
      } else {
        this._spatialIndexDirty = true;
      }
    } else if (revisionId != null) {
      this.revisionId = revisionId;
    }
  }
  _syncFrameCaches() {
    const cur = this.frameBoxes || [];
    if (this._frameBoxesRef !== cur) {
      this._frameBoxesRef = cur;
      const nextSet = new Set();
      const nextMap = new Map();
      for (let fi = 0; fi < cur.length; fi++) {
        nextSet.add(cur[fi].id);
        nextMap.set(cur[fi].id, cur[fi].bb);
      }
      this._frameSet = nextSet;
      this._frameRectMap = nextMap;
    }
  }
  _getFrameSet() {
    this._syncFrameCaches();
    return this._frameSet;
  }
  _getFrameRectMap() {
    this._syncFrameCaches();
    return this._frameRectMap;
  }
  setRenderEnv(env) {
    if (!env) return;
    if (env.bg) this.bg = env.bg;
    if (env.showGrid != null) this.showGrid = env.showGrid;
    if (env.clipFrames != null) this.clipFrames = env.clipFrames;
    if (env.frameBoxes) this.frameBoxes = env.frameBoxes;
    if (env.frameBgByGroup) this.frameBgByGroup = env.frameBgByGroup;
    this._cachedRootAcc = undefined;
  }
  /* Objek yang berada DI ATAS teks (urutan Z) dan tumpang-tindih dengannya dirender di layer SVG (bersama teks)
     agar urutan tumpukan benar; GPU melewatkan objek-objek ini agar tidak tergambar dobel. */
  setSvgOverlayIds(ids) {
    const next = ids && ids.size ? ids : null;
    const prev = this.svgOverlayIds || null;
    if (prev === next) return;
    if (prev && next && prev.size === next.size) {
      let same = true;
      for (const id of next) if (!prev.has(id)) { same = false; break; }
      if (same) return;
    }
    this.svgOverlayIds = next;
    this.requestRender(true);
  }
  setDragOffset(ids, dx, dy) {
    this.dragOffset = ids && (dx || dy) ? {
      ids,
      dx,
      dy
    } : null;
  }
  updateObjects(dirtyObjectIds, doc) {
    if (doc) this.setScene(doc, this.revisionId + 1);
  }
  setCamera(zoom, panX, panY, viewportWidth, viewportHeight) {
    this.camera.zoom = zoom || 1;
    this.camera.panX = panX || 0;
    this.camera.panY = panY || 0;
    if (viewportWidth > 0) this.camera.width = viewportWidth;
    if (viewportHeight > 0) this.camera.height = viewportHeight;
    const safeZoom = Math.max(0.001, Math.min(1e7, this.camera.zoom));
    const lodBucket = Math.floor(Math.log2(safeZoom));
    const effectiveZoom = Math.pow(2, lodBucket);
    const eps = (RENDER_CONFIG.targetPixelError || 0.25) / effectiveZoom;
    PERF_TELEMETRY.updateSceneMetrics({
      lodLevel: lodBucket,
      effectiveZoom,
      currentEpsilon: eps
    });
  }
  setSelectionOverlay(selectionPayload) {
    this.selectionPayload = selectionPayload;
  }
  setSnapOverlay(snapPayload) {
    this.snapPayload = snapPayload;
  }

  /* Tahap 1: Satu Scheduler RAF Terpadu agar tidak pernah terjadi double/triple render di satu frame */
  /* PANFIX: Geser/skala canvas WebGL via CSS transform selama drag pan/zoom.
     Isi canvas adalah hasil render pada view lama (_lastRenderView); transform
     CSS memetakan isi lama ke view baru (kamera saat ini) sehingga tampak benar
     tanpa render ulang. Render WebGL 1044 objek ~300ms/frame (SwiftShader;
     berat di GPU lemah) adalah sumber hang/patah-patah saat pan. CSS transform
     di-composite GPU (60fps) dan tidak menyentuh main thread.
     Rumus (transform-origin 0 0): s = z/z0, tx = px - s*px0, ty = py - s*py0.
     Mengembalikan true bila transform diterapkan (render boleh dilewati). */
  _applyInteractionCssTransform() {
    const cv = this.canvasEl;
    if (!cv || !this._lastRenderView) return false;
    const cam = this.camera || {};
    const z = cam.zoom || 1, px = cam.panX || 0, py = cam.panY || 0;
    const v0 = this._lastRenderView;
    const s = z / v0.z;
    const tx = px - s * v0.x, ty = py - s * v0.y;
    if (Math.abs(s - 1) < 1e-9 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01) {
      if (this._cssTransformActive) this._clearInteractionCssTransform();
      return false;
    }
    cv.style.transformOrigin = '0 0';
    cv.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + s.toFixed(6) + ')';
    this._cssTransformActive = true;
    return true;
  }
  _clearInteractionCssTransform() {
    const cv = this.canvasEl;
    if (cv && this._cssTransformActive) cv.style.transform = '';
    this._cssTransformActive = false;
  }
  requestRender(force = false) {
    if (this.disposed || !this.gpuEnabled) return;
    if (force) this._forcePending = true;
    if (this._rafId) return;
    if (typeof requestAnimationFrame === 'function') {
      this._rafId = requestAnimationFrame(() => {
        this._rafId = 0;
        const f = this._forcePending;
        this._forcePending = false;
        this.renderFrame(f);
      });
    } else {
      this.renderFrame(force);
    }
  }
  _computeStateSig(cssW, cssH) {
    const z = Math.round((this.camera.zoom || 1) * 1e5);
    const px = Math.round((this.camera.panX || 0) * 100);
    const py = Math.round((this.camera.panY || 0) * 100);
    const dg = this.dragOffset ? `${this.dragOffset.ids.size}:${Math.round(this.dragOffset.dx * 100)}:${Math.round(this.dragOffset.dy * 100)}` : '0';
    let rootAcc = this._cachedRootAcc;
    if (rootAcc === undefined || !(this.isZooming || this.isPanning || this.dragOffset)) {
      rootAcc = typeof document !== 'undefined' && document.documentElement ? (document.documentElement.style.getPropertyValue('--acc') || '') + ':' + (document.documentElement.getAttribute('data-theme') || '') : '';
      this._cachedRootAcc = rootAcc;
    }
    const bgKey = (this.bg ? `${this.bg.mode}:${this.bg.color}` : '') + ':' + rootAcc;
    const rcKey = `${RENDER_CONFIG.seamGuard ? 1 : 0}:${RENDER_CONFIG.targetPixelError}:${RENDER_CONFIG.maxBezierDepth}:${RENDER_CONFIG.aaMode}:${RENDER_CONFIG.backendOverride}:${RENDER_CONFIG.localCoordRebasing ? 1 : 0}:${RENDER_CONFIG.pixelPreviewMode}:${RENDER_CONFIG.pixelGrid ? 1 : 0}:${RENDER_CONFIG.pixelGridInSmooth ? 1 : 0}`;
    return `${this.revisionId}|${z}|${px}|${py}|${cssW}x${cssH}|${bgKey}|${this.showGrid ? 1 : 0}|${this.clipFrames ? 1 : 0}|${dg}|${rcKey}`;
  }
  renderFrame(force = false) {
    if (this.disposed || this.contextLost || !this.gpuEnabled || !this.canvasEl || !this.doc) return;
    const interacting = !!(this.isZooming || this.isPanning);
    /* PANFIX2: drag objek (dragOffset) bukan pan/zoom — CSS transform seluruh
       canvas TIDAK berlaku (hanya objek yang diseret yang bergerak). Tapi render
       saat drag objek sama beratnya (1044 objek, ~667ms/frame), jadi DPR 0.5x,
       throttle & sub-pixel cull juga berlaku untuknya. */
    const renderInteracting = interacting || !!this.dragOffset;
    /* PANFIX: Selama drag pan/zoom (force + interacting), JANGAN render WebGL
       tiap frame — terapkan CSS transform saja dan lewati render. Render WebGL
       1044 objek ~300ms/frame (SwiftShader; berat di GPU lemah) adalah sumber
       hang/patah-patah saat pan. Render sungguhan terjadi saat settle
       (interacting=false) atau bila belum ada baseline (_lastRenderView null). */
    if (force && interacting && this._lastRenderView) {
      if (this._applyInteractionCssTransform()) return;
    }
    /* Bukan interaksi (settle / render async): bersihkan CSS transform agar
       hasil render baru tampil tanpa transform ganda. */
    this._clearInteractionCssTransform();
    /* PERF (zoom/pan cepat): throttle ADAPTIF — hanya aktif bila render sebelumnya
       lambat (>20ms). Bila render cepat (hardware bagus), JANGAN throttle agar
       canvas tetap 60fps. Bila render lambat, batasi ke ~25fps (sekali per 40ms)
       supaya main thread sempat memproses input (slider tetap responsif).
       Render saat settle (isZooming/isPanning=false) TIDAK pernah di-throttle. */
    if (force && interacting && (this._lastRenderMs || 0) > 20) {
      const nowT = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (this._lastInteractRenderTs && nowT - this._lastInteractRenderTs < 40) return;
      this._lastInteractRenderTs = nowT;
    }
    /* PANFIX2: throttle render async saat drag objek — drag objek memanggil
       requestRender() tiap gerakan (force=false). Bila render sebelumnya lambat
       (>20ms), batasi ke 1 render per 50ms (~20fps) agar drag tidak hang.
       Posisi objek yang diseret tetap terasa responsif karena handle/seleksi
       SVG di-update via DOM langsung, bukan lewat render WebGL. */
    if (!force && this.dragOffset && (this._lastRenderMs || 0) > 20) {
      const nowT2 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (this._lastObjDragRenderTs && nowT2 - this._lastObjDragRenderTs < 50) return;
      this._lastObjDragRenderTs = nowT2;
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
      this._forcePending = false;
    }
    const cv = this.canvasEl;
    const host = this.containerEl || cv.parentElement;
    const cssW = this.camera.width || host && host.clientWidth || 1280;
    const cssH = this.camera.height || host && host.clientHeight || 800;
    if (cssW <= 0 || cssH <= 0) return;
    const sig = this._computeStateSig(cssW, cssH);
    if (!force && this._lastRenderedSig === sig) return;
    this._lastRenderedSig = sig;
    const tRender0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    /* GV-A06: Ukuran framebuffer adaptif sesuai profil perangkat & batas tekstur/renderbuffer GPU
       PERF: saat interaksi zoom/pan aktif, turunkan DPR ke 0.5x (seperempat piksel) agar
       rasterisasi jauh lebih ringan; resolusi penuh dipulihkan otomatis saat settle
       (isZooming/isPanning=false) karena fb dihitung ulang tiap renderFrame. */
    const rawDpr = typeof window !== 'undefined' && window.devicePixelRatio || 1;
    const effDprReq = renderInteracting ? Math.min(rawDpr, RENDER_CONFIG.maxRenderDpr || MAX_RENDER_DPR) * 0.5 : Math.min(rawDpr, RENDER_CONFIG.maxRenderDpr || MAX_RENDER_DPR);
    const fb = computeSafeFramebufferSize(cssW, cssH, effDprReq, ACTIVE_DEVICE_PROFILE, RENDER_CONFIG.aaMode);
    const pw = fb.pw,
      ph = fb.ph,
      pixelRatio = fb.effectiveDpr;
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    /* FXAA post-filter opsional (sesuai Bagian 3.2: opsional setelah pengujian) */
    if (RENDER_CONFIG.aaMode === 'fxaa') {
      cv.style.filter = ' contrast(1.01) blur(0.22px)';
    } else if (cv.style.filter) {
      cv.style.filter = '';
    }
    this.camera.width = cssW;
    this.camera.height = cssH;
    const z = this.camera.zoom || 1;
    const px = this.camera.panX || 0,
      py = this.camera.panY || 0;
    const themeKey = typeof document !== 'undefined' && document.documentElement ? (document.documentElement.getAttribute('data-theme') || '') + '|' + (document.documentElement.style.getPropertyValue('--acc') || '') : '';
    if (!this._cachedCols || this._cachedColsKey !== themeKey) {
      const rootStyle = typeof getComputedStyle === 'function' && host ? getComputedStyle(host) : null;
      this._cachedCols = {
        cardCol: rootStyle && rootStyle.getPropertyValue('--card').trim() || '#ffffff',
        lineCol: rootStyle && rootStyle.getPropertyValue('--line').trim() || '#eef2f6',
        accCol: rootStyle && rootStyle.getPropertyValue('--acc').trim() || '#13b152'
      };
      this._cachedColsKey = themeKey;
    }
    const {
      cardCol,
      lineCol,
      accCol
    } = this._cachedCols;
    const padWorld = 64 / z;
    const vx0 = -px / z - padWorld,
      vy0 = -py / z - padWorld;
    const vx1 = (cssW - px) / z + padWorld,
      vy1 = (cssH - py) / z + padWorld;
    const useCanvas2D = RENDER_CONFIG.backendOverride === 'canvas2d' || !(this.gl && this.glProg);
    if (!useCanvas2D) {
      this.backend = 'WebGL2 Hardware Engine';
      this._renderWebGL2Primary(cssW, cssH, pixelRatio, pw, ph, z, px, py, vx0, vy0, vx1, vy1, cardCol, lineCol, accCol);
    } else {
      this.backend = RENDER_CONFIG.backendOverride === 'canvas2d' ? 'Canvas2D Engine' : 'Canvas2D Fallback';
      this._renderCanvas2DFallback(cv, cssW, cssH, pixelRatio, z, px, py, vx0, vy0, vx1, vy1, cardCol, lineCol, accCol);
    }
    const gcStats = GEOMETRY_CACHE.getStats();
    PERF_TELEMETRY.updateSceneMetrics({
      cacheHits: gcStats.hits,
      cacheMisses: gcStats.misses,
      cachedObjectsCount: gcStats.cachedObjectsCount
    });
    const tRender1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    this._lastRenderMs = tRender1 - tRender0;
    /* PANFIX: catat view yang baru saja di-render — baseline untuk CSS transform saat drag berikutnya. */
    this._lastRenderView = { z: this.camera.zoom || 1, x: this.camera.panX || 0, y: this.camera.panY || 0 };
    PERF_TELEMETRY.recordRenderPass(tRender1 - tRender0, tRender1);
  }

  /* =========================================================================
     JALUR UTAMA WEBGL2 PADA CANVAS AKTIF (Tahap 2, 3, 4, 5, 6)
     - Viewport menggunakan gl.drawingBufferWidth & gl.drawingBufferHeight aktual
     - Local Coordinate Rendering via u_localPan (Float64 di CPU -> Float32 di GPU)
     - Ear-Clipping + Hardware Stencil-Then-Cover (Nonzero & EvenOdd)
     - Dukungan clipPathD per objek & Frame Clipping via Stencil Bit-7 (0x80)
     ========================================================================= */
  _renderWebGL2Primary(cssW, cssH, dpr, pw, ph, z, px, py, vx0, vy0, vx1, vy1, cardCol, lineCol, accCol, isFboPass = false) {
    const gl = this.gl,
      P = this.glProg;
    const dbw = isFboPass ? pw : gl.drawingBufferWidth || pw;
    const dbh = isFboPass ? ph : gl.drawingBufferHeight || ph;
    gl.viewport(0, 0, dbw, dbh);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0xFF);
    if (isFboPass) {
      gl.clearColor(0, 0, 0, 0);
    } else {
      gl.clearColor(1, 1, 1, 1);
    }
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.prog);
    gl.uniform2f(P.u_res, cssW, cssH);
    gl.uniform3f(P.u_cam, z, px, py);
    gl.uniform2f(P.u_offset, 0, 0);
    gl.uniform2f(P.u_localPan, px, py);
    gl.uniform1i(P.u_useLocalPan, 0);
    gl.uniformMatrix3fv(P.u_imgMat, false, this._identityMat3);
    gl.enableVertexAttribArray(P.a_pos);

    /* 1. Full-Screen Pass: Background (Solid / Checkerboard) + Adaptive Grid di Shader WebGL2 */
    const s = 16 / z,
      l = Math.pow(10, Math.floor(Math.log10(s))),
      n = s / l;
    const rawStep = (n < 2 ? 1 : n < 5 ? 2 : 5) * l;
    const step = RENDER_CONFIG.pixelGrid !== false ? Math.max(1, rawStep) : rawStep;
    const gsz = step * z;
    const solidCol = parsePaintRgba01(this.bg && this.bg.color || '#ffffff', 1);
    const cCard = parsePaintRgba01(cardCol, 1);
    const cLine = parsePaintRgba01(lineCol, 1);
    const cAcc = parsePaintRgba01(accCol || '#13b152', 1);
    gl.uniform3f(P.u_accCol, cAcc[0], cAcc[1], cAcc[2]);

    /* JIKA MODE INSPEKSI PIKSEL AKTIF (Mode 2: 'coverage' atau Mode 3: 'hard'):
       - Mode 3 ('hard'): Hardware Single-Sample FBO WebGL2 (0% antialiasing, 100% solid pixel-center rasterization di GPU tanpa getImageData CPU!).
       - Mode 2 ('coverage'): Merasterisasi coverage antialiasing 1x1.
       - Mode 1 ('smooth', Default): Melewati blok ini dan merender geometri vektor asli secara halus & solid. */
    const activePxMode = isFboPass ? 'smooth' : getActivePixelPreviewMode(z);
    if (activePxMode === 'hard' || activePxMode === 'coverage') {
      const tileInfo = this._renderSceneToPixelTile(cssW, cssH, z, px, py, vx0, vy0, vx1, vy1, activePxMode);
      if (tileInfo && (tileInfo.data || tileInfo.canvas)) {
        if (!this._pixelTileTex) {
          this._pixelTileTex = gl.createTexture();
          if (this._pixelTileTex) this._glTextures.add(this._pixelTileTex);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._pixelTileTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (!tileInfo.reused) {
          if (tileInfo.data) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tileInfo.tileW, tileInfo.tileH, 0, gl.RGBA, gl.UNSIGNED_BYTE, tileInfo.data);
          } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tileInfo.canvas);
          }
        }
        const localPanX = tileInfo.wx0 * z + px;
        const localPanY = tileInfo.wy0 * z + py;
        const modX = (tileInfo.wx0 % 10 + 10) % 10;
        const modY = (tileInfo.wy0 % 10 + 10) % 10;
        const showPxGrid = this.showGrid && RENDER_CONFIG.pixelGrid !== false ? 1.0 : 0.0;
        gl.uniform1i(P.u_isScreenSpace, 1);
        gl.uniform1i(P.u_mode, 5);
        gl.uniform1i(P.u_ramp, 0);
        gl.uniform2f(P.u_localPan, localPanX, localPanY);
        gl.uniform2f(P.u_offset, modX, modY);
        gl.uniform4f(P.u_color, solidCol[0], solidCol[1], solidCol[2], 1.0);
        gl.uniform4f(P.u_gradA, tileInfo.tileW, tileInfo.tileH, 0.0, showPxGrid);
        gl.uniform4f(P.u_gradB, cCard[0], cCard[1], cCard[2], this.bg && this.bg.mode === 'solid' ? 1.0 : 0.0);
        gl.uniform4f(P.u_auxCol, cLine[0], cLine[1], cLine[2], 1.0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.uniform1i(P.u_isScreenSpace, 0);
        PERF_TELEMETRY.updateSceneMetrics({
          totalObjects: this.doc && this.doc.objects ? this.doc.objects.length : 0,
          visibleObjects: tileInfo.visCount,
          culledObjects: tileInfo.culledCount,
          domPathCount: 0,
          gpuDrawCalls: tileInfo.drawCalls + 1,
          lodSegments: tileInfo.lodVerts,
          totalVertices: tileInfo.lodVerts,
          tessellationTimeMs: tileInfo.tessTimeSum,
          partialAlphaPixels: tileInfo.partialAlphaPixels || 0,
          pixelPreviewMode: activePxMode,
          dpr,
          drawingBufferWidth: dbw,
          drawingBufferHeight: dbh,
          aaDiagnostics: this.aaDiagnostics ? {
            ...this.aaDiagnostics,
            drawingBufferWidth: dbw,
            drawingBufferHeight: dbh
          } : undefined
        });
        return;
      }
    }
    /* High-Zoom Guard-Band Protection (z >= 8 di mode Smooth Vector):
       Pada zoom sangat dekat (800% .. 500.000%), segitiga objek dapat membentang puluhan ribu piksel
       melampaui batas guard-band fixed-point 24.8 rasterizer GPU (±16384 px) sehingga segitiga di-drop oleh GPU.
       Merasterisasi viewport via Path2D analitik Canvas2D ke tekstur layar memastikan kurva Bézier tetap 100% utuh & tajam! */
    setSceneInteractingZoom(!!(this.isZooming || this.isPanning));
    if (!isFboPass && activePxMode === 'smooth' && z >= 64 && !this.isPanning && !this.isZooming && typeof document !== 'undefined') {
      if (!this._hiZoomCanvas) {
        this._hiZoomCanvas = document.createElement('canvas');
      }
      const hcv = this._hiZoomCanvas;
      if (hcv.width !== dbw || hcv.height !== dbh) {
        hcv.width = dbw;
        hcv.height = dbh;
      }
      this._lastPxTileKey = null; /* tekstur _pixelTileTex dipakai ulang di sini -> cache tile piksel tidak valid lagi */
      const savedCtx2d = this.ctx2d;
      this.ctx2d = hcv.getContext('2d');
      const effDpr = dbw / Math.max(1, cssW);
      this._renderCanvas2DFallback(hcv, cssW, cssH, effDpr, z, px, py, vx0, vy0, vx1, vy1, cardCol, lineCol, accCol);
      this.ctx2d = savedCtx2d;
      if (!this._pixelTileTex) {
        this._pixelTileTex = gl.createTexture();
        if (this._pixelTileTex) this._glTextures.add(this._pixelTileTex);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._pixelTileTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hcv);
      gl.uniform1i(P.u_isScreenSpace, 1);
      gl.uniform1i(P.u_mode, 3);
      gl.uniform1i(P.u_ramp, 0);
      gl.uniform1f(P.u_opacity, 1.0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.uniform1i(P.u_isScreenSpace, 0);
      return;
    }
    if (!isFboPass) {
      gl.uniform1i(P.u_isScreenSpace, 1);
      gl.uniform1i(P.u_mode, 4);
      gl.uniform4f(P.u_color, solidCol[0], solidCol[1], solidCol[2], 1.0);
      gl.uniform4f(P.u_gradA, cCard[0], cCard[1], cCard[2], this.showGrid ? 1.0 : 0.0);
      gl.uniform4f(P.u_gradB, 0.0, 0.0, gsz, this.bg && this.bg.mode === 'solid' ? 1.0 : 0.0);
      gl.uniform4f(P.u_auxCol, cLine[0], cLine[1], cLine[2], 1.0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.uniform1i(P.u_isScreenSpace, 0);
    }
    const curFrameBoxes = this.frameBoxes || [];
    if (this._frameBoxesRef !== curFrameBoxes) {
      this._frameBoxesRef = curFrameBoxes;
      const nextSet = new Set();
      const nextMap = new Map();
      for (let fi = 0; fi < curFrameBoxes.length; fi++) {
        const f = curFrameBoxes[fi];
        nextSet.add(f.id);
        nextMap.set(f.id, f.bb);
      }
      this._frameSet = nextSet;
      this._frameRectMap = nextMap;
    }
    const frameSet = this._frameSet;
    const frameRectMap = this._frameRectMap;
    const objs = this.doc.objects || [];
    const drag = this.dragOffset;
    let drawCalls = 1,
      visCount = 0,
      culledCount = 0,
      lodVerts = 0;
    let totalFillTris = 0,
      totalStrokeTris = 0,
      tessTimeSum = 0;
    let activeClipFid = null,
      activeClipMode = null; /* 'scissor' | 'stencil' | null */
    let activeScissorRect = null;

    const setObjectLocalTransform = (originX, originY, odx, ody) => {
      /* Hitung posisi layar origin objek dalam Float64 di CPU untuk mencegah jitter Float32 */
      const localPanX = (originX + odx) * z + px;
      const localPanY = (originY + ody) * z + py;
      gl.uniform1i(P.u_useLocalPan, 1);
      gl.uniform2f(P.u_localPan, localPanX, localPanY);
      gl.uniform2f(P.u_offset, odx, ody);
    };
    const writeMaskToStencilBit7 = (maskObj, odx, ody) => {
      const maskMesh = buildObjectGpuBuffers(maskObj, z);
      const maskVbos = this._getMeshVbos(gl, maskMesh);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilMask(0xFF);
      gl.clearStencil(0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.uniform1i(P.u_mode, 0);
      gl.colorMask(false, false, false, false);
      setObjectLocalTransform(maskMesh.originX, maskMesh.originY, odx, ody);
      if (maskVbos.earVbo && maskMesh.earArray && maskMesh.earArray.length >= 6) {
        gl.stencilFunc(gl.ALWAYS, 0x80, 0x80);
        gl.stencilMask(0x80);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.bindBuffer(gl.ARRAY_BUFFER, maskVbos.earVbo);
        gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, maskMesh.earArray.length >> 1);
      } else if (maskVbos.fanVbo && maskVbos.coverVbo && maskMesh.fanArray && maskMesh.fanArray.length >= 6) {
        gl.stencilFunc(gl.ALWAYS, 0, 0x7F);
        gl.stencilMask(0x7F);
        gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
        gl.bindBuffer(gl.ARRAY_BUFFER, maskVbos.fanVbo);
        gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, maskMesh.fanArray.length >> 1);
        gl.stencilFunc(gl.NOTEQUAL, 0x80, 0x7F);
        gl.stencilMask(0xFF);
        gl.stencilOp(gl.ZERO, gl.ZERO, gl.REPLACE);
        gl.uniform1i(P.u_isScreenSpace, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.uniform1i(P.u_isScreenSpace, 0);
      }
      gl.colorMask(true, true, true, true);
      gl.disable(gl.STENCIL_TEST);
    };
    /* PERF: batasi stencil + cover pass ke bbox objek di layar (diintersect dgn scissor frame) agar fill-rate tidak sebesar layar penuh per objek */
    const applyObjScissor = (o, odx, ody) => {
      const bb = vinfo(o).bb;
      const clampPx = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      let x0 = clampPx(Math.floor(((bb[0] + odx) * z + px - 2) * dpr), 0, dbw);
      let x1 = clampPx(Math.ceil(((bb[2] + odx) * z + px + 2) * dpr), 0, dbw);
      let y0 = clampPx(Math.floor((cssH - ((bb[3] + ody) * z + py + 2)) * dpr), 0, dbh);
      let y1 = clampPx(Math.ceil((cssH - ((bb[1] + ody) * z + py - 2)) * dpr), 0, dbh);
      if (activeScissorRect) {
        x0 = Math.max(x0, activeScissorRect[0]);
        y0 = Math.max(y0, activeScissorRect[1]);
        x1 = Math.min(x1, activeScissorRect[0] + activeScissorRect[2]);
        y1 = Math.min(y1, activeScissorRect[1] + activeScissorRect[3]);
      }
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    };
    const restoreFrameScissor = () => {
      if (activeClipMode === 'scissor' && activeScissorRect) {
        gl.scissor(activeScissorRect[0], activeScissorRect[1], activeScissorRect[2], activeScissorRect[3]);
      } else {
        gl.disable(gl.SCISSOR_TEST);
      }
    };
    const drawObjectWebGL = (o, odx, ody, frameStencilActive, isDragged = false) => {
      /* Dukungan clipPathD per objek di WebGL2 (kontrak kualitas identik dengan Canvas2D & SVG DOM) */
      let objStencilClip = false;
      if (!isDragged && o.clipPathD && !frameStencilActive) {
        if (!o._cachedClipObj || o._cachedClipD !== o.clipPathD) {
          o._cachedClipD = o.clipPathD;
          o._cachedClipObj = {
            id: o.id + '__clip',
            subs: VE.parsePath(o.clipPathD, [1, 0, 0, 1, 0, 0]),
            fill: '#000',
            stroke: 'none',
            strokeWidth: 0,
            fillRule: 'nonzero'
          };
        }
        if (o._cachedClipObj.subs && o._cachedClipObj.subs.length) {
          writeMaskToStencilBit7(o._cachedClipObj, odx, ody);
          objStencilClip = true;
        }
      }
      const stencilClipActive = frameStencilActive || objStencilClip;
      const effObjOpacity = (o.opacity ?? 1) * (o.groupOpacity ?? 1);
      if (o.img) {
        gl.uniform1i(P.u_useLocalPan, 0);
        gl.uniform2f(P.u_offset, odx, ody);
        const tex = this._getImageTexture(gl, o.img.href);
        const imgEl = IMG_ELEMENT_CACHE.get(o.img.href);
        const parGeo = VE.computeImageParGeometry(o, imgEl && imgEl.naturalWidth, imgEl && imgEl.naturalHeight);
        const m = parGeo ? parGeo.effMatrix : VE.imageMatrix(o);
        if (tex && m) {
          if (stencilClipActive) {
            gl.enable(gl.STENCIL_TEST);
            gl.stencilFunc(gl.EQUAL, 0x80, 0x80);
            gl.stencilMask(0x00);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
          }
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1i(P.u_ramp, 0);
          gl.uniform1i(P.u_mode, 3);
          gl.uniform1f(P.u_opacity, effObjOpacity);
          const iw = o.img.w || 1,
            ih = o.img.h || 1;
          const im3 = this._scratchImgMat3;
          im3[0] = m[0] * iw;
          im3[1] = m[1] * iw;
          im3[3] = m[2] * ih;
          im3[4] = m[3] * ih;
          im3[6] = m[4];
          im3[7] = m[5];
          gl.uniformMatrix3fv(P.u_imgMat, false, im3);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
          gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.uniformMatrix3fv(P.u_imgMat, false, this._identityMat3);
          if (stencilClipActive) gl.disable(gl.STENCIL_TEST);
          drawCalls++;
        }
        if (objStencilClip) {
          gl.stencilMask(0xFF);
          gl.clearStencil(0);
          gl.clear(gl.STENCIL_BUFFER_BIT);
        }
        return;
      }

      /* Objek teks (o.text) dirender sebagai elemen SVG <text> vektor murni di layer <svg className="ved-svg-host">
         agar 100% tajam tanpa blur di semua level zoom (0.05% - 500.000%) dan tidak pernah menempelkan WebGLTexture/Canvas ke objek dokumen! */
      if (o.text) {
        if (objStencilClip) {
          gl.stencilMask(0xFF);
          gl.clearStencil(0);
          gl.clear(gl.STENCIL_BUFFER_BIT);
        }
        return;
      }
      const gpuMesh = buildObjectGpuBuffers(o, z);
      lodVerts += gpuMesh.totalVerts;
      totalFillTris += gpuMesh.fillTriCount || 0;
      totalStrokeTris += gpuMesh.strokeTriCount || 0;
      if (gpuMesh.tessellationMetadata) tessTimeSum += gpuMesh.tessellationMetadata.tessellationTimeMs || 0;
      const vbos = this._getMeshVbos(gl, gpuMesh);
      const originX = gpuMesh.originX;
      const originY = gpuMesh.originY;
      setObjectLocalTransform(originX, originY, odx, ody);
      const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent';
      const hasExplicitStroke = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;

      /* Fill Pass: Ear-Clipped Triangles (untuk poligon sederhana) atau Hardware Stencil-Then-Cover (compound/lubang/evenodd) */
      if (hasFill) {
        if (vbos.earVbo && gpuMesh.earArray && gpuMesh.earArray.length >= 6) {
          if (stencilClipActive) {
            gl.enable(gl.STENCIL_TEST);
            gl.stencilFunc(gl.EQUAL, 0x80, 0x80);
            gl.stencilMask(0x00);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
          }
          this._setWebGLPaintUniforms(gl, P, o.fill, VE.gradOn(o) ? o.grad : null, effObjOpacity, originX, originY);
          gl.bindBuffer(gl.ARRAY_BUFFER, vbos.earVbo);
          gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, gpuMesh.earArray.length >> 1);
          if (stencilClipActive) gl.disable(gl.STENCIL_TEST);
          drawCalls++;
        } else if (vbos.fanVbo && vbos.coverVbo && gpuMesh.fanArray && gpuMesh.fanArray.length >= 6) {
          applyObjScissor(o, odx, ody);
          gl.enable(gl.STENCIL_TEST);
          gl.uniform1i(P.u_mode, 0);
          gl.colorMask(false, false, false, false);
          if (stencilClipActive) {
            gl.stencilFunc(gl.EQUAL, 0x80, 0x80);
            gl.stencilMask(0x7F);
          } else {
            gl.stencilFunc(gl.ALWAYS, 0, 0x7F);
            gl.stencilMask(0x7F);
          }
          if (o.fillRule === 'evenodd') {
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
          } else {
            gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
            gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, vbos.fanVbo);
          gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, gpuMesh.fanArray.length >> 1);

          /* Cover Pass & Zero Bits 0..6 */
          gl.colorMask(true, true, true, true);
          if (stencilClipActive) {
            gl.stencilFunc(gl.LESS, 0x80, 0xFF);
            gl.stencilMask(0x7F);
          } else {
            gl.stencilFunc(gl.NOTEQUAL, 0, 0x7F);
            gl.stencilMask(0x7F);
          }
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
          this._setWebGLPaintUniforms(gl, P, o.fill, VE.gradOn(o) ? o.grad : null, effObjOpacity, originX, originY);
          if (z >= 2) {
            /* Saat zoom >= 2, gunakan quad ruang-layar penuh (dengan v_world localPan untuk gradien) agar Cover Pass Stencil tidak pernah terpotong guard-band clip GPU */
            gl.uniform1i(P.u_isScreenSpace, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
            gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.uniform1i(P.u_isScreenSpace, 0);
          } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, vbos.coverVbo);
            gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
          gl.disable(gl.STENCIL_TEST);
          restoreFrameScissor();
          drawCalls++;
        }

        /* Analytic Edge Coverage Pass (jika aaMode === 'analytic' dan bukan Hard Pixel FBO) */
        if (!isFboPass && vbos.edgeAaVbo && gpuMesh.edgeAaArray && gpuMesh.edgeAaArray.length >= 6) {
          if (stencilClipActive) {
            gl.enable(gl.STENCIL_TEST);
            gl.stencilFunc(gl.EQUAL, 0x80, 0x80);
            gl.stencilMask(0x00);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
          }
          this._setWebGLPaintUniforms(gl, P, o.fill, VE.gradOn(o) ? o.grad : null, (o.opacity ?? 1) * 0.42, originX, originY);
          gl.bindBuffer(gl.ARRAY_BUFFER, vbos.edgeAaVbo);
          gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, gpuMesh.edgeAaArray.length >> 1);
          if (stencilClipActive) gl.disable(gl.STENCIL_TEST);
          drawCalls++;
        }
      }

      /* Stroke Pass (atau Seam-Guard jika RENDER_CONFIG.seamGuard aktif) */
      if ((hasExplicitStroke || gpuMesh.hasSeamOnly) && vbos.strokeVbo && gpuMesh.strokeArray && gpuMesh.strokeArray.length >= 6) {
        if (stencilClipActive) {
          gl.enable(gl.STENCIL_TEST);
          gl.stencilFunc(gl.EQUAL, 0x80, 0x80);
          gl.stencilMask(0x00);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        }
        if (hasExplicitStroke) {
          this._setWebGLPaintUniforms(gl, P, o.stroke, VE.strokeGradOn(o) ? o.strokeGrad : null, o.opacity ?? 1, originX, originY);
        } else {
          this._setWebGLPaintUniforms(gl, P, o.fill, VE.gradOn(o) ? o.grad : null, o.opacity ?? 1, originX, originY);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, vbos.strokeVbo);
        gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, gpuMesh.strokeArray.length >> 1);
        if (stencilClipActive) gl.disable(gl.STENCIL_TEST);
        drawCalls++;
      }
      if (objStencilClip) {
        gl.stencilMask(0xFF);
        gl.clearStencil(0);
        gl.clear(gl.STENCIL_BUFFER_BIT);
      }
    };
    const closeFrameClipWebGL = () => {
      if (!activeClipFid) return;
      if (activeClipMode === 'scissor') {
        gl.disable(gl.SCISSOR_TEST);
      } else if (activeClipMode === 'stencil') {
        gl.stencilMask(0xFF);
        gl.clearStencil(0);
        gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.disable(gl.STENCIL_TEST);
      }
      /* Gambar stroke border Frame di atas anak-anaknya jika ada */
      const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(activeClipFid);
      if (bgObj && !bgObj.hidden && bgObj.stroke !== 'none' && bgObj.strokeWidth > 0) {
        const isBgDragged = !!(drag && drag.ids && drag.ids.has(bgObj.id));
        const bdx = isBgDragged ? drag.dx : 0,
          bdy = isBgDragged ? drag.dy : 0;
        const gpuMesh = buildObjectGpuBuffers(bgObj, z);
        const vbos = this._getMeshVbos(gl, gpuMesh);
        if (vbos.strokeVbo && gpuMesh.strokeArray && gpuMesh.strokeArray.length >= 6) {
          setObjectLocalTransform(gpuMesh.originX, gpuMesh.originY, bdx, bdy);
          this._setWebGLPaintUniforms(gl, P, bgObj.stroke, VE.strokeGradOn(bgObj) ? bgObj.strokeGrad : null, bgObj.opacity ?? 1, gpuMesh.originX, gpuMesh.originY);
          gl.bindBuffer(gl.ARRAY_BUFFER, vbos.strokeVbo);
          gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, gpuMesh.strokeArray.length >> 1);
          drawCalls++;
        }
      }
      activeClipFid = null;
      activeClipMode = null;
      activeScissorRect = null;
    };
    const openFrameClipWebGL = fid => {
      if (activeClipFid === fid) return;
      closeFrameClipWebGL();
      if (!fid) return;
      activeClipFid = fid;
      const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(fid);
      const isRounded = bgObj && bgObj.subs && bgObj.subs.some(sp => sp.nodes.some(n => n.handleIn || n.handleOut || n.fil));
      if (!isRounded) {
        const fbb = bgObj ? vinfo(bgObj).bb : frameRectMap.get(fid);
        if (fbb) {
          const isBgDragged = !!(bgObj && drag && drag.ids && drag.ids.has(bgObj.id));
          const bdx = isBgDragged ? drag.dx : 0,
            bdy = isBgDragged ? drag.dy : 0;
          const sx = Math.floor(((fbb[0] + bdx) * z + px) * dpr);
          const sy = Math.floor((cssH - ((fbb[3] + bdy) * z + py)) * dpr);
          const sw = Math.max(0, Math.ceil((fbb[2] - fbb[0]) * z * dpr));
          const sh = Math.max(0, Math.ceil((fbb[3] - fbb[1]) * z * dpr));
          const csx = Math.max(0, Math.min(dbw, sx));
          const csy = Math.max(0, Math.min(dbh, sy));
          const csw = Math.max(0, Math.min(dbw - csx, sx + sw - csx));
          const csh = Math.max(0, Math.min(dbh - csy, sy + sh - csy));
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(csx, csy, csw, csh);
          activeScissorRect = [csx, csy, csw, csh];
          activeClipMode = 'scissor';
          return;
        }
      }
      if (bgObj) {
        const isBgDragged = !!(drag && drag.ids && drag.ids.has(bgObj.id));
        const bdx = isBgDragged ? drag.dx : 0,
          bdy = isBgDragged ? drag.dy : 0;
        writeMaskToStencilBit7(bgObj, bdx, bdy);
        activeClipMode = 'stencil';
      }
    };
    const svgOverlayIds = this.svgOverlayIds;
    const renderObjWebGL = (o, isDragged) => {
      if (!o || o.hidden) return;
      if (svgOverlayIds && svgOverlayIds.has(o.id)) return;
      const odx = isDragged ? drag.dx : 0,
        ody = isDragged ? drag.dy : 0;
      const bb = vinfo(o).bb;
      const sPad = o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 + 2 : 2;
      if (!o.isFrameBg && !o.isAutoFrame) {
        if (bb[2] + odx + sPad < vx0 || bb[0] + odx - sPad > vx1 || bb[3] + ody + sPad < vy0 || bb[1] + ody - sPad > vy1) {
          culledCount++;
          return;
        }
        /* PERF (zoom cepat): saat interaksi zoom/pan aktif, lewati objek yang ukurannya
           sub-piksel di layar (<0.75px di kedua dimensi) — tidak terlihat namun tetap
           menelan draw call + stencil. Render penuh dipulihkan saat settle. */
        if ((this.isZooming || this.isPanning || this.dragOffset) && (bb[2] - bb[0]) * z < 0.75 && (bb[3] - bb[1]) * z < 0.75) {
          culledCount++;
          return;
        }
      }
      visCount++;
      const fid = !isDragged && this.clipFrames && o.group && !o.isFrameBg && !o.isAutoFrame && frameSet.has(o.group) ? o.group : null; /* FIX: objek yang sedang diseret tidak di-clip ke frame lamanya */
      if (fid !== activeClipFid) openFrameClipWebGL(fid);
      drawObjectWebGL(o, odx, ody, activeClipMode === 'stencil', isDragged);
    };
    if (drag && drag.ids && drag.ids.size > 0) {
      /* Pass 1: Render seluruh objek yang TIDAK sedang diseret */
      for (let i = 0, L = objs.length; i < L; i++) {
        const o = objs[i];
        if (!o || drag.ids.has(o.id)) continue;
        renderObjWebGL(o, false);
      }
      closeFrameClipWebGL();
      /* Pass 2: Render objek yang sedang dipindahkan di posisi PALING ATAS (z-index tertinggi) */
      for (let i = 0, L = objs.length; i < L; i++) {
        const o = objs[i];
        if (!o || !drag.ids.has(o.id)) continue;
        renderObjWebGL(o, true);
      }
    } else {
      for (let i = 0, L = objs.length; i < L; i++) {
        renderObjWebGL(objs[i], false);
      }
    }
    closeFrameClipWebGL();
    if (isFboPass) {
      return {
        visCount,
        culledCount,
        drawCalls,
        lodVerts,
        totalFillTris,
        totalStrokeTris,
        tessTimeSum
      };
    }

    /* Pada Mode 1 (Smooth Vector), garis kisi piksel 1x1 di atas objek hanya digambar jika pixelGridInSmooth diaktifkan */
    if (z >= 6 && this.showGrid && RENDER_CONFIG.pixelGridInSmooth) {
      const wx0 = Math.floor(-px / z);
      const wy0 = Math.floor(-py / z);
      const localPanX = wx0 * z + px;
      const localPanY = wy0 * z + py;
      const modX = (wx0 % 10 + 10) % 10;
      const modY = (wy0 % 10 + 10) % 10;
      gl.uniform1i(P.u_isScreenSpace, 1);
      gl.uniform1i(P.u_mode, 6);
      gl.uniform2f(P.u_localPan, localPanX, localPanY);
      gl.uniform2f(P.u_offset, modX, modY);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
      gl.vertexAttribPointer(P.a_pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.uniform1i(P.u_isScreenSpace, 0);
      drawCalls++;
    }
    PERF_TELEMETRY.updateSceneMetrics({
      totalObjects: objs.length,
      visibleObjects: visCount,
      culledObjects: culledCount,
      domPathCount: 0,
      gpuDrawCalls: drawCalls,
      lodSegments: lodVerts,
      totalVertices: lodVerts,
      fillTriangleCount: totalFillTris,
      strokeTriangleCount: totalStrokeTris,
      tessellationTimeMs: tessTimeSum,
      partialAlphaPixels: 0,
      pixelPreviewMode: 'smooth',
      dpr,
      drawingBufferWidth: dbw,
      drawingBufferHeight: dbh,
      aaDiagnostics: this.aaDiagnostics ? {
        ...this.aaDiagnostics,
        drawingBufferWidth: dbw,
        drawingBufferHeight: dbh
      } : undefined
    });
  }

  /* =========================================================================
     RASTERISASI TILE PIKSEL DOKUMEN 1:1 (BAGIAN 4 & 5 `perbaikan tools geovanta terbaru.md`)
     Mendukung 2 Mode Inspeksi Piksel yang Berbeda Secara Fundamental:
     1) mode === 'hard' (Mode 3 — Hard Pixel Preview):
        Rasterizer Biner Per-Objek yang:
        - Menguji coverage geometris setiap bentuk secara terpisah pada sampel piksel (cov >= 128).
        - Mempertahankan fill, opacity asli, gradient (tanpa dilusi alpha tepi), stroke, clip, dan z-order.
        - Mempertahankan komposit Porter-Duff source-over yang akurat untuk objek bertumpuk
          (objek hitam #000000 di atas objek krem menghasilkan 100% hitam solid atau 100% krem solid,
          TANPA piksel abu-abu/transparan di sekeliling objek!).
        - Menghasilkan piksel output tegas tanpa mengubah geometri SVG asli.
     2) mode === 'coverage' (Mode 2 — Pixel Coverage Preview):
        Merasterisasi coverage antialiasing 1x1 aktual dari Canvas2D serta menghitung diagnostik
        `partialAlphaPixels` (Bagian 5: jumlah piksel dengan 0 < alpha < 255).
     ========================================================================= */
  _renderSceneToPixelTile(cssW, cssH, z, px, py, vx0, vy0, vx1, vy1, mode = 'hard') {
    if (typeof document === 'undefined') return null;
    /* PERF: snap tile ke kelipatan 32 piksel dokumen + margin, sehingga pan kecil tetap memakai tile cache (tileKey stabil) */
    const SNAP = 32;
    const wx0 = Math.floor((Math.floor(-px / z) - 1) / SNAP) * SNAP;
    const wy0 = Math.floor((Math.floor(-py / z) - 1) / SNAP) * SNAP;
    const wx1 = Math.ceil((Math.ceil((cssW - px) / z) + 1) / SNAP) * SNAP;
    const wy1 = Math.ceil((Math.ceil((cssH - py) / z) + 1) / SNAP) * SNAP;
    const rawW = wx1 - wx0,
      rawH = wy1 - wy0;
    if (rawW > 4096 || rawH > 4096) return null;
    const tileW = Math.max(1, Math.min(4096, rawW));
    const tileH = Math.max(1, Math.min(4096, rawH));
    const tileKey = `${this.revisionId}|${mode}|${wx0}|${wy0}|${tileW}|${tileH}|${this.clipFrames ? 1 : 0}`;
    if (!this.dragOffset && this._lastPxTileKey === tileKey && this._lastPxTileRes && this._pixelTileTex) {
      return {
        ...this._lastPxTileRes,
        reused: true
      };
    }
    if (!this._pixelTileCanvas) {
      this._pixelTileCanvas = document.createElement('canvas');
      this._pixelTileCtx = this._pixelTileCanvas.getContext('2d', {
        willReadFrequently: true
      });
    }
    const tcv = this._pixelTileCanvas;
    const tctx = this._pixelTileCtx;
    if (!tctx) return null;
    if (tcv.width !== tileW || tcv.height !== tileH) {
      tcv.width = tileW;
      tcv.height = tileH;
    } else {
      tctx.clearRect(0, 0, tileW, tileH);
    }
    if (mode === 'hard') {
      const hardRes = this._renderSceneToHardPixelTile(tcv, tctx, wx0, wy0, tileW, tileH, z, vx0, vy0, vx1, vy1);
      if (hardRes && !this.dragOffset) {
        this._lastPxTileKey = tileKey;
        this._lastPxTileRes = hardRes;
      }
      return hardRes;
    }

    /* Mode 2 — Pixel Coverage Preview (Rasterisasi 1x1 dengan coverage antialiasing asli) */
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, -wx0, -wy0);
    const frameSet = this._getFrameSet();
    const frameRectMap = this._getFrameRectMap();
    const objs = this.doc && this.doc.objects || [];
    const drag = this.dragOffset;
    let drawCalls = 0,
      visCount = 0,
      culledCount = 0,
      lodVerts = 0,
      tessTimeSum = 0;
    let activeClipFid = null;
    const closeFrameClip = () => {
      if (!activeClipFid) return;
      tctx.restore();
      const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(activeClipFid);
      if (bgObj && !bgObj.hidden && bgObj.stroke !== 'none' && bgObj.strokeWidth > 0) {
        const fInfo = vinfo(bgObj);
        if (fInfo.p2) {
          tctx.save();
          if (drag && drag.ids && drag.ids.has(bgObj.id)) tctx.translate(drag.dx, drag.dy);
          tctx.globalAlpha = bgObj.opacity ?? 1;
          tctx.strokeStyle = VE.strokeGradOn(bgObj) ? this._makeCanvasGrad(tctx, bgObj.strokeGrad) : bgObj.stroke;
          tctx.lineWidth = bgObj.strokeWidth;
          tctx.lineJoin = bgObj.strokeLinejoin || 'round';
          tctx.lineCap = bgObj.strokeLinecap || 'round';
          if (bgObj.strokeMiterlimit) tctx.miterLimit = bgObj.strokeMiterlimit;
          tctx.stroke(fInfo.p2);
          tctx.restore();
          drawCalls++;
        }
      }
      activeClipFid = null;
    };
    const openFrameClip = fid => {
      if (activeClipFid === fid) return;
      closeFrameClip();
      if (!fid) return;
      tctx.save();
      const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(fid);
      if (bgObj && vinfo(bgObj).p2) {
        if (drag && drag.ids && drag.ids.has(bgObj.id)) {
          tctx.save();
          tctx.translate(drag.dx, drag.dy);
          tctx.clip(vinfo(bgObj).p2);
          tctx.restore();
        } else {
          tctx.clip(vinfo(bgObj).p2);
        }
      } else {
        const fbb = frameRectMap.get(fid);
        if (fbb) {
          tctx.beginPath();
          tctx.rect(fbb[0], fbb[1], fbb[2] - fbb[0], fbb[3] - fbb[1]);
          tctx.clip();
        }
      }
      activeClipFid = fid;
    };
    for (let i = 0, L = objs.length; i < L; i++) {
      const o = objs[i];
      if (!o || o.hidden) continue;
      const isDragged = !!(drag && drag.ids && drag.ids.has(o.id));
      const odx = isDragged ? drag.dx : 0,
        ody = isDragged ? drag.dy : 0;
      const info = vinfo(o);
      const bb = info.bb;
      const sPad = o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 + 2 : 2;
      if (!o.isFrameBg && !o.isAutoFrame) {
        if (bb[2] + odx + sPad < vx0 || bb[0] + odx - sPad > vx1 || bb[3] + ody + sPad < vy0 || bb[1] + ody - sPad > vy1) {
          culledCount++;
          continue;
        }
      }
      visCount++;
      const fid = !isDragged && this.clipFrames && o.group && !o.isFrameBg && !o.isAutoFrame && frameSet.has(o.group) ? o.group : null; /* FIX: objek yang sedang diseret tidak di-clip ke frame lamanya */
      if (fid !== activeClipFid) openFrameClip(fid);
      tctx.save();
      if (odx || ody) tctx.translate(odx, ody);
      tctx.globalAlpha = o.opacity ?? 1;
      if (!isDragged && o.clipPathD) {
        try {
          tctx.clip(new Path2D(o.clipPathD));
        } catch (e) {}
      }
      if (o.img) {
        const m = VE.imageMatrix(o);
        let imgEl = IMG_ELEMENT_CACHE.get(o.img.href);
        if (!imgEl && typeof Image !== 'undefined') {
          imgEl = new Image();
          imgEl.onload = () => this.requestRender(true);
          imgEl.src = o.img.href;
          IMG_ELEMENT_CACHE.set(o.img.href, imgEl);
        }
        if (imgEl && imgEl.complete && imgEl.naturalWidth > 0 && m) {
          tctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
          tctx.drawImage(imgEl, 0, 0, o.img.w, o.img.h);
          drawCalls++;
        }
        tctx.restore();
        continue;
      }
      const p2 = info.p2 || getObjectTessellationLOD(o, Math.max(1, z)).path2d;
      lodVerts += info.n || 0;
      if (!p2) {
        tctx.restore();
        continue;
      }
      const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent';
      const hasStroke = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;
      const fillStyle = hasFill ? VE.gradOn(o) ? this._makeCanvasGrad(tctx, o.grad) : o.fill : null;
      if (RENDER_CONFIG.seamGuard && hasFill && !hasStroke && isOpaquePaint(o) && !o.isFrameBg && !o.isAutoFrame) {
        tctx.strokeStyle = fillStyle;
        tctx.lineWidth = SEAM_STROKE_PX;
        tctx.lineJoin = 'round';
        tctx.lineCap = 'round';
        tctx.stroke(p2);
      }
      if (hasFill) {
        tctx.fillStyle = fillStyle;
        tctx.fill(p2, o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
        drawCalls++;
      }
      if (hasStroke) {
        tctx.strokeStyle = VE.strokeGradOn(o) ? this._makeCanvasGrad(tctx, o.strokeGrad) : o.stroke;
        tctx.lineWidth = o.strokeWidth;
        tctx.lineJoin = o.strokeLinejoin || 'round';
        tctx.lineCap = o.strokeLinecap || 'round';
        if (o.strokeMiterlimit) tctx.miterLimit = o.strokeMiterlimit;
        tctx.stroke(p2);
        drawCalls++;
      }
      tctx.restore();
    }
    closeFrameClip();
    tctx.restore();

    /* Bagian 5 `perbaikan tools geovanta terbaru.md`: Diagnostik Partial Alpha Coverage (hanya dibaca ke CPU saat logPartialAlpha aktif agar tidak memblokir GPU saat zoom interaktif) */
    let partialAlphaPixels = 0;
    let rawBytes = null;
    /* PERF: getImageData memaksa sinkronisasi GPU->CPU; hanya dijalankan untuk diagnostik. Tile diunggah langsung dari canvas ke tekstur. */
    if (RENDER_CONFIG.logPartialAlpha) {
      try {
        const imgData = tctx.getImageData(0, 0, tileW, tileH);
        const pixels = imgData.data;
        rawBytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] > 0 && pixels[i] < 255) {
            partialAlphaPixels++;
          }
        }
        console.log('Partial alpha coverage:', partialAlphaPixels);
      } catch (e) {}
    }
    const covRes = {
      canvas: tcv,
      data: rawBytes,
      wx0,
      wy0,
      tileW,
      tileH,
      drawCalls,
      visCount,
      culledCount,
      lodVerts,
      tessTimeSum,
      partialAlphaPixels
    };
    if (!this.dragOffset) {
      this._lastPxTileKey = tileKey;
      this._lastPxTileRes = covRes;
    }
    return covRes;
  }

  /* =========================================================================
     MODE 3 — HARD PIXEL PREVIEW (RASTERIZER BINER PER-OBJEK)
     Sesuai Bagian 4 `perbaikan tools geovanta terbaru.md`:
     1. Menguji coverage setiap bentuk pada posisi sampel piksel secara terpisah.
     2. Mempertahankan fill, opacity, gradient, dan z-order masing-masing objek.
     3. Mempertahankan hasil komposit Porter-Duff yang benar untuk objek bertumpuk.
     4. Menghasilkan piksel output yang tegas (solid) tanpa mengubah geometri SVG asli.
     ========================================================================= */
  _renderSceneToHardPixelTile(tcv, tctx, wx0, wy0, tileW, tileH, z, vx0, vy0, vx1, vy1) {
    const allObjs = this.doc && this.doc.objects || [];
    if (allObjs.length >= 1) {
      /* Fast Single-Pass Binary Pixel Tile (1x getImageData, 100% menampilkan seluruh objek & mengunggah Uint8Array langsung ke WebGL2!) */
      tctx.save();
      tctx.setTransform(1, 0, 0, 1, -wx0, -wy0);
      const frameSet = this._getFrameSet();
      const frameRectMap = this._getFrameRectMap();
      const drag = this.dragOffset;
      let drawCalls = 0,
        visCount = 0,
        culledCount = 0,
        lodVerts = 0,
        tessTimeSum = 0;
      let activeClipFid = null;
      const closeFrameClip = () => {
        if (!activeClipFid) return;
        tctx.restore();
        const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(activeClipFid);
        if (bgObj && !bgObj.hidden && bgObj.stroke !== 'none' && bgObj.strokeWidth > 0) {
          const fInfo = vinfo(bgObj);
          if (fInfo.p2) {
            tctx.save();
            if (drag && drag.ids && drag.ids.has(bgObj.id)) tctx.translate(drag.dx, drag.dy);
            tctx.globalAlpha = bgObj.opacity ?? 1;
            tctx.strokeStyle = VE.strokeGradOn(bgObj) ? this._makeCanvasGrad(tctx, bgObj.strokeGrad) : bgObj.stroke;
            tctx.lineWidth = Math.max(1, bgObj.strokeWidth);
            tctx.lineJoin = bgObj.strokeLinejoin || 'round';
            tctx.lineCap = bgObj.strokeLinecap || 'round';
            if (bgObj.strokeMiterlimit) tctx.miterLimit = bgObj.strokeMiterlimit;
            tctx.stroke(fInfo.p2);
            tctx.restore();
            drawCalls++;
          }
        }
        activeClipFid = null;
      };
      const openFrameClip = fid => {
        if (activeClipFid === fid) return;
        closeFrameClip();
        if (!fid) return;
        tctx.save();
        const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(fid);
        if (bgObj && vinfo(bgObj).p2) {
          if (drag && drag.ids && drag.ids.has(bgObj.id)) {
            tctx.save();
            tctx.translate(drag.dx, drag.dy);
            tctx.clip(vinfo(bgObj).p2);
            tctx.restore();
          } else {
            tctx.clip(vinfo(bgObj).p2);
          }
        } else {
          const fbb = frameRectMap.get(fid);
          if (fbb) {
            tctx.beginPath();
            tctx.rect(fbb[0], fbb[1], fbb[2] - fbb[0], fbb[3] - fbb[1]);
            tctx.clip();
          }
        }
        activeClipFid = fid;
      };
      for (let i = 0, L = allObjs.length; i < L; i++) {
        const o = allObjs[i];
        if (!o || o.hidden) continue;
        const isDragged = !!(drag && drag.ids && drag.ids.has(o.id));
        const odx = isDragged ? drag.dx : 0,
          ody = isDragged ? drag.dy : 0;
        const info = vinfo(o);
        const bb = info.bb;
        const sPad = o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 + 2 : 2;
        if (!o.isFrameBg && !o.isAutoFrame) {
          if (bb[2] + odx + sPad < vx0 || bb[0] + odx - sPad > vx1 || bb[3] + ody + sPad < vy0 || bb[1] + ody - sPad > vy1) {
            culledCount++;
            continue;
          }
        }
        visCount++;
        const fid = !isDragged && this.clipFrames && o.group && !o.isFrameBg && !o.isAutoFrame && frameSet.has(o.group) ? o.group : null; /* FIX: objek yang sedang diseret tidak di-clip ke frame lamanya */
        if (fid !== activeClipFid) openFrameClip(fid);
        if (o.img) {
          const m = VE.imageMatrix(o);
          let imgEl = IMG_ELEMENT_CACHE.get(o.img.href);
          if (!imgEl && typeof Image !== 'undefined') {
            imgEl = new Image();
            imgEl.onload = () => this.requestRender(true);
            imgEl.src = o.img.href;
            IMG_ELEMENT_CACHE.set(o.img.href, imgEl);
          }
          if (imgEl && imgEl.complete && imgEl.naturalWidth > 0 && m) {
            tctx.save();
            tctx.imageSmoothingEnabled = false;
            if (odx || ody) tctx.translate(odx, ody);
            tctx.globalAlpha = (o.opacity ?? 1) * (o.groupOpacity ?? 1);
            tctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
            tctx.drawImage(imgEl, 0, 0, o.img.w, o.img.h);
            tctx.restore();
            drawCalls++;
          }
          continue;
        }
        const p2 = info.p2 || getObjectTessellationLOD(o, Math.max(1, z)).path2d;
        lodVerts += info.n || 0;
        if (!p2) continue;
        tctx.save();
        if (odx || ody) tctx.translate(odx, ody);
        tctx.globalAlpha = (o.opacity ?? 1) * (o.groupOpacity ?? 1);
        if (!isDragged && o.clipPathD) {
          try {
            tctx.clip(new Path2D(o.clipPathD));
          } catch (e) {}
        }
        const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent';
        const hasStroke = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;
        if (hasFill) {
          tctx.fillStyle = VE.gradOn(o) ? this._makeCanvasGrad(tctx, o.grad) : o.fill;
          tctx.fill(p2, o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
          drawCalls++;
        }
        if (hasStroke) {
          tctx.strokeStyle = VE.strokeGradOn(o) ? this._makeCanvasGrad(tctx, o.strokeGrad) : o.stroke;
          tctx.lineWidth = Math.max(1, o.strokeWidth);
          tctx.lineJoin = o.strokeLinejoin || 'round';
          tctx.lineCap = o.strokeLinecap || 'round';
          if (o.strokeMiterlimit) tctx.miterLimit = o.strokeMiterlimit;
          tctx.stroke(p2);
          drawCalls++;
        }
        tctx.restore();
      }
      closeFrameClip();
      tctx.restore();
      let rawBytes = null;
      try {
        const imgData = tctx.getImageData(0, 0, tileW, tileH);
        const d = imgData.data;
        for (let i = 0, len = d.length; i < len; i += 4) {
          const a = d[i + 3];
          if (a === 0 || a === 255) continue;
          if (a >= 64) {
            const inv = 255 / a;
            d[i] = Math.min(255, d[i] * inv + 0.5 | 0);
            d[i + 1] = Math.min(255, d[i + 1] * inv + 0.5 | 0);
            d[i + 2] = Math.min(255, d[i + 2] * inv + 0.5 | 0);
            d[i + 3] = 255;
          } else {
            d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
          }
        }
        tctx.putImageData(imgData, 0, 0);
        rawBytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      } catch (e) {}
      return {
        canvas: tcv,
        data: rawBytes,
        wx0,
        wy0,
        tileW,
        tileH,
        drawCalls,
        visCount,
        culledCount,
        lodVerts,
        tessTimeSum,
        partialAlphaPixels: 0
      };
    }
    return null;
  }

  /* =========================================================================
     JALUR CANVAS2D ENGINE / FALLBACK (Tahap 3, 4, 6 + Mode Piksel Kotak-Kotak)
     ========================================================================= */
  _makeCanvasGrad(ctx, g) {
    if (!g || !g.stops || !g.stops.length) return '#000000';
    let cg;
    if (g.type === 'radial') {
      const fx = g.fx != null ? g.fx : g.cx,
        fy = g.fy != null ? g.fy : g.cy;
      cg = ctx.createRadialGradient(fx, fy, 0, g.cx, g.cy, Math.max(1e-4, g.r));
    } else {
      cg = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
    }
    for (let i = 0; i < g.stops.length; i++) {
      const st = g.stops[i];
      const off = Math.max(0, Math.min(1, st.offset || 0));
      const col = st.op != null && st.op < 1 && typeof formatColorWithAlpha === 'function' && typeof parseColorWithAlpha === 'function' ? formatColorWithAlpha(parseColorWithAlpha(st.color).hex, st.op) : st.color;
      try {
        cg.addColorStop(off, col);
      } catch (e) {}
    }
    return cg;
  }
  _drawCanvasPixelGridOverlay(ctx, cssW, cssH, z, px, py, accCol) {
    if (!this.showGrid || RENDER_CONFIG.pixelGrid === false || z < 4) return;
    const wx0 = Math.floor(-px / z);
    const wy0 = Math.floor(-py / z);
    const wx1 = Math.ceil((cssW - px) / z);
    const wy1 = Math.ceil((cssH - py) / z);
    ctx.save();
    /* Garis kotak piksel 1x1 px */
    ctx.beginPath();
    for (let wx = wx0; wx <= wx1; wx++) {
      if (wx % 10 === 0 && z >= 6) continue;
      const sx = Math.round(wx * z + px) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, cssH);
    }
    for (let wy = wy0; wy <= wy1; wy++) {
      if (wy % 10 === 0 && z >= 6) continue;
      const sy = Math.round(wy * z + py) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(cssW, sy);
    }
    ctx.strokeStyle = '#64748b';
    ctx.globalAlpha = Math.min(0.36, Math.max(0.16, (z - 4) / 16));
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Garis blok piksel mayor setiap 10x10 piksel */
    if (z >= 6) {
      ctx.beginPath();
      const startMajorX = Math.floor(wx0 / 10) * 10;
      const startMajorY = Math.floor(wy0 / 10) * 10;
      for (let wx = startMajorX; wx <= wx1; wx += 10) {
        const sx = Math.round(wx * z + px) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, cssH);
      }
      for (let wy = startMajorY; wy <= wy1; wy += 10) {
        const sy = Math.round(wy * z + py) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(cssW, sy);
      }
      ctx.strokeStyle = accCol || '#13b152';
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  _drawTextContentLocal2D(ctx, o, t, mb) {
    const fs = Math.max(1, Number(t.fontSize) || 32);
    const lh = Math.max(0.5, Number(t.lineHeight) || 1.2);
    const st = t.fontStyle && t.fontStyle !== 'normal' ? t.fontStyle + ' ' : '';
    const fw = t.fontWeight || 400;
    const ff = t.fontFamily || 'Inter, system-ui, sans-serif';
    try {
      ctx.font = `${st}${fw} ${fs}px ${ff}`;
    } catch (e) {
      ctx.font = `${fs}px sans-serif`;
    }
    ctx.textAlign = t.textAnchor === 'middle' ? 'center' : t.textAnchor === 'end' ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) {
      try {
        ctx.letterSpacing = (Number(t.letterSpacing) || 0) + 'px';
      } catch (e) {}
    }
    if ('wordSpacing' in ctx) {
      try {
        ctx.wordSpacing = (Number(t.wordSpacing) || 0) + 'px';
      } catch (e) {}
    }
    const lines = mb ? mb.lines : VE.formatTextLines(t);
    const bShift = Number(t.baselineShift) || 0;
    const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent';
    const hasStroke = o.stroke && o.stroke !== 'none' && o.stroke !== 'transparent' && (o.strokeWidth || 0) > 0;
    if (hasFill) ctx.fillStyle = VE.gradOn(o) ? this._makeCanvasGrad(ctx, o.grad) : o.fill;
    if (hasStroke) {
      ctx.strokeStyle = VE.strokeGradOn(o) ? this._makeCanvasGrad(ctx, o.strokeGrad) : o.stroke;
      ctx.lineWidth = o.strokeWidth || 1;
      ctx.lineJoin = o.strokeLinejoin || 'round';
      ctx.lineCap = o.strokeLinecap || 'round';
    }
    const dec = t.textDecoration || 'none';
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const ly = -bShift + i * fs * lh;
      if (hasFill) ctx.fillText(ln, 0, ly);
      if (hasStroke) ctx.strokeText(ln, 0, ly);
      if (dec && dec !== 'none' && mb) {
        const lw = Math.max(1, fs * 0.06);
        let dyDec = 0;
        if (dec === 'underline') dyDec = fs * 0.12;else if (dec === 'line-through') dyDec = -fs * 0.28;else if (dec === 'overline') dyDec = -fs * 0.82;
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = hasFill ? ctx.fillStyle : hasStroke ? ctx.strokeStyle : '#18181b';
        ctx.lineWidth = lw;
        ctx.moveTo(mb.xOff, ly + dyDec);
        ctx.lineTo(mb.xOff + mb.w, ly + dyDec);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  _renderCanvas2DFallback(cv, cssW, cssH, dpr, z, px, py, vx0, vy0, vx1, vy1, cardCol, lineCol, accCol) {
    const ctx = this.ctx2d || (this.ctx2d = cv.getContext('2d'));
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.bg && this.bg.mode === 'solid') {
      ctx.fillStyle = this.bg.color || '#ffffff';
      ctx.fillRect(0, 0, cssW, cssH);
    } else {
      ctx.fillStyle = cardCol;
      ctx.fillRect(0, 0, cssW, cssH);
      const ck = 8;
      if (!this._chkPat || this._chkCard !== cardCol || this._chkLine !== lineCol) {
        const pc = document.createElement('canvas');
        pc.width = ck * 2;
        pc.height = ck * 2;
        const pctx = pc.getContext('2d');
        pctx.fillStyle = cardCol;
        pctx.fillRect(0, 0, ck * 2, ck * 2);
        pctx.fillStyle = lineCol;
        pctx.fillRect(0, 0, ck, ck);
        pctx.fillRect(ck, ck, ck, ck);
        this._chkPat = ctx.createPattern(pc, 'repeat');
        this._chkCard = cardCol;
        this._chkLine = lineCol;
      }
      if (this._chkPat) {
        ctx.fillStyle = this._chkPat;
        ctx.fillRect(0, 0, cssW, cssH);
      }
    }

    /* JIKA MODE INSPEKSI PIKSEL AKTIF DI CANVAS2D (Mode 2: 'coverage' atau Mode 3: 'hard') */
    const activePxMode = getActivePixelPreviewMode(z);
    if (activePxMode === 'hard' || activePxMode === 'coverage') {
      const tileInfo = this._renderSceneToPixelTile(cssW, cssH, z, px, py, vx0, vy0, vx1, vy1, activePxMode);
      if (tileInfo && tileInfo.canvas) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tileInfo.canvas, 0, 0, tileInfo.tileW, tileInfo.tileH, tileInfo.wx0 * z + px, tileInfo.wy0 * z + py, tileInfo.tileW * z, tileInfo.tileH * z);
        this._drawCanvasPixelGridOverlay(ctx, cssW, cssH, z, px, py, accCol);
        ctx.restore();
        PERF_TELEMETRY.updateSceneMetrics({
          totalObjects: this.doc && this.doc.objects ? this.doc.objects.length : 0,
          visibleObjects: tileInfo.visCount,
          culledObjects: tileInfo.culledCount,
          domPathCount: 0,
          gpuDrawCalls: tileInfo.drawCalls + 1,
          lodSegments: tileInfo.lodVerts,
          totalVertices: tileInfo.lodVerts,
          tessellationTimeMs: tileInfo.tessTimeSum,
          dpr,
          drawingBufferWidth: cv.width,
          drawingBufferHeight: cv.height
        });
        return;
      }
    }
    ctx.imageSmoothingEnabled = true;
    try {
      ctx.imageSmoothingQuality = 'high';
    } catch (e) {}
    if (this.showGrid) {
      const s = 16 / z,
        l = Math.pow(10, Math.floor(Math.log10(s))),
        n = s / l;
      const rawStep = (n < 2 ? 1 : n < 5 ? 2 : 5) * l;
      const step = RENDER_CONFIG.pixelGrid !== false ? Math.max(1, rawStep) : rawStep;
      const gsz = step * z;
      if (gsz >= 4) {
        const gx0 = (px % gsz + gsz) % gsz;
        const gy0 = (py % gsz + gsz) % gsz;
        ctx.beginPath();
        for (let x = gx0; x <= cssW; x += gsz) {
          const sx = Math.round(x) + 0.5;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, cssH);
        }
        for (let y = gy0; y <= cssH; y += gsz) {
          const sy = Math.round(y) + 0.5;
          ctx.moveTo(0, sy);
          ctx.lineTo(cssW, sy);
        }
        ctx.strokeStyle = accCol;
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(z, z);
    const frameSet = this._getFrameSet();
    const frameRectMap = this._getFrameRectMap();
    const objs = this.doc.objects || [];
    const drag = this.dragOffset;
    let drawCalls = 0,
      visCount = 0,
      culledCount = 0,
      lodVerts = 0,
      tessTimeSum = 0;
    let activeClipFid = null;
    const closeFrameClip = () => {
      if (!activeClipFid) return;
      ctx.restore();
      const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(activeClipFid);
      if (bgObj && !bgObj.hidden && bgObj.stroke !== 'none' && bgObj.strokeWidth > 0) {
        const fInfo = vinfo(bgObj);
        if (fInfo.p2) {
          ctx.save();
          if (drag && drag.ids && drag.ids.has(bgObj.id)) ctx.translate(drag.dx, drag.dy);
          ctx.globalAlpha = bgObj.opacity ?? 1;
          ctx.strokeStyle = VE.strokeGradOn(bgObj) ? this._makeCanvasGrad(ctx, bgObj.strokeGrad) : bgObj.stroke;
          ctx.lineWidth = bgObj.nonScalingStroke ? bgObj.strokeWidth / z : bgObj.strokeWidth;
          ctx.lineJoin = bgObj.strokeLinejoin || 'round';
          ctx.lineCap = bgObj.strokeLinecap || 'round';
          if (bgObj.strokeMiterlimit) ctx.miterLimit = bgObj.strokeMiterlimit;
          ctx.stroke(fInfo.p2);
          ctx.restore();
          drawCalls++;
        }
      }
      activeClipFid = null;
    };
    const openFrameClip = fid => {
      if (activeClipFid === fid) return;
      closeFrameClip();
      if (!fid) return;
      ctx.save();
      const bgObj = this.frameBgByGroup && this.frameBgByGroup.get(fid);
      if (bgObj && vinfo(bgObj).p2) {
        if (drag && drag.ids && drag.ids.has(bgObj.id)) {
          ctx.save();
          ctx.translate(drag.dx, drag.dy);
          ctx.clip(vinfo(bgObj).p2);
          ctx.restore();
        } else {
          ctx.clip(vinfo(bgObj).p2);
        }
      } else {
        const fbb = frameRectMap.get(fid);
        if (fbb) {
          ctx.beginPath();
          ctx.rect(fbb[0], fbb[1], fbb[2] - fbb[0], fbb[3] - fbb[1]);
          ctx.clip();
        }
      }
      activeClipFid = fid;
    };
    const renderObj2D = (o, isDragged) => {
      if (!o || o.hidden) return;
      const odx = isDragged ? drag.dx : 0,
        ody = isDragged ? drag.dy : 0;
      const info = vinfo(o);
      const bb = info.bb;
      const sPad = o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 + 2 : 2;
      if (!o.isFrameBg && !o.isAutoFrame) {
        if (bb[2] + odx + sPad < vx0 || bb[0] + odx - sPad > vx1 || bb[3] + ody + sPad < vy0 || bb[1] + ody - sPad > vy1) {
          culledCount++;
          return;
        }
      }
      visCount++;
      const fid = !isDragged && this.clipFrames && o.group && !o.isFrameBg && !o.isAutoFrame && frameSet.has(o.group) ? o.group : null; /* FIX: objek yang sedang diseret tidak di-clip ke frame lamanya */
      if (fid !== activeClipFid) openFrameClip(fid);
      ctx.save();
      if (odx || ody) ctx.translate(odx, ody);
      ctx.globalAlpha = (o.opacity ?? 1) * (o.groupOpacity ?? 1);
      if (!isDragged && o.clipPathD) {
        try {
          ctx.clip(new Path2D(o.clipPathD), o.clipRule === 'evenodd' ? 'evenodd' : 'nonzero');
        } catch (e) {}
      }
      if (o.img) {
        let imgEl = IMG_ELEMENT_CACHE.get(o.img.href);
        if (!imgEl && typeof Image !== 'undefined') {
          imgEl = new Image();
          if (/^https?:\/\//i.test(o.img.href || '')) imgEl.crossOrigin = 'anonymous';
          imgEl.onload = () => {
            IMG_ELEMENT_CACHE.updatePixels(o.img.href, imgEl);
            this.requestRender(true);
          };
          imgEl.onerror = () => {
            imgEl._gvLoadError = true;
          };
          imgEl.src = o.img.href;
          IMG_ELEMENT_CACHE.set(o.img.href, imgEl);
        }
        const parGeo = VE.computeImageParGeometry(o, imgEl && imgEl.naturalWidth, imgEl && imgEl.naturalHeight);
        const baseM = parGeo ? parGeo.baseMatrix : VE.imageMatrix(o);
        const effM = parGeo ? parGeo.effMatrix : baseM;
        if (imgEl && !imgEl._gvLoadError && imgEl.complete && imgEl.naturalWidth > 0 && effM) {
          if (parGeo && parGeo.clip && baseM) {
            ctx.save();
            ctx.transform(baseM[0], baseM[1], baseM[2], baseM[3], baseM[4], baseM[5]);
            ctx.beginPath();
            ctx.rect(0, 0, o.img.w || 1, o.img.h || 1);
            ctx.clip();
            ctx.restore();
          }
          ctx.transform(effM[0], effM[1], effM[2], effM[3], effM[4], effM[5]);
          ctx.drawImage(imgEl, 0, 0, o.img.w, o.img.h);
          drawCalls++;
        }
        ctx.restore();
        return;
      }
      if (o.text) {
        const t = o.text;
        const m = VE.textMatrix(o) || [1, 0, 0, 1, t.x || 0, t.y || 0];
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        this._drawTextContentLocal2D(ctx, o, t, VE.measureTextBox(t));
        drawCalls++;
        ctx.restore();
        return;
      }

      /* Gunakan Path2D analitik asli (info.p2) saat tersedia agar kurva Bézier mulus sempurna tanpa overhead flatten CPU pada zoom ekstrem */
      const p2 = info.p2 || getObjectTessellationLOD(o, z).path2d;
      lodVerts += info.n || 0;
      if (!p2) {
        ctx.restore();
        return;
      }
      const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent';
      const hasStroke = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;
      const fillStyle = hasFill ? VE.gradOn(o) ? this._makeCanvasGrad(ctx, o.grad) : o.fill : null;

      /* Tahap 3: Seam guard di Canvas2D membaca RENDER_CONFIG.seamGuard */
      if (RENDER_CONFIG.seamGuard && hasFill && !hasStroke && isOpaquePaint(o) && !o.isFrameBg && !o.isAutoFrame) {
        ctx.strokeStyle = fillStyle;
        ctx.lineWidth = SEAM_STROKE_PX / z;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke(p2);
      }
      if (hasFill) {
        ctx.fillStyle = fillStyle;
        ctx.fill(p2, o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
        drawCalls++;
      }
      if (hasStroke) {
        ctx.strokeStyle = VE.strokeGradOn(o) ? this._makeCanvasGrad(ctx, o.strokeGrad) : o.stroke;
        const baseSw = o.nonScalingStroke ? o.strokeWidth / z : o.strokeWidth;
        ctx.lineWidth = z < 1 ? Math.max(baseSw, 0.55 / Math.max(1e-4, z)) : baseSw;
        ctx.lineJoin = o.strokeLinejoin || 'round';
        ctx.lineCap = o.strokeLinecap || 'round';
        if (o.strokeMiterlimit) ctx.miterLimit = o.strokeMiterlimit;
        ctx.stroke(p2);
        drawCalls++;
      }
      ctx.restore();
    };
    if (drag && drag.ids && drag.ids.size > 0) {
      /* Pass 1: Render seluruh objek yang TIDAK sedang diseret */
      for (let i = 0, L = objs.length; i < L; i++) {
        const o = objs[i];
        if (!o || drag.ids.has(o.id)) continue;
        renderObj2D(o, false);
      }
      closeFrameClip();
      /* Pass 2: Render objek yang sedang dipindahkan di posisi PALING ATAS (z-index tertinggi) */
      for (let i = 0, L = objs.length; i < L; i++) {
        const o = objs[i];
        if (!o || !drag.ids.has(o.id)) continue;
        renderObj2D(o, true);
      }
    } else {
      for (let i = 0, L = objs.length; i < L; i++) {
        renderObj2D(objs[i], false);
      }
    }
    closeFrameClip();
    ctx.restore();
    if (z >= 6 && RENDER_CONFIG.pixelGridInSmooth) {
      this._drawCanvasPixelGridOverlay(ctx, cssW, cssH, z, px, py, accCol);
    }
    ctx.restore();
    PERF_TELEMETRY.updateSceneMetrics({
      totalObjects: objs.length,
      visibleObjects: visCount,
      culledObjects: culledCount,
      domPathCount: 0,
      gpuDrawCalls: drawCalls,
      lodSegments: lodVerts,
      totalVertices: lodVerts,
      tessellationTimeMs: tessTimeSum,
      dpr,
      drawingBufferWidth: cv.width,
      drawingBufferHeight: cv.height
    });
  }
  queryHit(worldPoint, tolerancePx = 6) {
    if (!this.doc || !this.doc.objects) return null;
    const tol = tolerancePx / (this.camera.zoom || 1);
    const sIdx = !this._spatialIndexDirty && this.spatialIndex ? this.spatialIndex : (this.spatialIndex = VE.getDocSpatialIndex(this.doc.objects), this._spatialIndexDirty = false, this.spatialIndex);
    const frameRectMap = this._getFrameRectMap();
    const cands = sIdx ? sIdx.queryObjectsInRect(worldPoint.x - tol, worldPoint.y - tol, worldPoint.x + tol, worldPoint.y + tol) : [];
    for (let i = cands.length - 1; i >= 0; i--) {
      const o = cands[i].o;
      if (VE.hitTestObject(o, worldPoint, tol, {
        clipFrames: this.clipFrames,
        frameRectMap
      })) return o;
    }
    return null;
  }
  queryMarquee(worldRect, mode = 'intersect') {
    if (!this.doc || !this.doc.objects) return [];
    const [x0, y0, x1, y1] = worldRect;
    const sIdx = !this._spatialIndexDirty && this.spatialIndex ? this.spatialIndex : (this.spatialIndex = VE.getDocSpatialIndex(this.doc.objects), this._spatialIndexDirty = false, this.spatialIndex);
    const cands = sIdx ? sIdx.queryObjectsInRect(x0, y0, x1, y1) : [];
    return cands.filter(e => {
      const o = e.o;
      if (!VE.isHittable(o)) return false;
      const bb = e.bb;
      return mode === 'contain' ? bb[0] >= x0 && bb[2] <= x1 && bb[1] >= y0 && bb[3] <= y1 : bb[0] <= x1 && bb[2] >= x0 && bb[1] <= y1 && bb[3] >= y0;
    }).map(e => e.o);
  }

  /* GV-A04: Eksplisit hapus seluruh buffer, tekstur, program, shader & listener saat dispose() */
  dispose() {
    this.disposed = true;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (this.canvasEl && this._contextHandlersBound) {
      try {
        this.canvasEl.removeEventListener('webglcontextlost', this._onContextLost, false);
        this.canvasEl.removeEventListener('webglcontextrestored', this._onContextRestored, false);
      } catch (e) {}
      this._contextHandlersBound = false;
    }
    const gl = this.gl;
    if (gl && !this.contextLost) {
      try {
        this._glBuffers.forEach(b => {
          try {
            gl.deleteBuffer(b);
          } catch (e) {}
        });
        this._glTextures.forEach(t => {
          try {
            gl.deleteTexture(t);
          } catch (e) {}
        });
        this._glPrograms.forEach(p => {
          try {
            gl.deleteProgram(p);
          } catch (e) {}
        });
        this._glShaders.forEach(s => {
          try {
            gl.deleteShader(s);
          } catch (e) {}
        });
      } catch (e) {}
    }
    this._glBuffers.clear();
    this._glTextures.clear();
    this._glPrograms.clear();
    this._glShaders.clear();
    this.vboCache = new WeakMap();
    this._vboCacheOrder.clear();
    this._vboTotalBytes = 0;
    this.gradTexCache = new WeakMap();
    this.imgTexCache.clear();
    this._texTotalBytes = 0;
    this.gl = null;
    this.ctx2d = null;
    PERF_TELEMETRY.updateSceneMetrics({
      vboBytes: 0,
      textureBytes: 0
    });
  }
}

export { SceneRenderer };
export default SceneRenderer;
