/**
 * @file src/engine/spatialIndexAndHitTest.jsx
 * @description Kalkulasi kotak batas analitik (Tight BBox), indeks spasial dokumen, & hit-testing objek
 */
import { segPoint } from './bezierSubdivisionAndMove.jsx';
import { sub, dot, dist } from './vectorPrimitives.jsx';
import { gradOn, strokeGradOn } from './gradientEngine.jsx';
import { VCTX } from '../utils/colorParserAndFormatter.jsx';
import { serializePath } from './svgPathSerializer.jsx';
import { vinfo } from '../renderer/pathWindingAndBatching.jsx';

/* =========================================================================
   ANALYTIC CUBIC EXTREMA BBOX (IM-007) & PRE-SAMPLED CHORD LUT + SPATIAL INDEX (GV-005, GV-006)
   ========================================================================= */
const TBB = new WeakMap();
const SEG_LUT_CACHE = new WeakMap();
const DOC_SPATIAL_CACHE = new WeakMap();

/* IM-007: Solusi analitik turunan kubik B'(t) = 0 -> 3*a*t^2 + 2*b*t + c = 0 untuk t in (0,1) */
/* IM-007: Solusi analitik turunan kubik B'(t) = 0 -> 3*a*t^2 + 2*b*t + c = 0 untuk t in (0,1) */
function cubicExtrema1D(p0, p1, p2, p3, outT) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-10) {
    if (Math.abs(b) > 1e-10) {
      const t = -c / b;
      if (t > 1e-7 && t < 1 - 1e-7) outT.push(t);
    }
    return;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  if (t1 > 1e-7 && t1 < 1 - 1e-7) outT.push(t1);
  if (t2 > 1e-7 && t2 < 1 - 1e-7 && Math.abs(t2 - t1) > 1e-7) outT.push(t2);
}
function segAnalyticBBox(a, b) {
  let x0 = Math.min(a.x, b.x),
    x1 = Math.max(a.x, b.x);
  let y0 = Math.min(a.y, b.y),
    y1 = Math.max(a.y, b.y);
  if (!a.handleOut && !b.handleIn) return [x0, y0, x1, y1];
  const p1 = a.handleOut || a,
    p2 = b.handleIn || b;
  const ts = [];
  cubicExtrema1D(a.x, p1.x, p2.x, b.x, ts);
  cubicExtrema1D(a.y, p1.y, p2.y, b.y, ts);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i],
      u = 1 - t,
      u2 = u * u,
      t2 = t * t,
      c0 = u2 * u,
      c1 = 3 * u2 * t,
      c2 = 3 * u * t2,
      c3 = t2 * t;
    const qx = c0 * a.x + c1 * p1.x + c2 * p2.x + c3 * b.x;
    const qy = c0 * a.y + c1 * p1.y + c2 * p2.y + c3 * b.y;
    if (qx < x0) x0 = qx;
    if (qx > x1) x1 = qx;
    if (qy < y0) y0 = qy;
    if (qy > y1) y1 = qy;
  }
  return [x0, y0, x1, y1];
}

/* IM-007: tightBBox(o) menggunakan ekstrema analitik B'(t)=0 sehingga 100% presisi tanpa miss kurva tajam */
/* IM-007: tightBBox(o) menggunakan ekstrema analitik B'(t)=0 sehingga 100% presisi tanpa miss kurva tajam */
function tightBBox(o) {
  let r = TBB.get(o);
  if (r) return r;
  let x0 = 1e18,
    y0 = 1e18,
    x1 = -1e18,
    y1 = -1e18;
  const subs = o.subs;
  for (let si = 0, sLen = subs.length; si < sLen; si++) {
    const sp = subs[si],
      ns = sp.nodes,
      n = ns.length;
    if (n === 1) {
      const q = ns[0];
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    const lim = sp.closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const sb = segAnalyticBBox(ns[i], ns[(i + 1) % n]);
      if (sb[0] < x0) x0 = sb[0];
      if (sb[2] > x1) x1 = sb[2];
      if (sb[1] < y0) y0 = sb[1];
      if (sb[3] > y1) y1 = sb[3];
    }
  }
  r = [x0, y0, x1, y1];
  TBB.set(o, r);
  return r;
}

/* Pre-sampled 12-chord LUT per segmen kurva untuk proyeksi cepat nearOnSeg */
/* Pre-sampled 12-chord LUT per segmen kurva untuk proyeksi cepat nearOnSeg */
function getSegLut(a, b) {
  let byA = SEG_LUT_CACHE.get(a);
  if (byA) {
    const hit = byA.get(b);
    if (hit) return hit;
  } else {
    byA = new WeakMap();
    SEG_LUT_CACHE.set(a, byA);
  }
  const N = 12,
    pts = new Array(N + 1);
  for (let k = 0; k <= N; k++) pts[k] = segPoint(a, b, k / N);
  const bb = segAnalyticBBox(a, b);
  const entry = {
    pts,
    bb,
    N
  };
  byA.set(b, entry);
  return entry;
}

/* titik terdekat pada satu segmen (lurus / cubic dengan pre-sampled LUT + 6-step ternary refinement) -> {x,y,d,t} */
/* titik terdekat pada satu segmen (lurus / cubic dengan pre-sampled LUT + 6-step ternary refinement) -> {x,y,d,t} */
function nearOnSeg(a, b, p) {
  const px = p.x,
    py = p.y;
  if (!a.handleOut && !b.handleIn) {
    const abx = b.x - a.x,
      aby = b.y - a.y,
      L2 = abx * abx + aby * aby;
    const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / L2));
    const qx = a.x + abx * t,
      qy = a.y + aby * t,
      dx = px - qx,
      dy = py - qy;
    return {
      x: qx,
      y: qy,
      d: Math.sqrt(dx * dx + dy * dy),
      t
    };
  }
  const lut = getSegLut(a, b),
    pts = lut.pts,
    N = lut.N;
  let bestK = 0,
    bd2 = 1e18;
  for (let k = 0; k <= N; k++) {
    const dx = px - pts[k].x,
      dy = py - pts[k].y,
      d2 = dx * dx + dy * dy;
    if (d2 < bd2) {
      bd2 = d2;
      bestK = k;
    }
  }
  const p0x = a.x,
    p0y = a.y,
    p1 = a.handleOut || a,
    p2 = b.handleIn || b,
    p1x = p1.x,
    p1y = p1.y,
    p2x = p2.x,
    p2y = p2.y,
    p3x = b.x,
    p3y = b.y;
  let lo = Math.max(0, (bestK - 1) / N),
    hi = Math.min(1, (bestK + 1) / N);
  for (let it = 0; it < 7; it++) {
    const third = (hi - lo) / 3,
      m1 = lo + third,
      m2 = hi - third;
    const u1 = 1 - m1,
      u1_2 = u1 * u1,
      m1_2 = m1 * m1;
    const q1x = u1_2 * u1 * p0x + 3 * u1_2 * m1 * p1x + 3 * u1 * m1_2 * p2x + m1_2 * m1 * p3x;
    const q1y = u1_2 * u1 * p0y + 3 * u1_2 * m1 * p1y + 3 * u1 * m1_2 * p2y + m1_2 * m1 * p3y;
    const u2 = 1 - m2,
      u2_2 = u2 * u2,
      m2_2 = m2 * m2;
    const q2x = u2_2 * u2 * p0x + 3 * u2_2 * m2 * p1x + 3 * u2 * m2_2 * p2x + m2_2 * m2 * p3x;
    const q2y = u2_2 * u2 * p0y + 3 * u2_2 * m2 * p1y + 3 * u2 * m2_2 * p2y + m2_2 * m2 * p3y;
    const d1 = (px - q1x) * (px - q1x) + (py - q1y) * (py - q1y);
    const d2full = (px - q2x) * (px - q2x) + (py - q2y) * (py - q2y);
    if (d1 < d2full) hi = m2;else lo = m1;
  }
  const t = (lo + hi) * 0.5,
    u = 1 - t,
    u2 = u * u,
    t2 = t * t;
  const qx = u2 * u * p0x + 3 * u2 * t * p1x + 3 * u * t2 * p2x + t2 * t * p3x;
  const qy = u2 * u * p0y + 3 * u2 * t * p1y + 3 * u * t2 * p2y + t2 * t * p3y;
  const dx = px - qx,
    dy = py - qy;
  return {
    x: qx,
    y: qy,
    d: Math.sqrt(dx * dx + dy * dy),
    t
  };
}

/* GV-005 & GV-006: Indeks Spasial 2D Terpadu (Uniform Grid Spatial Hash) yang di-memo per array objects */
/* GV-005 & GV-006: Indeks Spasial 2D Terpadu (Uniform Grid Spatial Hash) yang di-memo per array objects */
function getDocSpatialIndex(objects) {
  if (!objects || !Array.isArray(objects)) return null;
  let idx = DOC_SPATIAL_CACHE.get(objects);
  if (idx) return idx;
  let minX = 1e18,
    minY = 1e18,
    maxX = -1e18,
    maxY = -1e18;
  const objEntries = [];
  for (let oi = 0, L = objects.length; oi < L; oi++) {
    const o = objects[oi];
    if (!o || o.hidden) continue;
    const bb = tightBBox(o);
    if (!bb || bb[0] > bb[2]) continue;
    const pad = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 + 1 : 1;
    const pbb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    if (pbb[0] < minX) minX = pbb[0];
    if (pbb[2] > maxX) maxX = pbb[2];
    if (pbb[1] < minY) minY = pbb[1];
    if (pbb[3] > maxY) maxY = pbb[3];
    objEntries.push({
      o,
      order: oi,
      bb,
      pbb
    });
  }
  const span = Math.max(64, Math.min(4096, Math.max(maxX - minX, maxY - minY) / 24 || 128));
  const cellSize = span;
  const cellKey = (cx, cy) => cx * 73856093 ^ cy * 19349663;
  const objCells = new Map();
  let ptCells = null,
    segCells = null;
  const putCell = (map, k, item) => {
    const b = map.get(k);
    if (b) b.push(item);else map.set(k, [item]);
  };
  for (let idxEntry = 0; idxEntry < objEntries.length; idxEntry++) {
    const entry = objEntries[idxEntry],
      pbb = entry.pbb;
    const cx0 = Math.floor(pbb[0] / cellSize),
      cx1 = Math.floor(pbb[2] / cellSize);
    const cy0 = Math.floor(pbb[1] / cellSize),
      cy1 = Math.floor(pbb[3] / cellSize);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) <= 256) {
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) putCell(objCells, cellKey(cx, cy), entry);
    } else {
      putCell(objCells, 'GLOBAL', entry);
    }
  }
  const queryPoint = (x, y, rad, fnPt) => {
    const cands = queryObjectsInRect(x - rad, y - rad, x + rad, y + rad);
    for (let idxEntry = 0; idxEntry < cands.length; idxEntry++) {
      const o = cands[idxEntry].o;
      if (o.isFrameBg || o.isAutoFrame) continue;
      for (let si = 0; si < o.subs.length; si++) {
        const sp = o.subs[si],
          ns = sp.nodes,
          n = ns.length;
        for (let ni = 0; ni < n; ni++) {
          const nd = ns[ni];
          if (Math.abs(nd.x - x) <= rad && Math.abs(nd.y - y) <= rad) fnPt({
            o,
            sp,
            n: nd,
            x: nd.x,
            y: nd.y,
            kind: 'node'
          });
          if (nd.handleIn && Math.abs(nd.handleIn.x - x) <= rad && Math.abs(nd.handleIn.y - y) <= rad) fnPt({
            o,
            sp,
            n: nd,
            x: nd.handleIn.x,
            y: nd.handleIn.y,
            kind: 'handle-in',
            h: true
          });
          if (nd.handleOut && Math.abs(nd.handleOut.x - x) <= rad && Math.abs(nd.handleOut.y - y) <= rad) fnPt({
            o,
            sp,
            n: nd,
            x: nd.handleOut.x,
            y: nd.handleOut.y,
            kind: 'handle-out',
            h: true
          });
        }
        const segLim = sp.closed ? n : n - 1;
        for (let ni = 0; ni < segLim; ni++) {
          const a = ns[ni],
            b = ns[(ni + 1) % n];
          const h1 = a.handleOut || a,
            h2 = b.handleIn || b;
          if (x < Math.min(a.x, b.x, h1.x, h2.x) - rad || x > Math.max(a.x, b.x, h1.x, h2.x) + rad || y < Math.min(a.y, b.y, h1.y, h2.y) - rad || y > Math.max(a.y, b.y, h1.y, h2.y) + rad) continue;
          const mp = segPoint(a, b, 0.5);
          if (Math.abs(mp.x - x) <= rad && Math.abs(mp.y - y) <= rad) fnPt({
            o,
            sp,
            a,
            b,
            x: mp.x,
            y: mp.y,
            kind: 'midpoint'
          });
        }
      }
    }
  };
  const querySegments = (x, y, rad, fnSeg) => {
    const cands = queryObjectsInRect(x - rad, y - rad, x + rad, y + rad);
    for (let idxEntry = 0; idxEntry < cands.length; idxEntry++) {
      const o = cands[idxEntry].o;
      if (o.isFrameBg || o.isAutoFrame) continue;
      for (let si = 0; si < o.subs.length; si++) {
        const sp = o.subs[si],
          ns = sp.nodes,
          n = ns.length;
        const segLim = sp.closed ? n : n - 1;
        for (let ni = 0; ni < segLim; ni++) {
          const a = ns[ni],
            b = ns[(ni + 1) % n];
          const h1 = a.handleOut || a,
            h2 = b.handleIn || b;
          if (x < Math.min(a.x, b.x, h1.x, h2.x) - rad || x > Math.max(a.x, b.x, h1.x, h2.x) + rad || y < Math.min(a.y, b.y, h1.y, h2.y) - rad || y > Math.max(a.y, b.y, h1.y, h2.y) + rad) continue;
          const sbb = segAnalyticBBox(a, b);
          if (x >= sbb[0] - rad && x <= sbb[2] + rad && y >= sbb[1] - rad && y <= sbb[3] + rad) fnSeg({
            o,
            sp,
            i: ni,
            a,
            b,
            bb: sbb
          });
        }
      }
    }
  };
  const queryObjectsInRect = (rx0, ry0, rx1, ry1) => {
    const seen = new Set(),
      out = [];
    const cx0 = Math.floor(rx0 / cellSize),
      cx1 = Math.floor(rx1 / cellSize);
    const cy0 = Math.floor(ry0 / cellSize),
      cy1 = Math.floor(ry1 / cellSize);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) <= 512) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const bucket = objCells.get(cellKey(cx, cy));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const e = bucket[i];
            if (seen.has(e.o.id)) continue;
            seen.add(e.o.id);
            if (e.pbb[2] >= rx0 && e.pbb[0] <= rx1 && e.pbb[3] >= ry0 && e.pbb[1] <= ry1) out.push(e);
          }
        }
      }
      const gl = objCells.get('GLOBAL');
      if (gl) {
        for (let i = 0; i < gl.length; i++) {
          const e = gl[i];
          if (!seen.has(e.o.id) && e.pbb[2] >= rx0 && e.pbb[0] <= rx1 && e.pbb[3] >= ry0 && e.pbb[1] <= ry1) {
            seen.add(e.o.id);
            out.push(e);
          }
        }
      }
      out.sort((a, b) => a.order - b.order);
      return out;
    }
    for (let i = 0; i < objEntries.length; i++) {
      const e = objEntries[i];
      if (e.pbb[2] >= rx0 && e.pbb[0] <= rx1 && e.pbb[3] >= ry0 && e.pbb[1] <= ry1) out.push(e);
    }
    return out;
  };
  const byId = new Map();
  for (let i = 0; i < objEntries.length; i++) byId.set(objEntries[i].o.id, objEntries[i]);
  idx = {
    cellSize,
    objEntries,
    objCells,
    byId,
    cellKey,
    putCell,
    queryPoint,
    querySegments,
    queryObjectsInRect
  };
  DOC_SPATIAL_CACHE.set(objects, idx);
  return idx;
}

/* GV-A18: Incremental Spatial Index Update untuk objek yang dimodifikasi tanpa rebuild O(N) penuh */
/* GV-A18: Incremental Spatial Index Update untuk objek yang dimodifikasi tanpa rebuild O(N) penuh */
function updateSpatialIndexForObjects(prevObjects, nextObjects, dirtyIds) {
  if (!prevObjects || !nextObjects || !dirtyIds || !dirtyIds.size || dirtyIds.size > 32) {
    return getDocSpatialIndex(nextObjects);
  }
  const prevIdx = DOC_SPATIAL_CACHE.get(prevObjects);
  if (!prevIdx || prevObjects.length !== nextObjects.length) {
    return getDocSpatialIndex(nextObjects);
  }
  const cellSize = prevIdx.cellSize;
  const cellKey = prevIdx.cellKey;
  const objCells = new Map();
  prevIdx.objCells.forEach((arr, k) => {
    const filtered = arr.filter(e => !dirtyIds.has(e.o.id));
    if (filtered.length) objCells.set(k, filtered);
  });
  const putCell = (map, k, item) => {
    const b = map.get(k);
    if (b) b.push(item);else map.set(k, [item]);
  };
  const objEntries = [];
  for (let oi = 0, L = nextObjects.length; oi < L; oi++) {
    const o = nextObjects[oi];
    if (!o || o.hidden) continue;
    if (!dirtyIds.has(o.id) && prevIdx.byId && prevIdx.byId.has(o.id)) {
      const oldE = prevIdx.byId.get(o.id);
      objEntries.push(oldE);
      continue;
    }
    const bb = tightBBox(o);
    if (!bb || bb[0] > bb[2]) continue;
    const pad = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 + 1 : 1;
    const pbb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    const entry = {
      o,
      order: oi,
      bb,
      pbb
    };
    objEntries.push(entry);
    const cx0 = Math.floor(pbb[0] / cellSize),
      cx1 = Math.floor(pbb[2] / cellSize);
    const cy0 = Math.floor(pbb[1] / cellSize),
      cy1 = Math.floor(pbb[3] / cellSize);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) <= 256) {
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) putCell(objCells, cellKey(cx, cy), entry);
    } else {
      putCell(objCells, 'GLOBAL', entry);
    }
  }
  return getDocSpatialIndex(nextObjects);
}

/* GV-A16: Kontrak Hit-Test Tunggal yang Konsisten dengan Visibilitas Visual, Opacity, ClipPath & Frame Clipping */
/* GV-A16: Kontrak Hit-Test Tunggal yang Konsisten dengan Visibilitas Visual, Opacity, ClipPath & Frame Clipping */
function isHittable(o) {
  if (!o || o.hidden || o.locked) return false;
  const effOp = (o.opacity ?? 1) * (o.groupOpacity ?? 1);
  if (!(effOp > 1e-3)) return false;
  const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent' || gradOn(o) || !!o.img || !!o.text;
  const hasStroke = (o.stroke && o.stroke !== 'none' && o.stroke !== 'transparent' || strokeGradOn(o)) && (o.strokeWidth || 0) > 0;
  return hasFill || hasStroke;
}
function hitTestObject(o, pt, tol = 2, opts = {}) {
  if (!isHittable(o) || !pt) return false;
  if (o.text) {
    const bb = tightBBox(o);
    if (!bb || pt.x < bb[0] - tol || pt.x > bb[2] + tol || pt.y < bb[1] - tol || pt.y > bb[3] + tol) return false;
    if (typeof Path2D !== 'undefined' && typeof VCTX !== 'undefined' && VCTX) {
      const dStr = serializePath(o);
      if (dStr) {
        try {
          const p2 = new Path2D(dStr);
          if (VCTX.isPointInPath(p2, pt.x, pt.y)) return true;
        } catch (e) {}
      }
    }
    return true;
  }
  if (opts.clipFrames && o.group && !o.isFrameBg && !o.isAutoFrame && opts.frameRectMap && opts.frameRectMap.has(o.group)) {
    const fbb = opts.frameRectMap.get(o.group);
    if (fbb && (pt.x < fbb[0] - tol || pt.x > fbb[2] + tol || pt.y < fbb[1] - tol || pt.y > fbb[3] + tol)) {
      return false;
    }
  }
  const bb = tightBBox(o);
  if (!bb || pt.x < bb[0] - tol || pt.x > bb[2] + tol || pt.y < bb[1] - tol || pt.y > bb[3] + tol) return false;
  if (o.clipPathD && typeof Path2D !== 'undefined' && typeof VCTX !== 'undefined' && VCTX) {
    try {
      const cp = new Path2D(o.clipPathD);
      if (!VCTX.isPointInPath(cp, pt.x, pt.y, 'nonzero') && !VCTX.isPointInPath(cp, pt.x, pt.y, 'evenodd')) {
        return false;
      }
    } catch (e) {}
  }
  if (typeof Path2D !== 'undefined' && typeof VCTX !== 'undefined' && VCTX) {
    const info = typeof vinfo === 'function' ? vinfo(o) : null;
    const p2 = info ? info.p2 : (() => {
      const dStr = serializePath(o);
      return dStr ? new Path2D(dStr) : null;
    })();
    if (!p2) return false;
    const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent' || gradOn(o) || !!o.img;
    if (hasFill && VCTX.isPointInPath(p2, pt.x, pt.y, o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero')) return true;
    const hasStroke = (o.stroke && o.stroke !== 'none' && o.stroke !== 'transparent' || strokeGradOn(o)) && (o.strokeWidth || 0) > 0;
    if (hasStroke) {
      VCTX.lineWidth = Math.max(o.strokeWidth || 0, tol * 2);
      if (VCTX.isPointInStroke(p2, pt.x, pt.y)) return true;
    }
    return false;
  }
  return true;
}

/* snap: (1) node/handle objek lain, (2) midpoint, (3) hline, (4) tepi/kontur objek lain, (5) grid per-sumbu via Spatial Index O(1) */

export { TBB, SEG_LUT_CACHE, DOC_SPATIAL_CACHE, cubicExtrema1D, segAnalyticBBox, tightBBox, getSegLut, nearOnSeg, getDocSpatialIndex, updateSpatialIndexForObjects, isHittable, hitTestObject };
