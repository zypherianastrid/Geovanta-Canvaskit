/**
 * @file src/engine/transformMatrixParser.jsx
 * @description Parser matriks transformasi SVG & kalkulasi viewBox preserveAspectRatio
 */
import { NUM, nums, isFiniteCoord, mmul } from './vectorPrimitives.jsx';

function parseTransform(str, warnCb) {
  let m = [1, 0, 0, 1, 0, 0];
  if (!str || !String(str).trim()) return m;
  const raw = String(str).trim();
  const re = /([A-Za-z]+)\s*\(([^)]*)\)/g;
  let r,
    lastIdx = 0;
  const ops = [];
  while (r = re.exec(raw)) {
    const between = raw.slice(lastIdx, r.index).replace(/[\s,]+/g, '');
    if (between.length > 0) {
      if (warnCb) warnCb('transform', null, 'unexpected-token:' + between);
      return [1, 0, 0, 1, 0, 0];
    }
    lastIdx = re.lastIndex;
    const fn = r[1];
    const argBody = r[2].trim();
    const stripped = argBody.replace(new RegExp(NUM, 'g'), '').replace(/[\s,]+/g, '');
    if (stripped.length > 0 || !argBody.length) {
      if (warnCb) warnCb('transform', null, 'invalid-args:' + fn);
      return [1, 0, 0, 1, 0, 0];
    }
    const a = nums(argBody);
    if (!a.length || !a.every(isFiniteCoord)) {
      if (warnCb) warnCb('transform', null, 'non-finite-args:' + fn);
      return [1, 0, 0, 1, 0, 0];
    }
    let t = null;
    if (fn === 'translate' && (a.length === 1 || a.length === 2)) {
      t = [1, 0, 0, 1, a[0], a.length === 2 ? a[1] : 0];
    } else if (fn === 'scale' && (a.length === 1 || a.length === 2)) {
      t = [a[0], 0, 0, a.length === 2 ? a[1] : a[0], 0, 0];
    } else if (fn === 'rotate' && (a.length === 1 || a.length === 3)) {
      const g = a[0] * Math.PI / 180,
        c = Math.cos(g),
        s = Math.sin(g);
      t = [c, s, -s, c, 0, 0];
      if (a.length === 3) t = mmul(mmul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (fn === 'matrix' && a.length === 6) {
      t = a.slice(0, 6);
    } else if (fn === 'skewX' && a.length === 1) {
      const tn = Math.tan(a[0] * Math.PI / 180);
      if (!isFiniteCoord(tn)) {
        if (warnCb) warnCb('transform', null, 'singular-skewX');
        return [1, 0, 0, 1, 0, 0];
      }
      t = [1, 0, tn, 1, 0, 0];
    } else if (fn === 'skewY' && a.length === 1) {
      const tn = Math.tan(a[0] * Math.PI / 180);
      if (!isFiniteCoord(tn)) {
        if (warnCb) warnCb('transform', null, 'singular-skewY');
        return [1, 0, 0, 1, 0, 0];
      }
      t = [1, tn, 0, 1, 0, 0];
    } else {
      if (warnCb) warnCb('transform', null, 'invalid-arity-or-fn:' + fn + '(' + a.length + ')');
      return [1, 0, 0, 1, 0, 0];
    }
    ops.push(t);
  }
  const tail = raw.slice(lastIdx).replace(/[\s,]+/g, '');
  if (tail.length > 0 || !ops.length) {
    if (warnCb) warnCb('transform', null, 'malformed-transform');
    return [1, 0, 0, 1, 0, 0];
  }
  for (let i = 0; i < ops.length; i++) m = mmul(m, ops[i]);
  if (!m.every(isFiniteCoord)) return [1, 0, 0, 1, 0, 0];
  return m;
}

/* GV-A09 & GV-A10: Canonical SVG preserveAspectRatio viewBox -> viewport transform & clip calculator */
/* GV-A09 & GV-A10: Canonical SVG preserveAspectRatio viewBox -> viewport transform & clip calculator */
function computeViewBoxTransform(vb, viewportW, viewportH, parString = 'xMidYMid meet', vpX = 0, vpY = 0) {
  const vx = Number(vb && vb[0]) || 0,
    vy = Number(vb && vb[1]) || 0;
  const vw = Number(vb && vb[2]) || 0,
    vh = Number(vb && vb[3]) || 0;
  const uw = Number(viewportW) || 0,
    uh = Number(viewportH) || 0;
  if (!(vw > 0) || !(vh > 0) || !(uw > 0) || !(uh > 0)) {
    return {
      matrix: [1, 0, 0, 1, vpX, vpY],
      sx: 1,
      sy: 1,
      tx: vpX,
      ty: vpY,
      clip: false,
      align: 'none',
      meetOrSlice: 'meet'
    };
  }
  const rawPar = String(parString || 'xMidYMid meet').trim().replace(/^defer\s+/i, '');
  const parts = rawPar.split(/\s+/).filter(Boolean);
  const align = parts[0] || 'xMidYMid';
  const meetOrSlice = parts[1] === 'slice' ? 'slice' : 'meet';
  if (align === 'none') {
    const sx = uw / vw,
      sy = uh / vh;
    const tx = vpX - vx * sx,
      ty = vpY - vy * sy;
    return {
      matrix: [sx, 0, 0, sy, tx, ty],
      sx,
      sy,
      tx,
      ty,
      clip: false,
      align: 'none',
      meetOrSlice: 'meet'
    };
  }
  const scaleX = uw / vw,
    scaleY = uh / vh;
  const sc = meetOrSlice === 'slice' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const drawnW = vw * sc,
    drawnH = vh * sc;
  let offX = 0,
    offY = 0;
  if (align.startsWith('xMid')) offX = (uw - drawnW) * 0.5;else if (align.startsWith('xMax')) offX = uw - drawnW;
  if (align.endsWith('YMid')) offY = (uh - drawnH) * 0.5;else if (align.endsWith('YMax')) offY = uh - drawnH;
  const tx = vpX + offX - vx * sc;
  const ty = vpY + offY - vy * sc;
  return {
    matrix: [sc, 0, 0, sc, tx, ty],
    sx: sc,
    sy: sc,
    tx,
    ty,
    offX,
    offY,
    drawnW,
    drawnH,
    clip: meetOrSlice === 'slice' && (drawnW > uw + 1e-5 || drawnH > uh + 1e-5),
    clipRect: [vpX, vpY, uw, uh],
    align,
    meetOrSlice
  };
}
const isId = m => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
const tp = (m, p) => p && {
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5]
};
const bake = (subs, m) => isId(m) ? subs : subs.map(sp => ({
  ...sp,
  nodes: sp.nodes.map(n => ({
    ...n,
    ...tp(m, n),
    handleIn: tp(m, n.handleIn),
    handleOut: tp(m, n.handleOut)
  }))
}));

/* ---- arc -> cubic bezier ---- */

export { parseTransform, computeViewBoxTransform, isId, tp, bake };
