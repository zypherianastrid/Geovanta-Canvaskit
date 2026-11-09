/**
 * @file src/engine/vectorPrimitives.jsx
 * @description Operasi matematika vektor 2D dasar, kloning node/subpath, & utilitas numerik
 */
const uid = () => 'n' + Math.random().toString(36).slice(2, 9);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
});
const sub = (a, b) => ({
  x: a.x - b.x,
  y: a.y - b.y
});
const add = (a, b) => ({
  x: a.x + b.x,
  y: a.y + b.y
});
const mul = (a, s) => ({
  x: a.x * s,
  y: a.y * s
});
const nrm = a => {
  const l = Math.hypot(a.x, a.y) || 1;
  return {
    x: a.x / l,
    y: a.y / l
  };
};
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const rd = v => Math.round(v * 10000) / 10000;
const P = n => ({
  x: n.x,
  y: n.y
});
const cl = n => ({
  ...n,
  handleIn: n.handleIn && {
    ...n.handleIn
  },
  handleOut: n.handleOut && {
    ...n.handleOut
  }
});
const clSub = sp => ({
  ...sp,
  nodes: sp.nodes.map(cl)
});
const NUM = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?';
const nums = s => (s.match(new RegExp(NUM, 'g')) || []).map(Number);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* ---- matriks transform (di-bake ke koordinat node) + GV-A11 strict validation ---- */
/* ---- matriks transform (di-bake ke koordinat node) + GV-A11 strict validation ---- */
const MAX_COORD_ABS = 1e7;
const isFiniteCoord = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORD_ABS;
const mmul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];

export { uid, dist, lerp, sub, add, mul, nrm, dot, cross, rd, P, cl, clSub, NUM, nums, esc, MAX_COORD_ABS, isFiniteCoord, mmul };
