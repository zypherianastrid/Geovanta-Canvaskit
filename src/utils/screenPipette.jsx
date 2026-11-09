/**
 * @file src/utils/screenPipette.jsx
 * @description Alat pipet warna layar (EyeDropper & kanvas fallback)
 */
import { cssPaint, parseColorWithAlpha, hex3b } from './colorParserAndFormatter.jsx';

const colorAtPoint = (x, y) => {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest && el.closest('.pip-ov')) continue;
    let c = null;
    try {
      if (el instanceof SVGGeometryElement) {
        const cs = getComputedStyle(el);
        if (+cs.fillOpacity > 0) c = cssPaint(cs.fill);
        if (!c) {
          const rawFill = el.getAttribute('fill') || '';
          const gm = /^url\(#([^)]+)\)$/i.exec(rawFill.trim());
          if (gm) {
            const gEl = document.getElementById(gm[1]);
            const st = gEl && gEl.querySelector('stop');
            if (st) c = cssPaint(getComputedStyle(st).stopColor) || st.getAttribute('stop-color');
          } else if (rawFill && rawFill !== 'none') {
            c = parseColorWithAlpha(rawFill).hex;
          }
        }
        if (!c && +cs.strokeOpacity > 0) c = cssPaint(cs.stroke);
      } else if (el.tagName && el.tagName.toLowerCase() === 'image') {
        const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (href) {
          const r = el.getBoundingClientRect();
          if (r.width && r.height) c = '#6366f1';
        }
      } else if (el instanceof HTMLCanvasElement) {
        const r = el.getBoundingClientRect(),
          g = el.getContext('2d');
        if (g && r.width && r.height) {
          const d = g.getImageData(Math.floor((x - r.left) * el.width / r.width), Math.floor((y - r.top) * el.height / r.height), 1, 1).data;
          if (d[3] > 5) c = hex3b(d[0], d[1], d[2]);
        }
      } else if (el instanceof HTMLImageElement && el.naturalWidth) {
        const r = el.getBoundingClientRect(),
          cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const g = cv.getContext('2d', {
          willReadFrequently: true
        });
        g.drawImage(el, Math.floor((x - r.left) / r.width * el.naturalWidth), Math.floor((y - r.top) / r.height * el.naturalHeight), 1, 1, 0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        if (d[3] > 5) c = hex3b(d[0], d[1], d[2]);
      } else if (el instanceof HTMLElement) c = cssPaint(getComputedStyle(el).backgroundColor);
    } catch (e) {}
    if (c && /^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  }
  return null;
};
const pagePipette = () => new Promise(res => {
  const host = document.fullscreenElement || document.body,
    ov = document.createElement('div'),
    ring = document.createElement('div'),
    chip = document.createElement('div'),
    hint = document.createElement('div');
  ov.className = 'pip-ov';
  ring.className = 'pip-ring';
  chip.className = 'pip-chip';
  hint.className = 'pip-hint';
  chip.innerHTML = '<i></i><span>—</span>';
  hint.textContent = 'Klik di kanvas/layar untuk mengambil warna · Esc untuk batal';
  ov.append(ring, chip, hint);
  host.appendChild(ov);
  let cur = null;
  const upd = e => {
    ring.style.left = chip.style.left = e.clientX + 'px';
    ring.style.top = chip.style.top = e.clientY + 'px';
    cur = colorAtPoint(e.clientX, e.clientY);
    chip.firstChild.style.background = cur || '';
    chip.lastChild.textContent = cur ? cur.toUpperCase() : 'Tidak ada warna';
  };
  const done = c => {
    removeEventListener('keydown', kd, true);
    ov.remove();
    res(c);
  };
  const kd = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      done(null);
    }
  };
  ov.addEventListener('pointermove', upd);
  ov.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    upd(e);
    if (e.pointerType === 'mouse') done(cur);
  });
  ov.addEventListener('pointerup', e => {
    e.stopPropagation();
    if (e.pointerType !== 'mouse') done(cur);
  });
  ov.addEventListener('pointercancel', () => done(null));
  addEventListener('keydown', kd, true);
});
const pickScreenColor = async () => {
  if (window.EyeDropper) {
    try {
      const r = await new window.EyeDropper().open();
      return r && r.sRGBHex ? String(r.sRGBHex).toLowerCase() : null;
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
    }
  }
  return pagePipette();
};

/* Pemilih warna kustom lengkap: SV area, Hue slider, Slider Transparansi (0-100%), Hapus Warna (No Color), Hex & Opacity CustomTextBox, dan Eye Color Dropper */

export { colorAtPoint, pagePipette, pickScreenColor };
