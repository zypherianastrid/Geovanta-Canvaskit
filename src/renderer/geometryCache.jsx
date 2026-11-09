/**
 * @file src/renderer/geometryCache.jsx
 * @description Manajer cache memori geometri LRU (GEOMETRY_CACHE) & anggaran buffer GPU
 */
import { PERF_TELEMETRY, RENDER_CONFIG } from '../utils/renderConfigAndTelemetry.jsx';
import { ACTIVE_DEVICE_PROFILE } from '../utils/gpuCapabilities.jsx';
import { vinfo } from './pathWindingAndBatching.jsx';

/* =========================================================================
   NEUTRAL SCENE RENDERER ABSTRACTION & ADAPTIVE TESSELLATION LOD (Sections 5, 6, 7)
   - Mendukung backend: WebGPU -> WebGL2 (Scissor + Stencil Frame Clipping) -> Canvas2D -> SVG DOM Baseline
   - Screen-Space Adaptive Flattening (De Casteljau, epsilon = 0.25 / zoom) dengan LOD Bucket Cache floor(log2(zoom))
   ========================================================================= */
/* =========================================================================
   TAHAP 2 — CANONICAL GEOMETRY ENGINE & GEOMETRY CACHE (Bagian 2.1, 2.2, 2.3)
   Struktur Cache:
   GeometryCache
     └── Object ID
         ├── Geometry Revision (Tidak berubah saat ganti fill/warna/opacity!)
         ├── LOD Bucket (LRU, tanpa batas maksimum 6 / 64x)
         ├── Flattened Polylines (World & Local Rebasing Float32)
         ├── Vertex Count
         └── Tessellation Metadata (tessellationTimeMs, maxDepthReached, toleranceMet, budgetHit)
   ========================================================================= */
const MAX_LOD_BUCKETS_PER_OBJ = 12;
const MAX_GPU_MESH_PER_OBJ = 12;
const MAX_CACHED_OBJECTS = 32768;
const GEOMETRY_CACHE = (() => {
  const store = new Map(); // objId -> { geometryRevision, geoSignature, originX, originY, rebasing, hasCurves, byteSize, lastObjRef, lodBuckets: Map, gpuMeshBuckets: Map }
  const subsRefToSig = new WeakMap();
  let nextRevCounter = 1;
  let hits = 0,
    misses = 0,
    totalGeometryBytes = 0;
  const estimateLodBytes = lod => {
    if (!lod) return 0;
    if (lod._byteSize != null) return lod._byteSize;
    let b = 64;
    if (lod.polylines) for (let i = 0; i < lod.polylines.length; i++) b += lod.polylines[i].coords ? lod.polylines[i].coords.byteLength : 0;
    if (lod.localPolylines) for (let i = 0; i < lod.localPolylines.length; i++) b += lod.localPolylines[i].coords ? lod.localPolylines[i].coords.byteLength : 0;
    lod._byteSize = b;
    return b;
  };
  const estimateGpuMeshBytes = gm => {
    if (!gm) return 0;
    if (gm._byteSize != null) return gm._byteSize;
    const b = 64 + (gm.earArray ? gm.earArray.byteLength : 0) + (gm.fanArray ? gm.fanArray.byteLength : 0) + (gm.coverArray ? gm.coverArray.byteLength : 0) + (gm.strokeArray ? gm.strokeArray.byteLength : 0) + (gm.edgeAaArray ? gm.edgeAaArray.byteLength : 0);
    gm._byteSize = b;
    return b;
  };
  const estimateEntryBytes = entry => {
    if (!entry) return 0;
    let b = 128;
    if (entry.lodBuckets) entry.lodBuckets.forEach(l => {
      b += estimateLodBytes(l);
    });
    if (entry.gpuMeshBuckets) entry.gpuMeshBuckets.forEach(gm => {
      b += estimateGpuMeshBytes(gm);
    });
    entry.byteSize = b;
    return b;
  };
  const recomputeTotalBytes = () => {
    let sum = 0;
    store.forEach(e => {
      sum += estimateEntryBytes(e);
    });
    totalGeometryBytes = sum;
    PERF_TELEMETRY.updateSceneMetrics({
      geometryCacheBytes: totalGeometryBytes,
      cachedObjectsCount: store.size
    });
    return totalGeometryBytes;
  };
  const registerLodBytes = (entry, lod, sign) => {
    const b = estimateLodBytes(lod);
    entry.byteSize = Math.max(128, (entry.byteSize || 128) + sign * b);
    totalGeometryBytes = Math.max(0, totalGeometryBytes + sign * b);
  };
  const registerGpuMeshBytes = (entry, gm, sign) => {
    const b = estimateGpuMeshBytes(gm);
    entry.byteSize = Math.max(128, (entry.byteSize || 128) + sign * b);
    totalGeometryBytes = Math.max(0, totalGeometryBytes + sign * b);
  };
  const enforceByteBudget = () => {
    const maxBytes = Math.max(16 * 1024 * 1024, ACTIVE_DEVICE_PROFILE && ACTIVE_DEVICE_PROFILE.maxGeometryCacheBytes || 96 * 1024 * 1024);
    while ((store.size > MAX_CACHED_OBJECTS || totalGeometryBytes > maxBytes) && store.size > 1) {
      const oldestId = store.keys().next().value;
      const oldEntry = store.get(oldestId);
      store.delete(oldestId);
      totalGeometryBytes = Math.max(0, totalGeometryBytes - (oldEntry ? oldEntry.byteSize || estimateEntryBytes(oldEntry) : 0));
    }
    PERF_TELEMETRY.updateSceneMetrics({
      geometryCacheBytes: totalGeometryBytes,
      cachedObjectsCount: store.size
    });
  };

  /* Hitung signature koordinat relatif terhadap titik awal (n0.x, n0.y) dari o.subs agar:
     1) Perubahan warna/fill/stroke/opacity TIDAK membangun ulang mesh.
     2) Translasi murni (VE.translate saat selesai geser objek) TIDAK membangun ulang mesh & VBO GPU! */
  const computeSubsSignature = subs => {
    if (!subs || !subs.length) return 'empty';
    const cachedSig = subsRefToSig.get(subs);
    if (cachedSig !== undefined) return cachedSig;
    let h1 = 2166136261 >>> 0,
      h2 = 0x9e3779b9 >>> 0,
      totalNodes = 0;
    let bx = 0,
      by = 0,
      hasBase = false;
    for (let si = 0; si < subs.length; si++) {
      const ns = subs[si].nodes;
      if (ns && ns.length) {
        bx = Number(ns[0].x) || 0;
        by = Number(ns[0].y) || 0;
        hasBase = true;
        break;
      }
    }
    const mix = val => {
      const bits = Math.round((Number(val) || 0) * 1e5) | 0;
      h1 ^= bits & 0xffff;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h1 ^= bits >>> 16 & 0xffff;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ bits, 0x85ebca6b) >>> 0;
    };
    for (let si = 0; si < subs.length; si++) {
      const sp = subs[si];
      mix(sp.closed ? 1 : 0);
      const ns = sp.nodes || [];
      totalNodes += ns.length;
      for (let ni = 0; ni < ns.length; ni++) {
        const nd = ns[ni];
        mix(hasBase ? nd.x - bx : nd.x);
        mix(hasBase ? nd.y - by : nd.y);
        if (nd.handleIn) {
          mix(hasBase ? nd.handleIn.x - bx : nd.handleIn.x);
          mix(hasBase ? nd.handleIn.y - by : nd.handleIn.y);
        } else mix(-999999);
        if (nd.handleOut) {
          mix(hasBase ? nd.handleOut.x - bx : nd.handleOut.x);
          mix(hasBase ? nd.handleOut.y - by : nd.handleOut.y);
        } else mix(-888888);
      }
    }
    const sig = `${subs.length}:${totalNodes}:${h1.toString(36)}:${h2.toString(36)}`;
    subsRefToSig.set(subs, sig);
    return sig;
  };
  const copySubsSignature = (oldSubs, newSubs) => {
    if (!oldSubs || !newSubs) return;
    const sig = subsRefToSig.get(oldSubs);
    if (sig !== undefined) subsRefToSig.set(newSubs, sig);
  };
  const getObjectEntry = o => {
    const objId = o.id || '_anon';
    const rebasing = RENDER_CONFIG.localCoordRebasing !== false;
    let entry = store.get(objId);
    if (entry && entry.lastObjRef === o && entry.rebasing === rebasing) {
      return entry;
    }
    const sig = computeSubsSignature(o.subs);
    const bb = vinfo(o).bb;
    const originX = rebasing && Number.isFinite(bb[0]) && Math.abs(bb[0]) < 1e15 ? bb[0] : 0;
    const originY = rebasing && Number.isFinite(bb[1]) && Math.abs(bb[1]) < 1e15 ? bb[1] : 0;
    if (entry && entry.geoSignature === sig && entry.rebasing === rebasing) {
      const sdx = originX - entry.originX;
      const sdy = originY - entry.originY;
      if (!rebasing && (Math.abs(sdx) > 1e-7 || Math.abs(sdy) > 1e-7)) {
        /* Pada mode Raw World (rebasing OFF), koordinat VBO adalah world-space sehingga perlu dibangun ulang jika bergeser */
      } else {
        if (Math.abs(sdx) > 1e-7 || Math.abs(sdy) > 1e-7) {
          entry.originX = originX;
          entry.originY = originY;
          entry.lodBuckets.forEach(lod => {
            lod.originX = originX;
            lod.originY = originY;
            if (lod.polylines) {
              for (let i = 0; i < lod.polylines.length; i++) {
                const c = lod.polylines[i].coords;
                for (let k = 0; k < c.length; k += 2) {
                  c[k] += sdx;
                  c[k + 1] += sdy;
                }
              }
            }
            if (lod._resetPath2d) lod._resetPath2d();
            if (lod.tessellationMetadata) {
              lod.tessellationMetadata.originX = originX;
              lod.tessellationMetadata.originY = originY;
            }
          });
          entry.gpuMeshBuckets.forEach(gm => {
            gm.originX = originX;
            gm.originY = originY;
          });
        }
        entry.lastObjRef = o;
        store.delete(objId);
        store.set(objId, entry);
        return entry;
      }
    }
    /* Geometri berubah (node/handle diedit) atau objek baru -> invalidasi entry lama untuk objId ini */
    if (entry) {
      totalGeometryBytes = Math.max(0, totalGeometryBytes - (entry.byteSize || 128));
    }
    let hasCurves = false;
    if (o.subs) {
      for (let si = 0; si < o.subs.length && !hasCurves; si++) {
        const ns = o.subs[si].nodes || [];
        for (let ni = 0; ni < ns.length; ni++) {
          if (ns[ni].handleIn || ns[ni].handleOut) {
            hasCurves = true;
            break;
          }
        }
      }
    }
    entry = {
      objectId: objId,
      geometryRevision: nextRevCounter++,
      geoSignature: sig,
      originX,
      originY,
      rebasing,
      hasCurves,
      byteSize: 128,
      lastObjRef: o,
      lodBuckets: new Map(),
      gpuMeshBuckets: new Map(),
      lastVertexCount: 0,
      lastTessellationMetadata: null
    };
    totalGeometryBytes += 128;
    if (store.size >= MAX_CACHED_OBJECTS) {
      const oldestId = store.keys().next().value;
      const oldE = store.get(oldestId);
      store.delete(oldestId);
      if (oldE) totalGeometryBytes = Math.max(0, totalGeometryBytes - (oldE.byteSize || 128));
    }
    store.set(objId, entry);
    return entry;
  };
  const recordHit = () => {
    hits++;
  };
  const recordMiss = () => {
    misses++;
    PERF_TELEMETRY.updateSceneMetrics({
      cacheHits: hits,
      cacheMisses: misses,
      cachedObjectsCount: store.size
    });
  };
  const clearAll = () => {
    store.clear();
    hits = 0;
    misses = 0;
    totalGeometryBytes = 0;
    PERF_TELEMETRY.updateSceneMetrics({
      cacheHits: 0,
      cacheMisses: 0,
      cachedObjectsCount: 0,
      geometryCacheBytes: 0
    });
  };
  const invalidateObject = objId => {
    const oldE = store.get(objId);
    if (oldE) {
      totalGeometryBytes = Math.max(0, totalGeometryBytes - (oldE.byteSize || 128));
      store.delete(objId);
      PERF_TELEMETRY.updateSceneMetrics({
        geometryCacheBytes: totalGeometryBytes,
        cachedObjectsCount: store.size
      });
    }
  };
  const getStats = () => ({
    cachedObjectsCount: store.size,
    geometryCacheBytes: totalGeometryBytes,
    hits,
    misses
  });
  return {
    getObjectEntry,
    computeSubsSignature,
    copySubsSignature,
    recordHit,
    recordMiss,
    clearAll,
    invalidateObject,
    enforceByteBudget,
    recomputeTotalBytes,
    registerLodBytes,
    registerGpuMeshBytes,
    getStats,
    store
  };
})();

/* =========================================================================
   2.1. ADAPTIVE BÉZIER FLATTENING (DE CASTELJAU + CHORD CONTROL-POINT DISTANCE)
   - Target geometric error: 0.25 CSS pixel (RENDER_CONFIG.targetPixelError)
   - Maksimum recursion depth: 16 (RENDER_CONFIG.maxBezierDepth, pengaman bukan target)
   - Minimum segment length: 0.01 CSS pixel (berhenti lebih awal untuk segmen mikro)
   - Kriteria flatness: jarak tegak lurus kedua control point terhadap garis chord
     + validasi overshoot longitudinal & deviasi titik tengah untuk kurva S / cusp / loop.
   - Anggaran vertex adaptif + pelaporan metadata tessellation lengkap.
   ========================================================================= */

export { MAX_LOD_BUCKETS_PER_OBJ, MAX_GPU_MESH_PER_OBJ, MAX_CACHED_OBJECTS, GEOMETRY_CACHE };
