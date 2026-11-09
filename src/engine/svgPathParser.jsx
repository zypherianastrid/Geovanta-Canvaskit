/**
 * @file src/engine/svgPathParser.jsx
 * @description Parser ketat tata bahasa atribut d path SVG menjadi struktur subpath & node
 */
import { uid, NUM, nums, isFiniteCoord, sub, cross, dot } from './vectorPrimitives.jsx';
import { arcArgs, arcToCubics } from './arcToBezier.jsx';
import { bake } from './transformMatrixParser.jsx';

/* ---- parse path -> subpath[] (with GV-A11 strict grammar & finite coordinate validation) ---- */
function parsePath(d, mat, warnCb) {
  const subs = [];
  let cur = null,
    cx = 0,
    cy = 0,
    sx = 0,
    sy = 0,
    pc = null,
    pq = null,
    prev = '';
  const rawD = String(d || '').trim();
  if (!rawD) return subs;
  const mk = (x, y) => ({
    id: uid(),
    x,
    y,
    type: 'corner',
    handleIn: null,
    handleOut: null
  });
  const begin = (x, y) => {
    cur = {
      id: uid(),
      closed: false,
      nodes: [mk(x, y)]
    };
    subs.push(cur);
  };
  const line = (x, y) => {
    if (!cur) begin(cx, cy);
    cur.nodes.push(mk(x, y));
    cx = x;
    cy = y;
  };
  const cubic = (x1, y1, x2, y2, x, y) => {
    if (!cur) begin(cx, cy);
    const L = cur.nodes[cur.nodes.length - 1];
    L.handleOut = x1 === L.x && y1 === L.y ? null : {
      x: x1,
      y: y1
    };
    const n = mk(x, y);
    n.handleIn = x2 === x && y2 === y ? null : {
      x: x2,
      y: y2
    };
    cur.nodes.push(n);
    cx = x;
    cy = y;
    pc = {
      x: x2,
      y: y2
    };
  };
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m,
    lastEnd = 0;
  while (m = re.exec(rawD)) {
    const gap = rawD.slice(lastEnd, m.index).trim();
    if (gap.length > 0) {
      if (warnCb) warnCb('path', null, 'unexpected-command:' + gap.slice(0, 12));
      break;
    }
    lastEnd = re.lastIndex;
    const t = m[1],
      T = t.toUpperCase(),
      abs = t === T;
    if (T === 'Z') {
      if (m[2] && m[2].trim().length > 0 && warnCb) warnCb('path', null, 'unexpected-args-after-Z');
      if (cur) {
        cur.closed = true;
        const f = cur.nodes[0],
          l = cur.nodes[cur.nodes.length - 1];
        if (cur.nodes.length > 1 && Math.hypot(l.x - f.x, l.y - f.y) < 1e-6 && !l.handleOut && !f.handleIn) {
          if (l.handleIn) f.handleIn = l.handleIn;
          cur.nodes.pop();
        }
      }
      cx = sx;
      cy = sy;
      cur = null;
      pc = pq = null;
      prev = 'Z';
      continue;
    }
    const cnt = {
      M: 2,
      L: 2,
      T: 2,
      H: 1,
      V: 1,
      C: 6,
      S: 4,
      Q: 4,
      A: 7
    }[T];
    const argStr = m[2] || '';
    if (T !== 'A') {
      const leftover = argStr.replace(new RegExp(NUM, 'g'), '').replace(/[\s,]+/g, '');
      if (leftover.length > 0) {
        if (warnCb) warnCb('path', null, 'invalid-token-in-' + T + ':' + leftover.slice(0, 12));
        break;
      }
    }
    const a = T === 'A' ? arcArgs(argStr, warnCb).flat() : nums(argStr);
    if (a.length === 0 || a.length % cnt !== 0 || !a.every(isFiniteCoord)) {
      if (warnCb) warnCb('path', null, 'invalid-arity-or-finite-in-' + T);
      if (!a.every(isFiniteCoord)) break;
    }
    for (let i = 0, first = true; i + cnt <= a.length; i += cnt, first = false) {
      const ox = abs ? 0 : cx,
        oy = abs ? 0 : cy;
      if (T === 'M') {
        const x = a[i] + ox,
          y = a[i + 1] + oy;
        if (first) {
          begin(x, y);
          sx = x;
          sy = y;
          cx = x;
          cy = y;
        } else line(x, y);
        pc = pq = null;
      } else if (T === 'L') line(a[i] + ox, a[i + 1] + oy);else if (T === 'H') line(a[i] + ox, cy);else if (T === 'V') line(cx, a[i] + oy);else if (T === 'C') cubic(a[i] + ox, a[i + 1] + oy, a[i + 2] + ox, a[i + 3] + oy, a[i + 4] + ox, a[i + 5] + oy);else if (T === 'S') {
        const r = (prev === 'C' || prev === 'S') && pc ? {
          x: 2 * cx - pc.x,
          y: 2 * cy - pc.y
        } : {
          x: cx,
          y: cy
        };
        cubic(r.x, r.y, a[i] + ox, a[i + 1] + oy, a[i + 2] + ox, a[i + 3] + oy);
      } else if (T === 'Q' || T === 'T') {
        let qx, qy, x, y;
        if (T === 'Q') {
          qx = a[i] + ox;
          qy = a[i + 1] + oy;
          x = a[i + 2] + ox;
          y = a[i + 3] + oy;
        } else {
          const r = (prev === 'Q' || prev === 'T') && pq ? {
            x: 2 * cx - pq.x,
            y: 2 * cy - pq.y
          } : {
            x: cx,
            y: cy
          };
          qx = r.x;
          qy = r.y;
          x = a[i] + ox;
          y = a[i + 1] + oy;
        }
        cubic(cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y);
        pq = {
          x: qx,
          y: qy
        };
      } else if (T === 'A') {
        const x = a[i + 5] + ox,
          y = a[i + 6] + oy;
        if (Math.hypot(x - cx, y - cy) > 1e-9) {
          const segs = arcToCubics(cx, cy, a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], x, y);
          if (segs) segs.forEach(s => cubic(...s));else line(x, y);
        }
      }
      prev = T;
    }
    prev = T;
  }
  let out = bake(subs.filter(sp => sp.nodes.length > 1), mat || [1, 0, 0, 1, 0, 0]);
  out.forEach(sp => {
    const ns = sp.nodes,
      n = ns.length;
    ns.forEach((nd, i) => {
      if (nd.handleIn && nd.handleOut) {
        const vi = sub(nd, nd.handleIn),
          vo = sub(nd.handleOut, nd);
        if (Math.abs(Math.atan2(cross(vi, vo), dot(vi, vo))) < 0.08) nd.type = Math.abs(Math.hypot(vi.x, vi.y) - Math.hypot(vo.x, vo.y)) < 0.5 ? 'symmetric' : 'smooth';else nd.type = 'corner';
      } else if (nd.handleIn || nd.handleOut) {
        /* Node ber-handle tunggal hanya 'smooth' jika handle-nya segaris dengan segmen lurus di sisi seberangnya; jika tidak = sudut (corner) */
        const pv = sp.closed || i > 0 ? ns[(i - 1 + n) % n] : null;
        const nx = sp.closed || i < n - 1 ? ns[(i + 1) % n] : null;
        const vi = nd.handleIn ? sub(nd, nd.handleIn) : pv ? sub(nd, pv) : null;
        const vo = nd.handleOut ? sub(nd.handleOut, nd) : nx ? sub(nx, nd) : null;
        if (vi && vo && Math.hypot(vi.x, vi.y) > 1e-6 && Math.hypot(vo.x, vo.y) > 1e-6 && Math.abs(Math.atan2(cross(vi, vo), dot(vi, vo))) < 0.08) nd.type = 'smooth';else nd.type = 'corner';
      }
    });
  });
  return out;
}

/* ---- serialisasi presisi tinggi (7 desimal float32 IEEE-754 agar koordinat asli SVG tidak bergeser) ---- */
/* v7.1: perintah path selalu dipisah spasi ("M x y C ... Z") agar parser ketat (CorelDRAW, Cricut, CAD) tidak gagal */

export { parsePath };
export default parsePath;
