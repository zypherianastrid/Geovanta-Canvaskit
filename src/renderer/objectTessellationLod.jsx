/**
 * @file src/renderer/objectTessellationLod.jsx
 * @description Generator Level-of-Detail (LOD) teselasi objek & cache elemen gambar kanvas
 */
import { GEOMETRY_CACHE, MAX_LOD_BUCKETS_PER_OBJ } from './geometryCache.jsx';
import { RENDER_CONFIG, PERF_TELEMETRY } from '../utils/renderConfigAndTelemetry.jsx';
import { ACTIVE_DEVICE_PROFILE } from '../utils/gpuCapabilities.jsx';
import { flattenCubicAdaptive } from './adaptiveCubicFlattener.jsx';

/* =========================================================================
   2.2. PERHITUNGAN TOLERANSI BERBASIS PIXEL ERROR & ZOOM TANPA BATAS 64x
   - Menghapus batas maksimum bucket 6 (64x) dan batas minimum toleransi 0.04.
   - Menggunakan GeometryCache berbasis Object ID & Geometry Revision.
   ========================================================================= */
function getObjectTessellationLOD(o, zoom = 1) {
  const objEntry = GEOMETRY_CACHE.getObjectEntry(o);
  const safeZoom = Math.max(0.0005, Math.min(1e7, Number.isFinite(zoom) && zoom > 0 ? zoom : 1));
  /* Objek poligon garis lurus murni (!objEntry.hasCurves) memiliki geometri identik di semua level zoom (lodBucket = 0).
     Untuk objek berkurva, clamp lodBucket minimum ke -2 (effectiveZoom >= 0.25) agar rentang zoom 0.05%..25% berbagi satu bucket! */
  const rawBucket = Math.max(-2, Math.min(4, Math.floor(Math.log2(safeZoom))));
  const lodBucket = !objEntry.hasCurves ? 0 : rawBucket <= 2 ? 0 : rawBucket <= 3 ? 2 : 4;
  const effectiveZoom = lodBucket === -2 ? 0.5 : lodBucket === 0 ? 1.5 : lodBucket === 2 ? 5.0 : 16.0;
  const targetPixelError = RENDER_CONFIG.targetPixelError || 0.25;
  const eps = targetPixelError / effectiveZoom;
  const tolSq = eps * eps;
  const minSegLen = (RENDER_CONFIG.minSegmentLengthPx || 0.01) / effectiveZoom;
  const minSegLenSq = minSegLen * minSegLen;
  const byLod = objEntry.lodBuckets;
  const hitLod = byLod.get(lodBucket);
  if (hitLod !== undefined) {
    GEOMETRY_CACHE.recordHit();
    return hitLod;
  }
  GEOMETRY_CACHE.recordMiss();
  if (byLod.size >= MAX_LOD_BUCKETS_PER_OBJ) {
    const oldestKey = byLod.keys().next().value;
    const oldLod = byLod.get(oldestKey);
    byLod.delete(oldestKey);
    if (oldLod) GEOMETRY_CACHE.registerLodBytes(objEntry, oldLod, -1);
  }
  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  /* GV-A05: Gunakan batas anggaran keras per objek sesuai profil perangkat (tanpa ekspansi tak terbatas nodeCnt * 64) */
  const hardObjectCap = Math.max(256, Math.min(RENDER_CONFIG.vertexBudgetPerObject || 65536, ACTIVE_DEVICE_PROFILE && ACTIVE_DEVICE_PROFILE.maxVerticesPerObject || 65536));
  const stats = {
    vertexCount: 0,
    segmentCount: 0,
    maxDepthReached: 0,
    maxDepthHit: 0,
    toleranceMet: true,
    budgetHit: false,
    vertexLimit: hardObjectCap
  };

  /* Hitung jumlah total segmen & segmen kurva di seluruh subpath terlebih dahulu
     agar anggaran vertex dibagi adil dan TIDAK ADA segmen/subpath yang terpotong (break) saat zoom sangat dekat! */
  let totalSegsCount = 0,
    curvedSegsCount = 0,
    validSubsCount = 0;
  for (let si = 0; si < o.subs.length; si++) {
    const sp = o.subs[si],
      ns = sp.nodes,
      n = ns.length;
    if (!n) continue;
    validSubsCount++;
    const lim = sp.closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      totalSegsCount++;
      const a = ns[i],
        b = ns[(i + 1) % n];
      if (a.handleOut || b.handleIn) curvedSegsCount++;
    }
  }
  const minRequiredVerts = validSubsCount + totalSegsCount;
  if (stats.vertexLimit < minRequiredVerts) {
    stats.vertexLimit = minRequiredVerts;
    stats.budgetHit = true;
    stats.toleranceMet = false;
  }
  const availExtraVerts = Math.max(0, stats.vertexLimit - minRequiredVerts);
  const extraPerCurve = curvedSegsCount > 0 ? Math.max(1, Math.floor(availExtraVerts / curvedSegsCount)) : 64;
  stats.segMaxDepth = Math.max(2, Math.min(8, RENDER_CONFIG.maxBezierDepth || 16, Math.floor(Math.log2(extraPerCurve + 1))));
  const originX = objEntry.originX;
  const originY = objEntry.originY;
  const polylines = [];
  const localPolylines = [];
  let totalVerts = 0;
  let remainingCurves = curvedSegsCount;
  let remainingBaseVerts = minRequiredVerts;
  for (let si = 0; si < o.subs.length; si++) {
    const sp = o.subs[si],
      ns = sp.nodes,
      n = ns.length;
    if (!n) continue;
    const pts = [ns[0].x, ns[0].y];
    stats.vertexCount++;
    remainingBaseVerts = Math.max(0, remainingBaseVerts - 1);
    const lim = sp.closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = ns[i],
        b = ns[(i + 1) % n];
      const isCurved = !!(a.handleOut || b.handleIn);
      const remPool = Math.max(0, stats.vertexLimit - stats.vertexCount - Math.max(0, remainingBaseVerts - 1));
      if (isCurved) {
        const fairShare = Math.max(2, Math.ceil(remPool / Math.max(1, remainingCurves)));
        stats.segVertexLimit = Math.min(stats.vertexLimit, stats.vertexCount + fairShare);
        remainingCurves = Math.max(0, remainingCurves - 1);
        flattenCubicAdaptive(a, b, tolSq, pts, 0, minSegLenSq, stats);
      } else {
        pts.push(b.x, b.y);
        stats.vertexCount++;
        stats.segmentCount++;
      }
      remainingBaseVerts = Math.max(0, remainingBaseVerts - 1);
    }
    /* Buang titik duplikat penutup jika berhimpit dengan titik awal */
    if (sp.closed && pts.length >= 6) {
      const dxClose = pts[pts.length - 2] - pts[0],
        dyClose = pts[pts.length - 1] - pts[1],
        closeThr = Math.max(1e-6, minSegLen * 0.25);
      if (dxClose * dxClose + dyClose * dyClose <= closeThr * closeThr) {
        pts.pop();
        pts.pop();
      }
    }
    const ptsLen = pts.length;
    const vCount = ptsLen >> 1;
    totalVerts += vCount;

    /* World coordinates (Float64Array agar presisi dunia terjaga untuk Canvas2D/debug) & Local coordinates (Float32Array untuk GPU) */
    const worldCoords = new Float64Array(ptsLen);
    const localCoords = new Float32Array(ptsLen);
    for (let k = 0; k < ptsLen; k += 2) {
      const wx = pts[k],
        wy = pts[k + 1];
      worldCoords[k] = wx;
      worldCoords[k + 1] = wy;
      localCoords[k] = wx - originX;
      localCoords[k + 1] = wy - originY;
    }
    polylines.push({
      closed: !!sp.closed,
      coords: worldCoords
    });
    localPolylines.push({
      closed: !!sp.closed,
      coords: localCoords
    });
  }
  const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const tessellationMetadata = {
    geometryRevision: objEntry.geometryRevision,
    lodBucket,
    effectiveZoom,
    targetPixelError,
    eps,
    vertexCount: totalVerts,
    segmentCount: stats.segmentCount,
    maxDepthReached: stats.maxDepthReached,
    maxDepthHit: stats.maxDepthHit,
    toleranceMet: stats.toleranceMet,
    budgetHit: stats.budgetHit,
    tessellationTimeMs: Math.round((t1 - t0) * 1000) / 1000,
    originX,
    originY
  };
  objEntry.lastVertexCount = totalVerts;
  objEntry.lastTessellationMetadata = tessellationMetadata;
  let _lodPath2d;
  const mesh = {
    objectId: objEntry.objectId,
    geometryRevision: objEntry.geometryRevision,
    originX,
    originY,
    lodBucket,
    effectiveZoom,
    eps,
    polylines,
    localPolylines,
    totalVerts,
    tessellationMetadata,
    _resetPath2d() {
      _lodPath2d = undefined;
    },
    get path2d() {
      if (_lodPath2d === undefined) {
        try {
          const p = new Path2D();
          for (let i = 0; i < polylines.length; i++) {
            const pl = polylines[i],
              c = pl.coords,
              m = c.length >> 1;
            if (!m) continue;
            p.moveTo(c[0], c[1]);
            for (let k = 1; k < m; k++) p.lineTo(c[k * 2], c[k * 2 + 1]);
            if (pl.closed) p.closePath();
          }
          _lodPath2d = p;
        } catch (e) {
          _lodPath2d = null;
        }
      }
      return _lodPath2d;
    }
  };
  byLod.set(lodBucket, mesh);
  GEOMETRY_CACHE.registerLodBytes(objEntry, mesh, 1);
  GEOMETRY_CACHE.enforceByteBudget();
  PERF_TELEMETRY.updateSceneMetrics({
    lodLevel: lodBucket,
    effectiveZoom,
    currentEpsilon: eps,
    targetPixelError,
    tessellationTimeMs: tessellationMetadata.tessellationTimeMs,
    toleranceMet: stats.toleranceMet,
    maxDepthHitCount: stats.maxDepthHit,
    budgetHitCount: stats.budgetHit ? 1 : 0
  });
  return mesh;
}

/* GV-A21 & GV-A13: Pixel-budgeted LRU Image Element Cache with CORS fallback & decoded pixel telemetry */
/* GV-A21 & GV-A13: Pixel-budgeted LRU Image Element Cache with CORS fallback & decoded pixel telemetry */
const IMG_ELEMENT_CACHE = (() => {
  const map = new Map(); // href -> { img, pixels, status }
  let totalPixels = 0;
  const recomputePixels = () => {
    let p = 0;
    map.forEach(v => {
      p += v && v.pixels || 0;
    });
    totalPixels = p;
    PERF_TELEMETRY.updateSceneMetrics({
      imageDecodedPixels: totalPixels
    });
    return totalPixels;
  };
  const evictIfNeeded = () => {
    const maxPx = ACTIVE_DEVICE_PROFILE && ACTIVE_DEVICE_PROFILE.maxImageCachePixels || 40000000;
    while (map.size > 1 && (map.size > 128 || totalPixels > maxPx)) {
      const oldestKey = map.keys().next().value;
      const oldVal = map.get(oldestKey);
      map.delete(oldestKey);
      totalPixels = Math.max(0, totalPixels - (oldVal && oldVal.pixels || 0));
    }
    PERF_TELEMETRY.updateSceneMetrics({
      imageDecodedPixels: totalPixels
    });
  };
  return {
    get(href) {
      const entry = map.get(href);
      if (!entry) return undefined;
      map.delete(href);
      map.set(href, entry);
      return entry.img;
    },
    getEntry(href) {
      return map.get(href) || null;
    },
    set(href, img) {
      const px = img && img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth * img.naturalHeight : 0;
      if (map.has(href)) {
        const prev = map.get(href);
        totalPixels = Math.max(0, totalPixels - (prev && prev.pixels || 0));
        map.delete(href);
      }
      map.set(href, {
        img,
        pixels: px
      });
      totalPixels += px;
      evictIfNeeded();
      return img;
    },
    updatePixels(href, img) {
      if (!map.has(href)) return this.set(href, img);
      const entry = map.get(href);
      totalPixels = Math.max(0, totalPixels - (entry.pixels || 0));
      entry.pixels = img && img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth * img.naturalHeight : 0;
      totalPixels += entry.pixels;
      evictIfNeeded();
    },
    delete(href) {
      const entry = map.get(href);
      if (entry) {
        totalPixels = Math.max(0, totalPixels - (entry.pixels || 0));
        map.delete(href);
        PERF_TELEMETRY.updateSceneMetrics({
          imageDecodedPixels: totalPixels
        });
      }
    },
    clear() {
      map.clear();
      totalPixels = 0;
      PERF_TELEMETRY.updateSceneMetrics({
        imageDecodedPixels: 0
      });
    },
    get size() {
      return map.size;
    },
    get totalPixels() {
      return totalPixels;
    }
  };
})();

export { getObjectTessellationLOD, IMG_ELEMENT_CACHE };
