/**
 * @file src/engine/curveFittingAndAnomalies.jsx
 * @description Pencocokan lingkaran Kåsa, pencocokan kurva Schneider, & deteksi anomali geometri vektor
 */
import { dist, nrm, sub, dot, cross, rd, P, uid, cl } from './vectorPrimitives.jsx';

/* =========================================================================
   DETEKSI GEOMETRI (INSPECTION ONLY) & AUTO-SIMPLIFY NODE ALGORITHMS
   Berdasarkan rekomendasi: Ray-Intersection Collapse, Schneider Bézier Fit,
   Kåsa Circle Fit, Monotonic Exterior Angle, Curvature Sign Alternation, DBSCAN
   ========================================================================= */

/* 1. Kåsa Algebraic Circle Fit Test */
function kasaFit(pts) {
  const m = pts.length;
  if (m < 3) return null;
  let sx = 0,
    sy = 0,
    sx2 = 0,
    sy2 = 0,
    sxy = 0,
    sx3 = 0,
    sy3 = 0,
    sx2y = 0,
    sxy2 = 0;
  for (const p of pts) {
    const x = p.x,
      y = p.y,
      x2 = x * x,
      y2 = y * y;
    sx += x;
    sy += y;
    sx2 += x2;
    sy2 += y2;
    sxy += x * y;
    sx3 += x2 * x;
    sy3 += y2 * y;
    sx2y += x2 * y;
    sxy2 += x * y2;
  }
  const C = m * sx2 - sx * sx,
    D = m * sxy - sx * sy,
    E = m * sy2 - sy * sy;
  const G = 0.5 * (m * sx3 + m * sxy2 - sx * sx2 - sx * sy2);
  const H = 0.5 * (m * sx2y + m * sy3 - sy * sx2 - sy * sy2);
  const det = C * E - D * D;
  if (Math.abs(det) < 1e-9) return null;
  const cx = (G * E - H * D) / det,
    cy = (C * H - D * G) / det;
  let rad = 0;
  for (const p of pts) rad += Math.hypot(p.x - cx, p.y - cy);
  rad /= m;
  let ss = 0,
    mx = 0;
  for (const p of pts) {
    const e = Math.abs(Math.hypot(p.x - cx, p.y - cy) - rad);
    if (e > mx) mx = e;
    ss += e * e;
  }
  const rms = Math.sqrt(ss / m);
  return {
    cx,
    cy,
    rad,
    rms,
    maxErr: mx
  };
}

/* 2. Philip Schneider Cubic Bézier Re-Fitting (Least Squares dengan Fixed Tangents) */
/* 2. Philip Schneider Cubic Bézier Re-Fitting (Least Squares dengan Fixed Tangents) */
function schneiderFit(points, t1, t2, tol) {
  const e2 = Math.max(0.01, tol * tol);
  const P = points.map(p => [p.x, p.y]);
  const n = P.length;
  if (n < 2) return [];
  const qb = (B, t) => {
    const m = 1 - t,
      a = m * m * m,
      b = 3 * m * m * t,
      c = 3 * m * t * t,
      d = t * t * t;
    return [a * B[0][0] + b * B[1][0] + c * B[2][0] + d * B[3][0], a * B[0][1] + b * B[1][1] + c * B[2][1] + d * B[3][1]];
  };
  const q1b = (B, t) => {
    const m = 1 - t;
    return [0, 1].map(i => 3 * (m * m * (B[1][i] - B[0][i]) + 2 * m * t * (B[2][i] - B[1][i]) + t * t * (B[3][i] - B[2][i])));
  };
  const q2b = (B, t) => {
    const m = 1 - t;
    return [0, 1].map(i => 6 * (m * (B[2][i] - 2 * B[1][i] + B[0][i]) + t * (B[3][i] - 2 * B[2][i] + B[1][i])));
  };
  const genB = (pts, u, tan1, tan2) => {
    const len = pts.length,
      p0 = pts[0],
      p3 = pts[len - 1];
    let c00 = 0,
      c01 = 0,
      c11 = 0,
      x0 = 0,
      x1 = 0;
    for (let i = 0; i < len; i++) {
      const t = u[i],
        m = 1 - t,
        b0 = m * m * m,
        b1 = 3 * m * m * t,
        b2 = 3 * m * t * t,
        b3 = t * t * t;
      const a1 = [tan1[0] * b1, tan1[1] * b1],
        a2 = [tan2[0] * b2, tan2[1] * b2];
      c00 += a1[0] * a1[0] + a1[1] * a1[1];
      c01 += a1[0] * a2[0] + a1[1] * a2[1];
      c11 += a2[0] * a2[0] + a2[1] * a2[1];
      const tm = [pts[i][0] - (p0[0] * (b0 + b1) + p3[0] * (b2 + b3)), pts[i][1] - (p0[1] * (b0 + b1) + p3[1] * (b2 + b3))];
      x0 += a1[0] * tm[0] + a1[1] * tm[1];
      x1 += a2[0] * tm[0] + a2[1] * tm[1];
    }
    const det = c00 * c11 - c01 * c01;
    let a = det ? (x0 * c11 - x1 * c01) / det : 0,
      b = det ? (c00 * x1 - c01 * x0) / det : 0;
    const sd = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
    if (a < 1e-6 * sd || b < 1e-6 * sd) a = b = sd / 3;
    return [p0, [p0[0] + tan1[0] * a, p0[1] + tan1[1] * a], [p3[0] + tan2[0] * b, p3[1] + tan2[1] * b], p3];
  };
  const maxErrB = (pts, B, u) => {
    let mx = 0,
      mi = Math.floor(pts.length / 2);
    for (let i = 1; i < pts.length - 1; i++) {
      const d = qb(B, u[i]),
        e = (d[0] - pts[i][0]) ** 2 + (d[1] - pts[i][1]) ** 2;
      if (e > mx) {
        mx = e;
        mi = i;
      }
    }
    return [mx, mi];
  };
  const repB = (pts, u, B) => {
    return u.map((t, i) => {
      const d = qb(B, t),
        d1 = q1b(B, t),
        d2 = q2b(B, t),
        dx = d[0] - pts[i][0],
        dy = d[1] - pts[i][1];
      const num = dx * d1[0] + dy * d1[1],
        den = d1[0] ** 2 + d1[1] ** 2 + dx * d2[0] + dy * d2[1];
      return den ? Math.max(0, Math.min(1, t - num / den)) : t;
    });
  };
  const out = [];
  const fitRec = (pts, tan1, tan2) => {
    const count = pts.length;
    if (count === 2) {
      const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 3;
      out.push([pts[0], [pts[0][0] + tan1[0] * d, pts[0][1] + tan1[1] * d], [pts[1][0] + tan2[0] * d, pts[1][1] + tan2[1] * d], pts[1]]);
      return;
    }
    let u = [0];
    for (let i = 1; i < count; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = u[count - 1] || 1;
    u = u.map(v => v / L);
    let B = genB(pts, u, tan1, tan2),
      [err, sp] = maxErrB(pts, B, u);
    for (let k = 0; k < 5 && err >= e2; k++) {
      if (err > e2 * 16) break;
      u = repB(pts, u, B);
      B = genB(pts, u, tan1, tan2);
      [err, sp] = maxErrB(pts, B, u);
    }
    if (err < e2) {
      out.push(B);
      return;
    }
    const fdx = pts[sp + 1][0] - pts[sp - 1][0],
      fdy = pts[sp + 1][1] - pts[sp - 1][1];
    const fl = Math.hypot(fdx, fdy) || 1;
    const f = [fdx / fl, fdy / fl];
    fitRec(pts.slice(0, sp + 1), tan1, [-f[0], -f[1]]);
    fitRec(pts.slice(sp), f, tan2);
  };
  const tan1 = [t1.x, t1.y],
    tan2 = [t2.x, t2.y];
  fitRec(P, tan1, tan2);
  return out;
}

/* ===== helper umum deteksi/simplify ===== */
/* ===== helper umum deteksi/simplify ===== */
const HTOL = 0.35;
const hasH = (nd, h) => !!h && Math.hypot(h.x - nd.x, h.y - nd.y) > HTOL;
/* segmen a→b dianggap lurus bila tidak ada handle aktif di kedua ujungnya */
/* segmen a→b dianggap lurus bila tidak ada handle aktif di kedua ujungnya */
const segStraight = (a, b) => !hasH(a, a.handleOut) && !hasH(b, b.handleIn);
const chainStraight = (nodes, idxs) => {
  for (let k = 0; k < idxs.length - 1; k++) if (!segStraight(nodes[idxs[k]], nodes[idxs[k + 1]])) return false;
  return true;
};
/* klaim indeks: hasil deteksi tidak boleh saling tumpang tindih (boleh berbagi node ujung) */
/* klaim indeks: hasil deteksi tidak boleh saling tumpang tindih (boleh berbagi node ujung) */
const makeClaim = () => {
  const all = new Set(),
    inner = new Set();
  return {
    ok(idxs) {
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k],
          end = k === 0 || k === idxs.length - 1;
        if (end ? inner.has(i) : all.has(i)) return false;
      }
      return true;
    },
    add(idxs) {
      idxs.forEach((i, k) => {
        all.add(i);
        if (k > 0 && k < idxs.length - 1) inner.add(i);
      });
    }
  };
};
const idIndex = nodes => {
  const m = new Map();
  nodes.forEach((nd, i) => m.set(nd.id, i));
  return m;
};

/* 3. Deteksi Corner Clusters (1D-DBSCAN sepanjang subpath + validasi sudut + Ray Intersection) */
/* 3. Deteksi Corner Clusters (1D-DBSCAN sepanjang subpath + validasi sudut + Ray Intersection) */
function findCornerClusters(nodes, closed, eps = 4.0, minAngleDeg = 20) {
  const n = nodes.length;
  if (n < 4) return [];
  /* closed path: mulai dari node yang jaraknya ke pendahulunya > eps agar cluster tidak terbelah di sambungan (wrap-around) */
  let start = 0;
  if (closed) {
    start = -1;
    for (let i = 0; i < n; i++) if (dist(nodes[(i - 1 + n) % n], nodes[i]) > eps) {
      start = i;
      break;
    }
    if (start < 0) return [];
  }
  const groups = [];
  let cur = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (cur.length && dist(nodes[cur[cur.length - 1]], nodes[i]) <= eps && dist(nodes[cur[0]], nodes[i]) <= eps * 1.5) cur.push(i);else {
      if (cur.length) groups.push(cur);
      cur = [i];
    }
  }
  if (cur.length) groups.push(cur);
  const clusters = [],
    minAng = minAngleDeg;
  for (const g of groups) {
    if (g.length < 2 || g.length > n - 2) continue;
    const f = g[0],
      l = g[g.length - 1];
    if (!closed && (g.indexOf(0) >= 0 || g.indexOf(n - 1) >= 0)) continue;
    if (g.some(i => nodes[i].fil)) continue; /* jangan batalkan fillet parametrik */
    const pi = (f - 1 + n) % n,
      ni = (l + 1) % n;
    const A = nodes[f],
      B = nodes[l],
      PV = nodes[pi],
      NX = nodes[ni];
    /* segmen tetangga harus lebih panjang dari eps: bedakan "simpul menumpuk" dari kurva rapat */
    if (dist(PV, A) <= eps || dist(B, NX) <= eps) continue;
    const vIn = hasH(A, A.handleIn) ? nrm(sub(A, A.handleIn)) : hasH(PV, PV.handleOut) ? nrm(sub(A, PV.handleOut)) : nrm(sub(A, PV));
    const vOut = hasH(B, B.handleOut) ? nrm(sub(B.handleOut, B)) : hasH(NX, NX.handleIn) ? nrm(sub(NX.handleIn, B)) : nrm(sub(NX, B));
    const angDeg = Math.acos(Math.max(-1, Math.min(1, dot(vIn, vOut)))) * 180 / Math.PI;
    if (angDeg < minAng) continue;
    let cx = 0,
      cy = 0;
    g.forEach(i => {
      cx += nodes[i].x;
      cy += nodes[i].y;
    });
    cx /= g.length;
    cy /= g.length;
    const centroid = {
      x: cx,
      y: cy
    };
    /* P* = perpotongan ray masuk (dari A) dan ray keluar (dari B): A + vIn*t = B + vOut*s */
    let inter = null;
    const det = cross(vIn, vOut);
    if (Math.abs(det) > 1e-4) {
      const w = sub(B, A),
        t = cross(w, vOut) / det,
        px = A.x + vIn.x * t,
        py = A.y + vIn.y * t;
      if (Math.hypot(px - cx, py - cy) <= Math.max(20, eps * 8)) inter = {
        x: px,
        y: py
      };
    }
    if (!inter) inter = centroid;
    let rMax = 0;
    g.forEach(i => {
      const d = dist(nodes[i], centroid);
      if (d > rMax) rMax = d;
    });
    clusters.push({
      nodeIndices: g.slice(),
      nodeIds: g.map(i => nodes[i].id),
      firstIdx: f,
      lastIdx: l,
      prevIdx: pi,
      nextIdx: ni,
      angleDeg: angDeg,
      centroid,
      radius: Math.max(rMax, eps),
      intersection: {
        x: rd(inter.x),
        y: rd(inter.y)
      }
    });
  }
  return clusters;
}

/* 4. Deteksi Node Redundan pada Garis Lurus (Cross-Product Collinearity Test) */
/* 4. Deteksi Node Redundan pada Garis Lurus (Cross-Product Collinearity Test) */
function findCollinearNodes(nodes, closed, tol = 0.25) {
  const n = nodes.length;
  if (n < 3) return [];
  const results = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const prev = nodes[(i - 1 + n) % n],
      curr = nodes[i],
      next = nodes[(i + 1) % n];
    if (hasH(curr, curr.handleIn) || hasH(curr, curr.handleOut)) continue;
    if (hasH(prev, prev.handleOut) || hasH(next, next.handleIn)) continue;
    if (curr.fil) continue;
    const L = dist(prev, next);
    if (L < 1e-6) continue;
    const perpDist = Math.abs((next.x - prev.x) * (prev.y - curr.y) - (prev.x - curr.x) * (next.y - prev.y)) / L;
    const dotVal = (curr.x - prev.x) * (next.x - prev.x) + (curr.y - prev.y) * (next.y - prev.y);
    if (perpDist <= tol && dotVal > 0 && dotVal < L * L) results.push({
      index: i,
      nodeId: curr.id,
      perpDist: rd(perpDist),
      pt: {
        x: curr.x,
        y: curr.y
      }
    });
  }
  return results;
}

/* 5. Deteksi Garis Meleyot (Tortuosity + Zero-Crossing terhadap chord); hanya rantai segmen lurus */
/* 5. Deteksi Garis Meleyot (Tortuosity + Zero-Crossing terhadap chord); hanya rantai segmen lurus */
function findWobblySpans(nodes, closed) {
  const n = nodes.length;
  if (n < 4) return [];
  const results = [],
    claim = makeClaim(),
    maxSpan = Math.min(10, closed ? n - 1 : n);
  for (let spanLen = maxSpan; spanLen >= 4; spanLen--) {
    const lastStart = closed ? n - 1 : n - spanLen;
    for (let i = 0; i <= lastStart; i++) {
      const idxs = [];
      for (let k = 0; k < spanLen; k++) idxs.push((i + k) % n);
      if (!claim.ok(idxs) || !chainStraight(nodes, idxs)) continue;
      const pStart = nodes[idxs[0]],
        pEnd = nodes[idxs[idxs.length - 1]];
      const chordLen = dist(pStart, pEnd);
      if (chordLen < 15) continue;
      let arcLen = 0;
      for (let k = 0; k < idxs.length - 1; k++) arcLen += dist(nodes[idxs[k]], nodes[idxs[k + 1]]);
      const tortuosity = arcLen / chordLen;
      if (tortuosity < 1.002 || tortuosity > 1.15) continue;
      let crossings = 0,
        prevSign = 0,
        maxDev = 0;
      const ab = sub(pEnd, pStart);
      for (let k = 1; k < idxs.length - 1; k++) {
        const sd = cross(ab, sub(nodes[idxs[k]], pStart)) / chordLen,
          ad = Math.abs(sd);
        if (ad > maxDev) maxDev = ad;
        const sign = sd > 0.15 ? 1 : sd < -0.15 ? -1 : 0;
        if (sign !== 0) {
          if (prevSign !== 0 && sign !== prevSign) crossings++;
          prevSign = sign;
        }
      }
      if (crossings >= 2 && maxDev < Math.max(5, chordLen * 0.14)) {
        claim.add(idxs);
        let cx = 0,
          cy = 0;
        idxs.forEach(k => {
          cx += nodes[k].x;
          cy += nodes[k].y;
        });
        cx /= idxs.length;
        cy /= idxs.length;
        results.push({
          nodeIndices: idxs,
          nodeIds: idxs.map(k => nodes[k].id),
          pts: idxs.map(k => ({
            x: nodes[k].x,
            y: nodes[k].y
          })),
          centroid: {
            x: cx,
            y: cy
          },
          chord: {
            p1: P(pStart),
            p2: P(pEnd)
          },
          chordLen: rd(chordLen),
          tortuosity: rd(tortuosity),
          crossings,
          maxDev: rd(maxDev)
        });
      }
    }
  }
  return results;
}

/* 6. Deteksi Lengkungan Patah / Faset (Monotonic Exterior Angle + Kåsa Circle Fit) */
/* 6. Deteksi Lengkungan Patah / Faset (Monotonic Exterior Angle + Kåsa Circle Fit) */
function findFacetedCurves(nodes, closed) {
  const n = nodes.length;
  if (n < 4) return [];
  const results = [],
    claim = makeClaim(),
    minChainLen = 4;
  for (let i = 0; i < (closed ? n : n - minChainLen + 1); i++) {
    const chain = [i];
    let prevSign = 0,
      total = 0;
    for (let k = 1; k < Math.min(12, n); k++) {
      if (!closed && i + k >= n) break;
      const cu = (i + k) % n,
        pv = (i + k - 1) % n,
        pp = (i + k - 2 + n) % n;
      const segLen = dist(nodes[pv], nodes[cu]);
      if (segLen > 55 || segLen < 1e-4 || !segStraight(nodes[pv], nodes[cu])) break;
      if (k >= 2) {
        const u = nrm(sub(nodes[pv], nodes[pp])),
          v = nrm(sub(nodes[cu], nodes[pv]));
        const turn = Math.atan2(cross(u, v), dot(u, v)),
          absAng = Math.abs(turn) * 180 / Math.PI;
        if (absAng < 2 || absAng > 42) break;
        const sign = turn > 0 ? 1 : -1;
        if (prevSign !== 0 && sign !== prevSign) break;
        prevSign = sign;
        total += absAng;
      }
      chain.push(cu);
    }
    if (chain.length < minChainLen || total < 26 || closed && chain.length >= n) continue;
    const fit = kasaFit(chain.map(k => nodes[k]));
    if (!fit || fit.rad < 4 || fit.rad > 6000 || fit.rms > Math.max(0.6, fit.rad * 0.04)) continue;
    if (!claim.ok(chain)) continue;
    claim.add(chain);
    let cx = 0,
      cy = 0;
    chain.forEach(k => {
      cx += nodes[k].x;
      cy += nodes[k].y;
    });
    cx /= chain.length;
    cy /= chain.length;
    results.push({
      nodeIndices: chain,
      nodeIds: chain.map(k => nodes[k].id),
      pts: chain.map(k => ({
        x: nodes[k].x,
        y: nodes[k].y
      })),
      centroid: {
        x: cx,
        y: cy
      },
      center: {
        x: rd(fit.cx),
        y: rd(fit.cy)
      },
      radius: rd(fit.rad),
      rms: rd(fit.rms),
      totalAngleDeg: rd(total)
    });
    i += chain.length - 2; /* lanjut dari node ujung rantai (ujung boleh dipakai bersama) */
  }

  return results;
}

/* 7. Deteksi Node Berlebih pada Lengkungan (jendela 5 node, belokan konsisten, cocok lingkaran) */
/* 7. Deteksi Node Berlebih pada Lengkungan (jendela 5 node, belokan konsisten, cocok lingkaran) */
function findDenseArcNodes(nodes, closed) {
  const n = nodes.length;
  if (n < 5) return [];
  const results = [],
    claim = makeClaim();
  for (let i = 0; i < (closed ? n : n - 4); i++) {
    const idxs = [];
    for (let k = 0; k < 5; k++) idxs.push((i + k) % n);
    if (closed && n < 6) break;
    if (!chainStraight(nodes, idxs)) continue;
    let ok = true,
      segSum = 0;
    for (let k = 0; k < 4; k++) {
      const d = dist(nodes[idxs[k]], nodes[idxs[k + 1]]);
      if (d > 35 || d < 0.5) {
        ok = false;
        break;
      }
      segSum += d;
    }
    if (!ok) continue;
    const ch = dist(nodes[idxs[0]], nodes[idxs[4]]);
    if (ch < 10 || segSum / ch > 1.45) continue;
    let sg = 0,
      tot = 0;
    for (let k = 1; k < 4; k++) {
      const u = nrm(sub(nodes[idxs[k]], nodes[idxs[k - 1]])),
        v = nrm(sub(nodes[idxs[k + 1]], nodes[idxs[k]]));
      const t = Math.atan2(cross(u, v), dot(u, v)),
        s = t > 0.0035 ? 1 : t < -0.0035 ? -1 : 0;
      if (s === 0 || sg && s !== sg) {
        ok = false;
        break;
      }
      sg = s;
      tot += Math.abs(t);
    }
    if (!ok || tot * 180 / Math.PI < 6) continue;
    const fit = kasaFit(idxs.map(k => nodes[k]));
    if (!fit || fit.rms >= 1.0 || fit.rad >= 400 || !claim.ok(idxs)) continue;
    claim.add(idxs);
    let cx = 0,
      cy = 0;
    idxs.forEach(k => {
      cx += nodes[k].x;
      cy += nodes[k].y;
    });
    results.push({
      nodeIndices: idxs,
      nodeIds: idxs.map(k => nodes[k].id),
      pts: idxs.map(k => ({
        x: nodes[k].x,
        y: nodes[k].y
      })),
      centroid: {
        x: cx / 5,
        y: cy / 5
      },
      fitRadius: rd(fit.rad),
      radius: rd(fit.rad)
    });
    i += 3;
  }
  return results;
}

/* 8. Master Deteksi Geometri (Non-Destruktif); id deterministik agar pilihan tidak hilang saat re-render */
/* 8. Master Deteksi Geometri (Non-Destruktif); id deterministik agar pilihan tidak hilang saat re-render */
const EMPTY_INSPECTION = {
  summary: {
    total: 0,
    cornerClusterCount: 0,
    collinearCount: 0,
    wobblyCount: 0,
    facetedCount: 0,
    denseArcCount: 0
  },
  clusteredCorners: [],
  collinearNodes: [],
  wobblyLines: [],
  facetedCurves: [],
  denseArcNodes: [],
  heatmap: []
};
function detectAnomalies(doc, opt = {}) {
  const eps = opt.cornerEps || 4.0,
    colTol = opt.collinearTol || 0.25,
    wantHeat = opt.heatmap !== false;
  const clusteredCorners = [],
    collinearNodes = [],
    wobblyLines = [],
    facetedCurves = [],
    denseArcNodes = [],
    allPts = [];
  doc.objects.forEach(o => {
    if (o.hidden || o.locked || o.img || o.isFrameBg || o.isAutoFrame) return;
    o.subs.forEach(sp => {
      const ns = sp.nodes;
      if (ns.length < 3) return;
      if (wantHeat) ns.forEach(n => allPts.push({
        x: n.x,
        y: n.y
      }));
      const base = {
        objId: o.id,
        objName: o.name,
        subId: sp.id
      };
      findCornerClusters(ns, sp.closed, eps).forEach(c => clusteredCorners.push({
        ...c,
        ...base,
        id: 'cc:' + sp.id + ':' + c.nodeIds[0],
        type: 'corner_cluster',
        message: `Sudut menumpuk (${c.nodeIndices.length} node)`
      }));
      findCollinearNodes(ns, sp.closed, colTol).forEach(c => collinearNodes.push({
        ...c,
        ...base,
        id: 'cl:' + c.nodeId,
        nodeIds: [c.nodeId],
        centroid: c.pt,
        type: 'collinear',
        message: 'Node redundan pada garis lurus'
      }));
      findWobblySpans(ns, sp.closed).forEach(w => wobblyLines.push({
        ...w,
        ...base,
        id: 'wb:' + sp.id + ':' + w.nodeIds[0],
        type: 'wobbly',
        message: 'Garis meleyot / bergelombang'
      }));
      const fc = findFacetedCurves(ns, sp.closed);
      fc.forEach(f => facetedCurves.push({
        ...f,
        ...base,
        id: 'fc:' + sp.id + ':' + f.nodeIds[0],
        type: 'faceted',
        message: `Lengkungan faset (${f.nodeIndices.length - 1} segmen)`
      }));
      const fIds = new Set();
      fc.forEach(f => f.nodeIds.forEach(id => fIds.add(id)));
      findDenseArcNodes(ns, sp.closed).forEach(d => {
        if (d.nodeIds.some(id => fIds.has(id))) return; /* sudah tercakup kategori faset */
        denseArcNodes.push({
          ...d,
          ...base,
          id: 'da:' + sp.id + ':' + d.nodeIds[0],
          type: 'dense_arc',
          message: 'Node berlebih pada lengkungan'
        });
      });
    });
  });

  /* heat-map kepadatan node (grid hash, O(N)) */
  const heatmap = [];
  if (wantHeat && allPts.length) {
    const R = Math.max(12, eps * 3.5),
      cell = R,
      grid = new Map();
    allPts.forEach(p => {
      const k = Math.floor(p.x / cell) + ',' + Math.floor(p.y / cell);
      let a = grid.get(k);
      if (!a) grid.set(k, a = []);
      a.push(p);
    });
    const step = Math.max(1, Math.ceil(allPts.length / 200));
    for (let i = 0; i < allPts.length; i += step) {
      const p = allPts[i],
        gx = Math.floor(p.x / cell),
        gy = Math.floor(p.y / cell);
      let count = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const a = grid.get(gx + dx + ',' + (gy + dy));
        if (a) for (const q of a) if (Math.hypot(p.x - q.x, p.y - q.y) <= R) count++;
      }
      if (count >= 3) {
        const intensity = Math.min(1, count / 10);
        heatmap.push({
          x: p.x,
          y: p.y,
          r: R * 0.9,
          level: count >= 7 ? 'hi' : count >= 4 ? 'mid' : 'lo',
          opacity: 0.25 + intensity * 0.5,
          count
        });
      }
    }
  }
  const summary = {
    total: clusteredCorners.length + collinearNodes.length + wobblyLines.length + facetedCurves.length + denseArcNodes.length,
    cornerClusterCount: clusteredCorners.length,
    collinearCount: collinearNodes.length,
    wobblyCount: wobblyLines.length,
    facetedCount: facetedCurves.length,
    denseArcCount: denseArcNodes.length
  };
  return {
    summary,
    clusteredCorners,
    collinearNodes,
    wobblyLines,
    facetedCurves,
    denseArcNodes,
    heatmap
  };
}

/* 9. Auto-Simplify — semua operasi berbasis ID node (bukan indeks) agar aman terhadap perubahan urutan */
/* Ray-Intersection Corner Collapse: ganti tiap cluster dengan satu node sudut di P*; handle masuk/keluar kurva tetangga dipertahankan */
/* 9. Auto-Simplify — semua operasi berbasis ID node (bukan indeks) agar aman terhadap perubahan urutan */
/* Ray-Intersection Corner Collapse: ganti tiap cluster dengan satu node sudut di P*; handle masuk/keluar kurva tetangga dipertahankan */
function collapseClusters(nodes, clusters) {
  const idx = idIndex(nodes),
    byFirst = new Map(),
    drop = new Set();
  for (const c of clusters) {
    const ids = c.nodeIds.filter(id => idx.has(id));
    if (ids.length < 2) continue;
    const A = nodes[idx.get(ids[0])],
      B = nodes[idx.get(ids[ids.length - 1])];
    byFirst.set(ids[0], {
      id: uid(),
      x: c.intersection.x,
      y: c.intersection.y,
      type: 'corner',
      handleIn: hasH(A, A.handleIn) ? {
        ...A.handleIn
      } : null,
      handleOut: hasH(B, B.handleOut) ? {
        ...B.handleOut
      } : null
    });
    ids.forEach(id => drop.add(id));
  }
  if (!drop.size) return null;
  const out = [];
  nodes.forEach(nd => {
    if (byFirst.has(nd.id)) out.push(byFirst.get(nd.id));else if (!drop.has(nd.id)) out.push(nd);
  });
  return out;
}
/* Schneider re-fit satu rantai (daftar id berurutan) -> array node baru, atau null bila tidak ada penghematan */
/* Schneider re-fit satu rantai (daftar id berurutan) -> array node baru, atau null bila tidak ada penghematan */
function refitChain(nodes, closed, ids, tol) {
  const n = nodes.length,
    m = ids.length;
  if (m < 4 || m > n) return null;
  const i0 = nodes.findIndex(x => x.id === ids[0]);
  if (i0 < 0) return null;
  for (let k = 0; k < m; k++) if (nodes[(i0 + k) % n].id !== ids[k]) return null;
  const wrap = i0 + m > n;
  if (wrap && !closed) return null;
  let arr = nodes.map(cl);
  if (wrap) arr = arr.slice(i0).concat(arr.slice(0, i0));
  const s = wrap ? 0 : i0,
    e = s + m - 1,
    A = arr[s],
    B = arr[e],
    idxs = [];
  for (let k = s; k <= e; k++) idxs.push(k);
  if (!chainStraight(arr, idxs)) return null;
  const pts = arr.slice(s, e + 1).map(q => ({
    x: q.x,
    y: q.y
  }));
  const fitted = schneiderFit(pts, nrm(sub(arr[s + 1], A)), nrm(sub(arr[e - 1], B)), tol);
  if (!fitted.length || fitted.length >= m - 1) return null;
  A.handleOut = {
    x: rd(fitted[0][1][0]),
    y: rd(fitted[0][1][1])
  };
  B.handleIn = {
    x: rd(fitted[fitted.length - 1][2][0]),
    y: rd(fitted[fitted.length - 1][2][1])
  };
  const mids = [];
  for (let k = 0; k < fitted.length - 1; k++) {
    const c = fitted[k],
      d = fitted[k + 1];
    mids.push({
      id: uid(),
      x: rd(c[3][0]),
      y: rd(c[3][1]),
      type: 'smooth',
      handleIn: {
        x: rd(c[2][0]),
        y: rd(c[2][1])
      },
      handleOut: {
        x: rd(d[1][0]),
        y: rd(d[1][1])
      }
    });
  }
  arr.splice(s + 1, m - 2, ...mids);
  return arr;
}
/* =========================================================================
   PORT IDENTIK DARI VECTORCRAFT (crates/pathops/src/fit.rs & edit.rs & boolean.rs)
   DENGAN SHAPE-PRESERVING GUARD & STACKED-CORNER CONSOLIDATION:
   Object › Path › Simplify (`simplify_with`, `simplify_subpath`, `simplify_run`,
   `simplify_part`, `simplify_runs`, `fit_cubics`, `rdp`, `smooth_points`,
   `simplify_level_tolerance`, `auto_simplify_level`)
   ========================================================================= */

export { kasaFit, schneiderFit, HTOL, hasH, segStraight, chainStraight, makeClaim, idIndex, findCornerClusters, findCollinearNodes, findWobblySpans, findFacetedCurves, findDenseArcNodes, EMPTY_INSPECTION, detectAnomalies, collapseClusters, refitChain };
