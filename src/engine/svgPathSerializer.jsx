/**
 * @file src/engine/svgPathSerializer.jsx
 * @description Serialisasi presisi tinggi IEEE-754 subpath & generator path bentuk dasar
 */
import { nums } from './vectorPrimitives.jsx';

/* ---- serialisasi presisi tinggi (7 desimal float32 IEEE-754 agar koordinat asli SVG tidak bergeser) ---- */
/* v7.1: perintah path selalu dipisah spasi ("M x y C ... Z") agar parser ketat (CorelDRAW, Cricut, CAD) tidak gagal */
const SUB_D = new WeakMap();
const rdCoord = v => {
  const r = Math.round(v * 1e7) / 1e7;
  return Object.is(r, -0) ? 0 : r;
};
const pc2 = (p, ox = 0, oy = 0) => rdCoord(p.x - ox) + ' ' + rdCoord(p.y - oy);
const seg = (a, b, ox = 0, oy = 0) => a.handleOut || b.handleIn ? ' C ' + pc2(a.handleOut || a, ox, oy) + ' ' + pc2(b.handleIn || b, ox, oy) + ' ' + pc2(b, ox, oy) : ' L ' + pc2(b, ox, oy);
function serializeSub(sp, ox = 0, oy = 0) {
  if (ox === 0 && oy === 0) {
    const c = SUB_D.get(sp);
    if (c !== undefined) return c;
  }
  const ns = sp.nodes;
  if (!ns.length) return '';
  let d = 'M ' + pc2(ns[0], ox, oy);
  for (let i = 1; i < ns.length; i++) d += seg(ns[i - 1], ns[i], ox, oy);
  if (sp.closed) {
    const a = ns[ns.length - 1],
      b = ns[0];
    if (a.handleOut || b.handleIn) d += seg(a, b, ox, oy);
    d += ' Z';
  }
  if (ox === 0 && oy === 0) SUB_D.set(sp, d);
  return d;
}
const serializePath = (o, ox = 0, oy = 0) => o.subs.map(sp => serializeSub(sp, ox, oy)).join(' ');
const nodeCount = o => o.subs.reduce((s, sp) => s + sp.nodes.length, 0);

/* ---- parse SVG: path, rect, circle, ellipse, line, polyline, polygon, g (+transform, style, pewarisan) ---- */
/* ---- parse SVG: path, rect, circle, ellipse, line, polyline, polygon, g (+transform, style, pewarisan) ---- */
function shapeD(el) {
  const g = k => parseFloat(el.getAttribute(k)) || 0,
    t = el.tagName;
  if (t === 'path') return el.getAttribute('d') || '';
  if (t === 'rect') {
    const x = g('x'),
      y = g('y'),
      w = g('width'),
      h = g('height');
    let rx = g('rx'),
      ry = g('ry');
    if (!rx) rx = ry;
    if (!ry) ry = rx;
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);
    if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  if (t === 'circle' || t === 'ellipse') {
    const cx = g('cx'),
      cy = g('cy'),
      rx = t === 'circle' ? g('r') : g('rx'),
      ry = t === 'circle' ? g('r') : g('ry');
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
  }
  if (t === 'line') return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
  if (t === 'polyline' || t === 'polygon') {
    const a = nums(el.getAttribute('points') || '');
    let d = '';
    for (let i = 0; i + 1 < a.length; i += 2) d += (i ? 'L' : 'M') + a[i] + ' ' + a[i + 1];
    return d + (t === 'polygon' ? 'Z' : '');
  }
  return null;
}

export { SUB_D, rdCoord, pc2, seg, serializeSub, serializePath, nodeCount, shapeD };
