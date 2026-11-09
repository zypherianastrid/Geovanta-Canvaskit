/**
 * @file src/engine/topologicalCurveSimplifier.jsx
 * @description Mesin penyederhanaan kurva topologis (Simplify Path) & perbaikan otomatis anomali vektor
 */
import { sub, dist, uid, cl, nrm, cross, dot } from './vectorPrimitives.jsx';
import { rdCoord } from './svgPathSerializer.jsx';
import { hasH, detectAnomalies, collapseClusters, refitChain } from './curveFittingAndAnomalies.jsx';
import { docBounds } from './textAndImageEngine.jsx';

/* =========================================================================
   PORT IDENTIK DARI VECTORCRAFT (crates/pathops/src/fit.rs & edit.rs & boolean.rs)
   DENGAN SHAPE-PRESERVING GUARD & STACKED-CORNER CONSOLIDATION:
   Object › Path › Simplify (`simplify_with`, `simplify_subpath`, `simplify_run`,
   `simplify_part`, `simplify_runs`, `fit_cubics`, `rdp`, `smooth_points`,
   `simplify_level_tolerance`, `auto_simplify_level`)
   ========================================================================= */
const SIMPLIFY_LEVEL = 50.0;
const VC_MAX_REPARAM = 6;
const VC_MEASURE_LIMIT = 1e9;
function simplifyLevelTolerance(level) {
  const l = Number.isFinite(level) ? Math.max(0.0, Math.min(100.0, level)) : SIMPLIFY_LEVEL;
  return Math.pow(2.0, (SIMPLIFY_LEVEL - l) / 10.0);
}

/* Auto-Simplify level yang menjaga presisi bentuk visual (sub-piksel hingga ~0.62 pt pada ilustrasi kompleks) */
/* Auto-Simplify level yang menjaga presisi bentuk visual (sub-piksel hingga ~0.62 pt pada ilustrasi kompleks) */
function autoSimplifyLevel(size) {
  if (!(Number.isFinite(size) && size > 0.0)) return 100.0;
  const target = Math.min(0.62, Math.max(0.08, size / 1600.0));
  return Math.max(0.0, Math.min(100.0, Math.ceil(SIMPLIFY_LEVEL - 10.0 * Math.log2(target))));
}
function vcUnit(v) {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-9 ? {
    x: v.x / l,
    y: v.y / l
  } : null;
}
function vcStartTangent(c) {
  return vcUnit(sub(c.p1, c.p0)) || vcUnit(sub(c.p2, c.p0)) || vcUnit(sub(c.p3, c.p0)) || {
    x: 1.0,
    y: 0.0
  };
}
function vcEndTangent(c) {
  return vcUnit(sub(c.p3, c.p2)) || vcUnit(sub(c.p3, c.p1)) || vcUnit(sub(c.p3, c.p0)) || {
    x: 1.0,
    y: 0.0
  };
}
function vcDedup(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!out.length || dist(out[out.length - 1], p) > 1e-12) {
      out.push({
        x: p.x,
        y: p.y
      });
    }
  }
  return out;
}
function vcChordParams(pts) {
  const u = new Array(pts.length);
  u[0] = 0.0;
  for (let i = 1; i < pts.length; i++) {
    u[i] = u[i - 1] + dist(pts[i], pts[i - 1]);
  }
  const total = u[u.length - 1];
  if (total > 1e-12) {
    for (let i = 0; i < u.length; i++) u[i] /= total;
    u[u.length - 1] = 1.0;
  }
  return u;
}
function vcBern(u) {
  const v = 1.0 - u;
  return [v * v * v, 3.0 * v * v * u, 3.0 * v * u * u, u * u * u];
}
function vcEvalCubic(c, t) {
  const [b0, b1, b2, b3] = vcBern(t);
  return {
    x: b0 * c.p0.x + b1 * c.p1.x + b2 * c.p2.x + b3 * c.p3.x,
    y: b0 * c.p0.y + b1 * c.p1.y + b2 * c.p2.y + b3 * c.p3.y
  };
}
function vcGenerate(pts, u, t0, t1) {
  const p0 = pts[0],
    p3 = pts[pts.length - 1];
  const seg = dist(p0, p3);
  const dirIn = {
    x: -t1.x,
    y: -t1.y
  };
  let c00 = 0.0,
    c01 = 0.0,
    c11 = 0.0,
    x0 = 0.0,
    x1 = 0.0;
  for (let i = 0; i < pts.length; i++) {
    const [b0, b1, b2, b3] = vcBern(u[i]);
    const a1x = t0.x * b1,
      a1y = t0.y * b1;
    const a2x = dirIn.x * b2,
      a2y = dirIn.y * b2;
    c00 += a1x * a1x + a1y * a1y;
    c01 += a1x * a2x + a1y * a2y;
    c11 += a2x * a2x + a2y * a2y;
    const baseX = p0.x * (b0 + b1) + p3.x * (b2 + b3);
    const baseY = p0.y * (b0 + b1) + p3.y * (b2 + b3);
    const rhsX = pts[i].x - baseX;
    const rhsY = pts[i].y - baseY;
    x0 += a1x * rhsX + a1y * rhsY;
    x1 += a2x * rhsX + a2y * rhsY;
  }
  const det = c00 * c11 - c01 * c01;
  const fallback = seg / 3.0;
  let al = fallback,
    ar = fallback;
  if (Math.abs(det) > 1e-12) {
    al = (x0 * c11 - x1 * c01) / det;
    ar = (c00 * x1 - c01 * x0) / det;
  }
  const minA = 1e-6 * seg;
  if (!Number.isFinite(al) || !Number.isFinite(ar) || al < minA || ar < minA) {
    al = fallback;
    ar = fallback;
  }
  /* Batasi panjang handle hingga 1.15x chord agar kurva kubik tidak pernah melintir / menggelembung di luar bentuk asli */
  const cap = seg * 1.15 + 1e-9;
  al = Math.min(al, cap);
  ar = Math.min(ar, cap);
  return {
    p0: {
      x: p0.x,
      y: p0.y
    },
    p1: {
      x: p0.x + t0.x * al,
      y: p0.y + t0.y * al
    },
    p2: {
      x: p3.x + dirIn.x * ar,
      y: p3.y + dirIn.y * ar
    },
    p3: {
      x: p3.x,
      y: p3.y
    }
  };
}

/* Evaluasi galat O(N) pada titik sampel + titik tengah interval untuk menjamin bentuk kurva identik */
/* Evaluasi galat O(N) pada titik sampel + titik tengah interval untuk menjamin bentuk kurva identik */
function vcMaxError(pts, c, u) {
  let maxD2 = 0.0,
    split = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const q = vcEvalCubic(c, u[i]);
    const dx = pts[i].x - q.x,
      dy = pts[i].y - q.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > maxD2) {
      maxD2 = d2;
      split = i;
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const qMid = vcEvalCubic(c, 0.5 * (u[i] + u[i + 1]));
    const mx = 0.5 * (pts[i].x + pts[i + 1].x),
      my = 0.5 * (pts[i].y + pts[i + 1].y);
    const dx = mx - qMid.x,
      dy = my - qMid.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > maxD2) {
      maxD2 = d2;
      split = Math.max(1, Math.min(pts.length - 2, i));
    }
  }
  return [Math.sqrt(maxD2), split];
}
function vcNewton(c, p, u) {
  const q = vcEvalCubic(c, u);
  const v = 1.0 - u;
  const q0x = 3.0 * (c.p1.x - c.p0.x),
    q0y = 3.0 * (c.p1.y - c.p0.y);
  const q1x = 3.0 * (c.p2.x - c.p1.x),
    q1y = 3.0 * (c.p2.y - c.p1.y);
  const q2x = 3.0 * (c.p3.x - c.p2.x),
    q2y = 3.0 * (c.p3.y - c.p2.y);
  const d1x = v * v * q0x + 2.0 * v * u * q1x + u * u * q2x;
  const d1y = v * v * q0y + 2.0 * v * u * q1y + u * u * q2y;
  const d2x = v * 2.0 * (q1x - q0x) + u * 2.0 * (q2x - q1x);
  const d2y = v * 2.0 * (q1y - q0y) + u * 2.0 * (q2y - q1y);
  const diffX = q.x - p.x,
    diffY = q.y - p.y;
  const num = diffX * d1x + diffY * d1y;
  const den = d1x * d1x + d1y * d1y + (diffX * d2x + diffY * d2y);
  if (Math.abs(den) <= 1e-12) return u;
  return Math.max(0.0, Math.min(1.0, u - num / den));
}
function vcFitSingleFrom(pts, uIn, t0, t1) {
  const u = uIn.slice();
  let best = vcGenerate(pts, u, t0, t1);
  let [bestErr, split] = vcMaxError(pts, best, u);
  for (let iter = 0; iter < VC_MAX_REPARAM; iter++) {
    for (let i = 1; i < pts.length - 1; i++) {
      u[i] = vcNewton(best, pts[i], u[i]);
    }
    for (let i = 1; i < u.length; i++) {
      if (u[i] < u[i - 1]) u[i] = u[i - 1];
    }
    const c = vcGenerate(pts, u, t0, t1);
    const [err, sp] = vcMaxError(pts, c, u);
    if (err < bestErr) {
      best = c;
      bestErr = err;
      split = sp;
    } else {
      break;
    }
  }
  return [best, bestErr, split];
}
function vcFitSingle(pts, t0, t1) {
  if (pts.length < 2) return null;
  const u = vcChordParams(pts);
  const [c, err] = vcFitSingleFrom(pts, u, t0, t1);
  return [c, err];
}
function vcFitRec(pts, t0, t1, tol, out, depth) {
  const n = pts.length;
  if (n < 2) return;
  if (n === 2) {
    const d = dist(pts[0], pts[1]) / 3.0;
    out.push({
      p0: {
        x: pts[0].x,
        y: pts[0].y
      },
      p1: {
        x: pts[0].x + t0.x * d,
        y: pts[0].y + t0.y * d
      },
      p2: {
        x: pts[1].x - t1.x * d,
        y: pts[1].y - t1.y * d
      },
      p3: {
        x: pts[1].x,
        y: pts[1].y
      }
    });
    return;
  }
  const u = vcChordParams(pts);
  let [c, err, split] = vcFitSingleFrom(pts, u, t0, t1);
  if (err <= tol || depth > 40) {
    out.push(c);
    return;
  }
  split = Math.max(1, Math.min(n - 2, split));
  const tc = vcUnit(sub(pts[split + 1], pts[split - 1])) || t0;
  vcFitRec(pts.slice(0, split + 1), t0, tc, tol, out, depth + 1);
  vcFitRec(pts.slice(split), tc, t1, tol, out, depth + 1);
}
function vcFitCubics(pts, t0, t1, tol) {
  const clean = vcDedup(pts);
  if (clean.length < 2) return [];
  const out = [];
  vcFitRec(clean, t0, t1, Math.max(tol, 1e-6), out, 0);
  return out;
}
function vcIsStraight(c, tol) {
  const chord = sub(c.p3, c.p0);
  const len = Math.hypot(chord.x, chord.y);
  if (len < 1e-12) {
    return dist(c.p1, c.p0) <= tol && dist(c.p2, c.p0) <= tol;
  }
  const dir = {
    x: chord.x / len,
    y: chord.y / len
  };
  for (const h of [c.p1, c.p2]) {
    const v = sub(h, c.p0);
    const perp = Math.abs(v.x * dir.y - v.y * dir.x);
    const along = v.x * dir.x + v.y * dir.y;
    if (perp > tol || along < -tol || along > len + tol) return false;
  }
  return true;
}
function vcSample(c, m, pts, includeStart) {
  const start = includeStart ? 0 : 1;
  const mUse = Math.max(m, 1);
  for (let i = start; i <= mUse; i++) {
    const t = i / mUse;
    pts.push(vcEvalCubic(c, t));
  }
}
const VC_GL5_X = [0.0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const VC_GL5_W = [0.5688888888888889, 0.47862867049936647, 0.47862867049936647, 0.23692688505618908, 0.23692688505618908];
function vcCubicSpeedAt(c, t) {
  const v = 1.0 - t;
  const dx = 3.0 * (v * v * (c.p1.x - c.p0.x) + 2.0 * v * t * (c.p2.x - c.p1.x) + t * t * (c.p3.x - c.p2.x));
  const dy = 3.0 * (v * v * (c.p1.y - c.p0.y) + 2.0 * v * t * (c.p2.y - c.p1.y) + t * t * (c.p3.y - c.p2.y));
  return Math.hypot(dx, dy);
}
function vcGaussArclenInterval(c, t0, t1) {
  const half = 0.5 * (t1 - t0),
    mid = 0.5 * (t0 + t1);
  let sum = 0.0;
  for (let i = 0; i < 5; i++) {
    sum += VC_GL5_W[i] * vcCubicSpeedAt(c, mid + half * VC_GL5_X[i]);
  }
  return sum * half;
}
function vcMeasuredArclen(c, accuracy = 1e-6) {
  const ok = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= VC_MEASURE_LIMIT && Math.abs(p.y) <= VC_MEASURE_LIMIT;
  if (!ok(c.p0) || !ok(c.p1) || !ok(c.p2) || !ok(c.p3)) return 0.0;
  let total = 0.0;
  const stack = [[0.0, 1.0, vcGaussArclenInterval(c, 0.0, 1.0), 0]];
  while (stack.length) {
    const [t0, t1, est, depth] = stack.pop();
    const tm = 0.5 * (t0 + t1);
    const l = vcGaussArclenInterval(c, t0, tm);
    const r = vcGaussArclenInterval(c, tm, t1);
    if (Math.abs(l + r - est) <= accuracy || depth >= 10) {
      total += l + r;
    } else {
      stack.push([tm, t1, r, depth + 1]);
      stack.push([t0, tm, l, depth + 1]);
    }
  }
  return total;
}
function vcIsCollinearHandles(p, a, b) {
  const vax = a.x - p.x,
    vay = a.y - p.y;
  const vbx = b.x - p.x,
    vby = b.y - p.y;
  const cr = vax * vby - vay * vbx;
  const dt = vax * vbx + vay * vby;
  return Math.abs(cr) <= 1e-6 * Math.max(Math.hypot(vax, vay), 1.0) * Math.max(Math.hypot(vbx, vby), 1.0) && dt < 0.0;
}
function vcAnchorWithHandles(pos, hIn, hOut, keepId = null) {
  const p = {
    x: rdCoord(pos.x),
    y: rdCoord(pos.y)
  };
  const hi = hIn && dist(hIn, pos) > 1e-6 ? {
    x: rdCoord(hIn.x),
    y: rdCoord(hIn.y)
  } : null;
  const ho = hOut && dist(hOut, pos) > 1e-6 ? {
    x: rdCoord(hOut.x),
    y: rdCoord(hOut.y)
  } : null;
  const smooth = !!(hi && ho && vcIsCollinearHandles(pos, hi, ho));
  return {
    id: keepId || uid(),
    x: p.x,
    y: p.y,
    type: smooth ? 'smooth' : 'corner',
    handleIn: hi,
    handleOut: ho
  };
}
function vcWithHandle(node, out, h) {
  const pos = {
    x: node.x,
    y: node.y
  };
  const hIn = out ? node.handleIn ? {
    x: node.handleIn.x,
    y: node.handleIn.y
  } : pos : h || pos;
  const hOut = out ? h || pos : node.handleOut ? {
    x: node.handleOut.x,
    y: node.handleOut.y
  } : pos;
  const wasSmooth = node.type === 'smooth' || node.type === 'symmetric';
  const res = vcAnchorWithHandles(pos, hIn, hOut, node.id);
  if (!wasSmooth) res.type = 'corner';
  return res;
}
function vcSubpathSegCount(sp) {
  const n = sp.nodes.length;
  return n < 2 ? 0 : sp.closed ? n : n - 1;
}
function vcSubpathSegment(sp, i) {
  const n = sp.nodes.length;
  const a = sp.nodes[i % n],
    b = sp.nodes[(i + 1) % n];
  const p0 = {
      x: a.x,
      y: a.y
    },
    p3 = {
      x: b.x,
      y: b.y
    };
  const p1 = a.handleOut && dist(a.handleOut, p0) > 1e-9 ? {
    x: a.handleOut.x,
    y: a.handleOut.y
  } : p0;
  const p2 = b.handleIn && dist(b.handleIn, p3) > 1e-9 ? {
    x: b.handleIn.x,
    y: b.handleIn.y
  } : p3;
  return {
    p0,
    p1,
    p2,
    p3
  };
}
function vcSubpathSegIsLine(sp, i) {
  const n = sp.nodes.length;
  const a = sp.nodes[i % n],
    b = sp.nodes[(i + 1) % n];
  const hasOut = !!(a.handleOut && dist(a.handleOut, a) > 1e-9);
  const hasIn = !!(b.handleIn && dist(b.handleIn, b) > 1e-9);
  return !hasOut && !hasIn;
}
function vcSubpathSegs(sp) {
  const cnt = vcSubpathSegCount(sp),
    out = [];
  for (let i = 0; i < cnt; i++) {
    out.push({
      c: vcSubpathSegment(sp, i),
      line: vcSubpathSegIsLine(sp, i),
      forceCutStart: !!(sp.nodes[i] && sp.nodes[i]._forceCut)
    });
  }
  return out;
}
function vcSegLine(a, b) {
  return {
    c: {
      p0: {
        x: a.x,
        y: a.y
      },
      p1: {
        x: a.x,
        y: a.y
      },
      p2: {
        x: b.x,
        y: b.y
      },
      p3: {
        x: b.x,
        y: b.y
      }
    },
    line: true
  };
}
function vcSegsToSubpath(segs, closed, spId) {
  if (!segs || !segs.length) return null;
  const nodes = [];
  for (let i = 0; i < segs.length; i++) {
    const pos = segs[i].c.p0;
    const prevIdx = i > 0 ? i - 1 : closed ? segs.length - 1 : -1;
    const hIn = prevIdx >= 0 && !segs[prevIdx].line ? segs[prevIdx].c.p2 : pos;
    const hOut = !segs[i].line ? segs[i].c.p1 : pos;
    nodes.push(vcAnchorWithHandles(pos, hIn, hOut));
  }
  if (!closed) {
    const last = segs[segs.length - 1];
    const hIn = last.line ? last.c.p3 : last.c.p2;
    nodes.push(vcAnchorWithHandles(last.c.p3, hIn, last.c.p3));
  }
  return {
    id: spId || uid(),
    closed: !!closed,
    nodes
  };
}
function vcTurnDeg(a, b) {
  const tA = vcEndTangent(a.c),
    tB = vcStartTangent(b.c);
  const d = Math.max(-1.0, Math.min(1.0, tA.x * tB.x + tA.y * tB.y));
  return Math.acos(d) * 180.0 / Math.PI;
}

/* Deteksi belokan sambungan segmen yang juga memeriksa arah sekant (menangkap sudut tajam yang tersembunyi oleh handle mikro) */
/* Deteksi belokan sambungan segmen yang juga memeriksa arah sekant (menangkap sudut tajam yang tersembunyi oleh handle mikro) */
function vcJointTurnDeg(a, b) {
  const tanTurn = vcTurnDeg(a, b);
  const pPrev = vcEvalCubic(a.c, 0.75);
  const pJoint = a.c.p3;
  const pNext = vcEvalCubic(b.c, 0.25);
  const u1 = vcUnit(sub(pJoint, pPrev)),
    u2 = vcUnit(sub(pNext, pJoint));
  if (!u1 || !u2) return tanTurn;
  const secTurn = Math.acos(Math.max(-1.0, Math.min(1.0, u1.x * u2.x + u1.y * u2.y))) * 180.0 / Math.PI;
  return Math.max(tanTurn, secTurn);
}
function vcSmoothPoints(pts, sigma) {
  if (pts.length < 3 || !(Number.isFinite(sigma) && sigma > 0.0)) {
    return pts.slice();
  }
  const s = new Array(pts.length);
  let total = 0.0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) total += dist(pts[i - 1], pts[i]);
    s[i] = total;
  }
  let lo = 0,
    hi = 0;
  return pts.map((p, i) => {
    const si = s[i];
    const reach = Math.min(3.0 * sigma, si, total - si);
    if (reach <= 1e-9) return p;
    const spread = reach / 3.0;
    while (lo < s.length && s[lo] < si - reach) lo++;
    while (hi + 1 < s.length && s[hi + 1] <= si + reach) hi++;
    let sumX = 0.0,
      sumY = 0.0,
      weight = 0.0;
    for (let j = lo; j <= hi; j++) {
      const ds = s[j] - si;
      const w = Math.exp(-(ds * ds) / (2.0 * spread * spread));
      sumX += pts[j].x * w;
      sumY += pts[j].y * w;
      weight += w;
    }
    return weight > 0.0 ? {
      x: sumX / weight,
      y: sumY / weight
    } : p;
  });
}
function vcRdp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  let budget = pts.length * 64 + (1 << 20);
  while (stack.length) {
    const [a, b] = stack.pop();
    const span = b - a;
    if (budget < span) {
      for (let k = a; k <= b; k++) keep[k] = true;
      budget = 0;
      continue;
    }
    budget -= span;
    const pa = pts[a],
      pb = pts[b];
    const chord = sub(pb, pa);
    const len = Math.hypot(chord.x, chord.y);
    let bestD = 0.0,
      bestI = a;
    for (let i = a + 1; i < b; i++) {
      const p = pts[i];
      const d = len < 1e-12 ? dist(p, pa) : Math.abs((p.x - pa.x) * chord.y - (p.y - pa.y) * chord.x) / len;
      if (d > bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestD > tol) {
      keep[bestI] = true;
      stack.push([a, bestI]);
      stack.push([bestI, b]);
    }
  }
  return pts.filter((_, idx) => keep[idx]);
}

/* Pembersihan Node Menumpuk di Sudut yang Aman terhadap Bentuk Asli (Shape-Preserving):
   - Menggabungkan node berimpit & micro-arc di sudut/cusp (tanpa menembakkan garis potong jauh keluar).
   - Melebur cluster node menumpuk (2..5 node rapat) pada sudut 15°..135° tanpa merusak serif atau ujung pita (U-turn). */
/* Pembersihan Node Menumpuk di Sudut yang Aman terhadap Bentuk Asli (Shape-Preserving):
   - Menggabungkan node berimpit & micro-arc di sudut/cusp (tanpa menembakkan garis potong jauh keluar).
   - Melebur cluster node menumpuk (2..5 node rapat) pada sudut 15°..135° tanpa merusak serif atau ujung pita (U-turn). */
function vcCollapseStackedCornerNodes(sp, opts = {}, targetNodeIds = null) {
  const minKeep = sp.closed ? 3 : 2;
  if (!sp || !sp.nodes || sp.nodes.length <= minKeep) return {
    sp,
    mergedIds: new Set()
  };
  const tol = Math.max(opts.tolerance != null ? opts.tolerance : 0.5, 1e-4);
  const cornerAngleDeg = opts.cornerAngleDeg != null ? opts.cornerAngleDeg : 30.0;
  const eps = Math.min(4.2, Math.max(1.5, tol * 3.2));
  const microEps = Math.min(1.5, Math.max(0.4, tol * 1.2));
  const minAng = Math.max(15.0, Math.min(cornerAngleDeg, 35.0));
  let nodes = sp.nodes.map(nd => ({
    ...cl(nd),
    _forceCut: !!nd._forceCut
  }));
  const mergedIds = new Set();
  const okNode = id => !targetNodeIds || targetNodeIds.has(id);

  /* Pass 1: Gabungkan node berimpit / micro-arc pada sudut & cusp */
  for (let pass = 0; pass < 10 && nodes.length > minKeep; pass++) {
    let mergedAny = false;
    const n = nodes.length;
    const limit = sp.closed ? n : n - 1;
    for (let i = 0; i < limit && nodes.length > minKeep; i++) {
      const j = (i + 1) % nodes.length;
      const A = nodes[i],
        B = nodes[j];
      if (!okNode(A.id) || !okNode(B.id)) continue;
      const dAB = dist(A, B);
      if (dAB > microEps) continue;
      if (hasH(A, A.handleOut) && dist(A.handleOut, A) > microEps * 1.5) continue;
      if (hasH(B, B.handleIn) && dist(B.handleIn, B) > microEps * 1.5) continue;
      let px = 0.5 * (A.x + B.x),
        py = 0.5 * (A.y + B.y);
      if (nodes.length >= 4) {
        const pi = (i - 1 + nodes.length) % nodes.length;
        const ni = (j + 1) % nodes.length;
        const PV = nodes[pi],
          NX = nodes[ni];
        const vIn = hasH(A, A.handleIn) ? nrm(sub(A, A.handleIn)) : hasH(PV, PV.handleOut) ? nrm(sub(A, PV.handleOut)) : nrm(sub(A, PV));
        const vOut = hasH(B, B.handleOut) ? nrm(sub(B.handleOut, B)) : hasH(NX, NX.handleIn) ? nrm(sub(NX.handleIn, B)) : nrm(sub(NX, B));
        const det = cross(vIn, vOut);
        if (Math.abs(det) > 0.15) {
          const w = sub(B, A),
            t = cross(w, vOut) / det;
          const ix = A.x + vIn.x * t,
            iy = A.y + vIn.y * t;
          if (t >= -dAB * 0.5 && Math.hypot(ix - px, iy - py) <= Math.max(1.2, dAB * 1.2)) {
            px = ix;
            py = iy;
          }
        }
      }
      const mNode = {
        id: A.id,
        x: rdCoord(px),
        y: rdCoord(py),
        type: 'corner',
        handleIn: hasH(A, A.handleIn) ? {
          ...A.handleIn
        } : null,
        handleOut: hasH(B, B.handleOut) ? {
          ...B.handleOut
        } : null,
        _forceCut: true
      };
      mergedIds.add(mNode.id);
      nodes[i] = mNode;
      nodes.splice(j, 1);
      mergedAny = true;
      break;
    }
    if (!mergedAny) break;
  }

  /* Pass 2: Lebur cluster node menumpuk di sudut (2..5 node rapat pada belokan 15°..135°) */
  for (let pass = 0; pass < 4 && nodes.length >= 4 && nodes.length > minKeep; pass++) {
    const n = nodes.length;
    let start = 0;
    if (sp.closed) {
      start = -1;
      for (let i = 0; i < n; i++) {
        if (dist(nodes[(i - 1 + n) % n], nodes[i]) > eps) {
          start = i;
          break;
        }
      }
      if (start < 0) break;
    }
    const groups = [];
    let cur = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (cur.length && okNode(nodes[cur[cur.length - 1]].id) && okNode(nodes[i].id) && dist(nodes[cur[cur.length - 1]], nodes[i]) <= eps && dist(nodes[cur[0]], nodes[i]) <= eps * 1.6) {
        cur.push(i);
      } else {
        if (cur.length >= 2) groups.push(cur);
        cur = okNode(nodes[i].id) ? [i] : [];
      }
    }
    if (cur.length >= 2) groups.push(cur);
    if (!groups.length) break;
    const byFirst = new Map(),
      drop = new Set();
    let leftCount = n;
    for (const g of groups) {
      if (g.length < 2 || g.length > 5 || leftCount - (g.length - 1) < minKeep) continue;
      if (!sp.closed && (g.includes(0) || g.includes(n - 1))) continue;
      if (g.some(i => nodes[i].fil)) continue;
      const f = g[0],
        l = g[g.length - 1];
      const pi = (f - 1 + n) % n,
        ni = (l + 1) % n;
      if (g.includes(pi) || g.includes(ni)) continue;
      const A = nodes[f],
        B = nodes[l],
        PV = nodes[pi],
        NX = nodes[ni];
      const spanAB = dist(A, B);
      const dPrev = dist(PV, A),
        dNext = dist(B, NX);
      if (dPrev < Math.max(spanAB * 3.0, eps * 2.0) || dNext < Math.max(spanAB * 3.0, eps * 2.0)) continue;
      const vIn = hasH(A, A.handleIn) ? nrm(sub(A, A.handleIn)) : hasH(PV, PV.handleOut) ? nrm(sub(A, PV.handleOut)) : nrm(sub(A, PV));
      const vOut = hasH(B, B.handleOut) ? nrm(sub(B.handleOut, B)) : hasH(NX, NX.handleIn) ? nrm(sub(NX.handleIn, B)) : nrm(sub(NX, B));
      const angDeg = Math.acos(Math.max(-1.0, Math.min(1.0, dot(vIn, vOut)))) * 180.0 / Math.PI;
      if (angDeg < minAng || angDeg > 135.0) continue;
      let cx = 0.0,
        cy = 0.0;
      g.forEach(i => {
        cx += nodes[i].x;
        cy += nodes[i].y;
      });
      cx /= g.length;
      cy /= g.length;
      let inter = null;
      const det = cross(vIn, vOut);
      if (Math.abs(det) > 0.15) {
        const w = sub(B, A),
          t = cross(w, vOut) / det;
        const px = A.x + vIn.x * t,
          py = A.y + vIn.y * t;
        if (t >= -spanAB * 0.25 && Math.hypot(px - cx, py - cy) <= Math.max(2.5, spanAB * 1.25)) {
          inter = {
            x: px,
            y: py
          };
        }
      }
      if (!inter) {
        let bestNode = {
            x: cx,
            y: cy
          },
          bestTurn = -1;
        for (const idx of g) {
          const p0 = nodes[(idx - 1 + n) % n],
            p1 = nodes[idx],
            p2 = nodes[(idx + 1) % n];
          const u1 = nrm(sub(p1, p0)),
            u2 = nrm(sub(p2, p1));
          const tDeg = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2)))) * 180 / Math.PI;
          if (tDeg > bestTurn) {
            bestTurn = tDeg;
            bestNode = {
              x: p1.x,
              y: p1.y
            };
          }
        }
        inter = bestNode;
      }
      const keepId = A.id;
      byFirst.set(keepId, {
        id: keepId,
        x: rdCoord(inter.x),
        y: rdCoord(inter.y),
        type: 'corner',
        handleIn: hasH(A, A.handleIn) ? {
          ...A.handleIn
        } : null,
        handleOut: hasH(B, B.handleOut) ? {
          ...B.handleOut
        } : null,
        _forceCut: true
      });
      mergedIds.add(keepId);
      g.forEach(i => drop.add(nodes[i].id));
      leftCount -= g.length - 1;
    }
    if (!drop.size) break;
    const nextNodes = [];
    for (const nd of nodes) {
      if (byFirst.has(nd.id)) nextNodes.push(byFirst.get(nd.id));else if (!drop.has(nd.id)) nextNodes.push(nd);
    }
    nodes = nextNodes;
  }
  return {
    sp: {
      ...sp,
      nodes
    },
    mergedIds
  };
}
function vcPreSamplePiece(piece, tol) {
  return piece.map(s => {
    const pts = [];
    const approx = dist(s.c.p0, s.c.p1) + dist(s.c.p1, s.c.p2) + dist(s.c.p2, s.c.p3);
    const m = Math.max(8, Math.min(36, Math.ceil(approx / Math.max(1.0, tol * 1.5)) || 8));
    for (let i = 0; i <= m; i++) pts.push(vcEvalCubic(s.c, i / m));
    return pts;
  });
}
function vcJoinSegSamples(segSamples, a, b) {
  const pts = [];
  for (let k = a; k < b; k++) {
    const arr = segSamples[k];
    for (let i = k === a ? 0 : 1; i < arr.length; i++) pts.push(arr[i]);
  }
  return pts;
}

/* Refit satu potongan halus di antara dua sudut dengan jaminan jumlah segmen berkurang & bentuk tetap identik (<= tol) */
/* Refit satu potongan halus di antara dua sudut dengan jaminan jumlah segmen berkurang & bentuk tetap identik (<= tol) */
function vcFitPieceShapePreserving(piece, tol, straightLines, smooth) {
  if (!piece.length) return [];
  const segSamples = vcPreSamplePiece(piece, tol);
  let ptsAll = vcJoinSegSamples(segSamples, 0, piece.length);
  if (smooth > 0.0) {
    ptsAll = vcSmoothPoints(ptsAll, smooth);
  }
  if (straightLines) {
    const keep = vcRdp(ptsAll, tol);
    const out = [];
    for (let j = 0; j < keep.length - 1; j++) out.push(vcSegLine(keep[j], keep[j + 1]));
    return out;
  }
  if (piece.length === 1) {
    const c = piece[0].c;
    return [vcIsStraight(c, tol * 0.04) ? vcSegLine(c.p0, c.p3) : {
      c,
      line: false
    }];
  }
  const t0All = vcStartTangent(piece[0].c);
  const t1All = vcEndTangent(piece[piece.length - 1].c);
  const cubicsAll = vcFitCubics(ptsAll, t0All, t1All, tol);
  if (cubicsAll.length > 0 && cubicsAll.length < piece.length) {
    return cubicsAll.map(c => vcIsStraight(c, tol * 0.04) ? vcSegLine(c.p0, c.p3) : {
      c,
      line: false
    });
  }

  /* Jika rantai panjang memiliki infleksi kompleks, gabungkan secara bertahap sub-rentang (5..2 segmen -> 1 kurva kubik) yang memenuhi galat <= tol */
  const out = [];
  let i = 0;
  while (i < piece.length) {
    let merged = null,
      mergedSpan = 0;
    const maxSpan = Math.min(5, piece.length - i);
    for (let spanLen = maxSpan; spanLen >= 2; spanLen--) {
      const pts = vcJoinSegSamples(segSamples, i, i + spanLen);
      const t0 = vcStartTangent(piece[i].c);
      const t1 = vcEndTangent(piece[i + spanLen - 1].c);
      const u = vcChordParams(pts);
      const [c, err] = vcFitSingleFrom(pts, u, t0, t1);
      if (err <= tol) {
        merged = vcIsStraight(c, tol * 0.04) ? vcSegLine(c.p0, c.p3) : {
          c,
          line: false
        };
        mergedSpan = spanLen;
        break;
      }
    }
    if (merged) {
      out.push(merged);
      i += mergedSpan;
    } else {
      const s = piece[i];
      out.push(vcIsStraight(s.c, tol * 0.04) ? vcSegLine(s.c.p0, s.c.p3) : s);
      i += 1;
    }
  }
  return out;
}
function simplifyRun(run, opts = {}) {
  const tol = Math.max(opts.tolerance != null ? opts.tolerance : 0.5, 1e-6);
  const cornerAngleDeg = opts.cornerAngleDeg != null ? opts.cornerAngleDeg : 30.0;
  const straightLines = !!opts.straightLines;
  const smooth = opts.smooth || 0.0;
  const cuts = [0];
  for (let i = 1; i < run.length; i++) {
    if (run[i].forceCutStart || vcJointTurnDeg(run[i - 1], run[i]) > cornerAngleDeg) {
      cuts.push(i);
    }
  }
  cuts.push(run.length);
  const result = [];
  for (let w = 0; w < cuts.length - 1; w++) {
    const piece = run.slice(cuts[w], cuts[w + 1]);
    if (!piece.length) continue;
    const fitted = vcFitPieceShapePreserving(piece, tol, straightLines, smooth);
    for (let j = 0; j < fitted.length; j++) result.push(fitted[j]);
  }
  return result;
}
function vcNoWorse(originalSp, fittedSp) {
  return fittedSp.nodes.length > originalSp.nodes.length ? originalSp : fittedSp;
}
function simplifySubpath(sp, opts = {}) {
  const pre = vcCollapseStackedCornerNodes(sp, opts, null).sp;
  const segs = vcSubpathSegs(pre);
  const n = segs.length;
  if (n === 0) return pre;
  const cornerAngleDeg = opts.cornerAngleDeg != null ? opts.cornerAngleDeg : 30.0;
  let runSegs = segs;
  if (pre.closed) {
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (segs[i].forceCutStart || vcJointTurnDeg(segs[(i + n - 1) % n], segs[i]) > cornerAngleDeg) {
        k = i;
        break;
      }
    }
    if (k > 0) runSegs = segs.slice(k).concat(segs.slice(0, k));
  }
  const result = simplifyRun(runSegs, opts);
  const s = vcSegsToSubpath(result, pre.closed, sp.id);
  if (!s) return null;
  return opts.straightLines ? s : vcNoWorse(sp, s);
}
function simplifyWith(obj, opts = {}) {
  if (!obj || !obj.subs || obj.img) return obj;
  const subs = [];
  for (let i = 0; i < obj.subs.length; i++) {
    const s = simplifySubpath(obj.subs[i], opts);
    if (s && s.nodes && s.nodes.length >= 2) subs.push(s);
  }
  if (!subs.length) return obj;
  return {
    ...obj,
    subs
  };
}
function vcSimplifyRuns(sp, picked, opts) {
  const m = sp.nodes.length;
  const n = picked.length;
  const inside = a => sp.closed && a === 0 && picked[n - 1] && picked[0] || a > 0 && a < n && picked[a - 1] && picked[a];
  let start = 0;
  for (let a = 0; a < m; a++) {
    if (!inside(a)) {
      start = a;
      break;
    }
  }
  const anchors = [cl(sp.nodes[start])];
  const kept = [[start, 0]];
  const runs = [];
  let k = 0;
  while (k < n) {
    const j = (start + k) % n;
    if (!picked[j]) {
      const next = (j + 1) % m;
      if (k + 1 < n || !sp.closed) {
        kept.push([next, anchors.length]);
        anchors.push(cl(sp.nodes[next]));
      }
      k += 1;
      continue;
    }
    let len = 0;
    while (k + len < n && picked[(start + k + len) % n]) len++;
    const run = [];
    for (let i = k; i < k + len; i++) {
      const segIdx = (start + i) % n;
      run.push({
        c: vcSubpathSegment(sp, segIdx),
        line: vcSubpathSegIsLine(sp, segIdx),
        forceCutStart: !!(sp.nodes[segIdx] && sp.nodes[segIdx]._forceCut)
      });
    }
    const end = (start + k + len) % m;
    const fitted = simplifyRun(run, opts);
    const keepOriginal = !fitted.length || !opts.straightLines && fitted.length > run.length;
    const first = anchors.length - 1;
    if (keepOriginal) {
      for (let i = k + 1; i < k + len; i++) {
        anchors.push(cl(sp.nodes[(start + i) % m]));
      }
    } else {
      const a = anchors[first];
      anchors[first] = vcWithHandle(a, true, fitted[0].line ? {
        x: a.x,
        y: a.y
      } : fitted[0].c.p1);
      for (let w = 0; w < fitted.length - 1; w++) {
        const p = fitted[w + 1].c.p0;
        const hIn = fitted[w].line ? p : fitted[w].c.p2;
        const hOut = fitted[w + 1].line ? p : fitted[w + 1].c.p1;
        anchors.push(vcAnchorWithHandles(p, hIn, hOut));
      }
    }
    const runSegLen = keepOriginal ? run.length : fitted.length;
    for (let rs = first; rs < first + runSegLen; rs++) runs.push(rs);
    const endSeg = !keepOriginal && fitted.length ? fitted[fitted.length - 1] : null;
    if (sp.closed && k + len === n) {
      if (endSeg) {
        anchors[0] = vcWithHandle(anchors[0], false, endSeg.line ? {
          x: anchors[0].x,
          y: anchors[0].y
        } : endSeg.c.p2);
      }
    } else {
      const a = cl(sp.nodes[end]);
      kept.push([end, anchors.length]);
      anchors.push(endSeg ? vcWithHandle(a, false, endSeg.line ? {
        x: a.x,
        y: a.y
      } : endSeg.c.p2) : a);
    }
    k += len;
  }
  return [{
    ...sp,
    nodes: anchors
  }, runs, kept];
}
function simplifyPart(obj, selectedSegSet, opts = {}) {
  const runs = [];
  const anchorMap = new Map();
  const subs = [];
  for (let si = 0; si < obj.subs.length; si++) {
    const sp = obj.subs[si];
    const n = vcSubpathSegCount(sp);
    const picked = [];
    for (let i = 0; i < n; i++) picked.push(selectedSegSet.has(si + ':' + i));
    const ni = subs.length;
    if (!picked.includes(true)) {
      for (let ai = 0; ai < sp.nodes.length; ai++) anchorMap.set(si + ':' + ai, [ni, ai]);
      subs.push(sp);
    } else if (!picked.includes(false)) {
      const s = simplifySubpath(sp, opts);
      if (s && s.nodes && s.nodes.length >= 2) {
        const sc = vcSubpathSegCount(s);
        for (let i = 0; i < sc; i++) runs.push([ni, i]);
        subs.push(s);
      }
    } else {
      const [s, segs, kept] = vcSimplifyRuns(sp, picked, opts);
      segs.forEach(i => runs.push([ni, i]));
      kept.forEach(([oldIdx, newIdx]) => anchorMap.set(si + ':' + oldIdx, [ni, newIdx]));
      subs.push(s);
    }
  }
  return {
    obj: {
      ...obj,
      subs
    },
    segments: runs,
    anchors: anchorMap
  };
}
function vcReverseCubicSeg(seg) {
  const c = seg.c;
  return {
    c: {
      p0: {
        x: c.p3.x,
        y: c.p3.y
      },
      p1: {
        x: c.p2.x,
        y: c.p2.y
      },
      p2: {
        x: c.p1.x,
        y: c.p1.y
      },
      p3: {
        x: c.p0.x,
        y: c.p0.y
      }
    },
    line: !!seg.line,
    forceCutStart: false
  };
}
function vcReverseSegList(segs) {
  const out = new Array(segs.length);
  for (let i = 0; i < segs.length; i++) {
    out[i] = vcReverseCubicSeg(segs[segs.length - 1 - i]);
  }
  return out;
}
function vcSimplifyOpenChainNodes(chainNodes, opts, minSegs = 1) {
  if (!chainNodes || chainNodes.length < 2) return [];
  const origSegs = vcSubpathSegs({
    id: 'ch',
    closed: false,
    nodes: chainNodes
  });
  if (origSegs.length <= minSegs) return origSegs;
  const interiorIds = new Set();
  for (let i = 1; i < chainNodes.length - 1; i++) interiorIds.add(chainNodes[i].id);
  const tempSp = {
    id: 'ch',
    closed: false,
    nodes: chainNodes.map(cl)
  };
  const pre = interiorIds.size >= 2 ? vcCollapseStackedCornerNodes(tempSp, opts, interiorIds).sp : tempSp;
  pre.nodes[0].x = chainNodes[0].x;
  pre.nodes[0].y = chainNodes[0].y;
  pre.nodes[pre.nodes.length - 1].x = chainNodes[chainNodes.length - 1].x;
  pre.nodes[pre.nodes.length - 1].y = chainNodes[chainNodes.length - 1].y;
  const runSegs = vcSubpathSegs(pre);
  const fitted = simplifyRun(runSegs, opts);
  if (!fitted.length || fitted.length < minSegs) return origSegs;
  if (!opts.straightLines && fitted.length > origSegs.length) return origSegs;
  fitted[0].c.p0 = {
    x: chainNodes[0].x,
    y: chainNodes[0].y
  };
  if (fitted[0].line) fitted[0].c.p1 = {
    x: chainNodes[0].x,
    y: chainNodes[0].y
  };
  const last = fitted[fitted.length - 1];
  last.c.p3 = {
    x: chainNodes[chainNodes.length - 1].x,
    y: chainNodes[chainNodes.length - 1].y
  };
  if (last.line) last.c.p2 = {
    x: last.c.p3.x,
    y: last.c.p3.y
  };
  return fitted;
}

/* =========================================================================
   TOPOLOGY-PRESERVING SHARED-BOUNDARY SIMPLIFY (ANTI-GAP PLANAR PARTITION):
   Mendeteksi vertex bersama (klaster spasial 3x3), menormalisasi jembatan
   micro-arc 1-vs-2 segmen, mengunci titik simpang topologi (junctions),
   dan menyederhanakan setiap rantai batas bersama satu kali secara kanonik
   lalu menyinkronkannya ke kedua objek yang bersebelahan (maju & mundur).
   ========================================================================= */
/* =========================================================================
   TOPOLOGY-PRESERVING SHARED-BOUNDARY SIMPLIFY (ANTI-GAP PLANAR PARTITION):
   Mendeteksi vertex bersama (klaster spasial 3x3), menormalisasi jembatan
   micro-arc 1-vs-2 segmen, mengunci titik simpang topologi (junctions),
   dan menyederhanakan setiap rantai batas bersama satu kali secara kanonik
   lalu menyinkronkannya ke kedua objek yang bersebelahan (maju & mundur).
   ========================================================================= */
function vcTopologicalSimplifyObjects(allObjects, targetIds, opts) {
  const oiToDocIdx = [];
  allObjects.forEach((o, docIdx) => {
    if (!o || o.hidden || o.locked || o.img || o.isFrameBg || o.isAutoFrame || !o.subs || !o.subs.length) return;
    oiToDocIdx.push(docIdx);
  });
  if (!oiToDocIdx.length) return null;
  const eps = 0.03,
    cell = eps * 2;
  const grid = new Map(),
    clusters = [];
  const getCluster = pt => {
    const gx = Math.floor(pt.x / cell),
      gy = Math.floor(pt.y / cell);
    let bestC = -1,
      bestD = eps;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const b = grid.get(gx + dx + ',' + (gy + dy));
        if (!b) continue;
        for (const cid of b) {
          const c = clusters[cid];
          const d = Math.hypot(pt.x - c.x, pt.y - c.y);
          if (d <= bestD) {
            bestD = d;
            bestC = cid;
          }
        }
      }
    }
    if (bestC < 0) {
      bestC = clusters.length;
      clusters.push({
        id: bestC,
        x: pt.x,
        y: pt.y,
        objs: new Set(),
        subRefs: new Set(),
        occCount: 0
      });
      const k = gx + ',' + gy;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(bestC);
    }
    return bestC;
  };
  const workSubs = oiToDocIdx.map((docIdx, oi) => allObjects[docIdx].subs.map((sp, si) => ({
    id: sp.id,
    closed: !!sp.closed,
    nodes: sp.nodes.map(nd => {
      const copy = cl(nd),
        cid = getCluster(copy);
      clusters[cid].objs.add(oi);
      clusters[cid].subRefs.add(oi + ':' + si);
      copy._cid = cid;
      return copy;
    })
  })));
  workSubs.forEach((subs, oi) => {
    const objId = allObjects[oiToDocIdx[oi]].id;
    subs.forEach(sp => {
      const minKeep = sp.closed ? 3 : 2;
      if (sp.nodes.length <= minKeep) return;
      let ch = true;
      while (ch && sp.nodes.length > minKeep) {
        ch = false;
        const n = sp.nodes.length,
          limit = sp.closed ? n : n - 1;
        for (let i = 0; i < limit; i++) {
          const j = (i + 1) % n,
            a = sp.nodes[i],
            b = sp.nodes[j];
          if (!targetIds.has(objId) && ![...clusters[a._cid].objs].some(x => targetIds.has(allObjects[oiToDocIdx[x]].id))) continue;
          if (a._cid === b._cid && dist(a, b) <= eps && !hasH(a, a.handleOut) && !hasH(b, b.handleIn)) {
            a.handleOut = b.handleOut;
            sp.nodes.splice(j, 1);
            ch = true;
            break;
          }
        }
      }
    });
  });
  const uKey = (c1, c2) => c1 < c2 ? c1 + '|' + c2 : c2 + '|' + c1;
  const directEdgeMap = new Map();
  workSubs.forEach((subs, oi) => subs.forEach((sp, si) => {
    const n = sp.nodes.length,
      cnt = sp.closed ? n : n - 1;
    for (let i = 0; i < cnt; i++) {
      const a = sp.nodes[i],
        b = sp.nodes[(i + 1) % n];
      if (a._cid === b._cid) continue;
      const uk = uKey(a._cid, b._cid);
      if (!directEdgeMap.has(uk)) directEdgeMap.set(uk, []);
      directEdgeMap.get(uk).push({
        oi,
        si,
        a,
        b
      });
    }
  }));
  workSubs.forEach((subs, oi) => {
    const objId = allObjects[oiToDocIdx[oi]].id;
    subs.forEach((sp, si) => {
      const minKeep = sp.closed ? 3 : 2;
      if (sp.nodes.length <= minKeep) return;
      let changed = true;
      while (changed && sp.nodes.length > minKeep) {
        changed = false;
        const n = sp.nodes.length;
        for (let i = 0; i < n; i++) {
          if (!sp.closed && (i === 0 || i === n - 1)) continue;
          const mNode = sp.nodes[i];
          if (clusters[mNode._cid].objs.size > 1) continue;
          const pv = sp.nodes[(i - 1 + n) % n],
            nx = sp.nodes[(i + 1) % n];
          if (pv._cid === nx._cid || dist(pv, mNode) + dist(mNode, nx) > 3.5) continue;
          const matches = directEdgeMap.get(uKey(pv._cid, nx._cid));
          const ref = matches && matches.find(e => e.oi !== oi || e.si !== si);
          if (ref) {
            const refObjId = allObjects[oiToDocIdx[ref.oi]].id;
            if (!targetIds.has(objId) && !targetIds.has(refObjId)) continue;
            if (ref.a._cid === pv._cid) {
              pv.handleOut = ref.a.handleOut ? {
                ...ref.a.handleOut
              } : null;
              nx.handleIn = ref.b.handleIn ? {
                ...ref.b.handleIn
              } : null;
            } else {
              pv.handleOut = ref.b.handleIn ? {
                ...ref.b.handleIn
              } : null;
              nx.handleIn = ref.a.handleOut ? {
                ...ref.a.handleOut
              } : null;
            }
            sp.nodes.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
    });
  });
  clusters.forEach(c => {
    c.objs.clear();
    c.subRefs.clear();
    c.occCount = 0;
  });
  workSubs.forEach((subs, oi) => subs.forEach((sp, si) => sp.nodes.forEach(nd => {
    const c = clusters[nd._cid];
    c.objs.add(oi);
    c.subRefs.add(oi + ':' + si);
    c.occCount++;
  })));
  const activeCluster = c => {
    for (const oi of c.objs) if (targetIds.has(allObjects[oiToDocIdx[oi]].id)) return true;
    return false;
  };
  workSubs.forEach(subs => subs.forEach(sp => sp.nodes.forEach(nd => {
    const c = clusters[nd._cid];
    if (c.subRefs.size > 1 && activeCluster(c)) {
      const dx = c.x - nd.x,
        dy = c.y - nd.y;
      nd.x = c.x;
      nd.y = c.y;
      if (nd.handleIn) {
        nd.handleIn.x += dx;
        nd.handleIn.y += dy;
      }
      if (nd.handleOut) {
        nd.handleOut.x += dx;
        nd.handleOut.y += dy;
      }
    }
  })));
  const edgeBuckets = new Map();
  workSubs.forEach((subs, oi) => subs.forEach((sp, si) => {
    const n = sp.nodes.length,
      cnt = sp.closed ? n : n - 1;
    sp._segInfo = new Array(cnt);
    for (let i = 0; i < cnt; i++) {
      const a = sp.nodes[i],
        b = sp.nodes[(i + 1) % n];
      const seg = vcSubpathSegment(sp, i),
        mid = vcEvalCubic(seg, 0.5);
      const info = {
        oi,
        si,
        i,
        cA: a._cid,
        cB: b._cid,
        mid,
        partner: null,
        locked: false
      };
      sp._segInfo[i] = info;
      if (a._cid === b._cid) {
        info.locked = true;
        continue;
      }
      const uk = uKey(a._cid, b._cid);
      if (!edgeBuckets.has(uk)) edgeBuckets.set(uk, []);
      edgeBuckets.get(uk).push(info);
    }
  }));
  for (const [, list] of edgeBuckets.entries()) {
    if (list.length === 2) {
      const e0 = list[0],
        e1 = list[1];
      if ((e0.oi !== e1.oi || e0.si !== e1.si) && dist(e0.mid, e1.mid) <= 1.5) {
        const relDir = e0.cA === e1.cB && e0.cB === e1.cA ? -1 : 1;
        e0.partner = {
          oi: e1.oi,
          si: e1.si,
          i: e1.i,
          relDir
        };
        e1.partner = {
          oi: e0.oi,
          si: e0.si,
          i: e0.i,
          relDir
        };
      }
    } else if (list.length > 2) {
      list.forEach(e => {
        e.locked = true;
      });
    }
  }
  const areSegsChainContinuous = (sp, prevSegIdx, nextSegIdx, nodeCid) => {
    const sPrev = sp._segInfo[prevSegIdx],
      sNext = sp._segInfo[nextSegIdx];
    if (!sPrev || !sNext || sPrev.locked || sNext.locked) return false;
    const clRef = clusters[nodeCid];
    if (!sPrev.partner && !sNext.partner) return clRef.subRefs.size === 1 && clRef.occCount === 1;
    if (sPrev.partner && sNext.partner) {
      const p1 = sPrev.partner,
        p2 = sNext.partner;
      if (p1.oi !== p2.oi || p1.si !== p2.si || p1.relDir !== p2.relDir) return false;
      if (clRef.subRefs.size !== 2 || clRef.occCount !== 2) return false;
      const partSp = workSubs[p1.oi][p1.si],
        m2 = partSp._segInfo.length;
      if (p1.relDir === -1) {
        if (!partSp.closed && p1.i === 0) return false;
        return (p1.i - 1 + m2) % m2 === p2.i;
      } else {
        if (!partSp.closed && p1.i === m2 - 1) return false;
        return (p1.i + 1) % m2 === p2.i;
      }
    }
    return false;
  };
  const juncClusters = new Set();
  workSubs.forEach(subs => subs.forEach(sp => {
    const n = sp.nodes.length,
      cnt = sp._segInfo.length;
    const isJunc = new Array(n).fill(false);
    if (sp.closed && n <= 3) {
      for (let i = 0; i < n; i++) {
        isJunc[i] = true;
        juncClusters.add(sp.nodes[i]._cid);
      }
    } else if (!sp.closed && n > 0) {
      isJunc[0] = true;
      isJunc[n - 1] = true;
      juncClusters.add(sp.nodes[0]._cid);
      juncClusters.add(sp.nodes[n - 1]._cid);
    }
    for (let i = 0; i < n; i++) {
      if (isJunc[i]) continue;
      if (!areSegsChainContinuous(sp, (i - 1 + cnt) % cnt, i, sp.nodes[i]._cid)) {
        isJunc[i] = true;
        juncClusters.add(sp.nodes[i]._cid);
      }
    }
    sp._isJunc = isJunc;
  }));
  workSubs.forEach(subs => subs.forEach(sp => sp.nodes.forEach((nd, i) => {
    if (juncClusters.has(nd._cid)) sp._isJunc[i] = true;
  })));
  workSubs.forEach(subs => subs.forEach(sp => {
    if (!sp.closed || sp._isJunc.includes(true) || !sp._segInfo.length) return;
    const p0 = sp._segInfo[0].partner;
    if (p0) {
      let bestIdx = 0;
      for (let i = 1; i < sp.nodes.length; i++) {
        const a = sp.nodes[i],
          b = sp.nodes[bestIdx];
        if (a.x < b.x - 1e-9 || Math.abs(a.x - b.x) <= 1e-9 && a.y < b.y) bestIdx = i;
      }
      const targetCid = sp.nodes[bestIdx]._cid;
      sp._isJunc[bestIdx] = true;
      const partSp = workSubs[p0.oi][p0.si];
      const partIdx = partSp.nodes.findIndex(nd => nd._cid === targetCid);
      if (partIdx >= 0) partSp._isJunc[partIdx] = true;
    }
  }));
  workSubs.forEach(subs => subs.forEach(sp => {
    sp._juncCount = sp._isJunc.filter(Boolean).length;
  }));
  const sharedChainCache = new Map();
  const getChainKey = (oi1, si1, startSeg1, len, oi2, si2, startSeg2, relDir) => {
    const m2 = workSubs[oi2][si2]._segInfo.length;
    const endSeg2 = relDir === -1 ? (startSeg2 - (len - 1) + m2 * 4) % m2 : startSeg2;
    const k1 = oi1 + ':' + si1 + ':' + startSeg1 + ':' + len;
    const k2 = oi2 + ':' + si2 + ':' + endSeg2 + ':' + len;
    return k1 < k2 ? {
      key: k1 + '<->' + k2,
      canonical: true
    } : {
      key: k2 + '<->' + k1,
      canonical: false
    };
  };
  const newSubsByOi = workSubs.map((subs, oi) => subs.map((sp, si) => {
    const docIdx = oiToDocIdx[oi],
      objId = allObjects[docIdx].id,
      isObjTarget = targetIds.has(objId);
    const n = sp.nodes.length,
      cnt = sp._segInfo.length;
    if (cnt === 0) return sp;
    const juncIndices = [];
    for (let i = 0; i < n; i++) if (sp._isJunc[i]) juncIndices.push(i);
    if (juncIndices.length === 0) {
      if (!isObjTarget) return allObjects[docIdx].subs[si];
      const s = simplifySubpath(sp, opts);
      return s && s.nodes && s.nodes.length >= 3 ? s : sp;
    }
    const numChains = sp.closed ? juncIndices.length : juncIndices.length - 1;
    const outSegs = [];
    let anyChainSimplified = false;
    for (let cIdx = 0; cIdx < numChains; cIdx++) {
      const startNodeIdx = juncIndices[cIdx],
        endNodeIdx = juncIndices[(cIdx + 1) % juncIndices.length];
      const chainNodes = [sp.nodes[startNodeIdx]],
        chainSegIndices = [];
      let cur = startNodeIdx,
        guard = 0;
      while (guard++ <= n) {
        chainSegIndices.push(cur);
        cur = (cur + 1) % n;
        chainNodes.push(sp.nodes[cur]);
        if (cur === endNodeIdx) break;
      }
      const firstSegInfo = sp._segInfo[chainSegIndices[0]],
        partner = firstSegInfo.partner;
      const partnerObjId = partner ? allObjects[oiToDocIdx[partner.oi]].id : null;
      const shouldSimplifyChain = !firstSegInfo.locked && (isObjTarget || partnerObjId && targetIds.has(partnerObjId));
      if (!shouldSimplifyChain) {
        for (const sIdx of chainSegIndices) {
          outSegs.push({
            c: vcSubpathSegment(sp, sIdx),
            line: vcSubpathSegIsLine(sp, sIdx)
          });
        }
        continue;
      }
      anyChainSimplified = true;
      let minSegs = sp.closed && juncIndices.length === 1 ? 3 : sp.closed && juncIndices.length === 2 ? 2 : 1;
      if (partner) {
        const partSp = workSubs[partner.oi][partner.si];
        const pMin = partSp.closed && partSp._juncCount === 1 ? 3 : partSp.closed && partSp._juncCount === 2 ? 2 : 1;
        minSegs = Math.max(minSegs, pMin);
      }
      if (!partner) {
        for (const f of vcSimplifyOpenChainNodes(chainNodes, opts, minSegs)) outSegs.push(f);
      } else {
        const {
          key,
          canonical
        } = getChainKey(oi, si, chainSegIndices[0], chainSegIndices.length, partner.oi, partner.si, partner.i, partner.relDir);
        let fitted;
        if (sharedChainCache.has(key)) {
          const cached = sharedChainCache.get(key);
          fitted = !canonical && partner.relDir === -1 ? vcReverseSegList(cached) : cached;
        } else {
          let canNodes = chainNodes;
          if (!canonical && partner.relDir === -1) {
            canNodes = chainNodes.slice().reverse().map(nd => ({
              ...nd,
              handleIn: nd.handleOut ? {
                ...nd.handleOut
              } : null,
              handleOut: nd.handleIn ? {
                ...nd.handleIn
              } : null
            }));
          }
          const canFitted = vcSimplifyOpenChainNodes(canNodes, opts, minSegs);
          sharedChainCache.set(key, canFitted);
          fitted = !canonical && partner.relDir === -1 ? vcReverseSegList(canFitted) : canFitted;
        }
        for (const f of fitted) outSegs.push(f);
      }
    }
    const anyVertexTouched = sp.nodes.some(nd => clusters[nd._cid].subRefs.size > 1 && activeCluster(clusters[nd._cid]));
    if (!anyChainSimplified && !anyVertexTouched) return allObjects[docIdx].subs[si];
    const built = vcSegsToSubpath(outSegs, sp.closed, sp.id);
    if (!built || built.nodes.length < (sp.closed ? 3 : 2)) return allObjects[docIdx].subs[si];
    return built;
  }));
  return {
    oiToDocIdx,
    newSubsByOi
  };
}
function simplifyDoc(doc, params = {}, selObjsSet = null, selNodesSet = null) {
  const hasSelObjs = selObjsSet && selObjsSet.size > 0;
  const targetObjs = doc.objects.filter(o => !o.hidden && !o.locked && !o.img && !o.isFrameBg && !o.isAutoFrame && (!hasSelObjs || selObjsSet.has(o.id)));
  const bb = targetObjs.length ? docBounds({
    objects: targetObjs
  }) : null;
  const selSize = bb ? Math.max(bb[2] - bb[0], bb[3] - bb[1]) : 0.0;
  let level = null;
  if (params.auto) {
    level = autoSimplifyLevel(selSize);
  } else if (params.level != null && Number.isFinite(+params.level)) {
    level = Math.max(0.0, Math.min(100.0, Math.round(+params.level)));
  }
  const rawTol = level != null ? simplifyLevelTolerance(level) : params.tolerance != null ? +params.tolerance : 0.5;
  const tolerance = Math.max(1e-4, Math.min(1e4, Number.isFinite(rawTol) ? rawTol : 0.5));
  const cornerAngleDeg = params.cornerAngle != null ? Math.max(0.0, Math.min(180.0, +params.cornerAngle)) : params.angleThreshold != null ? Math.max(0.0, Math.min(180.0, 180.0 - +params.angleThreshold)) : 30.0;
  const opts = {
    tolerance,
    cornerAngleDeg,
    straightLines: !!params.straightLines,
    smooth: params.smooth != null ? +params.smooth : 0.0
  };
  const whole = !!params.wholePaths;
  const targetIds = new Set(targetObjs.map(o => o.id));
  const hasPartialNodes = !whole && selNodesSet && selNodesSet.size > 0;
  let before = 0,
    after = 0,
    anyChanged = false;
  const nextSelNodes = new Set();
  const changedIds = [];

  /* Mode Objek Utuh (per objek maupun seluruh objek sekaligus):
     Gunakan Topological Shared-Boundary Simplify agar batas bersama antar objek
     disinkronkan secara identik tanpa pernah memunculkan celah (gap) */
  if (!hasPartialNodes) {
    const topo = vcTopologicalSimplifyObjects(doc.objects, targetIds, opts);
    if (!topo) {
      return {
        doc,
        changed: false,
        ids: [],
        before: 0,
        after: 0,
        level: level != null ? level : autoSimplifyLevel(selSize),
        tolerance,
        nextSelNodes
      };
    }
    const docIdxToOi = new Map();
    topo.oiToDocIdx.forEach((docIdx, oi) => docIdxToOi.set(docIdx, oi));
    const objects = doc.objects.map((o, docIdx) => {
      const isTarget = targetIds.has(o.id);
      const nb = o.subs ? o.subs.reduce((s, sp) => s + sp.nodes.length, 0) : 0;
      if (isTarget) before += nb;
      if (!docIdxToOi.has(docIdx)) {
        if (isTarget) after += nb;
        return o;
      }
      const oi = docIdxToOi.get(docIdx);
      const nextSubs = topo.newSubsByOi[oi];
      const na = nextSubs.reduce((s, sp) => s + sp.nodes.length, 0);
      if (isTarget) after += na;
      const same = JSON.stringify(nextSubs.map(sp => ({
        closed: sp.closed,
        nodes: sp.nodes.map(n => [n.x, n.y, n.handleIn, n.handleOut, n.type])
      }))) === JSON.stringify(o.subs.map(sp => ({
        closed: sp.closed,
        nodes: sp.nodes.map(n => [n.x, n.y, n.handleIn, n.handleOut, n.type])
      })));
      if (!same) {
        anyChanged = true;
        changedIds.push(o.id);
        return {
          ...o,
          subs: nextSubs
        };
      }
      return o;
    });
    return {
      doc: anyChanged ? {
        ...doc,
        objects
      } : doc,
      changed: anyChanged,
      ids: changedIds,
      before,
      after,
      level: level != null ? level : autoSimplifyLevel(selSize),
      tolerance,
      nextSelNodes
    };
  }

  /* Mode Seleksi Sebagian Node (Node Tool): lindungi node yang berbagi koordinat dengan objek lain yang tidak ikut dipilih */
  const sharedGrid = new Map(),
    sharedEps = 0.03,
    sharedCell = sharedEps * 2;
  doc.objects.forEach(o => {
    if (o.hidden || o.locked || o.img || o.isFrameBg || o.isAutoFrame || !o.subs) return;
    o.subs.forEach(sp => sp.nodes.forEach(nd => {
      const gx = Math.floor(nd.x / sharedCell),
        gy = Math.floor(nd.y / sharedCell);
      const k = gx + ',' + gy;
      if (!sharedGrid.has(k)) sharedGrid.set(k, []);
      sharedGrid.get(k).push({
        objId: o.id,
        id: nd.id,
        x: nd.x,
        y: nd.y
      });
    }));
  });
  const isPinnedSharedNode = (nd, objId) => {
    const gx = Math.floor(nd.x / sharedCell),
      gy = Math.floor(nd.y / sharedCell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const b = sharedGrid.get(gx + dx + ',' + (gy + dy));
        if (!b) continue;
        for (const item of b) {
          if (item.objId !== objId && Math.hypot(nd.x - item.x, nd.y - item.y) <= sharedEps) return true;
        }
      }
    }
    return false;
  };
  const objects = doc.objects.map(o => {
    if (!targetIds.has(o.id)) return o;
    const nb = o.subs.reduce((s, sp) => s + sp.nodes.length, 0);
    before += nb;
    let workObj = o;
    let effSelNodes = selNodesSet;
    if (!whole && selNodesSet && selNodesSet.size > 0) {
      const nextSelSet = new Set();
      o.subs.forEach(sp => sp.nodes.forEach(nd => {
        if (selNodesSet.has(nd.id) && !isPinnedSharedNode(nd, o.id)) nextSelSet.add(nd.id);
      }));
      const preSubs = o.subs.map(sp => {
        const cRes = vcCollapseStackedCornerNodes(sp, opts, nextSelSet);
        cRes.mergedIds.forEach(id => nextSelSet.add(id));
        return cRes.sp;
      });
      workObj = {
        ...o,
        subs: preSubs
      };
      effSelNodes = new Set([...selNodesSet, ...nextSelSet]);
    }
    const pickedSegs = new Set();
    const selAnchorPairs = [];
    if (!whole && effSelNodes && effSelNodes.size > 0) {
      workObj.subs.forEach((sp, si) => {
        sp.nodes.forEach((nd, ai) => {
          if (effSelNodes.has(nd.id)) selAnchorPairs.push([si, ai]);
        });
        const sc = vcSubpathSegCount(sp),
          m = sp.nodes.length;
        for (let i = 0; i < sc; i++) {
          const a = sp.nodes[i],
            b = sp.nodes[(i + 1) % m];
          if (effSelNodes.has(a.id) && effSelNodes.has(b.id) && !isPinnedSharedNode(a, o.id) && !isPinnedSharedNode(b, o.id)) {
            pickedSegs.add(si + ':' + i);
          }
        }
      });
    }
    let nextObj;
    if (pickedSegs.size > 0) {
      const part = simplifyPart(workObj, pickedSegs, opts);
      nextObj = part.obj;
      const keptRefs = [];
      selAnchorPairs.forEach(([si, ai]) => {
        const mapped = part.anchors.get(si + ':' + ai);
        if (mapped) keptRefs.push(mapped);
      });
      part.segments.forEach(([si, i]) => {
        const sp = nextObj.subs[si];
        const m = sp ? Math.max(1, sp.nodes.length) : 1;
        keptRefs.push([si, i], [si, (i + 1) % m]);
      });
      const totalNextNodes = nextObj.subs.reduce((s, sp) => s + sp.nodes.length, 0);
      const uqNodes = new Set();
      keptRefs.forEach(([si, ai]) => {
        const nd = nextObj.subs[si] && nextObj.subs[si].nodes[ai];
        if (nd) uqNodes.add(nd.id);
      });
      if (uqNodes.size < totalNextNodes) {
        uqNodes.forEach(id => nextSelNodes.add(id));
      }
    } else if (!whole && selNodesSet && selNodesSet.size > 0 && workObj !== o) {
      nextObj = workObj;
      workObj.subs.forEach(sp => sp.nodes.forEach(nd => {
        if (effSelNodes.has(nd.id)) nextSelNodes.add(nd.id);
      }));
    } else {
      nextObj = simplifyWith(workObj, opts);
    }
    const na = nextObj.subs.reduce((s, sp) => s + sp.nodes.length, 0);
    after += na;
    const same = JSON.stringify(nextObj.subs.map(sp => ({
      closed: sp.closed,
      nodes: sp.nodes.map(n => [n.x, n.y, n.handleIn, n.handleOut, n.type])
    }))) === JSON.stringify(o.subs.map(sp => ({
      closed: sp.closed,
      nodes: sp.nodes.map(n => [n.x, n.y, n.handleIn, n.handleOut, n.type])
    })));
    if (!same) {
      anyChanged = true;
      changedIds.push(o.id);
      return nextObj;
    }
    return o;
  });
  return {
    doc: anyChanged ? {
      ...doc,
      objects
    } : doc,
    changed: anyChanged,
    ids: changedIds,
    before,
    after,
    level: level != null ? level : autoSimplifyLevel(selSize),
    tolerance,
    nextSelNodes
  };
}

/* Helper untuk tombol "Bersihkan Semua" pada panel Inspeksi Geometri (tanpa autoSimplify lama) */
/* Helper untuk tombol "Bersihkan Semua" pada panel Inspeksi Geometri (tanpa autoSimplify lama) */
function fixAllAnomalies(doc, opt = {}) {
  let cur = doc;
  for (let pass = 0; pass < 4; pass++) {
    const insp = detectAnomalies(cur, opt);
    const all = [...insp.clusteredCorners, ...insp.collinearNodes, ...insp.facetedCurves, ...insp.denseArcNodes, ...insp.wobblyLines];
    if (!all.length) break;
    let prev = cur;
    for (const anom of all) {
      cur = fixAnomaly(cur, anom, opt);
    }
    if (cur === prev) break;
  }
  return cur;
}

/* 11. Quick Fix untuk satu anomali (berbasis ID; mengembalikan doc yang sama bila tidak ada perubahan) */
/* 11. Quick Fix untuk satu anomali (berbasis ID; mengembalikan doc yang sama bila tidak ada perubahan) */
function fixAnomaly(doc, anom, opt = {}) {
  if (!anom || !anom.objId || !anom.subId) return doc;
  const tol = opt.tol || 1.0;
  let changed = false;
  const objects = doc.objects.map(o => {
    if (o.id !== anom.objId) return o;
    const subs = o.subs.map(sp => {
      if (sp.id !== anom.subId) return sp;
      const closed = sp.closed,
        minKeep = closed ? 3 : 2;
      let nodes = null;
      if (anom.type === 'corner_cluster') nodes = collapseClusters(sp.nodes.map(cl), [anom]);else if (anom.type === 'collinear') {
        if (sp.nodes.length > minKeep && sp.nodes.some(n => n.id === anom.nodeId)) nodes = sp.nodes.filter(n => n.id !== anom.nodeId).map(cl);
      } else if (anom.type === 'faceted' || anom.type === 'dense_arc') nodes = refitChain(sp.nodes, closed, anom.nodeIds, tol);else if (anom.type === 'wobbly') {
        const have = new Set(sp.nodes.map(n => n.id));
        if (anom.nodeIds.every(id => have.has(id))) {
          const drop = new Set(anom.nodeIds.slice(1, -1));
          nodes = sp.nodes.filter(n => !drop.has(n.id)).map(cl);
        }
      }
      if (!nodes || nodes.length < minKeep || nodes.length >= sp.nodes.length) return sp;
      nodes.forEach(nd => {
        if (!nd.handleIn && !nd.handleOut) nd.type = 'corner';
      });
      changed = true;
      return {
        ...sp,
        nodes
      };
    });
    return changed ? {
      ...o,
      subs
    } : o;
  });
  return changed ? {
    ...doc,
    objects
  } : doc;
}

/* =========================================================================
   MESIN MULTI-FORMAT: IMPOR & EKSPOR (.SVG, .AI, .PS, .EPS, .PDF, .PNG, .JPG, .WEBP)
   - Impor PS/EPS/AI: interpreter RPN (stack machine) + CTM affine (sumbu-Y dibalik) + CMYK→sRGB
   - AI modern (%PDF-): ekstrak stream, dekompresi lewat DecompressionStream native
   - Ekspor EPS (DSC EPSF-3.0) / AI (PDF-1.4) menyertakan SVG sumber (base64) agar round-trip Geovanta lossless
   - Ekspor raster: canvas supersampling + matte putih untuk JPG
   ========================================================================= */

export { SIMPLIFY_LEVEL, VC_MAX_REPARAM, VC_MEASURE_LIMIT, simplifyLevelTolerance, autoSimplifyLevel, vcUnit, vcStartTangent, vcEndTangent, vcDedup, vcChordParams, vcBern, vcEvalCubic, vcGenerate, vcMaxError, vcNewton, vcFitSingleFrom, vcFitSingle, vcFitRec, vcFitCubics, vcIsStraight, vcSample, VC_GL5_X, VC_GL5_W, vcCubicSpeedAt, vcGaussArclenInterval, vcMeasuredArclen, vcIsCollinearHandles, vcAnchorWithHandles, vcWithHandle, vcSubpathSegCount, vcSubpathSegment, vcSubpathSegIsLine, vcSubpathSegs, vcSegLine, vcSegsToSubpath, vcTurnDeg, vcJointTurnDeg, vcSmoothPoints, vcRdp, vcCollapseStackedCornerNodes, vcPreSamplePiece, vcJoinSegSamples, vcFitPieceShapePreserving, simplifyRun, vcNoWorse, simplifySubpath, simplifyWith, vcSimplifyRuns, simplifyPart, vcReverseCubicSeg, vcReverseSegList, vcSimplifyOpenChainNodes, vcTopologicalSimplifyObjects, simplifyDoc, fixAllAnomalies, fixAnomaly };
