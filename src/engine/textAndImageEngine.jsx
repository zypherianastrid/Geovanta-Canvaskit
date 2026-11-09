/**
 * @file src/engine/textAndImageEngine.jsx
 * @description Mesin pengukuran kotak teks vektor & geometri objek gambar pada kanvas
 */
import { uid, rd, mmul } from './vectorPrimitives.jsx';
import { normalizeDeg } from './affineAndOrientedBox.jsx';
import { parsePath } from './svgPathParser.jsx';
import { computeViewBoxTransform } from './transformMatrixParser.jsx';
import { mapGrad } from './gradientEngine.jsx';
import { tightBBox } from './spatialIndexAndHitTest.jsx';

/* ---- PHASE 4 & 5: Objek Teks SVG (o.type === 'text', o.text) ---- */
let _textMeasureCtx = null;
function getTextMeasureCtx() {
  if (_textMeasureCtx) return _textMeasureCtx;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    _textMeasureCtx = cv.getContext('2d');
  }
  return _textMeasureCtx;
}
function formatTextLines(txt) {
  if (!txt) return ['Teks'];
  let s = String(txt.content ?? 'Teks');
  if (txt.textTransform === 'uppercase') s = s.toUpperCase();else if (txt.textTransform === 'lowercase') s = s.toLowerCase();else if (txt.textTransform === 'capitalize') s = s.replace(/\b\w/g, c => c.toUpperCase());
  const lines = s.split('\n');
  return lines.length ? lines : [''];
}
function measureTextBox(txt) {
  const fs = Math.max(1, Number(txt.fontSize) || 32);
  const lh = Math.max(0.5, Number(txt.lineHeight) || 1.2);
  const ls = Number(txt.letterSpacing) || 0;
  const ws = Number(txt.wordSpacing) || 0;
  const lines = formatTextLines(txt);
  const lineWidths = [];
  const ctx = getTextMeasureCtx();
  let maxW = fs * 0.6;
  if (ctx) {
    const st = txt.fontStyle === 'italic' || txt.fontStyle === 'oblique' ? 'italic ' : '';
    const fw = txt.fontWeight || 400;
    const ff = txt.fontFamily || 'Inter, system-ui, sans-serif';
    try {
      ctx.font = `${st}${fw} ${fs}px ${ff}`;
    } catch (e) {
      ctx.font = `${fs}px sans-serif`;
    }
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const m = ctx.measureText(ln || ' ');
      const charExtra = Math.max(0, ln.length - 1) * ls;
      const spaceCount = (ln.match(/ /g) || []).length;
      const wordExtra = spaceCount * ws;
      const w = Math.max(fs * 0.35, (m ? m.width : ln.length * fs * 0.58) + charExtra + wordExtra);
      lineWidths.push(w);
      if (w > maxW) maxW = w;
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const spaceCount = (ln.match(/ /g) || []).length;
      const w = Math.max(1, ln.length) * fs * 0.58 + Math.max(0, ln.length - 1) * ls + spaceCount * ws;
      lineWidths.push(w);
      if (w > maxW) maxW = w;
    }
  }
  const ascent = fs * 0.82;
  const descent = fs * 0.24;
  const totalH = ascent + descent + Math.max(0, lines.length - 1) * fs * lh;
  const anchor = txt.textAnchor || 'start';
  let xOff = 0;
  if (anchor === 'middle') xOff = -maxW * 0.5;else if (anchor === 'end') xOff = -maxW;
  const bShift = Number(txt.baselineShift) || 0;
  const yTop = -ascent - bShift;
  return {
    xOff,
    yTop,
    w: Math.max(4, maxW),
    h: Math.max(4, totalH),
    ascent,
    descent,
    lines,
    lineWidths
  };
}
function buildTextSubs(txt) {
  const mb = measureTextBox(txt);
  const sx = Number(txt.scaleX) || 1;
  const sy = Number(txt.scaleY) || 1;
  const rotRad = (Number(txt.rotation) || 0) * Math.PI / 180;
  const cos = Math.cos(rotRad),
    sin = Math.sin(rotRad);
  const tx = Number(txt.x) || 0,
    ty = Number(txt.y) || 0;
  const corners = [{
    lx: mb.xOff,
    ly: mb.yTop
  }, {
    lx: mb.xOff + mb.w,
    ly: mb.yTop
  }, {
    lx: mb.xOff + mb.w,
    ly: mb.yTop + mb.h
  }, {
    lx: mb.xOff,
    ly: mb.yTop + mb.h
  }].map(p => {
    const rx = p.lx * sx,
      ry = p.ly * sy;
    return {
      id: uid(),
      x: rd(tx + rx * cos - ry * sin),
      y: rd(ty + rx * sin + ry * cos),
      type: 'corner',
      handleIn: null,
      handleOut: null,
      fil: null
    };
  });
  return [{
    id: uid(),
    closed: true,
    nodes: corners
  }];
}
function makeTextObj(opts = {}, mat = null) {
  let x = Number(opts.x) || 0;
  let y = Number(opts.y) || 0;
  let scaleX = Number(opts.scaleX) || 1;
  let scaleY = Number(opts.scaleY) || 1;
  let rotation = Number(opts.rotation) || 0;
  if (mat && (mat[0] !== 1 || mat[1] !== 0 || mat[2] !== 0 || mat[3] !== 1 || mat[4] !== 0 || mat[5] !== 0)) {
    const nx = mat[0] * x + mat[2] * y + mat[4];
    const ny = mat[1] * x + mat[3] * y + mat[5];
    x = rd(nx);
    y = rd(ny);
    const sxM = Math.hypot(mat[0], mat[1]) || 1;
    const syM = Math.hypot(mat[2], mat[3]) || 1;
    const det = mat[0] * mat[3] - mat[1] * mat[2];
    scaleX = rd(scaleX * sxM);
    scaleY = rd(scaleY * (det < 0 ? -syM : syM));
    rotation = rd(rotation + Math.atan2(mat[1], mat[0]) * 180 / Math.PI);
  }
  const text = {
    content: opts.content != null ? String(opts.content) : 'Teks Baru',
    x: rd(x),
    y: rd(y),
    fontFamily: opts.fontFamily || 'Inter, system-ui, sans-serif',
    fontWeight: Number(opts.fontWeight) || 400,
    fontSize: Math.max(1, Number(opts.fontSize) || 36),
    fontStyle: opts.fontStyle || 'normal',
    textDecoration: opts.textDecoration || 'none',
    textAnchor: opts.textAnchor || 'start',
    letterSpacing: Number(opts.letterSpacing) || 0,
    wordSpacing: Number(opts.wordSpacing) || 0,
    lineHeight: Math.max(0.5, Number(opts.lineHeight) || 1.2),
    textTransform: opts.textTransform || 'none',
    scaleX: scaleX || 1,
    scaleY: scaleY || 1,
    rotation: rotation || 0,
    baselineShift: Number(opts.baselineShift) || 0
  };
  const subs = buildTextSubs(text);
  const bboxAngle = rd(normalizeDeg(text.rotation || 0));
  return {
    id: opts.id || uid(),
    name: opts.name || 'Text-1',
    type: 'text',
    fill: opts.fill !== undefined ? opts.fill : '#18181b',
    stroke: opts.stroke !== undefined ? opts.stroke : 'none',
    strokeWidth: Number(opts.strokeWidth) || 0,
    strokeLinejoin: opts.strokeLinejoin || 'round',
    strokeLinecap: opts.strokeLinecap || 'round',
    opacity: opts.opacity !== undefined ? Number(opts.opacity) : 1,
    fillRule: 'nonzero',
    group: opts.group || null,
    bboxAngle,
    rot: rd(normalizeDeg(-bboxAngle)),
    text,
    subs
  };
}
function updateTextObj(o, patch) {
  if (!o || !o.text) return o;
  const nextText = {
    ...o.text,
    ...(typeof patch === 'function' ? patch(o.text) : patch)
  };
  const nextSubs = buildTextSubs(nextText);
  const bboxAngle = rd(normalizeDeg(nextText.rotation || 0));
  return {
    ...o,
    bboxAngle,
    rot: rd(normalizeDeg(-bboxAngle)),
    text: nextText,
    subs: nextSubs
  };
}
function syncTextTransformFromSubs(o) {
  if (!o || !o.text || !o.subs || !o.subs[0] || o.subs[0].nodes.length < 4) return o;
  const ns = o.subs[0].nodes;
  const p0 = ns[0],
    p1 = ns[1],
    p3 = ns[3];
  const mb = measureTextBox(o.text);
  const dxW = p1.x - p0.x,
    dyW = p1.y - p0.y;
  const dxH = p3.x - p0.x,
    dyH = p3.y - p0.y;
  const wActual = Math.hypot(dxW, dyW) || 1;
  const hActual = Math.hypot(dxH, dyH) || 1;
  const rotRad = Math.atan2(dyW, dxW);
  const rotDeg = normalizeDeg(rotRad * 180 / Math.PI);
  const crossZ = dxW * dyH - dyW * dxH;
  const sx = rd(wActual / Math.max(1e-4, mb.w));
  const sy = rd((crossZ < 0 ? -1 : 1) * (hActual / Math.max(1e-4, mb.h)));
  const cos = Math.cos(rotRad),
    sin = Math.sin(rotRad);
  const lx0 = mb.xOff * sx,
    ly0 = mb.yTop * sy;
  const tx = rd(p0.x - (lx0 * cos - ly0 * sin));
  const ty = rd(p0.y - (lx0 * sin + ly0 * cos));
  const nextText = {
    ...o.text,
    x: tx,
    y: ty,
    scaleX: sx || 1,
    scaleY: sy || 1,
    rotation: rd(rotDeg)
  };
  return {
    ...o,
    bboxAngle: rd(rotDeg),
    rot: rd(normalizeDeg(-rotDeg)),
    text: nextText
  };
}
function textMatrix(o) {
  if (!o || !o.text) return null;
  const t = o.text;
  const sx = Number(t.scaleX) || 1;
  const sy = Number(t.scaleY) || 1;
  const rad = (Number(t.rotation) || 0) * Math.PI / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  /* Jika fontStyle === 'oblique', tambahkan kemiringan sintetis (shear X = -0.18) agar Oblique berbeda jelas dari Normal & Italic */
  const skewK = t.fontStyle === 'oblique' ? -0.18 : 0;
  const m0 = cos * sx,
    m1 = sin * sx;
  const m2 = (cos * skewK - sin) * sy,
    m3 = (sin * skewK + cos) * sy;
  return [rd(m0), rd(m1), rd(m2), rd(m3), rd(t.x || 0), rd(t.y || 0)];
}

/* ---- GV-A10: objek gambar dengan preserveAspectRatio konsisten di SVG DOM, Canvas2D, dan WebGL2 ---- */
/* ---- GV-A10: objek gambar dengan preserveAspectRatio konsisten di SVG DOM, Canvas2D, dan WebGL2 ---- */
function makeImageObj(href, w, h, x, y, name, par, m, naturalW, naturalH) {
  const d = 'M' + x + ' ' + y + 'L' + (x + w) + ' ' + y + 'L' + (x + w) + ' ' + (y + h) + 'L' + x + ' ' + (y + h) + 'Z';
  return {
    id: uid(),
    name: name || 'image',
    type: 'image',
    fill: '#000000',
    stroke: 'none',
    strokeWidth: 0,
    opacity: 1,
    fillRule: 'nonzero',
    group: null,
    img: {
      href,
      w,
      h,
      naturalW: naturalW || w,
      naturalH: naturalH || h,
      par: par || 'xMidYMid meet'
    },
    subs: parsePath(d, m || [1, 0, 0, 1, 0, 0])
  };
}
function imageMatrix(o) {
  const im = o.img,
    ns = o.subs[0] && o.subs[0].nodes;
  if (!im || !ns || ns.length < 2) return null;
  if (ns.length === 4 && !ns.some(n => n.handleIn || n.handleOut)) {
    const p0 = ns[0],
      p1 = ns[1],
      p3 = ns[3];
    return [(p1.x - p0.x) / im.w, (p1.y - p0.y) / im.w, (p3.x - p0.x) / im.h, (p3.y - p0.y) / im.h, p0.x, p0.y];
  }
  let x0 = 1e18,
    y0 = 1e18,
    x1 = -1e18,
    y1 = -1e18;
  ns.forEach(n => {
    x0 = Math.min(x0, n.x);
    x1 = Math.max(x1, n.x);
    y0 = Math.min(y0, n.y);
    y1 = Math.max(y1, n.y);
  });
  return [(x1 - x0) / im.w, 0, 0, (y1 - y0) / im.h, x0, y0];
}
/* GV-A10: Hitung matriks efektif & batas clip untuk objek gambar berdasarkan preserveAspectRatio & ukuran natural gambar */
/* GV-A10: Hitung matriks efektif & batas clip untuk objek gambar berdasarkan preserveAspectRatio & ukuran natural gambar */
function computeImageParGeometry(o, naturalW, naturalH) {
  const baseM = imageMatrix(o);
  if (!baseM || !o || !o.img) return null;
  const vw = o.img.w || 1,
    vh = o.img.h || 1;
  const nw = Number(naturalW) || Number(o.img.naturalW) || vw;
  const nh = Number(naturalH) || Number(o.img.naturalH) || vh;
  const par = o.img.par || 'xMidYMid meet';
  const vbt = computeViewBoxTransform([0, 0, nw, nh], vw, vh, par, 0, 0);
  /* vbt.matrix memetakan [0..nw, 0..nh] -> [0..vw, 0..vh]; baseM memetakan [0..vw, 0..vh] -> world */
  const drawW = nw * vbt.sx,
    drawH = nh * vbt.sy;
  const drawX = vbt.tx,
    drawY = vbt.ty;
  /* Matriks efektif untuk menggambar quad [0..vw, 0..vh] di ruang dunia */
  const subMat = [drawW / vw, 0, 0, drawH / vh, drawX, drawY];
  const effMatrix = mmul(baseM, subMat);
  return {
    baseMatrix: baseM,
    effMatrix,
    drawX,
    drawY,
    drawW,
    drawH,
    clip: vbt.clip,
    align: vbt.align,
    meetOrSlice: vbt.meetOrSlice
  };
}
/* skala objek terhadap titik tetap (ax,ay) dengan faktor k (node + handle) */
/* skala objek terhadap titik tetap (ax,ay) dengan faktor k (node + handle) */
function scaleObj(o, ax, ay, k) {
  const f = q => q && {
    x: ax + (q.x - ax) * k,
    y: ay + (q.y - ay) * k
  };
  const next = {
    ...o,
    grad: mapGrad(o.grad, f, k),
    ...(o.strokeGrad ? {
      strokeGrad: mapGrad(o.strokeGrad, f, k)
    } : {}),
    subs: o.subs.map(sp => ({
      ...sp,
      nodes: sp.nodes.map(n => ({
        ...n,
        fil: null,
        x: ax + (n.x - ax) * k,
        y: ay + (n.y - ay) * k,
        handleIn: f(n.handleIn),
        handleOut: f(n.handleOut)
      }))
    }))
  };
  return next.text ? syncTextTransformFromSubs(next) : next;
}
/* kotak batas semua konten (kurva disampel, + setengah stroke) → [x0,y0,x1,y1] atau null */
/* kotak batas semua konten (kurva disampel, + setengah stroke) → [x0,y0,x1,y1] atau null */
function docBounds(doc, only) {
  let x0 = 1e18,
    y0 = 1e18,
    x1 = -1e18,
    y1 = -1e18;
  const add = (x, y, pad) => {
    if (x - pad < x0) x0 = x - pad;
    if (x + pad > x1) x1 = x + pad;
    if (y - pad < y0) y0 = y - pad;
    if (y + pad > y1) y1 = y + pad;
  };
  doc.objects.forEach(o => {
    if (only && !only.has(o.id)) return;
    const pad = o.stroke !== 'none' ? (o.strokeWidth || 0) / 2 : 0;
    const b = tightBBox(o);
    if (b && b[0] <= b[2] && b[1] <= b[3]) {
      add(b[0], b[1], pad);
      add(b[2], b[3], pad);
    }
  });
  return x0 > x1 ? null : [x0, y0, x1, y1];
}
/* opt: { bg:{mode:'transparent'|'solid',color}, area:'board'|'content' } */
/* ---- gradien per objek: o.grad disimpan dalam koordinat dokumen (userSpaceOnUse) supaya ikut translate/scale/rotate; valid selama o.fill masih sama dengan grad.base ---- */

export { _textMeasureCtx, getTextMeasureCtx, formatTextLines, measureTextBox, buildTextSubs, makeTextObj, updateTextObj, syncTextTransformFromSubs, textMatrix, makeImageObj, imageMatrix, computeImageParGeometry, scaleObj, docBounds };
