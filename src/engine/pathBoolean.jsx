/**
 * @file src/engine/pathBoolean.jsx
 * @description Boolean / Pathfinder (Union, Subtract, Intersect, Exclude) +
 * flatten objek ke ring poligon + refit ring ke subpath Bézier.
 *
 * Pendekatan (sesuai spek): flatten kurva adaptif -> clipping poligon
 * Greiner-Hormann dengan klasifikasi entry/exit berbasis sampel interior
 * (tahan terhadap sentuhan tangensial & sisi kolinier yang berimpit) ->
 * refit kembali ke Bézier memakai schneiderFit (curveFittingAndAnomalies).
 *
 * Semua fungsi di sini pure JS (tanpa JSX) agar bisa diuji langsung di Node.
 */
import { flattenCubicAdaptive } from '../renderer/adaptiveCubicFlattener.jsx';
import { schneiderFit } from './curveFittingAndAnomalies.jsx';
import { uid, rd } from './vectorPrimitives.jsx';

const EPS = 1e-9;
const FLAT_TOL = 0.25; /* sama dgn RENDER_CONFIG.targetPixelError */
const REFIT_TOL = 0.5;

/* ============================================================================
   Utilitas ring poligon: ring = array [x, y] (tutup implisit, tanpa titik
   akhir yang menduplikasi titik awal).
   ============================================================================ */
const ringArea = pts => {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};
const cleanRing = pts => {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = out[out.length - 1];
    if (!q || (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) > 1e-18) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if ((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) <= 1e-18) out.pop();
  }
  /* Hapus titik tengah yang persis kolinier (mis. sisa "spike" nol-lebar
     dari vertex sisipan di sisi yang berimpit) — tidak mengubah poligon. */
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const p = out[(i - 1 + out.length) % out.length], q = out[i], r = out[(i + 1) % out.length];
      const ux = q[0] - p[0], uy = q[1] - p[1], vx = r[0] - q[0], vy = r[1] - q[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu > 1e-12 && lv > 1e-12) {
        const cross = (ux * vy - uy * vx) / (lu * lv);
        const dot = (ux * vx + uy * vy) / (lu * lv);
        if (Math.abs(cross) < 1e-9 && dot > 0) { out.splice(i, 1); changed = true; break; }
      }
    }
  }
  return out;
};
const isValidRing = pts => pts.length >= 3 && Math.abs(ringArea(pts)) > 1e-9;

/* Winding number titik terhadap sekumpulan ring (nonzero => di dalam). */
const windingNumber = (x, y, rings) => {
  let wn = 0;
  for (let r = 0; r < rings.length; r++) {
    const pts = rings[r];
    for (let i = 0, n = pts.length; i < n; i++) {
      const ax = pts[i][0], ay = pts[i][1];
      const bx = pts[(i + 1) % n][0], by = pts[(i + 1) % n][1];
      if (ay <= y) {
        if (by > y && (bx - ax) * (y - ay) - (by - ay) * (x - ax) > 0) wn++;
      } else if (by <= y && (bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) wn--;
    }
  }
  return wn;
};
const isInsideRings = (x, y, rings) => windingNumber(x, y, rings) !== 0;

/* Normal interior sebuah sisi ring (mengarah ke dalam ring, berdasarkan
   tanda luas). Dipakai untuk sampel klasifikasi yang tahan terhadap sisi
   yang berimpit (overlap kolinier). */
const interiorNormal = (ax, ay, bx, by, area) => {
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L; /* normal kiri */
  /* Luas shoelace positif => interior di kiri arah jalan (sistem koordinat
     apa adanya); negatif => interior di kanan. */
  return area > 0 ? [nx, ny] : [-nx, -ny];
};

/* Uji mandiri: apakah ring berpotongan dengan dirinya sendiri (O(n^2)). */
const ringSelfIntersects = pts => {
  const n = pts.length;
  const segX = (ax, ay, bx, by, cx, cy) => {
    const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return d;
  };
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pts[j], d = pts[(j + 1) % n];
      const d1 = segX(a[0], a[1], b[0], b[1], c[0], c[1]);
      const d2 = segX(a[0], a[1], b[0], b[1], d[0], d[1]);
      const d3 = segX(c[0], c[1], d[0], d[1], a[0], a[1]);
      const d4 = segX(c[0], c[1], d[0], d[1], b[0], b[1]);
      if (d1 * d2 < -1e-18 && d3 * d4 < -1e-18) return true;
    }
  }
  return false;
};

/* ============================================================================
   Flatten objek -> ring poligon (hanya subpath TERTUTUP; subpath terbuka
   dilewati dan dihitung untuk pesan).
   ============================================================================ */
const flattenObjToRings = (o, tol = FLAT_TOL) => {
  const rings = [];
  let skippedOpen = 0, skippedTiny = 0;
  const tolSq = tol * tol;
  for (const sp of o.subs || []) {
    if (!sp.closed) { skippedOpen++; continue; }
    const ns = sp.nodes || [];
    if (ns.length < 3) { skippedTiny++; continue; }
    const flat = [ns[0].x, ns[0].y];
    for (let i = 1; i <= ns.length; i++) {
      const a = ns[i - 1], b = ns[i % ns.length];
      flattenCubicAdaptive(a, b, tolSq, flat);
    }
    const pts = [];
    for (let k = 0; k + 1 < flat.length; k += 2) pts.push([flat[k], flat[k + 1]]);
    const cleaned = cleanRing(pts);
    if (isValidRing(cleaned)) rings.push(cleaned);
    else skippedTiny++;
  }
  return { rings, skippedOpen, skippedTiny };
};

/* ============================================================================
   Perpotongan segmen-segmen.
   Mengembalikan: null | {kind:'cross', t, u, x, y} |
   {kind:'overlap', t0, t1, u0, u1} (ujung-ujung interval berimpit).
   ============================================================================ */
const segSegIntersect = (ax, ay, bx, by, cx, cy, dx, dy) => {
  const rX = bx - ax, rY = by - ay;
  const sX = dx - cx, sY = dy - cy;
  const den = rX * sY - rY * sX;
  const qpx = cx - ax, qpy = cy - ay;
  if (Math.abs(den) < 1e-14) {
    /* Sejajar: cek kolinier + overlap */
    if (Math.abs(qpx * rY - qpy * rX) > 1e-9 * Math.max(1, Math.hypot(rX, rY))) return null;
    const rLen2 = rX * rX + rY * rY;
    if (rLen2 < 1e-18) return null;
    const t0 = ((cx - ax) * rX + (cy - ay) * rY) / rLen2;
    const t1 = ((dx - ax) * rX + (dy - ay) * rY) / rLen2;
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    if (hi - lo <= 1e-12) {
      if (hi < -EPS || lo > 1 + EPS) return null;
      const t = Math.max(0, Math.min(1, (lo + hi) / 2));
      return { kind: 'touch', t, u: null, x: ax + rX * t, y: ay + rY * t };
    }
    const sLen2 = sX * sX + sY * sY || 1;
    const uOf = t => ((ax + rX * t - cx) * sX + (ay + rY * t - cy) * sY) / sLen2;
    return { kind: 'overlap', t0: lo, t1: hi, u0: uOf(lo), u1: uOf(hi) };
  }
  const t = (qpx * sY - qpy * sX) / den;
  const u = (qpx * rY - qpy * rX) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  const tc = Math.max(0, Math.min(1, t)), uc = Math.max(0, Math.min(1, u));
  return { kind: 'cross', t: tc, u: uc, x: ax + rX * tc, y: ay + rY * tc };
};

/* ============================================================================
   Greiner-Hormann.
   subjectRings / clipRings: array ring (masing-masing bisa banyak ring:
   outer + hole). op: 'union' | 'intersect' | 'difference' | 'xor'.
   Mengembalikan array ring hasil.
   ============================================================================ */
const buildPolyVerts = rings => {
  /* verts: array per ring berisi vertex {x, y, next, prev, isX, other,
     entry, visited, ringArea, ringIdx} dalam linked list sirkular. */
  const allVerts = [];
  const ringList = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const pts = rings[ri];
    const area = ringArea(pts);
    const vs = pts.map(p => ({ x: p[0], y: p[1], next: null, prev: null, isX: false, other: null, entry: null, visited: false, ringArea: area, ringIdx: ri }));
    for (let i = 0; i < vs.length; i++) {
      vs[i].next = vs[(i + 1) % vs.length];
      vs[i].prev = vs[(i + vs.length - 1) % vs.length];
    }
    ringList.push(vs);
    allVerts.push(...vs);
  }
  return { ringList, allVerts };
};

/* Normalisasi orientasi ring berdasarkan kedalaman nesting (even-odd):
   depth genap -> outer (luas > 0), depth ganjil -> hole (luas < 0).
   Perlu karena lubang yang digambar pengguna bisa berorientasi sama
   dengan outer-nya, padahal uji winding nonzero menuntut sebaliknya. */
const ringContainsPt = (px, py, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
};
const normalizeRingOrientations = rings => rings.map((r, i) => {
  let depth = 0;
  for (let j = 0; j < rings.length; j++) {
    if (i !== j && ringContainsPt(r[0][0], r[0][1], rings[j])) depth++;
  }
  const area = ringArea(r);
  const wantPositive = depth % 2 === 0;
  if ((area > 0) !== wantPositive) return r.slice().reverse();
  return r;
});

const clipRings = (subjectRings, clipRingsIn, op) => {
  const subj = normalizeRingOrientations(subjectRings.map(r => cleanRing(r)).filter(isValidRing));
  const clip = normalizeRingOrientations(clipRingsIn.map(r => cleanRing(r)).filter(isValidRing));
  if (!subj.length || !clip.length) {
    /* Tanpa lawan: hasil ditentukan murni oleh containment. */
    if (op === 'union') return [...subj, ...clip];
    if (op === 'intersect') return [];
    if (op === 'difference') return [...subj];
    return [...subj, ...clip]; /* xor */
  }
  if (op === 'xor') {
    const a = clipRings(subj, clip, 'difference');
    const b = clipRings(clip, subj, 'difference');
    return [...a, ...b];
  }
  const S = buildPolyVerts(subj);
  const C = buildPolyVerts(clip);
  /* --- 1. Cari semua perpotongan, kumpulkan record per sisi --- */
  const sRecs = []; /* per ring S: array per edge: [{t, x, y, cRing, cEdge, u}] */
  const cRecs = [];
  const keyPt = (x, y) => Math.round(x * 1e9) + ':' + Math.round(y * 1e9);
  const seenPt = new Set();
  const dedupPt = (x, y) => {
    const k = keyPt(x, y);
    if (seenPt.has(k)) return true;
    seenPt.add(k);
    return false;
  };
  for (let si = 0; si < S.ringList.length; si++) {
    sRecs.push(S.ringList[si].map(() => []));
  }
  for (let ci = 0; ci < C.ringList.length; ci++) {
    cRecs.push(C.ringList[ci].map(() => []));
  }
  for (let si = 0; si < S.ringList.length; si++) {
    const sVs = S.ringList[si];
    for (let i = 0; i < sVs.length; i++) {
      const a = sVs[i], b = sVs[i].next;
      if (Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12) continue;
      const minSx = Math.min(a.x, b.x), maxSx = Math.max(a.x, b.x);
      const minSy = Math.min(a.y, b.y), maxSy = Math.max(a.y, b.y);
      for (let ci = 0; ci < C.ringList.length; ci++) {
        const cVs = C.ringList[ci];
        for (let j = 0; j < cVs.length; j++) {
          const c = cVs[j], d = cVs[j].next;
          if (Math.abs(c.x - d.x) < 1e-12 && Math.abs(c.y - d.y) < 1e-12) continue;
          if (Math.max(c.x, d.x) < minSx - 1e-9 || Math.min(c.x, d.x) > maxSx + 1e-9 ||
            Math.max(c.y, d.y) < minSy - 1e-9 || Math.min(c.y, d.y) > maxSy + 1e-9) continue;
          const hit = segSegIntersect(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
          if (!hit) continue;
          if (hit.kind === 'overlap') {
            /* Sisipkan kedua ujung interval berimpit. */
            for (const [tt, uu] of [[hit.t0, hit.u0], [hit.t1, hit.u1]]) {
              const x = a.x + (b.x - a.x) * tt, y = a.y + (b.y - a.y) * tt;
              if (dedupPt(x, y)) continue;
              sRecs[si][i].push({ t: tt, x, y, cRing: ci, cEdge: j, u: uu });
              cRecs[ci][j].push({ t: uu, x, y, cRing: si, cEdge: i, u: tt });
            }
          } else {
            const { t, u, x, y } = hit;
            if (dedupPt(x, y)) continue;
            sRecs[si][i].push({ t, x, y, cRing: ci, cEdge: j, u });
            cRecs[ci][j].push({ t: u, x, y, cRing: si, cEdge: i, u: t });
          }
        }
      }
    }
  }
  /* --- 2. Sisipkan vertex perpotongan ke kedua poligon + tautkan --- */
  const linkRec = (rec, sV, cV) => {
    sV.isX = true; cV.isX = true;
    sV.other = cV; cV.other = sV;
  };
  const insertRecs = (poly, recs, isSubj) => {
    for (let ri = 0; ri < poly.ringList.length; ri++) {
      const vs = poly.ringList[ri];
      const edgeRecs = recs[ri];
      for (let i = 0; i < vs.length; i++) {
        const list = edgeRecs[i].slice().sort((p, q) => p.t - q.t);
        if (!list.length) continue;
        const start = vs[i], end = vs[i].next;
        let prev = start;
        for (const rec of list) {
          if (rec.t <= 1e-9) { /* menempel di vertex awal */
            rec.v = start;
            continue;
          }
          if (rec.t >= 1 - 1e-9) { /* menempel di vertex akhir */
            rec.v = end;
            continue;
          }
          const nv = { x: rec.x, y: rec.y, next: null, prev: null, isX: false, other: null, entry: null, visited: false, ringArea: start.ringArea, ringIdx: start.ringIdx };
          nv.prev = prev; nv.next = end;
          prev.next = nv; end.prev = nv;
          prev = nv;
          rec.v = nv;
          poly.allVerts.push(nv);
        }
      }
    }
  };
  insertRecs(S, sRecs, true);
  insertRecs(C, cRecs, false);
  /* Tautkan record S <-> C (cocokkan via cRing/cEdge/u). */
  for (let si = 0; si < sRecs.length; si++) {
    for (let i = 0; i < sRecs[si].length; i++) {
      for (const rec of sRecs[si][i]) {
        if (!rec.v) continue;
        const cList = cRecs[rec.cRing][rec.cEdge];
        const match = cList.find(r => Math.abs(r.t - rec.u) < 1e-7 && Math.abs(r.x - rec.x) < 1e-7 && Math.abs(r.y - rec.y) < 1e-7);
        if (match && match.v) linkRec(rec, rec.v, match.v);
        else if (match && !match.v) { /* ujung menempel: v = vertex yang sudah ada */ }
      }
    }
  }
  /* Vertex yang menempel di ujung sisi (t≈0/1) tapi belum tertaut: cari
     padanannya lewat koordinat. */
  const cByPt = new Map();
  for (const v of C.allVerts) if (v.isX || true) cByPt.set(keyPt(v.x, v.y), v);
  for (const v of S.allVerts) {
    if (!v.isX || v.other) continue;
    const m = cByPt.get(keyPt(v.x, v.y));
    if (m) linkRec(null, v, m);
  }
  const sByPt = new Map();
  for (const v of S.allVerts) sByPt.set(keyPt(v.x, v.y), v);
  for (const v of C.allVerts) {
    if (!v.isX || v.other) continue;
    const m = sByPt.get(keyPt(v.x, v.y));
    if (m) linkRec(null, m, v);
  }
  /* --- 3. Klasifikasi entry/exit via sampel interior sisi --- */
  const classify = (poly, otherRings) => {
    for (const v of poly.allVerts) {
      if (!v.isX || !v.other) continue;
      const inN = interiorNormal(v.prev.x, v.prev.y, v.x, v.y, v.ringArea);
      const outN = interiorNormal(v.x, v.y, v.next.x, v.next.y, v.ringArea);
      const e = 1e-7;
      const beforeX = (v.prev.x + v.x) / 2 + inN[0] * e, beforeY = (v.prev.y + v.y) / 2 + inN[1] * e;
      const afterX = (v.x + v.next.x) / 2 + outN[0] * e, afterY = (v.y + v.next.y) / 2 + outN[1] * e;
      const inBefore = isInsideRings(beforeX, beforeY, otherRings);
      const inAfter = isInsideRings(afterX, afterY, otherRings);
      v.entry = !inBefore && inAfter ? true : inBefore && !inAfter ? false : null;
    }
  };
  classify(S, clip);
  classify(C, subj);
  /* --- 4. Penelusuran ring hasil --- */
  const result = [];
  const trace = (startV, startPoly, startDir) => {
    /* startPoly: 'S' | 'C'; startDir: +1 maju, -1 mundur */
    const ring = [];
    let v = startV, poly = startPoly, dir = startDir;
    let guard = 0;
    const startKey = v;
    while (guard++ < 200000) {
      ring.push([v.x, v.y]);
      v.visited = true;
      if (v.other) v.other.visited = true;
      const nxt = dir > 0 ? v.next : v.prev;
      if ((nxt === startKey || (startKey.other && nxt === startKey.other)) && ring.length >= 3) {
        return cleanRing(ring);
      }
      if (nxt.isX && nxt.other) {
        /* Aturan switch (diturunkan dari status dalam/luar, bukan hafalan):
           - union: jalan mengikuti batas yang DI LUAR poligon lain; segmen
             berjalan EXIT -> ENTRY, jadi switch di ENTRY.
           - intersect: jalan mengikuti batas yang DI DALAM poligon lain;
             segmen berjalan ENTRY -> EXIT, jadi switch di EXIT.
           - difference: di S maju switch di ENTRY (-> C mundur); di C
             mundur switch di ENTRY (-> S maju). */
        let sw = false;
        if (op === 'union') {
          if (nxt.entry === true) sw = true;
        } else if (op === 'intersect') {
          if (nxt.entry === false) sw = true;
        } else if (op === 'difference') {
          if (nxt.entry === true) sw = true;
        }
        if (sw) {
          v = nxt.other;
          poly = poly === 'S' ? 'C' : 'S';
          if (op === 'difference') dir = poly === 'S' ? 1 : -1;
          continue;
        }
      }
      v = nxt;
    }
    return null;
  };
  const tryStart = (poly, v) => {
    if (v.visited || !v.isX || !v.other) return;
    /* Titik awal = awal segmen hasil (lihat aturan switch di atas):
       union & difference mulai di EXIT (batas di luar lawan), intersect
       mulai di ENTRY (batas di dalam lawan). */
    if (op === 'union' && v.entry !== false) return;
    if (op === 'intersect' && v.entry !== true) return;
    if (op === 'difference' && v.entry !== false) return;
    const dir = op === 'difference' && poly === 'C' ? -1 : 1;
    const ring = trace(v, poly, dir);
    if (ring && isValidRing(ring)) result.push(ring);
  };
  for (const v of S.allVerts) tryStart('S', v);
  for (const v of C.allVerts) tryStart('C', v);
  /* --- 5. Ring tanpa perpotongan: seleksi via containment --- */
  const insideResult = (sIn, cIn) => op === 'union' ? sIn || cIn : op === 'intersect' ? sIn && cIn : sIn && !cIn;
  const selectRing = (pts, ownRings, otherRings, isSubjRing) => {
    /* Titik tepat di dalam & di luar ring (offset normal interior). */
    const area = ringArea(pts);
    const ax = pts[0][0], ay = pts[0][1], bx = pts[1][0], by = pts[1][1];
    const n = interiorNormal(ax, ay, bx, by, area);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const e = 1e-6;
    const inX = mx + n[0] * e, inY = my + n[1] * e;
    const outX = mx - n[0] * e, outY = my - n[1] * e;
    const sIn = isSubjRing ? isInsideRings(inX, inY, ownRings) : isInsideRings(inX, inY, otherRings);
    const sOut = isSubjRing ? isInsideRings(outX, outY, ownRings) : isInsideRings(outX, outY, otherRings);
    const cIn = isSubjRing ? isInsideRings(inX, inY, otherRings) : isInsideRings(inX, inY, ownRings);
    const cOut = isSubjRing ? isInsideRings(outX, outY, otherRings) : isInsideRings(outX, outY, ownRings);
    const rIn = insideResult(sIn, cIn), rOut = insideResult(sOut, cOut);
    return rIn !== rOut;
  };
  /* Penanda ring yang bersentuhan: ring apa pun yang punya vertex
     perpotongan (asli maupun sisipan) sudah ditangani penelusuran dan
     TIDAK boleh ikut seleksi containment (hindari hitung ganda). */
  const markCrossed = (poly, rings) => {
    const flags = rings.map(() => false);
    for (const v of poly.allVerts) {
      /* Hanya perpotongan yang mengubah status dalam/luar (entry true/false)
         yang ditangani penelusuran; sentuhan tangensial (entry null) tidak
         mengubah status ring, jadi ring tetap ikut seleksi containment. */
      if (!v.isX || !v.other || v.entry == null) continue;
      if (v.ringIdx != null) flags[v.ringIdx] = true;
    }
    return flags;
  };
  const sCrossed = markCrossed(S, subj);
  const cCrossed = markCrossed(C, clip);
  for (let ri = 0; ri < subj.length; ri++) {
    if (sCrossed[ri]) continue;
    if (selectRing(subj[ri], subj, clip, true)) result.push(cleanRing(subj[ri]));
  }
  for (let ri = 0; ri < clip.length; ri++) {
    if (cCrossed[ri]) continue;
    if (selectRing(clip[ri], clip, subj, false)) result.push(cleanRing(clip[ri]));
  }
  /* Bersihkan hasil akhir + gabungkan ring yang berbagi sisi penuh. */
  const seen = new Set();
  const out = [];
  for (const r of result) {
    const c = cleanRing(r);
    if (!isValidRing(c)) continue;
    const k = c.map(p => Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6)).join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return stitchRings(out);
};

/* Gabungkan dua ring yang berbagi satu sisi penuh yang sama persis
   (sisi a->b di ring1, b->a di ring2). Kasus dua bentuk menempel
   tepi-ke-tepi: penelusuran tidak menggabungkannya karena tidak ada
   status dalam/luar yang berubah di vertex sentuh, padahal hasilnya
   semestinya satu ring. Overlap parsial sisi (bukan penuh) tidak
   digabung — hasilnya tetap benar secara luas, hanya 2 subpath. */
const stitchRings = rings => {
  const key = (x, y) => Math.round(x * 1e9) + ':' + Math.round(y * 1e9);
  let list = rings.map(r => r.slice());
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        for (let a = 0; a < A.length; a++) {
          const a0 = A[a], a1 = A[(a + 1) % A.length];
          for (let b = 0; b < B.length; b++) {
            const b0 = B[b], b1 = B[(b + 1) % B.length];
            if (key(a0[0], a0[1]) === key(b1[0], b1[1]) && key(a1[0], a1[1]) === key(b0[0], b0[1])) {
              const merged = [];
              for (let k = 0; k < A.length; k++) merged.push(A[(a + 1 + k) % A.length]);
              for (let k = 1; k < B.length - 1; k++) merged.push(B[(b + 1 + k) % B.length]);
              list.splice(j, 1);
              list.splice(i, 1, cleanRing(merged));
              changed = true;
              break outer;
            }
          }
        }
      }
    }
  }
  return list;
};

/* ============================================================================
   Refit ring -> subpath Bézier (nodes + handle), memakai schneiderFit.
   ============================================================================ */
const CORNER_TURN_DEG = 30;
const refitRingToSub = (ptsIn, tol = REFIT_TOL) => {
  const pts = cleanRing(ptsIn);
  if (pts.length < 3) return null;
  const n = pts.length;
  const turnAt = i => {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1];
    const vx = p2[0] - p1[0], vy = p2[1] - p1[1];
    const lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1;
    const cross = (ux * vy - uy * vx) / (lu * lv);
    const dot = (ux * vx + uy * vy) / (lu * lv);
    return Math.abs(Math.atan2(cross, dot)) * 180 / Math.PI;
  };
  const isCorner = new Array(n).fill(false);
  for (let i = 0; i < n; i++) if (turnAt(i) > CORNER_TURN_DEG) isCorner[i] = true;
  const cornerIdx = [];
  for (let i = 0; i < n; i++) if (isCorner[i]) cornerIdx.push(i);
  const mkNode = (x, y, type, hIn, hOut) => ({
    id: uid(), x: rd(x), y: rd(y), type,
    handleIn: hIn ? { x: rd(hIn[0]), y: rd(hIn[1]) } : null,
    handleOut: hOut ? { x: rd(hOut[0]), y: rd(hOut[1]) } : null
  });
  const nrm2 = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  const chainStraight = (a, b) => {
    /* Semua titik di antara a..b (indeks melingkar) dekat dengan chord? */
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    let i = (a + 1) % n;
    while (i !== b) {
      const px = pts[i][0], py = pts[i][1];
      const cr = Math.abs((px - ax) * dy - (py - ay) * dx) / Math.sqrt(L2);
      if (cr > tol * 0.5) return false;
      i = (i + 1) % n;
    }
    return true;
  };
  /* Bangun nodes dari satu rantai terbuka: pts[s..e] (indeks melingkar,
     inklusif, s != e). Mengembalikan array node (tanpa node akhir ganda). */
  const fitChain = (s, e) => {
    const idxs = [];
    let i = s;
    while (true) {
      idxs.push(i);
      if (i === e) break;
      i = (i + 1) % n;
    }
    if (idxs.length < 2) return null;
    const A = pts[s], B = pts[e];
    if (idxs.length === 2 || chainStraight(s, e)) {
      return { start: null, mids: [], end: null, straight: true };
    }
    const chainPts = idxs.map(k => ({ x: pts[k][0], y: pts[k][1] }));
    const t1 = nrm2(A[0], A[1], pts[(s + 1) % n][0], pts[(s + 1) % n][1]);
    const t2 = nrm2(B[0], B[1], pts[(e - 1 + n) % n][0], pts[(e - 1 + n) % n][1]);
    /* schneiderFit memakai tangen berupa OBJEK {x, y} (bukan array). */
    const fitted = schneiderFit(chainPts, { x: t1[0], y: t1[1] }, { x: t2[0], y: t2[1] }, tol);
    if (!fitted.length || fitted.length >= idxs.length - 1) {
      /* Tidak hemat: pakai polyline (semua titik jadi corner). */
      return { start: null, mids: idxs.slice(1, -1).map(k => mkNode(pts[k][0], pts[k][1], 'corner', null, null)), end: null, straight: false, polyline: true };
    }
    const mids = [];
    for (let k = 0; k < fitted.length - 1; k++) {
      const c = fitted[k], d = fitted[k + 1];
      mids.push(mkNode(c[3][0], c[3][1], 'smooth', c[2], d[1]));
    }
    return { start: fitted[0][1], mids, end: fitted[fitted.length - 1][2], straight: false };
  };
  let nodes = [];
  if (!cornerIdx.length) {
    /* Ring mulus penuh: fit sebagai rantai tertutup dari titik terjauh. */
    let s = 0;
    for (let i = 1; i < n; i++) if (pts[i][0] > pts[s][0]) s = i;
    const rot = [];
    for (let k = 0; k < n; k++) rot.push(pts[(s + k) % n]);
    rot.push(pts[s]);
    const t1 = nrm2(rot[0][0], rot[0][1], rot[1][0], rot[1][1]);
    const t2 = nrm2(rot[n][0], rot[n][1], rot[n - 1][0], rot[n - 1][1]);
    const fitted = schneiderFit(rot.map(p => ({ x: p[0], y: p[1] })), { x: t1[0], y: t1[1] }, { x: t2[0], y: t2[1] }, tol);
    if (!fitted.length) return null;
    const startNode = mkNode(rot[0][0], rot[0][1], 'smooth', fitted[fitted.length - 1][2], fitted[0][1]);
    nodes.push(startNode);
    for (let k = 0; k < fitted.length - 1; k++) {
      const c = fitted[k], d = fitted[k + 1];
      nodes.push(mkNode(c[3][0], c[3][1], 'smooth', c[2], d[1]));
    }
    return { id: uid(), closed: true, nodes };
  }
  /* Rantai antar corner. */
  const cornerNodes = new Map(); /* idx -> node */
  for (const ci of cornerIdx) {
    cornerNodes.set(ci, mkNode(pts[ci][0], pts[ci][1], 'corner', null, null));
  }
  /* Susun nodes searah jarum ring, mulai dari corner pertama. */
  const ordered = [];
  for (let k = 0; k < cornerIdx.length; k++) {
    const s = cornerIdx[k], e = cornerIdx[(k + 1) % cornerIdx.length];
    const res = fitChain(s, e);
    if (!res) continue;
    const nodeA = cornerNodes.get(s);
    const nodeB = cornerNodes.get(e);
    if (res.straight) {
      /* nodeA & nodeB tetap corner tanpa handle */
    } else if (res.polyline) {
      if (res.start) nodeA.handleOut = { x: rd(res.start[0]), y: rd(res.start[1]) };
      if (res.end) nodeB.handleIn = { x: rd(res.end[0]), y: rd(res.end[1]) };
      ordered.push(nodeA, ...res.mids);
      continue;
    } else {
      if (res.start) nodeA.handleOut = { x: rd(res.start[0]), y: rd(res.start[1]) };
      if (res.end) nodeB.handleIn = { x: rd(res.end[0]), y: rd(res.end[1]) };
      ordered.push(nodeA, ...res.mids);
      continue;
    }
    ordered.push(nodeA);
  }
  /* Tutup: node terakhir (corner terakhir) sudah termasuk lewat iterasi?
     Iterasi di atas mendorong nodeA tiap rantai; rantai terakhir mendorong
     corner terakhir sebagai nodeA-nya sendiri? Tidak — rantai terakhir
     s=corner terakhir, e=corner pertama: mendorong nodeA (corner terakhir).
     Jadi semua corner terdorong tepat sekali. */
  if (ordered.length < 3) return null;
  return { id: uid(), closed: true, nodes: ordered };
};

const ringsToSubs = (rings, tol = REFIT_TOL) => {
  const subs = [];
  for (const r of rings) {
    const sub = refitRingToSub(r, tol);
    if (sub) subs.push(sub);
  }
  return subs;
};

/* ============================================================================
   Operasi boolean tingkat dokumen (gaya simplifyDoc: kembalikan doc baru).
   op: 'union' | 'subtract' | 'intersect' | 'exclude'
   Konvensi: urutan objek = bawah -> atas (doc order). Subtract memakai
   objek TERATAS sebagai pemotong; sisanya digabung dulu sebagai subjek.
   ============================================================================ */
const booleanDoc = (doc, op, selIds) => {
  const targets = doc.objects.filter(o => selIds.has(o.id) && !o.hidden && !o.locked && !o.img && !o.text && o.subs && o.subs.length);
  if (targets.length < 2) return { doc, changed: false, reason: 'need2' };
  const perObj = targets.map(o => ({ o, ...flattenObjToRings(o) }));
  const usable = perObj.filter(p => p.rings.length > 0);
  if (usable.length < 2) return { doc, changed: false, reason: 'need2closed' };
  let resultRings = null;
  if (op === 'union') {
    resultRings = usable[0].rings;
    for (let i = 1; i < usable.length; i++) resultRings = clipRings(resultRings, usable[i].rings, 'union');
  } else if (op === 'intersect') {
    resultRings = usable[0].rings;
    for (let i = 1; i < usable.length; i++) {
      resultRings = clipRings(resultRings, usable[i].rings, 'intersect');
      if (!resultRings.length) break;
    }
  } else if (op === 'subtract') {
    const top = usable[usable.length - 1];
    let base = usable[0].rings;
    for (let i = 1; i < usable.length - 1; i++) base = clipRings(base, usable[i].rings, 'union');
    resultRings = clipRings(base, top.rings, 'difference');
  } else if (op === 'exclude') {
    resultRings = usable[0].rings;
    for (let i = 1; i < usable.length; i++) resultRings = clipRings(resultRings, usable[i].rings, 'xor');
  } else {
    return { doc, changed: false, reason: 'badop' };
  }
  if (!resultRings || !resultRings.length) return { doc, changed: false, reason: 'empty' };
  const subs = ringsToSubs(resultRings);
  if (!subs.length) return { doc, changed: false, reason: 'empty' };
  const bottom = usable[0].o;
  const topObj = usable[usable.length - 1].o;
  const names = new Set(doc.objects.map(o => o.name));
  let k = 1;
  while (names.has('Boolean-' + k)) k++;
  const bottomFill = bottom.fill != null && bottom.fill !== 'none' ? bottom.fill
    : typeof bottom.stroke === 'string' && bottom.stroke !== 'none' ? bottom.stroke : '#000000';
  const merged = {
    id: uid(),
    name: 'Boolean-' + k,
    type: 'path',
    fill: bottomFill,
    stroke: 'none',
    strokeWidth: 0,
    opacity: bottom.opacity != null ? bottom.opacity : 1,
    fillRule: 'evenodd',
    group: null,
    subs
  };
  const ids = new Set(usable.map(p => p.o.id));
  const out = [];
  doc.objects.forEach(o => {
    if (o.id === topObj.id) out.push(merged);
    else if (!ids.has(o.id)) out.push(o);
  });
  return {
    doc: { ...doc, objects: out },
    changed: true,
    resultId: merged.id,
    stats: {
      inObjects: usable.length,
      inRings: usable.reduce((s, p) => s + p.rings.length, 0),
      outRings: resultRings.length,
      outNodes: subs.reduce((s, sp) => s + sp.nodes.length, 0),
      skippedOpen: perObj.reduce((s, p) => s + p.skippedOpen, 0)
    }
  };
};

export { ringArea, cleanRing, windingNumber, isInsideRings, ringSelfIntersects, flattenObjToRings, segSegIntersect, clipRings, refitRingToSub, ringsToSubs, booleanDoc, FLAT_TOL, REFIT_TOL };
export default booleanDoc;
