/**
 * @file src/utils/colorParserAndFormatter.jsx
 * @description Parser & formatter warna CSS dengan kanal alfa (RGBA/Hex)
 */
import { clampN } from './colorMath.jsx';

/* Input angka kustom: tombol − / + , ketik langsung, panah atas/bawah */
const hex3b = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(+v))).toString(16).padStart(2, '0')).join('');
const cssPaint = c => {
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(c || '');
  if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return a > 0.02 ? hex3b(m[1], m[2], m[3]) : null;
};
const parseColorWithAlpha = val => {
  const s = String(val ?? '').trim();
  if (!s || s.toLowerCase() === 'none' || s.toLowerCase() === 'transparent') {
    return {
      hex: '#0d99ff',
      a: 0,
      isNone: true
    };
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return {
    hex: s.toLowerCase(),
    a: 1,
    isNone: false
  };
  if (/^#[0-9a-f]{8}$/i.test(s)) {
    const a = Math.round(parseInt(s.slice(7, 9), 16) / 255 * 100) / 100;
    return {
      hex: s.slice(0, 7).toLowerCase(),
      a: clampN(a, 0, 1),
      isNone: a <= 0
    };
  }
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return {
      hex: '#' + s.slice(1).split('').map(x => x + x).join('').toLowerCase(),
      a: 1,
      isNone: false
    };
  }
  const m = /rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/i.exec(s);
  if (m) {
    const hx = hex3b(m[1], m[2], m[3]);
    const rawA = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const a = clampN(isNaN(rawA) ? 1 : rawA, 0, 1);
    return {
      hex: hx,
      a,
      isNone: false
    };
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return {
    hex: s.toLowerCase(),
    a: 1,
    isNone: false
  };
  if (typeof cssToHex === 'function' && (typeof validColor !== 'function' || validColor(s))) {
    return {
      hex: cssToHex(s),
      a: 1,
      isNone: false
    };
  }
  return {
    hex: '#0d99ff',
    a: 1,
    isNone: false
  };
};
const formatColorWithAlpha = (hex, a) => {
  const cleanHex = (/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#0d99ff').toLowerCase();
  const alpha = clampN(a == null ? 1 : a, 0, 1);
  if (alpha >= 0.999) return cleanHex;
  const r = parseInt(cleanHex.slice(1, 3), 16),
    g = parseInt(cleanHex.slice(3, 5), 16),
    b = parseInt(cleanHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
};
const PAINT_RGBA_CACHE = new Map();
function parsePaintRgba01(colStr, opacity = 1) {
  if (!colStr || colStr === 'none' || colStr === 'transparent') return [0, 0, 0, 0];
  let base = PAINT_RGBA_CACHE.get(colStr);
  if (!base) {
    if (typeof parseColorWithAlpha === 'function') {
      const p = parseColorWithAlpha(colStr);
      const h = p.hex || '#000000';
      base = [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, p.a ?? 1];
    } else {
      base = [0, 0, 0, 1];
    }
    if (PAINT_RGBA_CACHE.size > 4096) PAINT_RGBA_CACHE.clear();
    PAINT_RGBA_CACHE.set(colStr, base);
  }
  const op = opacity ?? 1;
  if (op === 1 && base[3] === 1) return base;
  return [base[0], base[1], base[2], Math.max(0, Math.min(1, base[3] * op))];
}

/* =========================================================================
   TAHAP 5 — VALIDASI TRIANGULASI EAR-CLIPPING & DEGENERATE / SELF-INTERSECTION CHECK
   - Membersihkan titik hampir berhimpitan & segmen kolinier sebelum triangulasi.
   - Memeriksa apakah poligon memiliki self-intersection; jika ada, otomatis
     mengembalikan null agar dialihkan ke Hardware Stencil-Then-Cover!
   ========================================================================= */

const VCTX = (() => {
  try {
    return document.createElement('canvas').getContext('2d');
  } catch (e) {
    return null;
  }
})();
const HEX_CACHE = new Map();
const cssToHex = c => {
  if (!c) return '#000000';
  const hit = HEX_CACHE.get(c);
  if (hit) return hit;
  let out = '#000000';
  if (/^#[0-9a-f]{6}$/i.test(c)) out = c.toLowerCase();else if (/^#[0-9a-f]{3}$/i.test(c)) out = '#' + c.slice(1).split('').map(x => x + x).join('').toLowerCase();else {
    try {
      VCTX.fillStyle = '#000000';
      VCTX.fillStyle = c;
      const v = VCTX.fillStyle;
      if (v[0] === '#') out = v;else {
        const m = v.match(/\d+/g);
        if (m) out = '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
  }
  if (HEX_CACHE.size > 2000) HEX_CACHE.clear();
  HEX_CACHE.set(c, out);
  return out;
};
const validColor = s => s === 'none' || window.CSS && CSS.supports('color', s);

export { hex3b, cssPaint, parseColorWithAlpha, formatColorWithAlpha, PAINT_RGBA_CACHE, parsePaintRgba01, VCTX, HEX_CACHE, cssToHex, validColor };
