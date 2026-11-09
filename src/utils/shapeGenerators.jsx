/**
 * @file src/utils/shapeGenerators.jsx
 * @description Generator geometri bentuk dasar poligon, bintang, dan kurva unit
 */
/* ---------- Pustaka shape: setiap generator mengembalikan path M/L/C/Z di kotak (x, y, w, h) ---------- */
const SHK = 0.5523;
const shPoly = (pts, x, y, w, h) => 'M' + pts.map(([u, v]) => (x + u * w).toFixed(2) + ' ' + (y + v * h).toFixed(2)).join('L') + 'Z';
const shFit = pts => {
  const xs = pts.map(q => q[0]),
    ys = pts.map(q => q[1]),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  return pts.map(([u, v]) => [(u - x0) / (x1 - x0 || 1), (v - y0) / (y1 - y0 || 1)]);
};
const shNgon = (n, a0) => shFit(Array.from({
  length: n
}, (_, i) => {
  const a = (a0 + 360 * i / n) * Math.PI / 180;
  return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)];
}));
const shStar = (n, ri) => shFit(Array.from({
  length: n * 2
}, (_, i) => {
  const a = (-90 + 180 * i / n) * Math.PI / 180,
    r = i % 2 ? ri : 1;
  return [0.5 + 0.5 * r * Math.cos(a), 0.5 + 0.5 * r * Math.sin(a)];
}));
const shUnit = (t, x, y, w, h) => {
  let o = '',
    j = 0;
  for (const k of t) {
    if (typeof k === 'string') {
      o += k;
      j = 0;
    } else {
      o += (j % 2 === 0 ? x + k * w : y + k * h).toFixed(2) + ' ';
      j++;
    }
  }
  return o.trim();
};
const K2 = 0.5 * SHK;
const shapeRect = (a, b, prop) => {
  let w = Math.abs(b.x - a.x),
    h = Math.abs(b.y - a.y);
  if (prop) w = h = Math.max(w, h);
  return {
    x: b.x < a.x ? a.x - w : a.x,
    y: b.y < a.y ? a.y - h : a.y,
    w: Math.max(w, 0.5),
    h: Math.max(h, 0.5)
  };
};

export { SHK, shPoly, shFit, shNgon, shStar, shUnit, K2, shapeRect };
