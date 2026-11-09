/**
 * @file src/renderer/polygonTriangulatorAndStroke.jsx
 * @description Triangulasi poligon Ear-Clipping, ekspansi mesh stroke (Join/Cap/Miter), & pembuatan VBO GPU
 */
import { isOpaquePaint, SEAM_STROKE_PX, vinfo } from './pathWindingAndBatching.jsx';
import { GEOMETRY_CACHE, MAX_GPU_MESH_PER_OBJ } from './geometryCache.jsx';
import { RENDER_CONFIG } from '../utils/renderConfigAndTelemetry.jsx';
import { getObjectTessellationLOD } from './objectTessellationLod.jsx';

/* =========================================================================
   TAHAP 5 — VALIDASI TRIANGULASI EAR-CLIPPING & DEGENERATE / SELF-INTERSECTION CHECK
   - Membersihkan titik hampir berhimpitan & segmen kolinier sebelum triangulasi.
   - Memeriksa apakah poligon memiliki self-intersection; jika ada, otomatis
     mengembalikan null agar dialihkan ke Hardware Stencil-Then-Cover!
   ========================================================================= */
function hasPolygonSelfIntersection(ptsX, ptsY) {
  const n = ptsX.length;
  if (n <= 3) return false;
  if (n > 24) return true; /* Untuk poligon > 24 titik, gunakan Hardware Stencil-Then-Cover O(N) langsung */
  const ccwOrient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const segProperlyIntersects = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const d1 = ccwOrient(ax, ay, bx, by, cx, cy);
    const d2 = ccwOrient(ax, ay, bx, by, dx, dy);
    const d3 = ccwOrient(cx, cy, dx, dy, ax, ay);
    const d4 = ccwOrient(cx, cy, dx, dy, bx, by);
    return (d1 > 1e-7 && d2 < -1e-7 || d1 < -1e-7 && d2 > 1e-7) && (d3 > 1e-7 && d4 < -1e-7 || d3 < -1e-7 && d4 > 1e-7);
  };
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const ax = ptsX[i],
      ay = ptsY[i],
      bx = ptsX[i2],
      by = ptsY[i2];
    const minABx = Math.min(ax, bx),
      maxABx = Math.max(ax, bx);
    const minABy = Math.min(ay, by),
      maxABy = Math.max(ay, by);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; /* Segmen bertetangga di titik 0 */
      const j2 = (j + 1) % n;
      const cx = ptsX[j],
        cy = ptsY[j],
        dx = ptsX[j2],
        dy = ptsY[j2];
      if (Math.max(cx, dx) < minABx || Math.min(cx, dx) > maxABx || Math.max(cy, dy) < minABy || Math.min(cy, dy) > maxABy) continue;
      if (segProperlyIntersects(ax, ay, bx, by, cx, cy, dx, dy)) return true;
    }
  }
  return false;
}
function earClipSimplePolygon(coords) {
  const rawN = coords.length >> 1;
  if (rawN < 3) return null;
  if (rawN > 24) return null; /* Poligon > 24 titik ditangani oleh Hardware Stencil-Then-Cover O(N) */

  /* 1. Sanitasi titik yang hampir berhimpitan (coincident vertices) */
  const cleanX = [],
    cleanY = [];
  for (let i = 0; i < rawN; i++) {
    const x = coords[i * 2],
      y = coords[i * 2 + 1];
    if (!cleanX.length) {
      cleanX.push(x);
      cleanY.push(y);
    } else {
      const dx = x - cleanX[cleanX.length - 1],
        dy = y - cleanY[cleanY.length - 1];
      if (dx * dx + dy * dy > 1e-10) {
        cleanX.push(x);
        cleanY.push(y);
      }
    }
  }
  if (cleanX.length >= 2) {
    const dx0 = cleanX[cleanX.length - 1] - cleanX[0],
      dy0 = cleanY[cleanY.length - 1] - cleanY[0];
    if (dx0 * dx0 + dy0 * dy0 <= 1e-10) {
      cleanX.pop();
      cleanY.pop();
    }
  }

  /* 2. Buang titik kolinier murni (180 derajat) yang membuat segitiga ear degenerate */
  const ptsX = [],
    ptsY = [];
  const m = cleanX.length;
  if (m < 3) return null;
  for (let i = 0; i < m; i++) {
    const px = cleanX[(i - 1 + m) % m],
      py = cleanY[(i - 1 + m) % m];
    const cx = cleanX[i],
      cy = cleanY[i];
    const nx = cleanX[(i + 1) % m],
      ny = cleanY[(i + 1) % m];
    const ux = cx - px,
      uy = cy - py,
      vx = nx - cx,
      vy = ny - cy;
    const l1 = Math.hypot(ux, uy),
      l2 = Math.hypot(vx, vy);
    if (l1 > 1e-5 && l2 > 1e-5) {
      const sinTheta = Math.abs(ux * vy - uy * vx) / (l1 * l2);
      const cosTheta = (ux * vx + uy * vy) / (l1 * l2);
      if (sinTheta < 1e-5 && cosTheta > 0) continue;
    }
    ptsX.push(cx);
    ptsY.push(cy);
  }
  const n = ptsX.length;
  if (n < 3) return null;
  if (n === 3) {
    const area3 = (ptsX[1] - ptsX[0]) * (ptsY[2] - ptsY[0]) - (ptsY[1] - ptsY[0]) * (ptsX[2] - ptsX[0]);
    if (Math.abs(area3) < 1e-8) return null;
    return new Float32Array([ptsX[0], ptsY[0], ptsX[1], ptsY[1], ptsX[2], ptsY[2]]);
  }

  /* 3. Validasi tidak ada self-intersection */
  if (hasPolygonSelfIntersection(ptsX, ptsY)) return null;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += ptsX[i] * ptsY[j] - ptsX[j] * ptsY[i];
  }
  if (Math.abs(area2) < 1e-7) return null;
  const ccw = area2 > 0;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = ccw ? i : n - 1 - i;
  const ptInTri = (px, py, ax, ay, bx, by, cx, cy) => {
    const c1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const c2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
    const c3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
    return c1 >= -1e-7 && c2 >= -1e-7 && c3 >= -1e-7;
  };
  const out = [];
  let count = n,
    guard = n * 4;
  let cur = 0,
    epsPass = 1e-7;
  while (count > 2 && guard-- > 0) {
    const iPrev = idx[(cur + count - 1) % count];
    const iCur = idx[cur % count];
    const iNext = idx[(cur + 1) % count];
    const ax = ptsX[iPrev],
      ay = ptsY[iPrev];
    const bx = ptsX[iCur],
      by = ptsY[iCur];
    const cx = ptsX[iNext],
      cy = ptsY[iNext];
    const crossZ = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (crossZ > epsPass) {
      let hasInside = false;
      for (let k = 0; k < count; k++) {
        const ik = idx[k];
        if (ik === iPrev || ik === iCur || ik === iNext) continue;
        if (ptInTri(ptsX[ik], ptsY[ik], ax, ay, bx, by, cx, cy)) {
          hasInside = true;
          break;
        }
      }
      if (!hasInside) {
        out.push(ax, ay, bx, by, cx, cy);
        idx.splice(cur % count, 1);
        count--;
        cur = cur % Math.max(1, count);
        continue;
      }
    }
    cur = (cur + 1) % count;
    if (cur === 0 && epsPass > -1e-7) epsPass = 1e-11;
  }
  if (count !== 2) return null; /* Fallback ke Hardware Stencil-Then-Cover */
  return new Float32Array(out);
}

/* PERF: Poligon simpel CONVEX (lingkaran, elips, rounded rect, dsb.) tidak butuh stencil-then-cover.
   Cukup triangle fan dari vertex 0 -> tanpa cover pass layar penuh. Cek: tanda cross konsisten + total putaran = 360 derajat
   (mencegah bintang/pentagram yang selalu berbelok searah tapi berputar 720 derajat). */
function isConvexSimplePolygon(coords) {
  const n = coords.length >> 1;
  if (n < 3) return false;
  let sign = 0, total = 0, used = 0;
  for (let i = 0; i < n; i++) {
    const ax = coords[i * 2], ay = coords[i * 2 + 1];
    const bx = coords[((i + 1) % n) * 2], by = coords[((i + 1) % n) * 2 + 1];
    const cx = coords[((i + 2) % n) * 2], cy = coords[((i + 2) % n) * 2 + 1];
    const ux = bx - ax, uy = by - ay, vx = cx - bx, vy = cy - by;
    const l1 = Math.hypot(ux, uy), l2 = Math.hypot(vx, vy);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const cross = ux * vy - uy * vx;
    const dot = ux * vx + uy * vy;
    if (Math.abs(cross) / (l1 * l2) < 2e-3 && dot > 0) continue; /* kolinier */
    const sg = cross > 0 ? 1 : -1;
    if (sign && sg !== sign) return false;
    sign = sg;
    total += Math.atan2(cross, dot);
    used++;
  }
  if (used < 3 || !sign) return false;
  return Math.abs(Math.abs(total) - Math.PI * 2) < 0.05;
}
function fanTrianglesFromVertex0(coords) {
  const n = coords.length >> 1;
  const out = new Float32Array((n - 2) * 6);
  const x0 = coords[0], y0 = coords[1];
  let o = 0;
  for (let k = 1; k < n - 1; k++) {
    out[o++] = x0; out[o++] = y0;
    out[o++] = coords[k * 2]; out[o++] = coords[k * 2 + 1];
    out[o++] = coords[(k + 1) * 2]; out[o++] = coords[(k + 1) * 2 + 1];
  }
  return out;
}

/* Tahap 3 & 5: Tessellator Stroke Lengkap dengan Join (miter, bevel, round), Cap (butt, square, round), & Adaptive Round Steps */
/* Tahap 3 & 5: Tessellator Stroke Lengkap dengan Join (miter, bevel, round), Cap (butt, square, round), & Adaptive Round Steps */
function tessellateStrokePolylines(polylines, halfWidth, joinMode = 'round', capMode = 'round', miterLimit = 4, effectiveZoom = 1) {
  const verts = [];
  const hw = halfWidth;
  if (!(hw > 0)) return null;
  const screenRadiusPx = hw * Math.max(0.1, effectiveZoom);
  const baseArcSteps = Math.max(4, Math.min(24, Math.ceil(Math.sqrt(screenRadiusPx) * 2.5)));
  const pushTri = (x1, y1, x2, y2, x3, y3) => {
    verts.push(x1, y1, x2, y2, x3, y3);
  };
  const pushArcFan = (cx, cy, a0, a1, stepsOverride) => {
    let da = a1 - a0;
    while (da <= -Math.PI) da += Math.PI * 2;
    while (da > Math.PI) da -= Math.PI * 2;
    const st = Math.max(3, Math.min(28, stepsOverride || Math.ceil(Math.abs(da) / Math.PI * baseArcSteps)));
    let px = cx + Math.cos(a0) * hw,
      py = cy + Math.sin(a0) * hw;
    for (let s = 1; s <= st; s++) {
      const ang = a0 + da * s / st;
      const qx = cx + Math.cos(ang) * hw,
        qy = cy + Math.sin(ang) * hw;
      pushTri(cx, cy, px, py, qx, qy);
      px = qx;
      py = qy;
    }
  };
  for (let pi = 0; pi < polylines.length; pi++) {
    const pl = polylines[pi],
      c = pl.coords,
      n = c.length >> 1;
    if (n < 2) continue;
    const closed = !!pl.closed;
    const segCount = closed ? n : n - 1;
    const segBuf = new Float64Array(segCount * 8);
    let segLen = 0;
    for (let i = 0; i < segCount; i++) {
      const ax = c[i * 2],
        ay = c[i * 2 + 1];
      const nextIdx = (i + 1) % n * 2;
      const bx = c[nextIdx],
        by = c[nextIdx + 1];
      const dx = bx - ax,
        dy = by - ay,
        L2 = dx * dx + dy * dy;
      if (L2 < 1e-12) continue;
      const invL = 1 / Math.sqrt(L2);
      const tx = dx * invL,
        ty = dy * invL;
      const base = segLen * 8;
      segBuf[base] = ax;
      segBuf[base + 1] = ay;
      segBuf[base + 2] = bx;
      segBuf[base + 3] = by;
      segBuf[base + 4] = tx;
      segBuf[base + 5] = ty;
      segBuf[base + 6] = -ty;
      segBuf[base + 7] = tx;
      segLen++;
    }
    if (!segLen) continue;

    /* 1. Quad per segmen */
    for (let i = 0; i < segLen; i++) {
      const b0 = i * 8;
      const ax = segBuf[b0],
        ay = segBuf[b0 + 1],
        bx = segBuf[b0 + 2],
        by = segBuf[b0 + 3],
        nx = segBuf[b0 + 6],
        ny = segBuf[b0 + 7];
      const nxhw = nx * hw,
        nyhw = ny * hw;
      const x1 = ax + nxhw,
        y1 = ay + nyhw;
      const x2 = ax - nxhw,
        y2 = ay - nyhw;
      const x3 = bx + nxhw,
        y3 = by + nyhw;
      const x4 = bx - nxhw,
        y4 = by - nyhw;
      pushTri(x1, y1, x2, y2, x3, y3);
      pushTri(x2, y2, x4, y4, x3, y3);
    }

    /* 2. Line Joins antar segmen berurutan (miter / bevel / round) */
    const joinCount = closed ? segLen : segLen - 1;
    const miterLimSq = miterLimit * miterLimit;
    for (let i = 0; i < joinCount; i++) {
      const b0 = i * 8,
        b1 = (i + 1) % segLen * 8;
      const vx = segBuf[b0 + 2],
        vy = segBuf[b0 + 3];
      const s0tx = segBuf[b0 + 4],
        s0ty = segBuf[b0 + 5],
        s0nx = segBuf[b0 + 6],
        s0ny = segBuf[b0 + 7];
      const s1tx = segBuf[b1 + 4],
        s1ty = segBuf[b1 + 5],
        s1nx = segBuf[b1 + 6],
        s1ny = segBuf[b1 + 7];
      const crossT = s0tx * s1ty - s0ty * s1tx;
      if (Math.abs(crossT) < 1e-5) continue;
      const turnLeft = crossT < 0;
      const n0x = turnLeft ? s0nx : -s0nx,
        n0y = turnLeft ? s0ny : -s0ny;
      const n1x = turnLeft ? s1nx : -s1nx,
        n1y = turnLeft ? s1ny : -s1ny;
      const p0x = vx + n0x * hw,
        p0y = vy + n0y * hw;
      const p1x = vx + n1x * hw,
        p1y = vy + n1y * hw;
      if (joinMode === 'round' && screenRadiusPx > 1.25 && Math.abs(crossT) > 0.35) {
        pushArcFan(vx, vy, Math.atan2(n0y, n0x), Math.atan2(n1y, n1x));
      } else {
        /* Bevel dasar */
        pushTri(vx, vy, p0x, p0y, p1x, p1y);
        if (joinMode === 'miter') {
          const mx = n0x + n1x,
            my = n0y + n1y;
          const mLen2 = mx * mx + my * my;
          if (mLen2 > 1e-6) {
            const invHalfCos = 2 / mLen2;
            if (invHalfCos <= miterLimSq) {
              const miterPtX = vx + mx * (hw * 0.5 * invHalfCos);
              const miterPtY = vy + my * (hw * 0.5 * invHalfCos);
              pushTri(p0x, p0y, miterPtX, miterPtY, p1x, p1y);
            }
          }
        }
      }
    }

    /* 3. Line Caps pada ujung subpath terbuka (butt / square / round) */
    if (!closed && capMode !== 'butt') {
      const fAx = segBuf[0],
        fAy = segBuf[1],
        fTx = segBuf[4],
        fTy = segBuf[5],
        fNx = segBuf[6],
        fNy = segBuf[7];
      const lBase = (segLen - 1) * 8;
      const lBx = segBuf[lBase + 2],
        lBy = segBuf[lBase + 3],
        lTx = segBuf[lBase + 4],
        lTy = segBuf[lBase + 5],
        lNx = segBuf[lBase + 6],
        lNy = segBuf[lBase + 7];
      if (capMode === 'square') {
        const sx0 = fAx - fTx * hw,
          sy0 = fAy - fTy * hw;
        pushTri(fAx + fNx * hw, fAy + fNy * hw, sx0 + fNx * hw, sy0 + fNy * hw, sx0 - fNx * hw, sy0 - fNy * hw);
        pushTri(fAx + fNx * hw, fAy + fNy * hw, sx0 - fNx * hw, sy0 - fNy * hw, fAx - fNx * hw, fAy - fNy * hw);
        const ex1 = lBx + lTx * hw,
          ey1 = lBy + lTy * hw;
        pushTri(lBx + lNx * hw, lBy + lNy * hw, ex1 + lNx * hw, ey1 + lNy * hw, ex1 - lNx * hw, ey1 - lNy * hw);
        pushTri(lBx + lNx * hw, lBy + lNy * hw, ex1 - lNx * hw, ey1 - lNy * hw, lBx - lNx * hw, lBy - lNy * hw);
      } else if (capMode === 'round') {
        const aStart = Math.atan2(fNy, fNx);
        const startMid = Math.atan2(-fTy, -fTx);
        pushArcFan(fAx, fAy, aStart, startMid);
        pushArcFan(fAx, fAy, startMid, aStart + Math.PI);
        const aEnd = Math.atan2(lNy, lNx);
        const endMid = Math.atan2(lTy, lTx);
        pushArcFan(lBx, lBy, aEnd, endMid);
        pushArcFan(lBx, lBy, endMid, aEnd - Math.PI);
      }
    }
  }
  return verts.length ? new Float32Array(verts) : null;
}

/* Cek apakah objek eligible untuk Seam Guard (Tahap 3 — A/B Test) */
/* Cek apakah objek eligible untuk Seam Guard (Tahap 3 — A/B Test) */
function isObjectSeamCandidate(o) {
  return (!o.stroke || o.stroke === 'none' || !(o.strokeWidth > 0)) && o.fill && o.fill !== 'none' && o.fill !== 'transparent' && isOpaquePaint(o) && !o.isFrameBg && !o.isAutoFrame;
}

/* Tahap 4 & 5: Pembentukan Buffer GPU dengan Local Coordinate Rebasing (Float32) & Cache terpisah dari warna Fill */
/* Tahap 4 & 5: Pembentukan Buffer GPU dengan Local Coordinate Rebasing (Float32) & Cache terpisah dari warna Fill */
let SCENE_INTERACTING_ZOOM = false;
function buildObjectGpuBuffers(o, zoom = 1) {
  const objEntry = GEOMETRY_CACHE.getObjectEntry(o);
  const rcMask = (RENDER_CONFIG.seamGuard ? 1 : 0) | (RENDER_CONFIG.aaMode === 'analytic' ? 2 : 0);
  if (objEntry._lastGm && objEntry._lastGmRc === rcMask && objEntry._lastGmFr === (o.fillRule || 'nonzero') && objEntry._lastGmSt === (o.stroke || 'none') && objEntry._lastGmSw === (o.strokeWidth || 0) && objEntry._lastGmNs === !!o.nonScalingStroke && objEntry._lastGmLj === (o.strokeLinejoin || 'round') && objEntry._lastGmLc === (o.strokeLinecap || 'round') && objEntry._lastGmMl === (o.strokeMiterlimit || 4)) {
    if (SCENE_INTERACTING_ZOOM || objEntry._lastGmZ === zoom || RENDER_CONFIG.aaMode !== 'analytic' && objEntry._lastGm.lodBucket === (!objEntry.hasCurves || zoom < 8 ? 0 : zoom < 16 ? 2 : 4)) {
      GEOMETRY_CACHE.recordHit();
      return objEntry._lastGm;
    }
  }
  const lod = getObjectTessellationLOD(o, zoom);
  const byMesh = objEntry.gpuMeshBuckets;
  const hasStroke = !!(o.stroke && o.stroke !== 'none' && o.strokeWidth > 0);
  const hasSeamOnly = !hasStroke && RENDER_CONFIG.seamGuard && o.fill && o.fill !== 'none' && isOpaquePaint(o) && !o.isFrameBg && !o.isAutoFrame;
  const rawSw = hasStroke ? o.strokeWidth : hasSeamOnly ? SEAM_STROKE_PX : 0;
  const isNonScaling = !!(o.nonScalingStroke || hasSeamOnly);
  const quantZoom = Math.max(0.0005, lod.effectiveZoom || 1);
  const effSw = isNonScaling ? rawSw / quantZoom : rawSw;
  const cacheKey = rawSw === 0 && RENDER_CONFIG.aaMode !== 'analytic' ? lod.lodBucket + '|fill:' + (o.fillRule || 'nonzero') : lod.lodBucket + '|' + (isNonScaling || quantZoom < 1 ? 'ns:' + Math.round(effSw * 1000) : 's:' + Math.round(rawSw * 1000)) + '|' + (o.strokeLinejoin || 'round') + '|' + (o.strokeLinecap || 'round') + '|' + (o.fillRule || 'nonzero') + '|' + (RENDER_CONFIG.aaMode === 'analytic' ? 'aa1' : 'aa0');
  const saveLastGm = gm => {
    objEntry._lastGm = gm;
    objEntry._lastGmZ = zoom;
    objEntry._lastGmRc = rcMask;
    objEntry._lastGmFr = o.fillRule || 'nonzero';
    objEntry._lastGmSt = o.stroke || 'none';
    objEntry._lastGmSw = o.strokeWidth || 0;
    objEntry._lastGmNs = !!o.nonScalingStroke;
    objEntry._lastGmLj = o.strokeLinejoin || 'round';
    objEntry._lastGmLc = o.strokeLinecap || 'round';
    objEntry._lastGmMl = o.strokeMiterlimit || 4;
    return gm;
  };
  const hitMesh = byMesh.get(cacheKey);
  if (hitMesh !== undefined) {
    return saveLastGm(hitMesh);
  }
  if (byMesh.size >= MAX_GPU_MESH_PER_OBJ) {
    const oldK = byMesh.keys().next().value;
    const oldGm = byMesh.get(oldK);
    byMesh.delete(oldK);
    if (oldGm) {
      if (objEntry._lastGm === oldGm) objEntry._lastGm = null;
      oldGm._vboGl = null;
      oldGm._vboEntry = null;
      GEOMETRY_CACHE.registerGpuMeshBytes(objEntry, oldGm, -1);
    }
  }

  /* Gunakan localPolylines (relatif terhadap originX, originY) agar Float32 bebas jitter pada koordinat besar! */
  const pls = lod.localPolylines;
  const originX = lod.originX;
  const originY = lod.originY;
  let earArray = null;
  if (pls.length === 1 && pls[0].closed && o.fillRule !== 'evenodd') {
    earArray = earClipSimplePolygon(pls[0].coords);
    if (!earArray && isConvexSimplePolygon(pls[0].coords)) earArray = fanTrianglesFromVertex0(pls[0].coords);
  }
  const bb = vinfo(o).bb;
  const localW = Math.max(1e-4, bb[2] - bb[0]);
  const localH = Math.max(1e-4, bb[3] - bb[1]);
  const pivotX = bb[0] - originX + localW * 0.5;
  const pivotY = bb[1] - originY + localH * 0.5;
  const fanVerts = [];
  if (!earArray) {
    for (let i = 0; i < pls.length; i++) {
      const pl = pls[i],
        c = pl.coords,
        n = c.length >> 1;
      if (n < 3) continue;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        fanVerts.push(pivotX, pivotY, c[k * 2], c[k * 2 + 1], c[k2 * 2], c[k2 * 2 + 1]);
      }
    }
  }
  const pad = effSw > 0 ? effSw + 2 : 2;
  const bx0 = bb[0] - originX - pad,
    by0 = bb[1] - originY - pad;
  const bx1 = bb[2] - originX + pad,
    by1 = bb[3] - originY + pad;
  const coverVerts = new Float32Array([bx0, by0, bx1, by0, bx1, by1, bx0, by0, bx1, by1, bx0, by1]);
  const strokeArray = effSw > 0 ? tessellateStrokePolylines(pls, effSw * 0.5, hasSeamOnly ? 'bevel' : o.strokeLinejoin || 'round', hasSeamOnly ? 'butt' : o.strokeLinecap || 'round', o.strokeMiterlimit || 4, lod.effectiveZoom) : null;

  /* Analytic Edge Coverage fringe (0.85 px) jika mode Analytic AA dipilih */
  const edgeAaArray = RENDER_CONFIG.aaMode === 'analytic' && !(effSw > 0) ? tessellateStrokePolylines(pls, 0.45 / Math.max(0.001, zoom), 'round', 'round', 2, lod.effectiveZoom) : null;
  const fillTriCount = earArray ? earArray.length / 6 : fanVerts.length / 6;
  const strokeTriCount = strokeArray ? strokeArray.length / 6 : 0;
  const res = {
    geometryRevision: lod.geometryRevision,
    originX,
    originY,
    lodBucket: lod.lodBucket,
    effectiveZoom: lod.effectiveZoom,
    eps: lod.eps,
    totalVerts: lod.totalVerts,
    fillTriCount,
    strokeTriCount,
    earArray,
    fanArray: fanVerts.length ? new Float32Array(fanVerts) : null,
    coverArray: coverVerts,
    strokeArray,
    edgeAaArray,
    hasSeamOnly,
    tessellationMetadata: lod.tessellationMetadata
  };
  byMesh.set(cacheKey, res);
  GEOMETRY_CACHE.registerGpuMeshBytes(objEntry, res, 1);
  return saveLastGm(res);
}

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
function setSceneInteractingZoom(v) {
  SCENE_INTERACTING_ZOOM = v;
  return v;
}

export { isConvexSimplePolygon, fanTrianglesFromVertex0, hasPolygonSelfIntersection, earClipSimplePolygon, tessellateStrokePolylines, isObjectSeamCandidate, SCENE_INTERACTING_ZOOM, buildObjectGpuBuffers, setSceneInteractingZoom };
