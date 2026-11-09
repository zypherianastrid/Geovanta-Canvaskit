/**
 * @file src/engine/svgDocumentSerializer.jsx
 * @description Serialisasi dokumen Geovanta kembali menjadi kode standar XML SVG
 */
import { docBounds, imageMatrix, textMatrix, formatTextLines } from './textAndImageEngine.jsx';
import { rd, esc } from './vectorPrimitives.jsx';
import { gradOn, gradXml, strokeGradOn } from './gradientEngine.jsx';
import { FontManager } from '../utils/fontManager.jsx';
import { serializePath } from './svgPathSerializer.jsx';

function serializeDoc(doc, opt) {
  opt = opt || {};
  if (doc.objects.some(o => o.hidden)) doc = {
    ...doc,
    objects: doc.objects.filter(o => !o.hidden)
  }; /* layer tersembunyi tidak ikut diekspor (ala Figma) */
  if (opt.area === 'sel' && opt.only) {
    doc = {
      ...doc,
      objects: doc.objects.filter(o => opt.only.has(o.id))
    };
  }
  let [vx, vy, vw, vh] = doc.viewBox;
  let body = '',
    open = null,
    hasImg = false,
    gdefs = '',
    gn = 0;
  const used = new Set(),
    gseen = new Set();
  if (opt.area === 'content' || opt.area === 'sel') {
    const bb = docBounds(doc);
    if (bb && bb[2] > bb[0] && bb[3] > bb[1]) {
      vx = Math.floor(bb[0] * 100) / 100;
      vy = Math.floor(bb[1] * 100) / 100;
      vw = Math.ceil((bb[2] - vx) * 100) / 100;
      vh = Math.ceil((bb[3] - vy) * 100) / 100;
    }
  }
  /* v7.1: origin dinormalisasi ke (0,0) -> viewBox selalu "0 0 W H" sehingga Illustrator/CorelDRAW/Affinity menaruh objek tepat di artboard */
  const ox = vx,
    oy = vy;
  vw = Math.max(1, rd(vw));
  vh = Math.max(1, rd(vh));
  const uq = b => {
    b = String(b || 'path').replace(/[^\w\-.:]/g, '-');
    if (!/^[A-Za-z_]/.test(b)) b = 'id-' + b;
    let k = b,
      i = 2;
    while (used.has(k)) k = b + '-' + i++;
    used.add(k);
    return k;
  };
  const r6 = v => Math.round(v * 1e6) / 1e6;
  if (opt.bg && opt.bg.mode === 'solid') body += '<rect x="0" y="0" width="' + vw + '" height="' + vh + '" fill="' + esc(opt.bg.color || '#ffffff') + '"/>';
  doc.objects.forEach(o => {
    if (o.group !== open) {
      if (open) body += '</g>';
      if (o.group) {
        const isF = o.containerType === 'frame' || o.isAutoFrame || o.isFrameBg || /^frame/i.test(o.group);
        const gOp = o.groupOpacity != null && o.groupOpacity < 1 ? ' opacity="' + rd(o.groupOpacity) + '"' : '';
        body += '<g' + (gseen.has(o.group) ? '' : ' id="' + esc(o.group) + '"') + (isF ? ' data-container="frame"' : '') + gOp + '>';
        gseen.add(o.group);
      }
      open = o.group;
    }
    if (o.img) {
      const m = imageMatrix(o);
      if (!m) return;
      hasImg = true;
      const mS = [m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy];
      body += '<image id="' + uq(o.name) + '" href="' + esc(o.img.href) + '" xlink:href="' + esc(o.img.href) + '" x="0" y="0" width="' + r6(o.img.w) + '" height="' + r6(o.img.h) + '" preserveAspectRatio="' + esc(o.img.par || 'xMidYMid meet') + '" transform="matrix(' + mS.map(r6).join(' ') + ')"' + (o.opacity !== 1 ? ' opacity="' + rd(o.opacity) + '"' : '') + '/>';
      return;
    }
    let fillA = esc(o.fill);
    if (gradOn(o)) {
      const gid = 'grad-' + ++gn;
      gdefs += gradXml(o.grad, gid, ox, oy);
      fillA = 'url(#' + gid + ')';
    }
    let strokeA = esc(o.stroke);
    if (strokeGradOn(o)) {
      const sgid = 'sgrad-' + ++gn;
      gdefs += gradXml(o.strokeGrad, sgid, ox, oy);
      strokeA = 'url(#' + sgid + ')';
    }
    if (o.text) {
      const t = o.text;
      if (typeof FontManager !== 'undefined') {
        const fObj = FontManager.findFontByNameOrFamily(t.fontFamily);
        if (fObj && fObj.url && !gdefs.includes(fObj.url)) {
          gdefs += '<style>@import url(\'' + esc(fObj.url) + '\');</style>';
        }
      }
      const m = textMatrix(o) || [1, 0, 0, 1, t.x || 0, t.y || 0];
      const mS = [m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy];
      const lines = formatTextLines(t);
      const fs = Math.max(1, Number(t.fontSize) || 32);
      const lh = Math.max(0.5, Number(t.lineHeight) || 1.2);
      const bShift = Number(t.baselineShift) || 0;
      const inner = lines.length <= 1 ? esc(lines[0] || '') : lines.map((ln, idx) => '<tspan x="0" dy="' + (idx === 0 ? 0 : rd(fs * lh)) + '">' + esc(ln) + '</tspan>').join('');
      body += '<text id="' + uq(o.name) + '" x="0" y="' + rd(-bShift) + '"' + ' transform="matrix(' + mS.map(r6).join(' ') + ')"' + ' font-family="' + esc(t.fontFamily || 'Inter, sans-serif') + '"' + ' font-size="' + rd(fs) + '"' + ' font-weight="' + esc(t.fontWeight || 400) + '"' + (t.fontStyle && t.fontStyle !== 'normal' ? ' font-style="' + esc(t.fontStyle) + '"' : '') + (t.textDecoration && t.textDecoration !== 'none' ? ' text-decoration="' + esc(t.textDecoration) + '"' : '') + (t.textAnchor && t.textAnchor !== 'start' ? ' text-anchor="' + esc(t.textAnchor) + '"' : '') + (t.letterSpacing ? ' letter-spacing="' + rd(t.letterSpacing) + '"' : '') + (t.wordSpacing ? ' word-spacing="' + rd(t.wordSpacing) + '"' : '') + (t.textTransform && t.textTransform !== 'none' ? ' style="text-transform:' + esc(t.textTransform) + '"' : '') + ' fill="' + fillA + '"' + (o.stroke !== 'none' && o.strokeWidth > 0 ? ' stroke="' + strokeA + '" stroke-width="' + rd(o.strokeWidth) + '" stroke-linejoin="' + esc(o.strokeLinejoin || 'round') + '" stroke-linecap="' + esc(o.strokeLinecap || 'round') + '"' : '') + (o.opacity !== 1 ? ' opacity="' + rd(o.opacity) + '"' : '') + '>' + inner + '</text>';
      return;
    }
    body += '<path id="' + uq(o.name) + '" fill="' + fillA + '"' + (o.stroke !== 'none' && o.strokeWidth > 0 ? ' stroke="' + strokeA + '" stroke-width="' + rd(o.strokeWidth) + '" stroke-linejoin="' + esc(o.strokeLinejoin || 'round') + '" stroke-linecap="' + esc(o.strokeLinecap || 'round') + '"' + (o.strokeMiterlimit ? ' stroke-miterlimit="' + rd(o.strokeMiterlimit) + '"' : '') + (o.nonScalingStroke ? ' vector-effect="non-scaling-stroke"' : '') : '') + (o.opacity !== 1 ? ' opacity="' + rd(o.opacity) + '"' : '') + (o.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '') + ' d="' + serializePath(o, ox, oy) + '"/>';
  });
  if (open) body += '</g>';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"' + (hasImg ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : '') + ' version="1.1" width="' + vw + '" height="' + vh + '" viewBox="0 0 ' + vw + ' ' + vh + '">' + (gdefs ? '<defs>' + gdefs + '</defs>' : '') + body + '</svg>';
}

/* ---- operasi geometri (semua immutable) ---- */

export { serializeDoc };
export default serializeDoc;
