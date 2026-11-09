/**
 * @file src/workspace/thumbnailGenerator.jsx
 * @description Generator gambar pratinjau (Thumbnail) proyek secara asinkron di latar belakang
 */
import { VE } from '../engine/vectorEngine.jsx';

/* ----------------------------------------------------------------------------
   3. ThumbnailGenerator — Section 10 (Max 320 x 240 WebP Blob Preview)
   ---------------------------------------------------------------------------- */
const ThumbnailGenerator = (() => {
  /* Ukuran logis kartu 4:3 (360x270) + supersampling HiDPI 2.5x (900x675 piksel fisik)
     agar thumbnail di tab Workspace tampil sangat tajam pada layar standar maupun Retina/HiDPI 2x-3x */
  const MAX_W = 360;
  const MAX_H = 270;
  const THUMB_SCALE = 2.5;
  const computeDims = viewBox => {
    const vb = Array.isArray(viewBox) && viewBox.length === 4 ? viewBox : [0, 0, 800, 600];
    const vw = Math.max(1, Number(vb[2]) || 800);
    const vh = Math.max(1, Number(vb[3]) || 600);
    return {
      w: MAX_W,
      h: MAX_H,
      vx: Number(vb[0]) || 0,
      vy: Number(vb[1]) || 0,
      vw,
      vh
    };
  };

  /* GV-A19: Cached & bounded-concurrency image loader for thumbnail generation */
  const _thumbImgPromiseCache = new Map();
  const loadImgElement = (src, timeoutMs = 900) => {
    if (!src || typeof Image === 'undefined') return Promise.resolve(null);
    if (_thumbImgPromiseCache.has(src)) return _thumbImgPromiseCache.get(src);
    const p = new Promise(resolve => {
      const im = new Image();
      if (/^https?:\/\//i.test(src)) im.crossOrigin = 'anonymous';
      const timer = setTimeout(() => {
        _thumbImgPromiseCache.delete(src);
        resolve(null);
      }, timeoutMs);
      im.onload = () => {
        clearTimeout(timer);
        resolve(im);
      };
      im.onerror = () => {
        clearTimeout(timer);
        _thumbImgPromiseCache.delete(src);
        resolve(null);
      };
      im.src = src;
    });
    if (_thumbImgPromiseCache.size > 64) {
      const firstKey = _thumbImgPromiseCache.keys().next().value;
      _thumbImgPromiseCache.delete(firstKey);
    }
    _thumbImgPromiseCache.set(src, p);
    return p;
  };
  const preloadThumbImagesParallel = async (objs, maxConcurrency = 4, totalBudgetMs = 1500) => {
    const urls = [...new Set((objs || []).filter(o => o && !o.hidden && o.img && o.img.href).map(o => o.img.href))];
    const loadedMap = new Map();
    if (!urls.length) return loadedMap;
    const tStart = Date.now();
    let cursor = 0;
    const worker = async () => {
      while (cursor < urls.length) {
        const rem = totalBudgetMs - (Date.now() - tStart);
        if (rem <= 50) break;
        const u = urls[cursor++];
        const im = await loadImgElement(u, Math.min(800, rem));
        if (im) loadedMap.set(u, im);
      }
    };
    const workers = Array.from({
      length: Math.min(maxConcurrency, urls.length)
    }, () => worker());
    await Promise.all(workers);
    return loadedMap;
  };
  const generateThumbnailBlob = async (doc, opts = {}) => {
    const safeDoc = doc && Array.isArray(doc.objects) ? doc : {
      viewBox: [0, 0, 800, 600],
      objects: []
    };
    const {
      w,
      h,
      vx,
      vy,
      vw,
      vh
    } = computeDims(safeDoc.viewBox);
    if (typeof document === 'undefined' || !document.createElement) {
      return new Blob(['RIFF____WEBPVP8 '], {
        type: 'image/webp'
      });
    }
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * THUMB_SCALE);
    cv.height = Math.round(h * THUMB_SCALE);
    const ctx = cv.getContext('2d', {
      alpha: false
    });
    if (!ctx) return new Blob([], {
      type: 'image/webp'
    });
    ctx.scale(THUMB_SCALE, THUMB_SCALE);
    ctx.imageSmoothingEnabled = true;
    try {
      ctx.imageSmoothingQuality = 'high';
    } catch (e) {}

    // Clean Material UI 3.0 bright canvas preview backdrop (never black)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Subtle M3 grid pattern on background
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.045)';
    ctx.lineWidth = 1;
    const step = 16;
    ctx.beginPath();
    for (let gx = step; gx < w; gx += step) {
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
    }
    for (let gy = step; gy < h; gy += step) {
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
    }
    ctx.stroke();

    // Calculate fit transform framing visible objects or the artboard
    let bx0 = vx,
      by0 = vy,
      bw = vw,
      bh = vh;
    const visObjs = safeDoc.objects.filter(o => o && !o.hidden);
    if (typeof VE !== 'undefined' && VE.docBounds && visObjs.length > 0) {
      const bb = VE.docBounds({
        objects: visObjs
      });
      if (bb && isFinite(bb[0]) && bb[2] > bb[0] && bb[3] > bb[1]) {
        bx0 = bb[0];
        by0 = bb[1];
        bw = Math.max(1, bb[2] - bb[0]);
        bh = Math.max(1, bb[3] - bb[1]);
      }
    }
    const pad = 16;
    const availW = Math.max(1, w - pad * 2);
    const availH = Math.max(1, h - pad * 2);
    const scale = Math.min(availW / bw, availH / bh);
    const tx = pad + (availW - bw * scale) * 0.5 - bx0 * scale;
    const ty = pad + (availH - bh * scale) * 0.5 - by0 * scale;

    // Draw elevated white artboard card with soft shadow
    ctx.save();
    const abX = visObjs.length > 0 ? bx0 * scale + tx - 6 : vx * scale + tx;
    const abY = visObjs.length > 0 ? by0 * scale + ty - 6 : vy * scale + ty;
    const abW = visObjs.length > 0 ? bw * scale + 12 : vw * scale;
    const abH = visObjs.length > 0 ? bh * scale + 12 : vh * scale;
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(abX, abY, abW, abH);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(abX, abY, abW, abH);
    if (visObjs.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(vw) + ' × ' + Math.round(vh), abX + abW * 0.5, abY + abH * 0.5);
    }
    ctx.restore();

    /* GV-A19: Preload seluruh gambar secara paralel (maks 4 konkurensi, batas total 1.5 dtk) sebelum loop gambar */
    const preloadedImgs = await preloadThumbImagesParallel(safeDoc.objects, 4, 1500);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);
    for (let i = 0; i < safeDoc.objects.length; i++) {
      const o = safeDoc.objects[i];
      if (!o || o.hidden) continue;
      ctx.save();
      ctx.globalAlpha = (o.opacity != null ? o.opacity : 1) * (o.groupOpacity != null ? o.groupOpacity : 1);
      if (o.img && o.img.href) {
        const im = preloadedImgs.get(o.img.href) || null;
        const ns = o.subs && o.subs[0] && o.subs[0].nodes;
        if (im && ns && ns.length >= 4) {
          const p0 = ns[0],
            p1 = ns[1],
            p3 = ns[3];
          const iw = o.img.w || im.naturalWidth || 1;
          const ih = o.img.h || im.naturalHeight || 1;
          ctx.transform((p1.x - p0.x) / iw, (p1.y - p0.y) / iw, (p3.x - p0.x) / ih, (p3.y - p0.y) / ih, p0.x, p0.y);
          ctx.drawImage(im, 0, 0, iw, ih);
        } else if (ns && ns.length >= 4) {
          /* Placeholder kotak bersih jika gambar gagal/timeout */
          const p0 = ns[0],
            p2 = ns[2];
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(Math.min(p0.x, p2.x), Math.min(p0.y, p2.y), Math.abs(p2.x - p0.x), Math.abs(p2.y - p0.y));
        }
        ctx.restore();
        continue;
      }
      if (o.text) {
        const t = o.text;
        const m = typeof VE !== 'undefined' && VE.textMatrix ? VE.textMatrix(o) : [1, 0, 0, 1, t.x || 0, t.y || 0];
        if (m) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        const fs = Math.max(1, Number(t.fontSize) || 32);
        const lh = Math.max(0.5, Number(t.lineHeight) || 1.2);
        const st = t.fontStyle && t.fontStyle !== 'normal' ? 'italic ' : '';
        try {
          ctx.font = `${st}${t.fontWeight || 400} ${fs}px ${t.fontFamily || 'Inter, sans-serif'}`;
        } catch (e) {
          ctx.font = `${fs}px sans-serif`;
        }
        ctx.textAlign = t.textAnchor === 'middle' ? 'center' : t.textAnchor === 'end' ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        const lines = typeof VE !== 'undefined' && VE.formatTextLines ? VE.formatTextLines(t) : String(t.content || '').split('\n');
        const bShift = Number(t.baselineShift) || 0;
        if (o.fill && o.fill !== 'none') {
          ctx.fillStyle = o.fill;
          for (let li = 0; li < lines.length; li++) ctx.fillText(lines[li], 0, -bShift + li * fs * lh);
        }
        if (o.stroke && o.stroke !== 'none' && (o.strokeWidth || 0) > 0) {
          ctx.strokeStyle = o.stroke;
          ctx.lineWidth = o.strokeWidth || 1;
          for (let li = 0; li < lines.length; li++) ctx.strokeText(lines[li], 0, -bShift + li * fs * lh);
        }
        ctx.restore();
        continue;
      }
      const pathFn = typeof VE !== 'undefined' ? VE.serializePath || VE.objToD : null;
      if (typeof Path2D !== 'undefined' && pathFn) {
        const dStr = pathFn(o);
        if (dStr) {
          const p2 = new Path2D(dStr);
          if (o.fill && o.fill !== 'none' && o.fill !== 'transparent') {
            if (VE.gradOn && VE.gradOn(o) && o.grad) {
              const g = o.grad;
              let cGrad = null;
              if (g.type === 'radial') {
                cGrad = ctx.createRadialGradient(g.fx != null ? g.fx : g.cx, g.fy != null ? g.fy : g.cy, 0, g.cx, g.cy, Math.max(1e-3, g.r));
              } else {
                cGrad = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
              }
              (g.stops || []).forEach(st => {
                try {
                  cGrad.addColorStop(Math.max(0, Math.min(1, st.offset != null ? st.offset : st.off != null ? st.off : 0)), st.color || '#000');
                } catch (e) {}
              });
              ctx.fillStyle = cGrad;
            } else {
              ctx.fillStyle = o.fill;
            }
            ctx.fill(p2, o.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
          }
          if (o.stroke && o.stroke !== 'none' && (o.strokeWidth || 0) > 0) {
            if (VE.strokeGradOn && VE.strokeGradOn(o) && o.strokeGrad) {
              const sg = o.strokeGrad;
              const sGrad = sg.type === 'radial' ? ctx.createRadialGradient(sg.fx != null ? sg.fx : sg.cx, sg.fy != null ? sg.fy : sg.cy, 0, sg.cx, sg.cy, Math.max(1e-3, sg.r)) : ctx.createLinearGradient(sg.x1, sg.y1, sg.x2, sg.y2);
              (sg.stops || []).forEach(st => {
                try {
                  sGrad.addColorStop(Math.max(0, Math.min(1, st.offset != null ? st.offset : st.off != null ? st.off : 0)), st.color || '#000');
                } catch (e) {}
              });
              ctx.strokeStyle = sGrad;
            } else {
              ctx.strokeStyle = o.stroke;
            }
            ctx.lineWidth = o.strokeWidth || 1;
            ctx.lineCap = o.strokeLinecap || 'round';
            ctx.lineJoin = o.strokeLinejoin || 'round';
            ctx.stroke(p2);
          }
        }
      }
      ctx.restore();
    }
    ctx.restore();
    return new Promise(resolve => {
      try {
        cv.toBlob(blob => {
          if (blob) return resolve(blob);
          cv.toBlob(b2 => resolve(b2 || new Blob([], {
            type: 'image/webp'
          })), 'image/png');
        }, 'image/webp', 0.96);
      } catch (e) {
        resolve(new Blob([], {
          type: 'image/webp'
        }));
      }
    });
  };
  return {
    MAX_W,
    MAX_H,
    computeDims,
    generateThumbnailBlob
  };
})();

/* ----------------------------------------------------------------------------
   4. ZipEngine — Standards-compliant ZIP Reader & Writer for .geovanta Backup
   ---------------------------------------------------------------------------- */

export { ThumbnailGenerator };
export default ThumbnailGenerator;
