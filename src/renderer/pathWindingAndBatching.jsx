/**
 * @file src/renderer/pathWindingAndBatching.jsx
 * @description Normalisasi arah putaran (Winding Rule) path komposit, cache vinfo, & pengelompokan batch render SVG
 */
import { VE } from '../engine/vectorEngine.jsx';
import { subBBox, VINFO } from './subpathBBox.jsx';
import { cssToHex } from '../utils/colorParserAndFormatter.jsx';

const sampleSubPoly = sp => {
  const ns = sp.nodes,
    L = ns.length,
    pts = [];
  if (L < 2) return {
    pts,
    area2: 0
  };
  for (let i = 0; i < L; i++) {
    const a = ns[i],
      b = ns[(i + 1) % L];
    pts.push({
      x: a.x,
      y: a.y
    });
    if (a.handleOut || b.handleIn) {
      for (let k = 1; k < 6; k++) pts.push(VE.segPoint(a, b, k / 6));
    }
  }
  let area2 = 0;
  for (let i = 0, m = pts.length; i < m; i++) {
    const p = pts[i],
      q = pts[(i + 1) % m];
    area2 += p.x * q.y - q.x * p.y;
  }
  return {
    pts,
    area2
  };
};
const polyWindingAt = (pts, mx, my) => {
  let wn = 0;
  for (let k = 0, m = pts.length; k < m; k++) {
    const p = pts[k],
      q = pts[(k + 1) % m];
    if (p.y <= my) {
      if (q.y > my && (q.x - p.x) * (my - p.y) - (mx - p.x) * (q.y - p.y) > 0) wn++;
    } else {
      if (q.y <= my && (q.x - p.x) * (my - p.y) - (mx - p.x) * (q.y - p.y) < 0) wn--;
    }
  }
  return wn;
};
const reverseClosedSub = sp => ({
  id: sp.id,
  closed: sp.closed,
  nodes: sp.nodes.slice().reverse().map(n => ({
    x: n.x,
    y: n.y,
    handleIn: n.handleOut,
    handleOut: n.handleIn
  }))
});
const buildNormalizedPathD = (o, rawD) => {
  const subs = o.subs;
  if (!subs || !subs.length) return rawD;
  if (subs.length === 1) {
    const sp = subs[0];
    if (!sp.closed || sp.nodes.length < 2) return rawD;
    const {
      area2
    } = sampleSubPoly(sp);
    return area2 < -1e-9 ? VE.serializeSub(reverseClosedSub(sp)) : rawD;
  }
  const metas = subs.map(sp => {
    if (!sp.closed || sp.nodes.length < 2) return {
      sp,
      closed: false,
      pts: [],
      area2: 0,
      bb: subBBox(sp)
    };
    const {
      pts,
      area2
    } = sampleSubPoly(sp);
    const probe = VE.segPoint(sp.nodes[0], sp.nodes[1 % sp.nodes.length], 0.5);
    return {
      sp,
      closed: true,
      pts,
      area2,
      bb: subBBox(sp),
      probe
    };
  });
  let anyReversed = false;
  const parts = metas.map((m, i) => {
    if (!m.closed || Math.abs(m.area2) < 1e-9) return VE.serializeSub(m.sp);
    let encl = 0;
    const px = m.probe.x,
      py = m.probe.y;
    for (let j = 0; j < metas.length; j++) {
      if (j === i || !metas[j].closed) continue;
      const bj = metas[j].bb;
      if (px < bj[0] || px > bj[2] || py < bj[1] || py > bj[3]) continue;
      if (polyWindingAt(metas[j].pts, px, py) !== 0) encl++;
    }
    const wantPos = encl % 2 === 0;
    const isPos = m.area2 > 0;
    if (wantPos !== isPos) {
      anyReversed = true;
      return VE.serializeSub(reverseClosedSub(m.sp));
    }
    return VE.serializeSub(m.sp);
  });
  return anyReversed ? parts.join(' ') : rawD;
};
const vinfo = o => {
  let r = VINFO.get(o);
  if (r) return r;
  const bb = VE.tightBBox(o);
  let nCnt = 0;
  const subs = o.subs;
  for (let i = 0, L = subs.length; i < L; i++) nCnt += subs[i].nodes.length;
  let _d, _p2, _dNorm;
  r = {
    bb,
    n: nCnt,
    get d() {
      if (_d === undefined) _d = VE.serializePath(o);
      return _d;
    },
    get p2() {
      if (_p2 === undefined) {
        try {
          _p2 = new Path2D(r.d);
        } catch (e) {
          _p2 = null;
        }
      }
      return _p2;
    },
    get dNorm() {
      if (_dNorm === undefined) _dNorm = buildNormalizedPathD(o, r.d);
      return _dNorm;
    }
  };
  VINFO.set(o, r);
  return r;
};
/* v7.4 — Anti-Seam Vector Renderer & Winding-Safe Path Compositing:
   1) CanvasObj: merender objek tunggal dengan subpixel seam-guard (paint-order: stroke fill, non-scaling-stroke)
      pada path isi penuh tanpa garis tepi agar batas antarpath beda warna tidak bocor warna background.
   2) CompositePathObj: menggabungkan beberapa path yang memiliki properti visual identik (fill/gradient/stroke)
      ke dalam satu komposit <path> (dengan normalisasi orientasi winding nonzero) sehingga browser merasterisasi
      bentuk-bentuk yang saling menempel dalam satu pass tanpa celah anti-aliasing (0% subpixel seam). */
const isOpaquePaint = o => (o.opacity ?? 1) >= 0.999 && (VE.gradOn(o) ? (o.grad.stops || []).every(s => (s.op ?? 1) >= 0.999) : !/^rgba\(/i.test(o.fill || ''));
const SEAM_STROKE_PX = 0.45;

/* ============================================================================
   PHASE 3 — LAYER PANEL: LIVE SVG SHAPE PREVIEW
   - Menampilkan bentuk miniatur nyata dari objek SVG di setiap baris Layer
   - Menggunakan cache vinfo(o) (WeakMap) & React.memo agar tetap 60fps
   - Mendukung Path, Circle, Rect, Star, Polygon, Image, dan Text
   ============================================================================ */

const gradBatchKey = g => {
  if (!g) return '';
  const r = v => Math.round((+v || 0) * 1e4) / 1e4;
  const coords = g.type === 'radial' ? [g.cx, g.cy, g.r, g.fx != null ? g.fx : g.cx, g.fy != null ? g.fy : g.cy].map(r).join(',') : [g.x1, g.y1, g.x2, g.y2].map(r).join(',');
  const stops = (g.stops || []).map(s => r(s.offset) + ':' + String(s.color || '').toLowerCase() + ':' + r(s.op ?? 1)).join(';');
  return g.type + '|' + (g.spread || 'pad') + '|' + coords + '|' + stops;
};
const batchStyleKey = (o, selObjsSet) => {
  if (!o || o.img || o.text || o.isFrameBg || o.isAutoFrame) return null;
  if ((o.opacity ?? 1) < 0.999) return null;
  const isSel = selObjsSet.has(o.id);
  if (selObjsSet.size === 1 && isSel) return null; /* objek tunggal terpilih dirender mandiri untuk gizmo/drag */
  const selFlag = isSel ? '1' : '0';
  const hasStroke = o.stroke !== 'none' && o.strokeWidth > 0;
  const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent';
  if (!hasStroke && hasFill) {
    if (!o.subs || !o.subs.length || !o.subs.every(sp => sp.closed)) return null;
    if (!isOpaquePaint(o)) return null;
    if (VE.gradOn(o)) return 'G|' + selFlag + '|' + gradBatchKey(o.grad);
    return 'F|' + selFlag + '|' + cssToHex(o.fill);
  }
  if (hasStroke && !hasFill && !/^rgba\(/i.test(o.stroke || '') && !VE.strokeGradOn(o) && !o.clipPathD) {
    return 'S|' + selFlag + '|' + cssToHex(o.stroke) + '|' + VE.rd(o.strokeWidth) + '|' + (o.strokeLinejoin || 'round') + '|' + (o.strokeLinecap || 'round') + '|' + (o.strokeMiterlimit || '') + '|' + (o.nonScalingStroke ? '1' : '0');
  }
  return null;
};

/* GV-003: Precompute dCombined & idsStr saat batch dibuat agar tidak di-join ulang pada tiap render */
/* GV-003: Precompute dCombined & idsStr saat batch dibuat agar tidak di-join ulang pada tiap render */
const buildScopeBatches = (objs, selObjsSet) => {
  const items = [];
  for (let i = 0, L = objs.length; i < L; i++) {
    const o = objs[i];
    if (o.clipPathD) {
      const info = vinfo(o);
      items.push({
        styleKey: null,
        objs: [o],
        bb: info.bb.slice(),
        dCombined: info.d,
        idsStr: o.id
      });
      continue;
    }
    const info = vinfo(o);
    const pad = o.stroke !== 'none' && o.strokeWidth > 0 ? o.strokeWidth * 0.5 + 0.5 : 0.5;
    const bb = [info.bb[0] - pad, info.bb[1] - pad, info.bb[2] + pad, info.bb[3] + pad];
    const sk = batchStyleKey(o, selObjsSet);
    if (!sk) {
      items.push({
        styleKey: null,
        objs: [o],
        bb,
        dCombined: info.d,
        idsStr: o.id
      });
      continue;
    }
    let merged = false;
    const minJ = Math.max(0, items.length - 48);
    for (let j = items.length - 1; j >= minJ; j--) {
      const it = items[j];
      if (it.styleKey === sk) {
        it.objs.push(o);
        if (bb[0] < it.bb[0]) it.bb[0] = bb[0];
        if (bb[1] < it.bb[1]) it.bb[1] = bb[1];
        if (bb[2] > it.bb[2]) it.bb[2] = bb[2];
        if (bb[3] > it.bb[3]) it.bb[3] = bb[3];
        merged = true;
        break;
      }
      const ib = it.bb;
      if (bb[0] <= ib[2] && bb[2] >= ib[0] && bb[1] <= ib[3] && bb[3] >= ib[1]) {
        break; /* beririsan dengan objek beda warna di atasnya -> jaga z-order! */
      }
    }

    if (!merged) {
      items.push({
        styleKey: sk,
        objs: [o],
        bb,
        dCombined: '',
        idsStr: ''
      });
    }
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.objs.length > 1) {
      const isStrokeOnly = it.objs[0].fill === 'none';
      it.dCombined = it.objs.map(o => isStrokeOnly ? vinfo(o).d : vinfo(o).dNorm).join(' ');
      it.idsStr = it.objs.map(o => o.id).join(',');
    }
  }
  return items;
};

export { sampleSubPoly, polyWindingAt, reverseClosedSub, buildNormalizedPathD, vinfo, isOpaquePaint, SEAM_STROKE_PX, gradBatchKey, batchStyleKey, buildScopeBatches };
