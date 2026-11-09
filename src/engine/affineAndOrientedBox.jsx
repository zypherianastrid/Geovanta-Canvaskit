/**
 * @file src/engine/affineAndOrientedBox.jsx
 * @description Matriks transformasi afine 2D, Oriented Bounding Box (OBB), handle resize/rotasi, urutan Z, & panduan jarak
 */
import { rd } from './vectorPrimitives.jsx';
import { parsePath } from './svgPathParser.jsx';
import { serializePath } from './svgPathSerializer.jsx';
import { mapGrad } from './gradientEngine.jsx';
import { mapFil } from './bezierSubdivisionAndMove.jsx';
import { syncTextTransformFromSubs } from './textAndImageEngine.jsx';
import { tightBBox } from './spatialIndexAndHitTest.jsx';
import { compactGroups } from './figmaAutoLayoutAndFrames.jsx';

/* =========================================================================
   VECTORCRAFT NATIVE ORIENTED BOUNDING BOX, 8 HANDLES, & AFFINE TRANSFORM
   Port presisi dari:
   - crates/doc/src/orient.rs (OrientedBox, normalize_deg, transformed_angle, bbox_angle)
   - crates/tools/src/bbox.rs (Handle, hit_handle, in_rotate_zone, scale_for_drag, rotate_for_drag, handle_cursor)
   - crates/tools/src/select.rs (box_hit, active_box)
   - crates/tools/src/cursor.rs (rotate_about_in_view -> RotateToward(octant))
   ========================================================================= */
function affineIdentity() {
  return [1, 0, 0, 1, 0, 0];
}
function affineTranslate(dx, dy) {
  return [1, 0, 0, 1, dx, dy];
}
function affineScale(sx, sy) {
  return [sx, 0, 0, sy, 0, 0];
}
function affineRotate(rad) {
  const c = Math.cos(rad),
    s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}
function affineMul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function affineDet(a) {
  return a[0] * a[3] - a[1] * a[2];
}
function affineInverse(a) {
  const det = affineDet(a);
  if (Math.abs(det) < 1e-15) return [1, 0, 0, 1, 0, 0];
  const inv = 1.0 / det;
  const m0 = a[3] * inv,
    m1 = -a[1] * inv,
    m2 = -a[2] * inv,
    m3 = a[0] * inv;
  return [m0, m1, m2, m3, -(m0 * a[4] + m2 * a[5]), -(m1 * a[4] + m3 * a[5])];
}
function affinePt(a, p) {
  return {
    x: a[0] * p.x + a[2] * p.y + a[4],
    y: a[1] * p.x + a[3] * p.y + a[5]
  };
}
function transformRectBbox(a, r) {
  const p0 = affinePt(a, {
    x: r.x0,
    y: r.y0
  });
  const p1 = affinePt(a, {
    x: r.x1,
    y: r.y0
  });
  const p2 = affinePt(a, {
    x: r.x1,
    y: r.y1
  });
  const p3 = affinePt(a, {
    x: r.x0,
    y: r.y1
  });
  return {
    x0: Math.min(p0.x, p1.x, p2.x, p3.x),
    y0: Math.min(p0.y, p1.y, p2.y, p3.y),
    x1: Math.max(p0.x, p1.x, p2.x, p3.x),
    y1: Math.max(p0.y, p1.y, p2.y, p3.y)
  };
}
function normalizeDeg(deg) {
  let d = (deg + 180.0) % 360.0;
  if (d < 0) d += 360.0;
  d -= 180.0;
  if (d === -180.0) return 180.0;
  return d === 0 ? 0.0 : d;
}
function getObjBboxAngle(o) {
  if (!o) return 0.0;
  if (typeof o.bboxAngle === 'number' && isFinite(o.bboxAngle)) return o.bboxAngle;
  return normalizeDeg(-(o.rot || 0));
}
function transformedAngle(angle, a) {
  const rad = -angle * Math.PI / 180.0;
  const s = Math.sin(rad),
    c = Math.cos(rad);
  const vx = a[0] * c + a[2] * s,
    vy = a[1] * c + a[3] * s;
  if (vx * vx + vy * vy <= 1e-18) return angle;
  const out = normalizeDeg(-Math.atan2(vy, vx) * 180.0 / Math.PI);
  if (affineDet(a) >= 0.0) return out;
  const alt = normalizeDeg(out + 180.0);
  return Math.abs(normalizeDeg(alt - angle)) < Math.abs(normalizeDeg(out - angle)) ? alt : out;
}
function transformObjectGeomOnly(o, a) {
  const tr = q => q && affinePt(a, q);
  return {
    ...o,
    subs: (o.subs || []).map(sp => ({
      ...sp,
      nodes: sp.nodes.map(n => ({
        ...n,
        ...tr(n),
        handleIn: tr(n.handleIn),
        handleOut: tr(n.handleOut)
      }))
    }))
  };
}
function transformObject(o, a, scaleStroke) {
  if (!o) return o;
  const tr = q => q && affinePt(a, q);
  const detAbs = Math.abs(affineDet(a));
  const kScale = Math.sqrt(detAbs);
  const sxLen = Math.hypot(a[0], a[1]),
    syLen = Math.hypot(a[2], a[3]);
  const iso = Math.abs(sxLen - syLen) < 1e-4 && Math.abs(a[0] * a[2] + a[1] * a[3]) < 1e-4;
  const nextBboxAngle = transformedAngle(getObjBboxAngle(o), a);
  const nextRot = rd(normalizeDeg(-nextBboxAngle));
  let nextClipPathD = o.clipPathD;
  if (o.clipPathD) {
    try {
      const cSubs = parsePath(o.clipPathD);
      const tSubs = cSubs.map(sp => ({
        ...sp,
        nodes: sp.nodes.map(n => ({
          ...n,
          ...tr(n),
          handleIn: tr(n.handleIn),
          handleOut: tr(n.handleOut)
        }))
      }));
      nextClipPathD = serializePath({
        subs: tSubs
      });
    } catch (e) {}
  }
  const nextObj = {
    ...o,
    bboxAngle: nextBboxAngle,
    rot: nextRot,
    ...(nextClipPathD !== o.clipPathD ? {
      clipPathD: nextClipPathD
    } : {}),
    grad: mapGrad(o.grad, tr, kScale),
    ...(o.strokeGrad ? {
      strokeGrad: mapGrad(o.strokeGrad, tr, kScale)
    } : {}),
    strokeWidth: scaleStroke && o.strokeWidth && !o.nonScalingStroke ? rd(o.strokeWidth * kScale) : o.strokeWidth,
    subs: (o.subs || []).map(sp => ({
      ...sp,
      nodes: sp.nodes.map(n => ({
        ...n,
        ...tr(n),
        handleIn: tr(n.handleIn),
        handleOut: tr(n.handleOut),
        fil: iso && n.fil ? mapFil(n.fil, tr, kScale) : null
      }))
    }))
  };
  return nextObj.text ? syncTextTransformFromSubs(nextObj) : nextObj;
}
function createOrientedBox(angle, rect) {
  const toDocMat = affineRotate(-angle * Math.PI / 180.0);
  const toLocalMat = affineInverse(toDocMat);
  const toDocPt = p => affinePt(toDocMat, p);
  const toLocal = p => affinePt(toLocalMat, p);
  return {
    angle,
    rect,
    toDocMat,
    toLocalMat,
    toDocPt,
    toLocal,
    conjugate: a => angle === 0.0 ? a : affineMul(toDocMat, affineMul(a, toLocalMat)),
    center: () => toDocPt({
      x: (rect.x0 + rect.x1) * 0.5,
      y: (rect.y0 + rect.y1) * 0.5
    }),
    corners: () => [toDocPt({
      x: rect.x0,
      y: rect.y0
    }), toDocPt({
      x: rect.x1,
      y: rect.y0
    }), toDocPt({
      x: rect.x1,
      y: rect.y1
    }), toDocPt({
      x: rect.x0,
      y: rect.y1
    })]
  };
}
function docBboxAngle(doc, selIds) {
  if (!doc || !selIds || !selIds.size) return 0.0;
  let first = null;
  for (let i = 0; i < doc.objects.length; i++) {
    const o = doc.objects[i];
    if (!selIds.has(o.id) || o.hidden) continue;
    const a = getObjBboxAngle(o);
    if (first === null) first = a;else if (Math.abs(a - first) >= 1e-6) return 0.0;
  }
  return first !== null ? first : 0.0;
}
function selectionOrientedBox(doc, selIds) {
  if (!doc || !selIds || !selIds.size) return null;
  const angle = docBboxAngle(doc, selIds);
  const toLocalMat = angle === 0.0 ? null : affineInverse(affineRotate(-angle * Math.PI / 180.0));
  let x0 = 1e18,
    y0 = 1e18,
    x1 = -1e18,
    y1 = -1e18,
    found = false;
  for (let i = 0; i < doc.objects.length; i++) {
    const o = doc.objects[i];
    if (!selIds.has(o.id) || o.hidden) continue;
    const targetObj = toLocalMat ? transformObjectGeomOnly(o, toLocalMat) : o;
    const bb = tightBBox(targetObj);
    if (!bb || !isFinite(bb[0]) || bb[0] > bb[2] || Math.abs(bb[0]) > 1e15) continue;
    if (bb[0] < x0) x0 = bb[0];
    if (bb[1] < y0) y0 = bb[1];
    if (bb[2] > x1) x1 = bb[2];
    if (bb[3] > y1) y1 = bb[3];
    found = true;
  }
  if (!found || x0 > x1) return null;
  return createOrientedBox(angle, {
    x0,
    y0,
    x1,
    y1
  });
}
const VC_HANDLES = [{
  idx: 0,
  name: 'TopLeft',
  isCorner: true,
  axes: [true, true],
  pos: r => ({
    x: r.x0,
    y: r.y0
  })
}, {
  idx: 1,
  name: 'Top',
  isCorner: false,
  axes: [false, true],
  pos: r => ({
    x: (r.x0 + r.x1) * 0.5,
    y: r.y0
  })
}, {
  idx: 2,
  name: 'TopRight',
  isCorner: true,
  axes: [true, true],
  pos: r => ({
    x: r.x1,
    y: r.y0
  })
}, {
  idx: 3,
  name: 'Right',
  isCorner: false,
  axes: [true, false],
  pos: r => ({
    x: r.x1,
    y: (r.y0 + r.y1) * 0.5
  })
}, {
  idx: 4,
  name: 'BottomRight',
  isCorner: true,
  axes: [true, true],
  pos: r => ({
    x: r.x1,
    y: r.y1
  })
}, {
  idx: 5,
  name: 'Bottom',
  isCorner: false,
  axes: [false, true],
  pos: r => ({
    x: (r.x0 + r.x1) * 0.5,
    y: r.y1
  })
}, {
  idx: 6,
  name: 'BottomLeft',
  isCorner: true,
  axes: [true, true],
  pos: r => ({
    x: r.x0,
    y: r.y1
  })
}, {
  idx: 7,
  name: 'Left',
  isCorner: false,
  axes: [true, false],
  pos: r => ({
    x: r.x0,
    y: (r.y0 + r.y1) * 0.5
  })
}];
VC_HANDLES.forEach((h, i) => {
  h.opposite = () => VC_HANDLES[(i + 4) % 8];
});
const VC_CORNERS = [VC_HANDLES[0], VC_HANDLES[2], VC_HANDLES[4], VC_HANDLES[6]];
function hitHandle(r, lp, tol) {
  for (let i = 0; i < 8; i++) {
    const h = VC_HANDLES[i],
      q = h.pos(r);
    if (Math.abs(q.x - lp.x) <= tol && Math.abs(q.y - lp.y) <= tol) return h;
  }
  return null;
}
function inRotateZone(r, lp, inner, outer) {
  const inside = lp.x >= r.x0 && lp.x <= r.x1 && lp.y >= r.y0 && lp.y <= r.y1;
  if (inside) return null;
  for (let i = 0; i < 4; i++) {
    const h = VC_CORNERS[i],
      q = h.pos(r);
    const d = Math.hypot(lp.x - q.x, lp.y - q.y);
    if (d > inner && d <= outer) return h;
  }
  return null;
}
function boxHit(bx, p, zoom) {
  if (!bx || !p) return null;
  const lp = bx.toLocal(p);
  const z = zoom || 1;
  const tol = 5.0 / z,
    outer = 18.0 / z;
  const hh = hitHandle(bx.rect, lp, tol);
  if (hh) return {
    kind: 'handle',
    handle: hh
  };
  const rc = inRotateZone(bx.rect, lp, tol, outer);
  if (rc) return {
    kind: 'rotate',
    corner: rc
  };
  return null;
}
function scaleForDrag(r, handle, lp, proportional, fromCenter) {
  const origin = fromCenter ? {
    x: (r.x0 + r.x1) * 0.5,
    y: (r.y0 + r.y1) * 0.5
  } : handle.opposite().pos(r);
  const start = handle.pos(r);
  const [ax, ay] = handle.axes;
  const d0x = start.x - origin.x,
    d0y = start.y - origin.y;
  const d1x = lp.x - origin.x,
    d1y = lp.y - origin.y;
  let sx = ax && Math.abs(d0x) > 1e-9 ? d1x / d0x : 1.0;
  let sy = ay && Math.abs(d0y) > 1e-9 ? d1y / d0y : 1.0;
  if (proportional) {
    if (handle.isCorner) {
      const s = Math.abs(sx - 1.0) >= Math.abs(sy - 1.0) ? sx : sy;
      sx = s;
      sy = s;
    } else if (ax) {
      sy = Math.abs(sx);
    } else {
      sx = Math.abs(sy);
    }
  }
  const clamp = s => Math.abs(s) < 1e-4 ? s < 0 ? -1e-4 : 1e-4 : s;
  const csx = clamp(sx),
    csy = clamp(sy);
  return affineMul(affineTranslate(origin.x, origin.y), affineMul(affineScale(csx, csy), affineTranslate(-origin.x, -origin.y)));
}
function rotateForDrag(center, start, p, snap) {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(p.y - center.y, p.x - center.x);
  let a = a1 - a0;
  if (snap) {
    const step = Math.PI / 4.0;
    a = Math.round(a / step) * step;
  }
  const matrix = affineMul(affineTranslate(center.x, center.y), affineMul(affineRotate(a), affineTranslate(-center.x, -center.y)));
  return {
    matrix,
    deg: -a * 180.0 / Math.PI
  };
}
function handleCursor(handle, boxAngle) {
  const steps = Math.round((boxAngle || 0) / 45.0);
  const idx = ((handle.idx - steps) % 8 + 8) % 8;
  if (idx === 1 || idx === 5) return 'var(--cur-ns)';
  if (idx === 3 || idx === 7) return 'var(--cur-ew)';
  if (idx === 0 || idx === 4) return 'var(--cur-nwse)';
  return 'var(--cur-nesw)';
}
function rotateCursorForPt(center, p) {
  const dx = p.x - center.x,
    dy = p.y - center.y;
  const oct = dx * dx + dy * dy <= 1e-12 ? 0 : (Math.round(Math.atan2(dx, -dy) / (Math.PI / 4.0)) % 8 + 8) % 8;
  return 'var(--cur-rot-' + oct + ')';
}

/* Susun ulang urutan Z-Order ala Figma: 'front' (Ctrl+]), 'back' (Ctrl+[), 'forward' (]), 'backward' ([) */
/* Susun ulang urutan Z-Order ala Figma: 'front' (Ctrl+]), 'back' (Ctrl+[), 'forward' (]), 'backward' ([) */
function arrangeZOrder(doc, selIds, mode) {
  if (!selIds || !selIds.size) return doc;
  const a = compactGroups(doc.objects);
  const isBg = o => !!(o.isFrameBg || o.isAutoFrame);
  /* Jika latar Frame terpilih, perluas seleksi ke seluruh anggota Frame tersebut untuk pergerakan tingkat kontainer */
  const effSel = new Set(selIds);
  a.forEach(o => {
    if (effSel.has(o.id) && isBg(o) && o.group) {
      a.forEach(ch => {
        if (ch.group === o.group) effSel.add(ch.id);
      });
    }
  });
  const units = [],
    gmap = new Map();
  a.forEach(o => {
    if (!o.group) {
      units.push({
        one: o
      });
      return;
    }
    let g = gmap.get(o.group);
    if (!g) {
      g = {
        gid: o.group,
        mem: []
      };
      gmap.set(o.group, g);
      units.push(g);
    }
    g.mem.push(o);
  });
  const moveArr = (arr, isSel) => {
    const r = arr.slice();
    if (mode === 'front') return [...r.filter(x => !isSel(x)), ...r.filter(x => isSel(x))];
    if (mode === 'back') return [...r.filter(x => isSel(x)), ...r.filter(x => !isSel(x))];
    if (mode === 'forward') {
      for (let i = r.length - 2; i >= 0; i--) if (isSel(r[i]) && !isSel(r[i + 1])) [r[i], r[i + 1]] = [r[i + 1], r[i]];
      return r;
    }
    if (mode === 'backward') {
      for (let i = 1; i < r.length; i++) if (isSel(r[i]) && !isSel(r[i - 1])) [r[i], r[i - 1]] = [r[i - 1], r[i]];
      return r;
    }
    return r;
  };
  units.forEach(u => {
    if (!u.mem || u.mem.every(q => effSel.has(q.id))) return;
    u.mem = [...u.mem.filter(isBg), ...moveArr(u.mem.filter(q => !isBg(q)), q => effSel.has(q.id))];
  });
  const uSel = u => u.one ? effSel.has(u.one.id) : u.mem.every(q => effSel.has(q.id));
  const out = moveArr(units, uSel).flatMap(u => u.one ? [u.one] : u.mem);
  if (out.length === doc.objects.length && out.every((o, i) => o === doc.objects[i])) return doc;
  return {
    ...doc,
    objects: compactGroups(out)
  };
}

/* Figma Alt + Hover Redline Distance: hitung garis ukur jarak dari kotak seleksi `selBox`
   ke kotak target `targetBox` (objek yang sedang di-hover atau Artboard jika hover di ruang kosong) */
/* Figma Alt + Hover Redline Distance: hitung garis ukur jarak dari kotak seleksi `selBox`
   ke kotak target `targetBox` (objek yang sedang di-hover atau Artboard jika hover di ruang kosong) */
function measureDistanceGuides(selBox, targetBox, isArtboard = false) {
  if (!selBox || !targetBox) return [];
  const [sL, sT, sR, sB] = selBox,
    sCx = (sL + sR) / 2,
    sCy = (sT + sB) / 2;
  const [tL, tT, tR, tB] = targetBox;
  const lines = [];
  const fmt = v => String(Math.round(v * 10) / 10);
  if (isArtboard) {
    /* Jarak dari ke-4 sisi objek terpilih ke tepi dalam Artboard */
    if (sL > tL) lines.push({
      x1: tL,
      y1: sCy,
      x2: sL,
      y2: sCy,
      label: fmt(sL - tL)
    });
    if (sR < tR) lines.push({
      x1: sR,
      y1: sCy,
      x2: tR,
      y2: sCy,
      label: fmt(tR - sR)
    });
    if (sT > tT) lines.push({
      x1: sCx,
      y1: tT,
      x2: sCx,
      y2: sT,
      label: fmt(sT - tT)
    });
    if (sB < tB) lines.push({
      x1: sCx,
      y1: sB,
      x2: sCx,
      y2: tB,
      label: fmt(tB - sB)
    });
    return lines;
  }

  /* Jarak Horizontal antara dua objek */
  const overlapY0 = Math.max(sT, tT),
    overlapY1 = Math.min(sB, tB);
  const yMid = overlapY0 <= overlapY1 ? (overlapY0 + overlapY1) / 2 : sCy;
  if (tL > sR) {
    lines.push({
      x1: sR,
      y1: yMid,
      x2: tL,
      y2: yMid,
      label: fmt(tL - sR),
      aux: overlapY0 > overlapY1 ? {
        x: tL,
        y1: yMid,
        y2: sCy < tT ? tT : tB
      } : null
    });
  } else if (sL > tR) {
    lines.push({
      x1: tR,
      y1: yMid,
      x2: sL,
      y2: yMid,
      label: fmt(sL - tR),
      aux: overlapY0 > overlapY1 ? {
        x: tR,
        y1: yMid,
        y2: sCy < tT ? tT : tB
      } : null
    });
  }

  /* Jarak Vertikal antara dua objek */
  const overlapX0 = Math.max(sL, tL),
    overlapX1 = Math.min(sR, tR);
  const xMid = overlapX0 <= overlapX1 ? (overlapX0 + overlapX1) / 2 : sCx;
  if (tT > sB) {
    lines.push({
      x1: xMid,
      y1: sB,
      x2: xMid,
      y2: tT,
      label: fmt(tT - sB),
      aux: overlapX0 > overlapX1 ? {
        y: tT,
        x1: xMid,
        x2: sCx < tL ? tL : tR
      } : null
    });
  } else if (sT > tB) {
    lines.push({
      x1: xMid,
      y1: tB,
      x2: xMid,
      y2: sT,
      label: fmt(sT - tB),
      aux: overlapX0 > overlapX1 ? {
        y: tB,
        x1: xMid,
        x2: sCx < tL ? tL : tR
      } : null
    });
  }
  return lines;
}

/* ============================================================================
   MODUL SHARP-CORNER PRESERVATION & KLASIFIKASI DINAMIS 4-STATUS (UNTUK REFINE)
   1. Discrete Curvature + Turning Angle Detection: theta_i = atan2(u x v, u . v)
   2. Regresi Linear Lokal (TLS/OLS) Multi-Node di kiri & kanan kandidat sudut
      untuk mengenali puncak tajam yang terpecah menjadi banyak node kecil
      (mis. puncak, ujung kaki, dan sudut palang pada huruf A).
   3. Pembedaan tegas Sharp Corner (pertahankan anchor tajam) vs Rounded Corner
      (sederhanakan node berlebih tanpa menghilangkan radius).
   4. Klasifikasi ulang (recomputed) setiap kali geometri berubah ke dalam 4 status:
      'protected-corner' | 'smooth' | 'redundant' | 'uncertain'
   ============================================================================ */

/* Helper: Sudut belok bertanda (radian) & absolut (derajat) untuk 3 titik P_{i-1}, P_i, P_{i+1} */

export { affineIdentity, affineTranslate, affineScale, affineRotate, affineMul, affineDet, affineInverse, affinePt, transformRectBbox, normalizeDeg, getObjBboxAngle, transformedAngle, transformObjectGeomOnly, transformObject, createOrientedBox, docBboxAngle, selectionOrientedBox, VC_HANDLES, VC_CORNERS, hitHandle, inRotateZone, boxHit, scaleForDrag, rotateForDrag, handleCursor, rotateCursorForPt, arrangeZOrder, measureDistanceGuides };
