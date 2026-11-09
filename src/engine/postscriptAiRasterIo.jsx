/**
 * @file src/engine/postscriptAiRasterIo.jsx
 * @description Parser & eksportir multi-format: PostScript (.eps), Adobe Illustrator (.ai), dan Raster (.png/.jpg/.webp)
 */
import { parseSVG } from './svgDocumentParser.jsx';
import { toHex } from '../utils/colorMath.jsx';
import { rd, uid, mmul } from './vectorPrimitives.jsx';
import { parsePath } from './svgPathParser.jsx';
import { serializeSub } from './svgPathSerializer.jsx';
import { docBounds } from './textAndImageEngine.jsx';
import { cssToHex } from '../utils/colorParserAndFormatter.jsx';
import { serializeDoc } from './svgDocumentSerializer.jsx';
import { ACTIVE_DEVICE_PROFILE, GPU_CAPS } from '../utils/gpuCapabilities.jsx';

/* =========================================================================
   MESIN MULTI-FORMAT: IMPOR & EKSPOR (.SVG, .AI, .PS, .EPS, .PDF, .PNG, .JPG, .WEBP)
   - Impor PS/EPS/AI: interpreter RPN (stack machine) + CTM affine (sumbu-Y dibalik) + CMYK→sRGB
   - AI modern (%PDF-): ekstrak stream, dekompresi lewat DecompressionStream native
   - Ekspor EPS (DSC EPSF-3.0) / AI (PDF-1.4) menyertakan SVG sumber (base64) agar round-trip Geovanta lossless
   - Ekspor raster: canvas supersampling + matte putih untuk JPG
   ========================================================================= */
const b64enc = str => {
  const u8 = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64dec = b => {
  const s = atob(b),
    u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return new TextDecoder('utf-8').decode(u8);
};
/* SVG sumber disisipkan sebagai komentar berbaris pendek (aman untuk batas 255 karakter DSC & aman untuk Unicode) */
/* SVG sumber disisipkan sebagai komentar berbaris pendek (aman untuk batas 255 karakter DSC & aman untuk Unicode) */
const embedLines = svg => (b64enc(svg).match(/.{1,100}/g) || []).map(l => '%SVGPeak-Data: ' + l).join('\n') + '\n';
const readEmbedded = raw => {
  const ms = [...raw.matchAll(/^%SVGPeak-Data: ([A-Za-z0-9+/=]+)[ \t]*\r?$/gm)];
  if (!ms.length) return null;
  try {
    const s = b64dec(ms.map(m => m[1]).join(''));
    return /<svg[\s>]/i.test(s) ? s : null;
  } catch (e) {
    return null;
  }
};

/* dekompresi stream FlateDecode (zlib) dengan Web API native */
/* dekompresi stream FlateDecode (zlib) dengan Web API native */
async function inflateBytes(u8) {
  if (typeof DecompressionStream === 'undefined') return null;
  for (const fmt of ['deflate', 'deflate-raw']) {
    try {
      const src = fmt === 'deflate' ? u8 : u8.subarray(2);
      const ds = new DecompressionStream(fmt),
        wr = ds.writable.getWriter();
      wr.write(src).catch(() => {});
      wr.close().catch(() => {});
      const buf = await new Response(ds.readable).arrayBuffer();
      return new TextDecoder('latin1').decode(buf);
    } catch (e) {}
  }
  return null;
}
const looksText = s => {
  const n = Math.min(s.length, 3000);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c < 9 || c > 13 && c < 32) bad++;
  }
  return n > 0 && bad / n < 0.02;
};
const OPS_RE = /(?:^|\s)(?:m|l|c|re|f|S|B|rg|k|cm|moveto|lineto|curveto)(?=\s|$)/;

/* kumpulkan teks operator dari .ai (PDF) / .ps / .eps; atau kembalikan SVG sumber bila ada */
/* kumpulkan teks operator dari .ai (PDF) / .ps / .eps; atau kembalikan SVG sumber bila ada */
async function extractPSStreams(buffer) {
  let u8 = new Uint8Array(buffer);
  /* EPS biner DOS (header C5D0D3C6): ambil bagian PostScript saja */
  if (u8.length > 30 && u8[0] === 0xC5 && u8[1] === 0xD0 && u8[2] === 0xD3 && u8[3] === 0xC6) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength),
      off = dv.getUint32(4, true),
      len = dv.getUint32(8, true);
    if (off > 0 && off + len <= u8.length) u8 = u8.subarray(off, off + len);
  }
  const raw = new TextDecoder('latin1').decode(u8);
  const emb = readEmbedded(raw);
  if (emb) return {
    embeddedSvg: emb
  };
  if (/^\s*(<\?xml[\s\S]*?>\s*)?<svg[\s>]/i.test(raw.slice(0, 2048))) return {
    embeddedSvg: new TextDecoder('utf-8').decode(u8)
  };
  let bbox = [0, 0, 612, 792],
    hasBox = false;
  const mb = raw.match(/\/(?:ArtBox|CropBox|TrimBox|MediaBox)\s*\[\s*([-+.\d]+)\s+([-+.\d]+)\s+([-+.\d]+)\s+([-+.\d]+)\s*\]/) || raw.match(/%%HiResBoundingBox:\s*([-+.\d]+)\s+([-+.\d]+)\s+([-+.\d]+)\s+([-+.\d]+)/) || raw.match(/%%BoundingBox:\s*([-+.\d]+)\s+([-+.\d]+)\s+([-+.\d]+)\s+([-+.\d]+)/);
  if (mb) {
    const v = [1, 2, 3, 4].map(i => parseFloat(mb[i]));
    if (v.every(x => !isNaN(x)) && v[2] > v[0] && v[3] > v[1]) {
      bbox = v;
      hasBox = true;
    }
  }
  const gsMap = {};
  for (const g of raw.matchAll(/\/([\w.-]+)\s*<<[^<>]*?\/ca\s+([-+.\d]+)/g)) {
    const v = parseFloat(g[2]);
    if (!isNaN(v)) gsMap[g[1]] = Math.max(0, Math.min(1, v));
  }
  if (raw.startsWith('%PDF-')) {
    /* langkah 1: inventaris semua stream (nomor objek, kamus, rentang byte) */
    const recs = [];
    let pos = 0;
    while (pos < raw.length) {
      const sIdx = raw.indexOf('stream', pos);
      if (sIdx < 0) break;
      let start = sIdx + 6;
      if (raw[start] === '\r' && raw[start + 1] === '\n') start += 2;else if (raw[start] === '\n' || raw[start] === '\r') start += 1;else {
        pos = sIdx + 6;
        continue;
      }
      const eIdx = raw.indexOf('endstream', start);
      if (eIdx < 0) break;
      let end = eIdx;
      if (raw[end - 2] === '\r' && raw[end - 1] === '\n') end -= 2;else if (raw[end - 1] === '\n' || raw[end - 1] === '\r') end -= 1;
      let head = raw.slice(Math.max(0, sIdx - 500), sIdx);
      const oi = head.lastIndexOf('obj');
      if (oi >= 0) head = head.slice(oi + 3);
      const nm = raw.slice(Math.max(0, sIdx - 500), sIdx).match(/(\d+)\s+\d+\s+obj(?![\s\S]*\bobj\b)/);
      recs.push({
        num: nm ? +nm[1] : -1,
        head,
        start,
        end
      });
      pos = eIdx + 9;
    }
    /* langkah 2: pilih stream konten HALAMAN (hindari AIPrivateData Illustrator yang menduplikasi karya) */
    const cm = raw.match(/\/Contents\s*(?:(\d+)\s+\d+\s+R|\[([^\]]*)\])/);
    let order = null;
    if (cm) order = cm[1] ? [+cm[1]] : [...cm[2].matchAll(/(\d+)\s+\d+\s+R/g)].map(m => +m[1]);
    const isVec = r => !/\/Subtype\s*\/(?:Image|Form|Type1C|CIDFont|OpenType)|\/Type\s*\/(?:Metadata|XRef|ObjStm|Font|FontDescriptor)/.test(r.head);
    let pick = order ? order.map(n => recs.find(r => r.num === n)).filter(Boolean) : [];
    const decode = async r => {
      const fl = r.head.match(/\/Filter\s*(?:\[\s*)?\/(\w+)/);
      if (fl && fl[1] !== 'FlateDecode') return null;
      if (fl) return inflateBytes(u8.subarray(r.start, r.end));
      return raw.slice(r.start, r.end);
    };
    const out = [];
    for (const r of pick.length ? pick : recs.filter(isVec)) {
      const t = await decode(r);
      if (t && looksText(t) && OPS_RE.test(t) && (pick.length || !/AIPrivateData|%AI\d|%%BeginProlog/.test(t))) out.push(t);
    }
    if (out.length) return {
      streamText: out.join('\n'),
      bbox,
      hasBox,
      isPDF: true,
      gsMap
    };
    return {
      streamText: '',
      bbox,
      hasBox,
      isPDF: true,
      noStream: true
    };
  }
  return {
    streamText: raw,
    bbox,
    hasBox,
    isPDF: false,
    gsMap
  };
}

/* interpreter RPN PostScript / EPS / PDF / AI → dokumen vektor SVGPeak */
/* interpreter RPN PostScript / EPS / PDF / AI → dokumen vektor SVGPeak */
async function parsePSorAI(buffer) {
  const ext = await extractPSStreams(buffer);
  if (ext.embeddedSvg) return parseSVG(ext.embeddedSvg);
  if (ext.noStream) return {
    viewBox: [0, 0, 100, 100],
    objects: [],
    unsupported: true,
    error: true
  };
  const [llx, lly, urx, ury] = ext.bbox;
  let W = Math.max(1, urx - llx),
    H = Math.max(1, ury - lly);
  const clean = (ext.streamText || '').replace(/%[^\r\n]*/g, ' ').replace(/\((?:\\.|[^\\()])*\)/g, ' ').replace(/<(?!<)[0-9A-Fa-f\s]*>/g, ' ');
  const cl01 = v => Math.max(0, Math.min(1, v));
  const cmykHex = (c, m, y, k) => {
    const K = 1 - cl01(k);
    return toHex(255 * (1 - cl01(c)) * K, 255 * (1 - cl01(m)) * K, 255 * (1 - cl01(y)) * K);
  };
  const rgbHex = (r, g, b) => {
    const sc = r > 1 || g > 1 || b > 1 ? 1 : 255;
    return toHex(r * sc, g * sc, b * sc);
  };
  const grayHex = g => {
    const v = g > 1 ? g : g * 255;
    return toHex(v, v, v);
  };
  let state = {
    ctm: [1, 0, 0, -1, -llx, ury],
    fill: '#000000',
    stroke: '#000000',
    sw: 1,
    op: 1,
    clipPathD: null,
    clipRule: 'nonzero'
  };
  const gstack = [];
  const unsupportedOps = [];
  const notePsUnsupported = opName => {
    if (unsupportedOps.length < 24 && !unsupportedOps.includes(opName)) unsupportedOps.push(opName);
  };
  const trPt = (x, y) => {
    const m = state.ctm;
    return {
      x: rd(m[0] * x + m[2] * y + m[4]),
      y: rd(m[1] * x + m[3] * y + m[5])
    };
  };
  const objects = [];
  let curD = '',
    cx = 0,
    cy = 0,
    sx = 0,
    sy = 0,
    auto = 0,
    lastName = '';
  const stack = [];
  const popN = k => stack.splice(stack.length - k, k);
  const flushPath = (doFill, doStroke, evenodd, closeFirst) => {
    if (!curD) return;
    if (closeFirst && !curD.endsWith('Z')) curD += 'Z';
    const subs = parsePath(curD, [1, 0, 0, 1, 0, 0]);
    curD = '';
    if (!subs.length) return;
    const sc = Math.sqrt(Math.abs(state.ctm[0] * state.ctm[3] - state.ctm[1] * state.ctm[2])) || 1;
    objects.push({
      id: uid(),
      name: 'vec-' + ++auto,
      type: 'path',
      fill: doFill ? state.fill : 'none',
      stroke: doStroke ? state.stroke : 'none',
      strokeWidth: doStroke ? rd(state.sw * sc) : 0,
      opacity: state.op,
      fillRule: evenodd ? 'evenodd' : 'nonzero',
      ...(state.clipPathD ? {
        clipPathD: state.clipPathD,
        clipRule: state.clipRule || 'nonzero'
      } : {}),
      group: null,
      subs
    });
  };
  const startIfNone = () => {
    if (!curD) {
      const p0 = trPt(cx, cy);
      curD = 'M' + p0.x + ' ' + p0.y;
    }
  };
  const tokRe = /\[|\]|\/[^\s[\](){}]+|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?|[a-zA-Z*'"]+|\S/g;
  let m;
  while (m = tokRe.exec(clean)) {
    const tk = m[0];
    if (tk === '[' || tk === ']') continue;
    if (tk[0] === '/') {
      lastName = tk.slice(1);
      continue;
    }
    const num = Number(tk);
    if (!isNaN(num) && /[\d.]/.test(tk)) {
      stack.push(num);
      if (stack.length > 64) stack.shift();
      continue;
    }
    const n = stack.length;
    if ((tk === 'm' || tk === 'moveto' || tk === 'rmoveto') && n >= 2) {
      const [x, y] = popN(2);
      cx = tk === 'rmoveto' ? cx + x : x;
      cy = tk === 'rmoveto' ? cy + y : y;
      sx = cx;
      sy = cy;
      const p = trPt(cx, cy);
      curD += 'M' + p.x + ' ' + p.y;
    } else if ((tk === 'l' || tk === 'L' || tk === 'lineto' || tk === 'rlineto') && n >= 2) {
      const [x, y] = popN(2);
      startIfNone();
      cx = tk === 'rlineto' ? cx + x : x;
      cy = tk === 'rlineto' ? cy + y : y;
      const p = trPt(cx, cy);
      curD += 'L' + p.x + ' ' + p.y;
    } else if ((tk === 'c' || tk === 'C' || tk === 'curveto' || tk === 'rcurveto') && n >= 6) {
      const [x1, y1, x2, y2, x3, y3] = popN(6),
        rel = tk === 'rcurveto';
      startIfNone();
      const p1 = trPt(rel ? cx + x1 : x1, rel ? cy + y1 : y1),
        p2 = trPt(rel ? cx + x2 : x2, rel ? cy + y2 : y2);
      cx = rel ? cx + x3 : x3;
      cy = rel ? cy + y3 : y3;
      const p3 = trPt(cx, cy);
      curD += 'C' + p1.x + ' ' + p1.y + ' ' + p2.x + ' ' + p2.y + ' ' + p3.x + ' ' + p3.y;
    } else if ((tk === 'v' || tk === 'V') && n >= 4) {
      /* c1 = titik saat ini */
      const [x2, y2, x3, y3] = popN(4);
      startIfNone();
      const p1 = trPt(cx, cy),
        p2 = trPt(x2, y2);
      cx = x3;
      cy = y3;
      const p3 = trPt(cx, cy);
      curD += 'C' + p1.x + ' ' + p1.y + ' ' + p2.x + ' ' + p2.y + ' ' + p3.x + ' ' + p3.y;
    } else if ((tk === 'y' || tk === 'Y') && n >= 4) {
      /* c2 = titik akhir */
      const [x1, y1, x3, y3] = popN(4);
      startIfNone();
      const p1 = trPt(x1, y1);
      cx = x3;
      cy = y3;
      const p3 = trPt(cx, cy);
      curD += 'C' + p1.x + ' ' + p1.y + ' ' + p3.x + ' ' + p3.y + ' ' + p3.x + ' ' + p3.y;
    } else if ((tk === 'arc' || tk === 'arcn') && n >= 5) {
      /* busur lingkaran PostScript -> Bezier kubik (maks 90° per segmen) */
      const [ax, ay, r, ang1, ang2] = popN(5),
        ccw = tk === 'arc';
      const a1 = ang1 * Math.PI / 180;
      let dth = ccw ? ang2 - ang1 : ang1 - ang2;
      dth = (dth % 360 + 360) % 360 * Math.PI / 180;
      if (dth < 1e-9 && Math.abs(ang2 - ang1) >= 360 - 1e-3) dth = 2 * Math.PI;
      const steps = Math.max(1, Math.ceil(dth / (Math.PI / 2) - 1e-9));
      const stepAng = (ccw ? 1 : -1) * (dth / steps),
        kk = 4 / 3 * Math.tan(stepAng / 4);
      const x0 = ax + r * Math.cos(a1),
        y0 = ay + r * Math.sin(a1),
        p0 = trPt(x0, y0);
      if (curD) curD += 'L' + p0.x + ' ' + p0.y;else {
        curD = 'M' + p0.x + ' ' + p0.y;
        sx = x0;
        sy = y0;
      }
      let th = a1;
      for (let st = 0; st < steps; st++) {
        const tn = th + stepAng,
          c0 = Math.cos(th),
          s0 = Math.sin(th),
          c1 = Math.cos(tn),
          s1 = Math.sin(tn);
        const q1 = trPt(ax + r * (c0 - kk * s0), ay + r * (s0 + kk * c0)),
          q2 = trPt(ax + r * (c1 + kk * s1), ay + r * (s1 - kk * c1)),
          q3 = trPt(ax + r * c1, ay + r * s1);
        curD += 'C' + q1.x + ' ' + q1.y + ' ' + q2.x + ' ' + q2.y + ' ' + q3.x + ' ' + q3.y;
        th = tn;
      }
      cx = ax + r * Math.cos(th);
      cy = ay + r * Math.sin(th);
    } else if (tk === 're' && n >= 4) {
      const [x, y, w, h] = popN(4),
        p0 = trPt(x, y),
        p1 = trPt(x + w, y),
        p2 = trPt(x + w, y + h),
        p3 = trPt(x, y + h);
      curD += 'M' + p0.x + ' ' + p0.y + 'L' + p1.x + ' ' + p1.y + 'L' + p2.x + ' ' + p2.y + 'L' + p3.x + ' ' + p3.y + 'Z';
      cx = sx = x;
      cy = sy = y;
    } else if (tk === 'h' || tk === 'closepath') {
      if (curD && !curD.endsWith('Z')) curD += 'Z';
      cx = sx;
      cy = sy;
    }
    /* warna */else if ((tk === 'rg' || tk === 'setrgbcolor' || tk === 'Xa') && n >= 3) {
      const [r, g, b] = popN(3);
      state.fill = rgbHex(r, g, b);
    } else if ((tk === 'RG' || tk === 'XA') && n >= 3) {
      const [r, g, b] = popN(3);
      state.stroke = rgbHex(r, g, b);
    } else if ((tk === 'k' || tk === 'setcmykcolor') && n >= 4) {
      const [c, m2, y, k] = popN(4);
      state.fill = cmykHex(c, m2, y, k);
    } else if (tk === 'K' && n >= 4) {
      const [c, m2, y, k] = popN(4);
      state.stroke = cmykHex(c, m2, y, k);
    } else if ((tk === 'g' || tk === 'setgray') && n >= 1) {
      const [g] = popN(1);
      state.fill = grayHex(g);
    } else if (tk === 'G' && n >= 1) {
      const [g] = popN(1);
      state.stroke = grayHex(g);
    } else if ((tk === 'sc' || tk === 'scn' || tk === 'SC' || tk === 'SCN') && n >= 1) {
      /* warna generik: jumlah operand menentukan ruang warna */
      const f = tk === 'sc' || tk === 'scn',
        hex = n >= 4 ? cmykHex(...stack.slice(-4)) : n === 3 ? rgbHex(...stack.slice(-3)) : n === 1 ? grayHex(stack[n - 1]) : null;
      if (hex) {
        if (f) state.fill = hex;else state.stroke = hex;
      }
    } else if (tk === 'gs') {
      const v = (ext.gsMap || {})[lastName];
      if (v != null) state.op = v;
    } else if ((tk === 'w' || tk === 'setlinewidth') && n >= 1) {
      const [w] = popN(1);
      state.sw = Math.max(0.01, w);
    }
    /* matriks & stack grafis */else if ((tk === 'cm' || tk === 'concat') && n >= 6) {
      state.ctm = mmul(state.ctm, popN(6));
    } else if (tk === 'translate' && n >= 2) {
      const [tx, ty] = popN(2);
      state.ctm = mmul(state.ctm, [1, 0, 0, 1, tx, ty]);
    } else if (tk === 'scale' && n >= 2) {
      const [a, d] = popN(2);
      state.ctm = mmul(state.ctm, [a, 0, 0, d, 0, 0]);
    } else if (tk === 'rotate' && n >= 1) {
      const [deg] = popN(1),
        r = deg * Math.PI / 180,
        c = Math.cos(r),
        s = Math.sin(r);
      state.ctm = mmul(state.ctm, [c, s, -s, c, 0, 0]);
    } else if (tk === 'q' || tk === 'gsave') gstack.push({
      ...state,
      ctm: state.ctm.slice(),
      _p: [curD, cx, cy, sx, sy]
    });else if (tk === 'Q' || tk === 'grestore') {
      if (gstack.length) {
        const sv = gstack.pop();
        if (tk === 'grestore') [curD, cx, cy, sx, sy] = sv._p;
        delete sv._p;
        state = sv;
      }
    }
    /* paint */else if (tk === 'f' || tk === 'F' || tk === 'fill') flushPath(true, false, false, false);else if (tk === 'f*' || tk === 'eofill') flushPath(true, false, true, false);else if (tk === 'S' || tk === 'stroke') flushPath(false, true, false, false);else if (tk === 's') flushPath(false, true, false, true);else if (tk === 'B') flushPath(true, true, false, false);else if (tk === 'B*') flushPath(true, true, true, false);else if (tk === 'b') flushPath(true, true, false, true);else if (tk === 'b*') flushPath(true, true, true, true);else if (tk === 'n' || tk === 'N' || tk === 'newpath') curD = '';else if (tk === 'W' || tk === 'W*' || tk === 'clip' || tk === 'eoclip') {
      /* GV-A12: Rekam geometri clipping aktif ke dalam graphics state (dipulihkan saat Q / grestore) */
      if (curD) {
        const closedClipD = curD.endsWith('Z') ? curD : curD + 'Z';
        const clipSubs = parsePath(closedClipD, [1, 0, 0, 1, 0, 0]);
        if (clipSubs.length) {
          const newClipD = clipSubs.map(sp => serializeSub(sp)).join(' ');
          state.clipPathD = state.clipPathD ? state.clipPathD + ' ' + newClipD : newClipD;
          state.clipRule = tk === 'W*' || tk === 'eoclip' ? 'evenodd' : 'nonzero';
        }
      }
    } else if (['sh', 'shfill', 'Do', 'BI', 'ID', 'EI', 'Tj', 'TJ', 'show', 'ashow', 'widthshow', 'awidthshow', 'kshow', 'xshow', 'yshow', 'xyshow'].includes(tk)) {
      notePsUnsupported(tk);
    }
    /* setiap operator (dikenal atau tidak) menghabiskan operandnya */
    stack.length = 0;
  }
  let vb = [0, 0, W, H];
  if (!ext.hasBox && objects.length) {
    const bb = docBounds({
      objects
    });
    if (bb && bb[2] > bb[0] && bb[3] > bb[1]) {
      const x0 = Math.floor(bb[0]),
        y0 = Math.floor(bb[1]);
      vb = [x0, y0, Math.ceil(bb[2]) - x0, Math.ceil(bb[3]) - y0];
    }
  }
  const unsupported = unsupportedOps.length > 0;
  const unsupportedSummary = unsupportedOps.slice(0, 6).join(', ');
  return {
    viewBox: vb,
    objects,
    unsupported,
    unsupportedElements: unsupportedOps,
    unsupportedSummary,
    error: !objects.length
  };
}

/* ---- bantuan ekspor ---- */
/* ---- bantuan ekspor ---- */
const hex01 = hx => {
  const h = cssToHex(hx || '#000000');
  return [1, 3, 5].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4)).join(' ');
};
const hasPaint = o => {
  const f = o.fill && o.fill !== 'none',
    s = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;
  return {
    f,
    s
  };
};
function pathOps(o, mv, ln, cu, cz) {
  let t = '';
  o.subs.forEach(sp => {
    const ns = sp.nodes,
      n = ns.length;
    if (!n) return;
    t += mv(ns[0]);
    const lim = sp.closed ? n : n - 1;
    for (let i = 0; i < lim; i++) {
      const a = ns[i],
        b = ns[(i + 1) % n];
      if (a.handleOut || b.handleIn) {
        const c1 = a.handleOut || a,
          c2 = b.handleIn || b;
        t += cu(c1, c2, b);
      } else if (i < n - 1) t += ln(b);
    }
    if (sp.closed) t += cz();
  });
  return t;
}

/* ---- ekspor PostScript / EPS (%!PS-Adobe-3.0 EPSF-3.0) ---- */
/* ---- ekspor PostScript / EPS (%!PS-Adobe-3.0 EPSF-3.0) ---- */
function exportEPS(doc, opt) {
  opt = opt || {};
  const svgStr = serializeDoc(doc, opt),
    parsed = parseSVG(svgStr),
    [vx, vy, vw, vh] = parsed.viewBox;
  let ps = '%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Geovanta Vector Editor\n%%BoundingBox: 0 0 ' + Math.ceil(vw) + ' ' + Math.ceil(vh) + '\n%%HiResBoundingBox: 0 0 ' + rd(vw) + ' ' + rd(vh) + '\n%%LanguageLevel: 2\n%%Pages: 1\n%%EndComments\n';
  ps += embedLines(svgStr);
  ps += 'gsave\n0 ' + rd(vh) + ' translate 1 -1 scale\n' + rd(-vx) + ' ' + rd(-vy) + ' translate\n';
  if (opt.bg && opt.bg.mode === 'solid') ps += hex01(opt.bg.color) + ' setrgbcolor\n' + rd(vx) + ' ' + rd(vy) + ' ' + rd(vw) + ' ' + rd(vh) + ' rectfill\n';
  parsed.objects.forEach(o => {
    if (o.img) return;
    const {
      f,
      s
    } = hasPaint(o);
    if (!f && !s) return;
    ps += 'newpath\n' + pathOps(o, p => rd(p.x) + ' ' + rd(p.y) + ' moveto\n', p => rd(p.x) + ' ' + rd(p.y) + ' lineto\n', (c1, c2, p) => rd(c1.x) + ' ' + rd(c1.y) + ' ' + rd(c2.x) + ' ' + rd(c2.y) + ' ' + rd(p.x) + ' ' + rd(p.y) + ' curveto\n', () => 'closepath\n');
    const fOp = o.fillRule === 'evenodd' ? 'eofill' : 'fill';
    if (f && s) ps += 'gsave ' + hex01(o.fill) + ' setrgbcolor ' + fOp + ' grestore\n' + hex01(o.stroke) + ' setrgbcolor ' + rd(o.strokeWidth) + ' setlinewidth stroke\n';else if (f) ps += hex01(o.fill) + ' setrgbcolor ' + fOp + '\n';else ps += hex01(o.stroke) + ' setrgbcolor ' + rd(o.strokeWidth) + ' setlinewidth stroke\n';
  });
  return ps + 'grestore\nshowpage\n%%EOF\n';
}

/* ---- ekspor Adobe Illustrator (.ai): PDF-1.4 + stream vektor asli + SVG sumber ---- */
/* ---- ekspor Adobe Illustrator (.ai): PDF-1.4 + stream vektor asli + SVG sumber ---- */
function exportAI(doc, opt) {
  opt = opt || {};
  const svgStr = serializeDoc(doc, opt),
    parsed = parseSVG(svgStr),
    [vx, vy, vw, vh] = parsed.viewBox;
  const gs = [];
  let stm = 'q\n1 0 0 -1 ' + rd(-vx) + ' ' + rd(vh + vy) + ' cm\n';
  if (opt.bg && opt.bg.mode === 'solid') stm += hex01(opt.bg.color) + ' rg\n' + rd(vx) + ' ' + rd(vy) + ' ' + rd(vw) + ' ' + rd(vh) + ' re f\n';
  parsed.objects.forEach(o => {
    if (o.img) return;
    const {
      f,
      s
    } = hasPaint(o);
    if (!f && !s) return;
    const op = o.opacity != null && o.opacity < 1;
    let gi = 0;
    if (op) {
      gs.push(rd(o.opacity));
      gi = gs.length;
      stm += 'q\n/GS' + gi + ' gs\n';
    }
    if (f) stm += hex01(o.fill) + ' rg\n';
    if (s) stm += hex01(o.stroke) + ' RG ' + rd(o.strokeWidth) + ' w\n';
    stm += pathOps(o, p => rd(p.x) + ' ' + rd(p.y) + ' m\n', p => rd(p.x) + ' ' + rd(p.y) + ' l\n', (c1, c2, p) => rd(c1.x) + ' ' + rd(c1.y) + ' ' + rd(c2.x) + ' ' + rd(c2.y) + ' ' + rd(p.x) + ' ' + rd(p.y) + ' c\n', () => 'h\n');
    const eo = o.fillRule === 'evenodd';
    stm += (f && s ? eo ? 'B*' : 'B' : f ? eo ? 'f*' : 'f' : 'S') + '\n';
    if (op) stm += 'Q\n';
  });
  stm += 'Q\n';
  const res = gs.length ? '<< /ExtGState << ' + gs.map((a, i) => '/GS' + (i + 1) + ' << /Type /ExtGState /ca ' + a + ' /CA ' + a + ' >>').join(' ') + ' >> >>' : '<< >>';
  const box = '[0 0 ' + rd(vw) + ' ' + rd(vh) + ']';
  const objs = ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ' + box + ' /ArtBox ' + box + ' /Contents 4 0 R /Resources ' + res + ' >>\nendobj\n', '4 0 obj\n<< /Length ' + stm.length + ' >>\nstream\n' + stm + 'endstream\nendobj\n', '5 0 obj\n<< /Producer (Geovanta Vector Editor) /Creator (Geovanta) >>\nendobj\n'];
  let pdf = '%PDF-1.4\n' + embedLines(svgStr);
  const offs = []; /* semua ASCII → panjang string = offset byte */
  objs.forEach(o => {
    offs.push(pdf.length);
    pdf += o;
  });
  const xp = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offs.forEach(p => {
    pdf += String(p).padStart(10, '0') + ' 00000 n \n';
  });
  return pdf + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xp + '\n%%EOF\n';
}

/* ---- GV-A06 & GV-A13: ekspor raster (.png/.jpg/.webp) dengan batas piksel perangkat, guard CORS/tainted canvas & jaminan settlement Promise ---- */
/* ---- GV-A06 & GV-A13: ekspor raster (.png/.jpg/.webp) dengan batas piksel perangkat, guard CORS/tainted canvas & jaminan settlement Promise ---- */
function exportRaster(doc, opt, format, scale, quality) {
  scale = Number(scale) > 0 ? Number(scale) : 2;
  quality = quality == null ? 0.92 : quality;
  return new Promise((resolve, reject) => {
    let settled = false;
    let url = null;
    let timer = 0;
    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
        url = null;
      }
    };
    const safeResolve = val => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };
    const safeReject = err => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err || 'Gagal mengekspor raster')));
    };
    try {
      opt = opt || {};
      const prof = typeof ACTIVE_DEVICE_PROFILE !== 'undefined' && ACTIVE_DEVICE_PROFILE ? ACTIVE_DEVICE_PROFILE : {
        maxExportDimension: 8192,
        maxExportPixels: 67108864
      };
      const MAXD = Math.min(8192, prof.maxExportDimension || 8192, typeof GPU_CAPS !== 'undefined' && GPU_CAPS.maxTextureSize || 8192);
      const MAXA = Math.min(67108864, prof.maxExportPixels || 67108864);
      const svgStr = serializeDoc(doc, opt);
      const vbm = svgStr.match(/viewBox="([^"]+)"/);
      const vb = vbm ? vbm[1].split(/\s+/).map(Number) : [0, 0, 100, 100];
      let k = scale;
      k = Math.min(k, MAXD / Math.max(vb[2], 1), MAXD / Math.max(vb[3], 1), Math.sqrt(MAXA / Math.max(vb[2] * vb[3], 1)));
      const W = Math.max(1, Math.min(MAXD, Math.round(vb[2] * k)));
      const H = Math.max(1, Math.min(MAXD, Math.round(vb[3] * k)));
      if (W * H > MAXA) {
        return safeReject(new Error(`Resolusi ekspor (${W}×${H}) melebihi anggaran memori aman perangkat`));
      }
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d');
      if (!ctx) return safeReject(new Error('Konteks Canvas2D tidak tersedia untuk ekspor raster'));
      const jpg = format === 'jpg' || format === 'jpeg';
      if (jpg) {
        ctx.fillStyle = opt.bg && opt.bg.mode === 'solid' && opt.bg.color ? opt.bg.color : '#ffffff';
        ctx.fillRect(0, 0, W, H);
      }
      const sized = svgStr.replace(/<svg\b[^>]*>/, tag => tag.replace(/\s(?:width|height)="[^"]*"/g, '').replace('<svg ', '<svg width="' + W + '" height="' + H + '" '));
      url = URL.createObjectURL(new Blob([sized], {
        type: 'image/svg+xml;charset=utf-8'
      }));
      const im = new Image();
      im.crossOrigin = 'anonymous';
      timer = setTimeout(() => {
        safeReject(new Error('Waktu tunggu ekspor raster habis (timeout)'));
      }, 12000);
      im.onload = () => {
        try {
          ctx.drawImage(im, 0, 0, W, H);
          const mime = jpg ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
          if (typeof cv.toBlob !== 'function') {
            const dataUrl = cv.toDataURL(mime, quality);
            const bin = atob(dataUrl.split(',')[1] || '');
            const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            return safeResolve(new Blob([u8], {
              type: mime
            }));
          }
          cv.toBlob(b => {
            if (b) safeResolve(b);else safeReject(new Error('Browser tidak mendukung format ' + format));
          }, mime, quality);
        } catch (drawErr) {
          safeReject(new Error('Kanvas terkontaminasi aset lintas-origin (CORS tainted canvas) atau gagal merender: ' + (drawErr && drawErr.message || drawErr)));
        }
      };
      im.onerror = () => safeReject(new Error('Gagal merender dokumen SVG ke kanvas raster'));
      im.src = url;
    } catch (err) {
      safeReject(err);
    }
  });
}

/* =========================================================================
   TRANSFORM, ALIGNMENT, AUTO LAYOUT & PADDING ALA FIGMA (v4.4)
   Semua operasi immutable dan memakai invariansi afin Bézier: node + handle + metadata fillet
   ditransformasikan dengan matriks yang sama, sehingga bentuk kurva tidak berubah.
   ========================================================================= */
/* Kotak pembatas gabungan untuk himpunan objek (atau node terpilih bila selNodes diberikan) */

export { b64enc, b64dec, embedLines, readEmbedded, inflateBytes, looksText, OPS_RE, extractPSStreams, parsePSorAI, hex01, hasPaint, pathOps, exportEPS, exportAI, exportRaster };
