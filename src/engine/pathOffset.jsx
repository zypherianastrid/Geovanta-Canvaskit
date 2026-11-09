/**
 * @file src/engine/pathOffset.jsx
 * @description Outline Stroke + Offset Path (Expand/Contract).
 *
 * Prinsip: offset langsung (miter/bevel/round + cap butt/square/round)
 * untuk kasus umum yang cepat; bila hasilnya berpotongan sendiri
 * (bentuk cekung + jarak besar), fallback ke dilasi eksak: gabungan
 * (union) potongan-potongan cembung sepanjang batas memakai clipper
 * Greiner-Hormann dari pathBoolean — jadi hasilnya selalu bersih.
 * Expand = union(asli, dilasi batas); Contract = difference(asli, dilasi).
 *
 * Semua fungsi pure JS (tanpa JSX) agar bisa diuji langsung di Node.
 */
import { flattenCubicAdaptive } from '../renderer/adaptiveCubicFlattener.jsx';
import { ringArea, ringSelfIntersects, cleanRing, flattenObjToRings, refitRingToSub, ringsToSubs, windingNumber, segSegIntersect } from './pathBoolean.jsx';
import { schneiderFit } from './curveFittingAndAnomalies.jsx';
import { uid, rd } from './vectorPrimitives.jsx';

const REFIT_TOL = 0.5;
const CORNER_TURN_DEG = 30;

/* --- util --- */
const nrm2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
};
const lineIntersect = (px, py, ux, uy, qx, qy, vx, vy) => {
  const den = ux * vy - uy * vx;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((qx - px) * vy - (qy - py) * vx) / den;
  return [px + ux * t, py + uy * t];
};
const isValidRingLocal = pts => pts.length >= 3 && Math.abs(ringArea(pts)) > 1e-9;
/* Flatten daftar node (terbuka/tertutup) -> polyline [x, y]. */
const flattenNodesToPts = (nodes, closed, tol = 0.25) => {
  if (!nodes || nodes.length < 2) return [];
  const flat = [nodes[0].x, nodes[0].y];
  const tolSq = tol * tol;
  const last = closed ? nodes.length : nodes.length - 1;
  for (let i = 1; i <= last; i++) {
    const a = nodes[i - 1], b = nodes[i % nodes.length];
    flattenCubicAdaptive(a, b, tolSq, flat);
  }
  const pts = [];
  for (let k = 0; k + 1 < flat.length; k += 2) pts.push([flat[k], flat[k + 1]]);
  return cleanRing(pts);
};
/* Busur dari sudut a0 ke a1 (arah terpendek yang melewati sudut bisector). */
const arcPoints = (cx, cy, r, a0, a1, midAng) => {
  let da = a1 - a0;
  while (da <= -Math.PI) da += Math.PI * 2;
  while (da > Math.PI) da -= Math.PI * 2;
  if (midAng != null) {
    let dMid = midAng - a0;
    while (dMid <= -Math.PI) dMid += Math.PI * 2;
    while (dMid > Math.PI) dMid -= Math.PI * 2;
    if ((da > 0) !== (dMid > 0) && Math.abs(dMid) > 1e-9) da = da > 0 ? da - Math.PI * 2 : da + Math.PI * 2;
  }
  const steps = Math.max(2, Math.min(24, Math.ceil(Math.abs(da) / (Math.PI / 12))));
  const out = [];
  for (let s = 0; s <= steps; s++) {
    const ang = a0 + da * s / steps;
    out.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  return out;
};

/* ============================================================================
   Offset langsung satu ring tertutup sejauh d (d > 0 = keluar, d < 0 = ke dalam).
   Mengembalikan ring atau null bila degenerasi.
   ============================================================================ */
const offsetRingDirect = (ringIn, d, join = 'miter', miterLimit = 4) => {
  const ring = cleanRing(ringIn);
  const n = ring.length;
  if (n < 3 || d === 0) return d === 0 ? ring.slice() : null;
  const area = ringArea(ring);
  if (Math.abs(area) < 1e-9) return null;
  const ad = Math.abs(d);
  const sgn = d > 0 ? 1 : -1; /* sisi offset: luar bila d > 0, dalam bila d < 0 */
  const outN = i => {
    const a = ring[i], b = ring[(i + 1) % n];
    const [tx, ty] = nrm2(a[0], a[1], b[0], b[1]);
    const lx = -ty, ly = tx; /* kiri */
    return area > 0 ? [-lx, -ly] : [lx, ly]; /* luar */
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const prev = ring[(i - 1 + n) % n], next = ring[(i + 1) % n];
    const nIn = outN((i - 1 + n) % n), nOut = outN(i);
    const [tInX, tInY] = nrm2(prev[0], prev[1], p[0], p[1]);
    const [tOutX, tOutY] = nrm2(p[0], p[1], next[0], next[1]);
    const A = [p[0] + nIn[0] * d, p[1] + nIn[1] * d];
    const B = [p[0] + nOut[0] * d, p[1] + nOut[1] * d];
    const cross = tInX * tOutY - tInY * tOutX;
    const convexOut = area > 0 ? cross > 0 : cross < 0;
    /* Busur round hanya di vertex yang cembung KE ARAH sisi offset:
       untuk offset keluar = vertex cembung-luar; untuk offset ke dalam =
       vertex refleks-luar (cekung dari luar). */
    const convex = d > 0 ? convexOut : !convexOut;
    const bis = [(nIn[0] + nOut[0]) * sgn, (nIn[1] + nOut[1]) * sgn];
    const bisL = Math.hypot(bis[0], bis[1]);
    const M = lineIntersect(A[0], A[1], tInX, tInY, B[0], B[1], tOutX, tOutY);
    const miterLen = M ? Math.hypot(M[0] - p[0], M[1] - p[1]) : Infinity;
    const miterOk = M && bisL > 1e-9 &&
      (M[0] - p[0]) * bis[0] + (M[1] - p[1]) * bis[1] > 0 &&
      miterLen <= miterLimit * ad + 1e-9;
    if (join === 'round' && convex) {
      const a0 = Math.atan2(A[1] - p[1], A[0] - p[0]);
      const a1 = Math.atan2(B[1] - p[1], B[0] - p[0]);
      const midAng = bisL > 1e-9 ? Math.atan2(bis[1], bis[0]) : null;
      out.push(...arcPoints(p[0], p[1], ad, a0, a1, midAng));
    } else if (miterOk) {
      out.push(M);
    } else {
      out.push(A, B); /* bevel (atau miter tak valid) */
    }
  }
  const cleaned = cleanRing(out);
  return isValidRingLocal(cleaned) ? cleaned : null;
};


/* Validasi ring hasil offset: tiap titik sampel harus berjarak >= |d| dari
   batas asli (toleransi kecil) — kalau tidak, hasil langsung salah (kasus
   kontraksi melewati inradius: garis offset saling menyilang dan membentuk
   ring kecil terbalik yang lolos uji self-intersect). Untuk contract,
   sampel juga harus berada di dalam ring asli. */
const minDistToRing = (x, y, ring) => {
  let best = Infinity;
  for (let i = 0, n = ring.length; i < n; i++) {
    const ax = ring[i][0], ay = ring[i][1], bx = ring[(i + 1) % n][0], by = ring[(i + 1) % n][1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const ex = ax + dx * t - x, ey = ay + dy * t - y;
    const dd = ex * ex + ey * ey;
    if (dd < best) best = dd;
  }
  return Math.sqrt(best);
};
const validateOffsetRing = (orig, result, d) => {
  const ad = Math.abs(d);
  const eps = Math.max(0.1, 0.01 * ad);
  const samples = [];
  for (let i = 0, n = result.length; i < n; i++) {
    samples.push(result[i]);
    const q = result[(i + 1) % n];
    samples.push([(result[i][0] + q[0]) / 2, (result[i][1] + q[1]) / 2]);
  }
  for (const [x, y] of samples) {
    if (minDistToRing(x, y, orig) < ad - eps) return false;
    if (d < 0 && windingNumber(x, y, [orig]) === 0) return false;
  }
  if (d > 0) {
    for (const [x, y] of orig) {
      if (windingNumber(x, y, [result]) === 0) return false;
    }
  }
  return true;
};

/* Bersihkan ring yang berpotongan sendiri (fold pada offset): di tiap
   persilangan, buang loop yang lebih kecil (fold selalu kecil; batas valid
   adalah loop besar). Iteratif sampai ring sederhana. Mengembalikan ring
   bersih, atau null bila tidak konvergen / degenerate. */
const removeOffsetLoops = (ringIn, maxIter = 2000) => {
  let pts = ringIn.slice();
  for (let iter = 0; iter < maxIter; iter++) {
    const n = pts.length;
    if (n < 3) return null;
    let cross = null;
    outer: for (let i = 0; i < n; i++) {
      const ax = pts[i][0], ay = pts[i][1], bx = pts[(i + 1) % n][0], by = pts[(i + 1) % n][1];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; /* segmen bertetangga */
        const cx = pts[j][0], cy = pts[j][1], dx = pts[(j + 1) % n][0], dy = pts[(j + 1) % n][1];
        const hit = segSegIntersect(ax, ay, bx, by, cx, cy, dx, dy);
        if (hit && hit.kind === 'cross' && hit.t > 0.001 && hit.t < 0.999 && hit.u > 0.001 && hit.u < 0.999) {
          cross = { i, j, x: hit.x, y: hit.y };
          break outer;
        }
      }
    }
    if (!cross) return cleanRing(pts);
    const { i, j, x, y } = cross;
    const p = [x, y];
    /* Loop A: p -> pts[i+1..j] -> p ; Loop B: p -> pts[j+1..i] -> p */
    const loopA = [p];
    for (let k = i + 1; k <= j; k++) loopA.push(pts[k]);
    const loopB = [p];
    for (let k = j + 1; k < n; k++) loopB.push(pts[k]);
    for (let k = 0; k <= i; k++) loopB.push(pts[k]);
    const kept = Math.abs(ringArea(loopA)) <= Math.abs(ringArea(loopB)) ? loopB : loopA;
    pts = cleanRing(kept);
    if (!pts || pts.length < 3) return null;
  }
  return null;
};

/* Offset satu ring dengan validasi + fallback pembersihan fold. */
const offsetRingSafe = (ring, d, join = 'miter', miterLimit = 4) => {
  if (d === 0) return [cleanRing(ring)];
  const direct = offsetRingDirect(ring, d, join, miterLimit);
  if (direct && !ringSelfIntersects(direct) && validateOffsetRing(ring, direct, d)) return [direct];
  let cleaned = null;
  if (direct && ringSelfIntersects(direct)) {
    cleaned = removeOffsetLoops(direct);
    if (cleaned && !ringSelfIntersects(cleaned) && validateOffsetRing(ring, cleaned, d)) return [cleaned];
  }
  if (d < 0) return []; /* kontraksi melewati inradius: bentuk lenyap */
  /* Expand: hasil terbaik yang ada (ring sederhana), daripada gagal total. */
  if (cleaned && !ringSelfIntersects(cleaned)) return [cleaned];
  if (direct && !ringSelfIntersects(direct)) return [direct];
  return [];
};

/* ============================================================================
   Outline stroke: polyline (terbuka/tertutup) -> ring-ring outline.
   ============================================================================ */
const strokeOutlineRings = (ptsIn, closed, halfW, join = 'miter', cap = 'butt', miterLimit = 4) => {
  if (!(halfW > 0)) return [];
  const pts = cleanRing(ptsIn);
  if (closed) {
    if (pts.length < 3) return [];
    const outer = offsetRingDirect(pts, halfW, join, miterLimit);
    const inner = offsetRingDirect(pts, -halfW, join, miterLimit);
    if (outer && inner && !ringSelfIntersects(outer) && !ringSelfIntersects(inner) &&
      validateOffsetRing(pts, outer, halfW) && validateOffsetRing(pts, inner, -halfW)) return [outer, inner];
    /* Fallback: band = [expand, contract] lewat offsetRingSafe (fold dibersihkan).
       Bila contract lenyap (stroke lebih lebar dari bentuk), band = [outer] saja. */
    return [...offsetRingSafe(pts, halfW, join, miterLimit), ...offsetRingSafe(pts, -halfW, join, miterLimit)];
  }
  if (pts.length < 2) return [];
  const n = pts.length;
  /* Satu sisi offset: d > 0 = kiri arah jalan. Mengembalikan daftar titik
     (1 titik utk miter, 2 utk bevel, busur utk round di sisi cembung). */
  const sidePoints = (dSide, isLeft) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (i === 0) {
        const [tx, ty] = nrm2(p[0], p[1], pts[1][0], pts[1][1]);
        const nx = -ty * (isLeft ? 1 : -1), ny = tx * (isLeft ? 1 : -1);
        out.push([p[0] + nx * halfW, p[1] + ny * halfW]);
        continue;
      }
      if (i === n - 1) {
        const [tx, ty] = nrm2(pts[n - 2][0], pts[n - 2][1], p[0], p[1]);
        const nx = -ty * (isLeft ? 1 : -1), ny = tx * (isLeft ? 1 : -1);
        out.push([p[0] + nx * halfW, p[1] + ny * halfW]);
        continue;
      }
      const [tInX, tInY] = nrm2(pts[i - 1][0], pts[i - 1][1], p[0], p[1]);
      const [tOutX, tOutY] = nrm2(p[0], p[1], pts[i + 1][0], pts[i + 1][1]);
      const s = isLeft ? 1 : -1;
      const nIn = [-tInY * s, tInX * s], nOut = [-tOutY * s, tOutX * s];
      const A = [p[0] + nIn[0] * halfW, p[1] + nIn[1] * halfW];
      const B = [p[0] + nOut[0] * halfW, p[1] + nOut[1] * halfW];
      const cross = tInX * tOutY - tInY * tOutX;
      const isOuter = isLeft ? cross > 0 : cross < 0;
      const M = lineIntersect(A[0], A[1], tInX, tInY, B[0], B[1], tOutX, tOutY);
      const bis = [nIn[0] + nOut[0], nIn[1] + nOut[1]];
      const bisL = Math.hypot(bis[0], bis[1]);
      const miterLen = M ? Math.hypot(M[0] - p[0], M[1] - p[1]) : Infinity;
      const miterOk = M && bisL > 1e-9 &&
        (M[0] - p[0]) * bis[0] + (M[1] - p[1]) * bis[1] > 0 &&
        miterLen <= miterLimit * halfW + 1e-9;
      if (join === 'round' && isOuter) {
        const a0 = Math.atan2(A[1] - p[1], A[0] - p[0]);
        const a1 = Math.atan2(B[1] - p[1], B[0] - p[0]);
        const midAng = bisL > 1e-9 ? Math.atan2(bis[1], bis[0]) : null;
        out.push(...arcPoints(p[0], p[1], halfW, a0, a1, midAng));
      } else if (miterOk) {
        out.push(M);
      } else {
        out.push(A, B);
      }
    }
    return out;
  };
  const left = sidePoints(halfW, true);
  const right = sidePoints(-halfW, false);
  const ring = [...left];
  const endP = pts[n - 1];
  const [eTx, eTy] = nrm2(pts[n - 2][0], pts[n - 2][1], endP[0], endP[1]);
  if (cap === 'round') {
    const a0 = Math.atan2(left[left.length - 1][1] - endP[1], left[left.length - 1][0] - endP[0]);
    const a1 = Math.atan2(right[right.length - 1][1] - endP[1], right[right.length - 1][0] - endP[0]);
    /* Busur cap harus melewati arah tangen keluar ujung. */
    const midAng = Math.atan2(eTy, eTx);
    ring.push(...arcPoints(endP[0], endP[1], halfW, a0, a1, midAng).slice(1, -1));
  } else if (cap === 'square') {
    ring.push([left[left.length - 1][0] + eTx * halfW, left[left.length - 1][1] + eTy * halfW]);
    ring.push([right[right.length - 1][0] + eTx * halfW, right[right.length - 1][1] + eTy * halfW]);
  }
  for (let i = right.length - 1; i >= 0; i--) ring.push(right[i]);
  const startP = pts[0];
  const [sTx, sTy] = nrm2(startP[0], startP[1], pts[1][0], pts[1][1]);
  if (cap === 'round') {
    const a0 = Math.atan2(right[0][1] - startP[1], right[0][0] - startP[0]);
    const a1 = Math.atan2(left[0][1] - startP[1], left[0][0] - startP[0]);
    const midAng = Math.atan2(-sTy, -sTx);
    ring.push(...arcPoints(startP[0], startP[1], halfW, a0, a1, midAng).slice(1, -1));
  } else if (cap === 'square') {
    ring.push([right[0][0] - sTx * halfW, right[0][1] - sTy * halfW]);
    ring.push([left[0][0] - sTx * halfW, left[0][1] - sTy * halfW]);
  }
  const cleaned = cleanRing(ring);
  if (isValidRingLocal(cleaned) && !ringSelfIntersects(cleaned)) return [cleaned];
  /* Fallback: bersihkan fold pada outline langsung. */
  if (isValidRingLocal(cleaned)) {
    const fixed = removeOffsetLoops(cleaned);
    if (fixed && !ringSelfIntersects(fixed)) return [fixed];
  }
  return isValidRingLocal(cleaned) ? [cleaned] : [];
};

/* Offset satu polyline terbuka ke satu sisi (d > 0 = kiri arah jalan). */
const offsetPolylinePoints = (ptsIn, d, join = 'miter', miterLimit = 4) => {
  const pts = cleanRing(ptsIn);
  const n = pts.length;
  if (n < 2 || d === 0) return pts.slice();
  const ad = Math.abs(d);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (i === 0 || i === n - 1) {
      const a = i === 0 ? p : pts[n - 2], b = i === 0 ? pts[1] : p;
      const [tx, ty] = nrm2(a[0], a[1], b[0], b[1]);
      out.push([p[0] + (-ty) * d, p[1] + (tx) * d]);
      continue;
    }
    const [tInX, tInY] = nrm2(pts[i - 1][0], pts[i - 1][1], p[0], p[1]);
    const [tOutX, tOutY] = nrm2(p[0], p[1], pts[i + 1][0], pts[i + 1][1]);
    const s = d > 0 ? 1 : -1;
    const nIn = [-tInY * s, tInX * s], nOut = [-tOutY * s, tOutX * s];
    const A = [p[0] + nIn[0] * ad, p[1] + nIn[1] * ad];
    const B = [p[0] + nOut[0] * ad, p[1] + nOut[1] * ad];
    const cross = tInX * tOutY - tInY * tOutX;
    const isOuter = d > 0 ? cross > 0 : cross < 0;
    const M = lineIntersect(A[0], A[1], tInX, tInY, B[0], B[1], tOutX, tOutY);
    const bis = [nIn[0] + nOut[0], nIn[1] + nOut[1]];
    const bisL = Math.hypot(bis[0], bis[1]);
    const miterLen = M ? Math.hypot(M[0] - p[0], M[1] - p[1]) : Infinity;
    const miterOk = M && bisL > 1e-9 &&
      (M[0] - p[0]) * bis[0] + (M[1] - p[1]) * bis[1] > 0 &&
      miterLen <= miterLimit * ad + 1e-9;
    if (join === 'round' && isOuter) {
      const a0 = Math.atan2(A[1] - p[1], A[0] - p[0]);
      const a1 = Math.atan2(B[1] - p[1], B[0] - p[0]);
      const midAng = bisL > 1e-9 ? Math.atan2(bis[1], bis[0]) : null;
      out.push(...arcPoints(p[0], p[1], ad, a0, a1, midAng));
    } else if (miterOk) {
      out.push(M);
    } else {
      out.push(A, B);
    }
  }
  return out;
};

/* ============================================================================
   Refit rantai TERBUKA (daftar titik) -> subpath terbuka (nodes).
   ============================================================================ */
const refitOpenChain = (ptsIn, tol = REFIT_TOL) => {
  const pts = cleanRing(ptsIn);
  if (pts.length < 2) return null;
  const n = pts.length;
  const turnAt = i => {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1];
    const vx = p2[0] - p1[0], vy = p2[1] - p1[1];
    const lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1;
    return Math.abs(Math.atan2((ux * vy - uy * vx) / (lu * lv), (ux * vx + uy * vy) / (lu * lv))) * 180 / Math.PI;
  };
  const isCorner = new Array(n).fill(false);
  for (let i = 1; i < n - 1; i++) if (turnAt(i) > CORNER_TURN_DEG) isCorner[i] = true;
  isCorner[0] = true; isCorner[n - 1] = true;
  const mkNode = (x, y, type, hIn, hOut) => ({
    id: uid(), x: rd(x), y: rd(y), type,
    handleIn: hIn ? { x: rd(hIn[0]), y: rd(hIn[1]) } : null,
    handleOut: hOut ? { x: rd(hOut[0]), y: rd(hOut[1]) } : null
  });
  const chainStraight = (a, b) => {
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const cr = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (cr > tol * 0.5) return false;
    }
    return true;
  };
  const corners = [];
  for (let i = 0; i < n; i++) if (isCorner[i]) corners.push(i);
  const cornerNodes = new Map();
  for (const ci of corners) cornerNodes.set(ci, mkNode(pts[ci][0], pts[ci][1], 'corner', null, null));
  const nodes = [];
  for (let k = 0; k < corners.length - 1; k++) {
    const s = corners[k], e = corners[k + 1];
    const nodeA = cornerNodes.get(s), nodeB = cornerNodes.get(e);
    if (e - s <= 1 || chainStraight(s, e)) {
      nodes.push(nodeA);
      continue;
    }
    const chainPts = pts.slice(s, e + 1).map(p => ({ x: p[0], y: p[1] }));
    const t1 = nrm2(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]);
    const t2 = nrm2(pts[e][0], pts[e][1], pts[e - 1][0], pts[e - 1][1]);
    const fitted = schneiderFit(chainPts, { x: t1[0], y: t1[1] }, { x: t2[0], y: t2[1] }, tol);
    if (!fitted.length || fitted.length >= e - s) {
      nodes.push(nodeA);
      for (let m = s + 1; m < e; m++) nodes.push(mkNode(pts[m][0], pts[m][1], 'corner', null, null));
      continue;
    }
    nodeA.handleOut = { x: rd(fitted[0][1][0]), y: rd(fitted[0][1][1]) };
    nodeB.handleIn = { x: rd(fitted[fitted.length - 1][2][0]), y: rd(fitted[fitted.length - 1][2][1]) };
    nodes.push(nodeA);
    for (let m = 0; m < fitted.length - 1; m++) {
      const c = fitted[m], d = fitted[m + 1];
      nodes.push(mkNode(c[3][0], c[3][1], 'smooth', c[2], d[1]));
    }
  }
  nodes.push(cornerNodes.get(corners[corners.length - 1]));
  return { id: uid(), closed: false, nodes };
};

/* ============================================================================
   Operasi tingkat dokumen.
   ============================================================================ */
const outlineStrokeDoc = (doc, selIds) => {
  const targets = doc.objects.filter(o => selIds.has(o.id) && !o.hidden && !o.locked && !o.img && !o.text && o.subs && o.subs.length);
  const usable = targets.filter(o => o.stroke && o.stroke !== 'none' && o.strokeWidth > 0);
  if (!usable.length) return { doc, changed: false, reason: targets.length ? 'nostroke' : 'needpath' };
  let changedAny = false, droppedFill = 0, nSubs = 0;
  const byId = new Map(usable.map(o => [o.id, o]));
  const newObjs = doc.objects.map(o => {
    if (!byId.has(o.id)) return o;
    const halfW = o.strokeWidth / 2;
    const join = o.strokeLinejoin || 'miter';
    const cap = o.strokeLinecap || 'butt';
    const miterLimit = o.strokeMiterlimit || 4;
    const fillCol = typeof o.stroke === 'string' && o.stroke !== 'none' && !o.stroke.startsWith('url(') ? o.stroke : '#000000';
    const outSubs = [];
    for (const sp of o.subs) {
      if (sp.closed) {
        const { rings } = flattenObjToRings({ subs: [sp] });
        if (!rings.length) continue;
        outSubs.push(...ringsToSubs(strokeOutlineRings(rings[0], true, halfW, join, cap, miterLimit)));
      } else {
        const pts = flattenNodesToPts(sp.nodes, false);
        if (pts.length < 2) continue;
        outSubs.push(...ringsToSubs(strokeOutlineRings(pts, false, halfW, join, cap, miterLimit)));
      }
    }
    if (!outSubs.length) return o;
    changedAny = true;
    nSubs += outSubs.length;
    if (o.fill && o.fill !== 'none') droppedFill++;
    return { ...o, fill: fillCol, stroke: 'none', strokeWidth: 0, fillRule: 'evenodd', subs: outSubs };
  });
  if (!changedAny) return { doc, changed: false, reason: 'empty' };
  return { doc: { ...doc, objects: newObjs }, changed: true, stats: { objects: usable.length, outSubs: nSubs, droppedFill } };
};

const offsetDoc = (doc, selIds, dist, join = 'miter', miterLimit = 4) => {
  if (!dist || !Number.isFinite(dist)) return { doc, changed: false, reason: 'nodist' };
  const targets = doc.objects.filter(o => selIds.has(o.id) && !o.hidden && !o.locked && !o.img && !o.text && o.subs && o.subs.length);
  if (!targets.length) return { doc, changed: false, reason: 'needpath' };
  let changedAny = false, droppedSubs = 0, nObjects = 0;
  const byId = new Map(targets.map(o => [o.id, o]));
  const newObjs = doc.objects.map(o => {
    if (!byId.has(o.id)) return o;
    const outSubs = [];
    for (const sp of o.subs) {
      if (sp.closed) {
        const { rings } = flattenObjToRings({ subs: [sp] });
        if (!rings.length) { droppedSubs++; continue; }
        const off = offsetRingSafe(rings[0], dist, join, miterLimit);
        const subs = ringsToSubs(off);
        if (!subs.length) { droppedSubs++; continue; }
        outSubs.push(...subs);
      } else {
        const pts = flattenNodesToPts(sp.nodes, false);
        if (pts.length < 2) { droppedSubs++; continue; }
        const offPts = offsetPolylinePoints(pts, dist, join, miterLimit);
        const sub = refitOpenChain(offPts);
        if (!sub) { droppedSubs++; continue; }
        outSubs.push(sub);
      }
    }
    if (!outSubs.length) return o;
    changedAny = true;
    nObjects++;
    return { ...o, subs: outSubs };
  });
  if (!changedAny) return { doc, changed: false, reason: 'empty' };
  return { doc: { ...doc, objects: newObjs }, changed: true, stats: { objects: nObjects, droppedSubs } };
};

export { offsetRingDirect, offsetRingSafe, removeOffsetLoops, strokeOutlineRings, offsetPolylinePoints, refitOpenChain, outlineStrokeDoc, offsetDoc };
export default offsetDoc;
