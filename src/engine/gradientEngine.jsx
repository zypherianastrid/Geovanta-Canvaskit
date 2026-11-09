/**
 * @file src/engine/gradientEngine.jsx
 * @description Mesin interpolasi gradien multi-stop OKLab/sRGB, kompilasi stop, & proyeksi sudut
 */
import { esc, rd, uid } from './vectorPrimitives.jsx';
import { cssToHex } from '../utils/colorParserAndFormatter.jsx';
import { rgb2ok, ok2hex } from '../utils/colorMath.jsx';
import { tightBBox } from './spatialIndexAndHitTest.jsx';

/* opt: { bg:{mode:'transparent'|'solid',color}, area:'board'|'content' } */
/* ---- gradien per objek: o.grad disimpan dalam koordinat dokumen (userSpaceOnUse) supaya ikut translate/scale/rotate; valid selama o.fill masih sama dengan grad.base ---- */
const mapGrad = (g, f, k) => {
  if (!g) return g;
  if (g.type === 'radial') {
    const c = f({
        x: g.cx,
        y: g.cy
      }),
      fc = g.fx != null ? f({
        x: g.fx,
        y: g.fy
      }) : null,
      r = g.r * (k || 1),
      out = {
        ...g,
        cx: c.x,
        cy: c.y,
        r
      };
    if (fc) {
      out.fx = fc.x;
      out.fy = fc.y;
    }
    if (g.handleAng != null) {
      const h = f({
        x: g.cx + Math.cos(g.handleAng) * g.r,
        y: g.cy + Math.sin(g.handleAng) * g.r
      });
      out.handleAng = Math.atan2(h.y - c.y, h.x - c.x);
    }
    return out;
  }
  const a = f({
      x: g.x1,
      y: g.y1
    }),
    b = f({
      x: g.x2,
      y: g.y2
    });
  return {
    ...g,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y
  };
};
const gradOn = o => !!(o && o.grad && o.grad.base === o.fill);
const strokeGradOn = o => !!(o && o.strokeGrad && o.strokeGrad.base === o.stroke);
const gradXml = (g, id, ox = 0, oy = 0) => {
  const r = v => Math.round(v * 1e4) / 1e4,
    sp = g.spread && g.spread !== 'pad' ? ' spreadMethod="' + g.spread + '"' : '';
  const st = g.stops.map(t => '<stop offset="' + r(t.offset) + '" stop-color="' + esc(t.color) + '"' + (t.op != null && t.op !== 1 ? ' stop-opacity="' + r(t.op) + '"' : '') + '/>').join('');
  if (g.type === 'radial') {
    const fx = g.fx != null ? ' fx="' + r(g.fx - ox) + '" fy="' + r(g.fy - oy) + '"' : '';
    return '<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + r(g.cx - ox) + '" cy="' + r(g.cy - oy) + '" r="' + r(g.r) + '"' + fx + sp + '>' + st + '</radialGradient>';
  }
  return '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + r(g.x1 - ox) + '" y1="' + r(g.y1 - oy) + '" x2="' + r(g.x2 - ox) + '" y2="' + r(g.y2 - oy) + '"' + sp + '>' + st + '</linearGradient>';
};
/* ---- Editor gradien tingkat lanjut (v4.9): multi-stop, midpoint, OKLab, focal point, spread ---- */
/* Konversi Hex (#rrggbb) ke OKLab [L, a, b] menggunakan rgb2ok global */
/* ---- Editor gradien tingkat lanjut (v4.9): multi-stop, midpoint, OKLab, focal point, spread ---- */
/* Konversi Hex (#rrggbb) ke OKLab [L, a, b] menggunakan rgb2ok global */
function hex2ok(hex) {
  const h = cssToHex(hex || '#000000');
  return rgb2ok(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
}

/* Sampling warna pada posisi t in [0,1] dari daftar stops (di ruang OKLab) */
/* Sampling warna pada posisi t in [0,1] dari daftar stops (di ruang OKLab) */
function sampleGradAt(stops, t) {
  if (!stops || !stops.length) return {
    color: '#000000',
    op: 1
  };
  const s = stops.slice().sort((a, b) => a.offset - b.offset);
  if (t <= s[0].offset) return {
    color: cssToHex(s[0].color),
    op: s[0].op ?? 1
  };
  if (t >= s[s.length - 1].offset) return {
    color: cssToHex(s[s.length - 1].color),
    op: s[s.length - 1].op ?? 1
  };
  let i = 0;
  while (i < s.length - 2 && t > s[i + 1].offset) i++;
  const a = s[i],
    b = s[i + 1];
  const span = Math.max(1e-6, b.offset - a.offset);
  let u = Math.max(0, Math.min(1, (t - a.offset) / span));
  /* Skew non-linear berdasarkan posisi berlian midpoint m in (0.15, 0.85) */
  const mid = a.mid != null ? Math.max(0.15, Math.min(0.85, a.mid)) : 0.5;
  if (Math.abs(mid - 0.5) > 1e-3 && u > 0 && u < 1) {
    u = Math.pow(u, -Math.LN2 / Math.log(mid));
  }
  const okA = hex2ok(a.color),
    okB = hex2ok(b.color);
  const col = ok2hex(okA[0] + (okB[0] - okA[0]) * u, okA[1] + (okB[1] - okA[1]) * u, okA[2] + (okB[2] - okA[2]) * u);
  const opA = a.op ?? 1,
    opB = b.op ?? 1;
  return {
    color: col,
    op: rd(opA + (opB - opA) * u)
  };
}

/* Kompilasi rawStops (stop kontrol UI) -> stops SVG (dengan sub-sampling OKLab & Midpoint) */
/* Kompilasi rawStops (stop kontrol UI) -> stops SVG (dengan sub-sampling OKLab & Midpoint) */
function compileGradStops(rawStops, useOklab = true) {
  const src = (rawStops || []).slice().sort((a, b) => a.offset - b.offset);
  if (src.length < 2) return src;
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const a = src[i];
    out.push({
      offset: rd(a.offset),
      color: cssToHex(a.color),
      op: a.op == null ? 1 : rd(a.op)
    });
    if (i + 1 < src.length) {
      const b = src[i + 1];
      const okA = hex2ok(a.color),
        okB = hex2ok(b.color);
      const dE = Math.hypot(okA[0] - okB[0], okA[1] - okB[1], okA[2] - okB[2]);
      const mid = a.mid != null ? Math.max(0.15, Math.min(0.85, a.mid)) : 0.5;
      const hasSkew = Math.abs(mid - 0.5) > 0.02;
      /* Sub-sampling jika mode OKLab aktif atau jika midpoint digeser dari 0.5 */
      if (useOklab && dE > 0.04 || hasSkew) {
        const steps = Math.min(7, Math.max(hasSkew ? 4 : 2, Math.ceil(dE / 0.045)));
        for (let k = 1; k < steps; k++) {
          const tLin = k / steps;
          const off = a.offset + (b.offset - a.offset) * tLin;
          const smp = sampleGradAt([a, b], off);
          out.push({
            offset: rd(off),
            color: smp.color,
            op: smp.op
          });
        }
      }
    }
  }
  return out;
}

/* Ramer-Douglas-Peucker (RDP) di ruang 4D (offset, L, a, b) untuk menyederhanakan stop gradien */
/* Ramer-Douglas-Peucker (RDP) di ruang 4D (offset, L, a, b) untuk menyederhanakan stop gradien */
function simplifyGradStops(stops, tol = 0.022) {
  const src = (stops || []).slice().sort((a, b) => a.offset - b.offset);
  if (src.length <= 3) return src.map(s => ({
    ...s,
    id: s.id || uid(),
    mid: 0.5
  }));
  const pts = src.map(s => ({
    s,
    ok: hex2ok(s.color),
    u: s.offset
  }));
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const rdp = (i, j) => {
    if (j - i <= 1) return;
    let maxD = tol,
      maxK = -1;
    const A = pts[i],
      B = pts[j],
      du = B.u - A.u || 1e-6;
    for (let k = i + 1; k < j; k++) {
      const t = (pts[k].u - A.u) / du;
      const dL = pts[k].ok[0] - (A.ok[0] + (B.ok[0] - A.ok[0]) * t);
      const da = pts[k].ok[1] - (A.ok[1] + (B.ok[1] - A.ok[1]) * t);
      const db = pts[k].ok[2] - (A.ok[2] + (B.ok[2] - A.ok[2]) * t);
      const d = Math.hypot(dL, da, db);
      if (d > maxD) {
        maxD = d;
        maxK = k;
      }
    }
    if (maxK >= 0) {
      keep[maxK] = 1;
      rdp(i, maxK);
      rdp(maxK, j);
    }
  };
  rdp(0, pts.length - 1);
  return pts.map((p, i) => ({
    p,
    i
  })).filter(x => keep[x.i]).map(({
    p,
    i
  }) => ({
    id: 'r' + i,
    offset: rd(p.s.offset),
    color: cssToHex(p.s.color),
    op: p.s.op ?? 1,
    mid: 0.5
  }));
}

/* Sederhanakan sampai maksimal maxN stop (cari toleransi RDP terkecil yang memenuhi batas) */
/* Sederhanakan sampai maksimal maxN stop (cari toleransi RDP terkecil yang memenuhi batas) */
function simplifyGradStopsTo(stops, maxN = 8, startTol = 0.012) {
  let tol = startTol,
    out = simplifyGradStops(stops, tol),
    guard = 0;
  while (out.length > maxN && guard++ < 24) {
    tol *= 1.35;
    out = simplifyGradStops(stops, tol);
  }
  return out;
}

/* Normalisasi & Pembangunan Objek Gradien (Memastikan rawStops dan stops sinkron) */
/* Normalisasi & Pembangunan Objek Gradien (Memastikan rawStops dan stops sinkron) */
function ensureGradModel(o, desiredType) {
  const bb = tightBBox(o);
  const x0 = isFinite(bb[0]) ? bb[0] : 0,
    y0 = isFinite(bb[1]) ? bb[1] : 0;
  const x1 = isFinite(bb[2]) ? bb[2] : 100,
    y1 = isFinite(bb[3]) ? bb[3] : 100;
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2,
    r = Math.max(10, Math.hypot(x1 - x0, y1 - y0) / 2);
  const baseCol = o.fill && o.fill !== 'none' ? cssToHex(o.fill) : '#4f46e5';
  if (!o.grad || !gradOn(o)) {
    const rawStops = [{
      id: uid(),
      offset: 0,
      color: baseCol,
      op: 1,
      mid: 0.5
    }, {
      id: uid(),
      offset: 1,
      color: '#a855f7',
      op: 1,
      mid: 0.5
    }];
    const type = desiredType || 'linear';
    const g = type === 'radial' ? {
      type: 'radial',
      base: baseCol,
      cx,
      cy,
      r,
      fx: cx,
      fy: cy,
      oklab: true,
      spread: 'pad',
      rawStops,
      stops: compileGradStops(rawStops, true)
    } : {
      type: 'linear',
      base: baseCol,
      x1: x0,
      y1: cy,
      x2: x1,
      y2: cy,
      oklab: true,
      spread: 'pad',
      rawStops,
      stops: compileGradStops(rawStops, true)
    };
    return {
      ...o,
      fill: baseCol,
      grad: g
    };
  }
  let g = {
    ...o.grad
  };
  if (!g.rawStops || !g.rawStops.length) {
    /* Jika gradien memiliki > 5 stop, sederhanakan otomatis dengan RDP untuk dijadikan rawStops */
    g.rawStops = g.stops.length > 5 ? simplifyGradStopsTo(g.stops, 10, 0.018) : g.stops.map((s, i) => ({
      id: s.id || 's' + i,
      offset: s.offset,
      color: cssToHex(s.color),
      op: s.op ?? 1,
      mid: 0.5
    }));
    g.oklab = true;
  }
  if (desiredType && desiredType !== g.type) {
    if (desiredType === 'radial') {
      const mCx = g.x1 != null ? (g.x1 + g.x2) / 2 : cx;
      const mCy = g.y1 != null ? (g.y1 + g.y2) / 2 : cy;
      const mR = g.x1 != null ? Math.max(5, Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / 2) : r;
      g = {
        ...g,
        type: 'radial',
        cx: rd(mCx),
        cy: rd(mCy),
        r: rd(mR),
        fx: rd(mCx),
        fy: rd(mCy)
      };
    } else {
      const mCx = g.cx != null ? g.cx : cx,
        mCy = g.cy != null ? g.cy : cy,
        mR = g.r || r;
      g = {
        ...g,
        type: 'linear',
        x1: rd(mCx - mR),
        y1: rd(mCy),
        x2: rd(mCx + mR),
        y2: rd(mCy)
      };
    }
  }
  g.stops = compileGradStops(g.rawStops, g.oklab !== false);
  g.base = g.stops[Math.floor(g.stops.length / 2)].color;
  return {
    ...o,
    fill: g.base,
    grad: g
  };
}

/* Update rawStops pada objek & kompilasi ulang ke stops SVG */
/* Update rawStops pada objek & kompilasi ulang ke stops SVG */
function updateGradStops(o, nextRawStops, extraGradProps) {
  if (!o.grad) return o;
  const raw = nextRawStops.slice().sort((a, b) => a.offset - b.offset);
  const g = {
    ...o.grad,
    ...(extraGradProps || {}),
    rawStops: raw
  };
  g.stops = compileGradStops(raw, g.oklab !== false);
  const base = g.stops[Math.floor(g.stops.length / 2)].color;
  g.base = base;
  return {
    ...o,
    fill: base,
    grad: g
  };
}

/* Hitung & atur sudut gradien linear dalam derajat (-180 s/d 180) */
/* Hitung & atur sudut gradien linear dalam derajat (-180 s/d 180) */
function gradAngleDeg(g) {
  if (!g || g.type !== 'linear') return 0;
  return Math.round(Math.atan2(g.y2 - g.y1, g.x2 - g.x1) * 1800 / Math.PI) / 10;
}
function setGradAngleDeg(o, deg) {
  if (!o.grad || o.grad.type !== 'linear') return o;
  const g = o.grad,
    cx = (g.x1 + g.x2) / 2,
    cy = (g.y1 + g.y2) / 2;
  const half = Math.max(5, Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / 2);
  const rad = deg * Math.PI / 180,
    dx = Math.cos(rad) * half,
    dy = Math.sin(rad) * half;
  return {
    ...o,
    grad: {
      ...g,
      x1: rd(cx - dx),
      y1: rd(cy - dy),
      x2: rd(cx + dx),
      y2: rd(cy + dy)
    }
  };
}

/* Proyeksi ortogonal titik kanvas P ke garis gradien -> t in [0, 1] */
/* Proyeksi ortogonal titik kanvas P ke garis gradien -> t in [0, 1] */
function projectPointToGrad(g, pt) {
  if (!g) return 0.5;
  if (g.type === 'radial') {
    const r = Math.max(1e-6, g.r);
    return Math.max(0, Math.min(1, Math.hypot(pt.x - g.cx, pt.y - g.cy) / r));
  }
  const vx = g.x2 - g.x1,
    vy = g.y2 - g.y1,
    L2 = vx * vx + vy * vy;
  if (L2 < 1e-9) return 0.5;
  return Math.max(0, Math.min(1, ((pt.x - g.x1) * vx + (pt.y - g.y1) * vy) / L2));
}

/* Koordinat kanvas (x, y) untuk posisi t in [0, 1] pada garis gizmo gradien */
/* Koordinat kanvas (x, y) untuk posisi t in [0, 1] pada garis gizmo gradien */
function gradPointAt(g, t) {
  if (g.type === 'radial') {
    const ang = g.handleAng || 0;
    return {
      x: g.cx + Math.cos(ang) * g.r * t,
      y: g.cy + Math.sin(ang) * g.r * t
    };
  }
  return {
    x: g.x1 + (g.x2 - g.x1) * t,
    y: g.y1 + (g.y2 - g.y1) * t
  };
}

export { mapGrad, gradOn, strokeGradOn, gradXml, hex2ok, sampleGradAt, compileGradStops, simplifyGradStops, simplifyGradStopsTo, ensureGradModel, updateGradStops, gradAngleDeg, setGradAngleDeg, projectPointToGrad, gradPointAt };
