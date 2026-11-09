/**
 * @file src/engine/figmaAutoLayoutAndFrames.jsx
 * @description Mesin Frame ala Figma, Auto Layout baris/kolom, padding artboard, & auto-reparenting objek
 */
import { tightBBox } from './spatialIndexAndHitTest.jsx';
import { docBounds } from './textAndImageEngine.jsx';
import { parsePath } from './svgPathParser.jsx';
import { rd, uid } from './vectorPrimitives.jsx';
import { setCornerRadius } from './cornerFilletEngine.jsx';
import { translate } from './bezierSubdivisionAndMove.jsx';

/* 5. AUTO LAYOUT & PADDING: Row / Column / Wrap-Grid + padding 4 sisi + Auto-Frame latar.
      cfg: { dir, cols, gap, gapX, gapY, pt, pr, pb, pl, alignX, alignY, frame, frameRadius, frameFill, frameStroke, frameStrokeW, mem }
      mem (dari hasil sebelumnya) menjaga urutan item & titik asal agar reflow langsung tidak melayang/berubah urutan.
      Mengembalikan { doc, selIds, mem } atau null. */
function readingOrder(boxes) {
  const sorted = boxes.slice().sort((a, b) => a.cy - b.cy),
    rows = [];
  sorted.forEach(b => {
    const r = rows[rows.length - 1];
    if (r && b.cy >= r.t && b.cy <= r.b) {
      r.items.push(b);
      r.t = Math.min(r.t, b.t);
      r.b = Math.max(r.b, b.b);
    } else rows.push({
      items: [b],
      t: b.t,
      b: b.b
    });
  });
  return rows.flatMap(r => r.items.sort((a, b) => a.cx - b.cx));
}
/* Kelompokkan path yang saling bertumpuk (beririsan bounding box) menjadi satu unit visual utuh
   agar Auto Layout & Padding tidak pernah memecah bagian-bagian ilustrasi (mata, rambut, baju) menjadi barisan terpisah! */
/* Kelompokkan path yang saling bertumpuk (beririsan bounding box) menjadi satu unit visual utuh
   agar Auto Layout & Padding tidak pernah memecah bagian-bagian ilustrasi (mata, rambut, baju) menjadi barisan terpisah! */
function clusterLayoutUnits(rawItems) {
  const itemBoxes = rawItems.map(o => {
    const b = tightBBox(o);
    return {
      o,
      l: b[0],
      t: b[1],
      r: b[2],
      b: b[3]
    };
  });
  const n = itemBoxes.length;
  const parent = Array.from({
    length: n
  }, (_, i) => i);
  const find = x => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const unite = (a, b) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < n; i++) {
    const A = itemBoxes[i];
    for (let j = i + 1; j < n; j++) {
      const B = itemBoxes[j];
      if (Math.min(A.r, B.r) > Math.max(A.l, B.l) - 1e-3 && Math.min(A.b, B.b) > Math.max(A.t, B.t) - 1e-3) {
        unite(i, j);
      }
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i),
      ib = itemBoxes[i];
    let g = groups.get(r);
    if (!g) {
      g = {
        id: ib.o.id,
        objs: [ib.o],
        l: ib.l,
        t: ib.t,
        r: ib.r,
        b: ib.b
      };
      groups.set(r, g);
    } else {
      g.objs.push(ib.o);
      if (ib.l < g.l) g.l = ib.l;
      if (ib.t < g.t) g.t = ib.t;
      if (ib.r > g.r) g.r = ib.r;
      if (ib.b > g.b) g.b = ib.b;
    }
  }
  return [...groups.values()].map(g => ({
    id: g.id,
    o: g.objs[0],
    objs: g.objs,
    l: g.l,
    t: g.t,
    r: g.r,
    b: g.b,
    w: g.r - g.l,
    h: g.b - g.t,
    cx: (g.l + g.r) / 2,
    cy: (g.t + g.b) / 2
  }));
}

/* Ubah ukuran kotak latar Frame (padding pt/pr/pb/pl & radius) mengelilingi anak-anaknya TANPA menggeser/mengacak posisi objek anak */
/* Ubah ukuran kotak latar Frame (padding pt/pr/pb/pl & radius) mengelilingi anak-anaknya TANPA menggeser/mengacak posisi objek anak */
function applyFramePadding(doc, selObjs, cfg) {
  cfg = cfg || {};
  const pt = Math.max(0, cfg.pt != null ? cfg.pt : 0);
  const pr = Math.max(0, cfg.pr != null ? cfg.pr : 0);
  const pb = Math.max(0, cfg.pb != null ? cfg.pb : 0);
  const pl = Math.max(0, cfg.pl != null ? cfg.pl : 0);
  const rad = Math.max(0, cfg.frameRadius != null ? cfg.frameRadius : cfg.radius || 0);
  const picked = doc.objects.filter(o => selObjs && selObjs.has(o.id));
  if (!picked.length) return null;
  const frameGroups = new Set();
  picked.forEach(o => {
    if ((o.isFrameBg || o.isAutoFrame) && o.group) frameGroups.add(o.group);else if (o.group && doc.objects.some(q => q.group === o.group && (q.isFrameBg || q.isAutoFrame))) frameGroups.add(o.group);
  });
  if (frameGroups.size > 0) {
    let changed = false;
    const nextSel = new Set(selObjs);
    const nextObjects = doc.objects.map(o => {
      if (!(o.isFrameBg || o.isAutoFrame) || !o.group || !frameGroups.has(o.group)) return o;
      const kids = doc.objects.filter(q => q.group === o.group && !q.isFrameBg && !q.isAutoFrame && !q.hidden);
      if (!kids.length) return o;
      const bb = docBounds(doc, new Set(kids.map(q => q.id)));
      if (!bb) return o;
      const x0 = bb[0] - pl,
        y0 = bb[1] - pt,
        x1 = bb[2] + pr,
        y1 = bb[3] + pb;
      const w = Math.max(1e-3, x1 - x0),
        h = Math.max(1e-3, y1 - y0);
      const baseFrame = {
        ...o,
        subs: parsePath(`M${rd(x0)} ${rd(y0)}L${rd(x1)} ${rd(y0)}L${rd(x1)} ${rd(y1)}L${rd(x0)} ${rd(y1)}Z`, [1, 0, 0, 1, 0, 0])
      };
      const rEff = Math.min(rad, w / 2, h / 2);
      const updatedBg = rEff > 0 ? setCornerRadius(baseFrame, rEff, {
        mode: 'circular'
      }) : baseFrame;
      changed = true;
      nextSel.add(updatedBg.id);
      return updatedBg;
    });
    if (!changed) return null;
    return {
      doc: {
        ...doc,
        objects: nextObjects
      },
      selIds: nextSel
    };
  }
  return null;
}
function applyAutoLayout(doc, selObjs, cfg) {
  cfg = cfg || {};
  const dir = cfg.dir || 'row',
    cols = Math.max(1, Math.round(cfg.cols || 3));
  const gapX = cfg.gapX != null ? cfg.gapX : cfg.gap != null ? cfg.gap : 12,
    gapY = cfg.gapY != null ? cfg.gapY : cfg.gap != null ? cfg.gap : gapX;
  const pt = cfg.pt != null ? cfg.pt : 0,
    pr = cfg.pr != null ? cfg.pr : 0,
    pb = cfg.pb != null ? cfg.pb : 0,
    pl = cfg.pl != null ? cfg.pl : 0;
  const ax = cfg.alignX != null ? cfg.alignX : 0,
    ay = cfg.alignY != null ? cfg.alignY : 0.5;
  const picked = doc.objects.filter(o => selObjs.has(o.id));
  let items = picked.filter(o => !o.isAutoFrame && !o.isFrameBg);
  let existingFrame = picked.find(o => o.isAutoFrame || o.isFrameBg) || null;
  if (!items.length && existingFrame && existingFrame.group) {
    items = doc.objects.filter(o => o.group === existingFrame.group && !o.isAutoFrame && !o.isFrameBg);
  }
  if (!items.length) return null;
  const key = items.map(o => o.id).sort().join(','),
    mem = cfg.mem && cfg.mem.key === key ? cfg.mem : null;
  if (!existingFrame && mem && mem.frameId) {
    existingFrame = doc.objects.find(o => o.id === mem.frameId && (o.isAutoFrame || o.isFrameBg)) || null;
  }
  if (!existingFrame && items[0].group && items.every(o => o.group === items[0].group)) {
    existingFrame = doc.objects.find(o => o.group === items[0].group && (o.isAutoFrame || o.isFrameBg)) || null;
  }
  let boxes = clusterLayoutUnits(items);
  /* Jika seluruh objek merupakan satu kesatuan ilustrasi yang saling bertumpuk (1 cluster) dan sudah punya Frame,
     cukup sesuaikan kotak Frame mengelilingi ilustrasi sesuai padding (pt, pr, pb, pl) tanpa menggeser ilustrasi! */
  if (boxes.length === 1 && existingFrame && cfg.frame !== false) {
    const fp = applyFramePadding(doc, new Set([existingFrame.id, ...items.map(o => o.id)]), {
      pt,
      pr,
      pb,
      pl,
      frameRadius: cfg.frameRadius
    });
    if (fp) {
      const b0 = boxes[0];
      return {
        doc: fp.doc,
        selIds: fp.selIds,
        mem: {
          key,
          order: [b0.id],
          x: b0.l - pl,
          y: b0.t - pt,
          frameId: existingFrame.id,
          group: existingFrame.group
        }
      };
    }
  }
  if (mem) {
    const byId = new Map(boxes.map(b => [b.id, b]));
    const ord = mem.order.map(id => byId.get(id)).filter(Boolean);
    if (ord.length === boxes.length) boxes = ord;
  } else if (dir === 'col') boxes.sort((a, b) => a.cy - b.cy || a.cx - b.cx);else if (dir === 'wrap') boxes = readingOrder(boxes);else boxes.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  let origX, origY;
  if (existingFrame) {
    const fb = tightBBox(existingFrame);
    origX = fb[0];
    origY = fb[1];
  } else if (mem) {
    origX = mem.x;
    origY = mem.y;
  } else {
    origX = Math.min(...boxes.map(b => b.l)) - pl;
    origY = Math.min(...boxes.map(b => b.t)) - pt;
  }
  const lines = [];
  if (dir === 'col') boxes.forEach(b => lines.push([b]));else if (dir === 'row') lines.push(boxes);else for (let i = 0; i < boxes.length; i += cols) lines.push(boxes.slice(i, i + cols));
  const LM = lines.map(ln => ({
    items: ln,
    w: ln.reduce((s, b) => s + b.w, 0) + gapX * Math.max(0, ln.length - 1),
    h: Math.max(0, ...ln.map(b => b.h))
  }));
  const contentW = Math.max(0, ...LM.map(l => l.w)),
    contentH = LM.reduce((s, l) => s + l.h, 0) + gapY * Math.max(0, LM.length - 1);
  const frameW = pl + contentW + pr,
    frameH = pt + contentH + pb;
  const moved = new Map();
  let curY = origY + pt;
  LM.forEach(ln => {
    let curX = origX + pl + ax * (contentW - ln.w);
    ln.items.forEach(it => {
      const dx = curX - it.l,
        dy = curY + ay * (ln.h - it.h) - it.t;
      const unitObjs = it.objs || [it.o];
      unitObjs.forEach(uo => moved.set(uo.id, Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 ? uo : translate(uo, dx, dy)));
      curX += it.w + gapX;
    });
    curY += ln.h + gapY;
  });
  const nextSel = new Set(items.map(o => o.id));
  let frameObj = null;
  let targetGroup = existingFrame ? existingFrame.group : items.every(o => o.group && o.group === items[0].group) ? items[0].group : null;
  if (cfg.frame && !targetGroup) {
    if (mem && mem.group) targetGroup = mem.group;else {
      const usedG = new Set(doc.objects.map(o => o.group).filter(Boolean));
      let k = 1;
      while (usedG.has('Frame-' + k)) k++;
      targetGroup = 'Frame-' + k;
    }
  }
  if (cfg.frame) {
    const r = Math.max(0, Math.min(cfg.frameRadius || 0, frameW / 2, frameH / 2)),
      X = origX,
      Y = origY,
      X2 = X + frameW,
      Y2 = Y + frameH;
    const ef = existingFrame;
    const baseFrame = {
      id: ef ? ef.id : uid(),
      name: ef ? ef.name : targetGroup ? targetGroup + '-bg' : 'auto-frame',
      type: 'path',
      isAutoFrame: true,
      isFrameBg: true,
      containerType: 'frame',
      fill: cfg.frameFill || (ef ? ef.fill : '#f4f4f5'),
      stroke: cfg.frameStroke || (ef ? ef.stroke : '#d4d4d8'),
      strokeWidth: cfg.frameStrokeW != null ? cfg.frameStrokeW : ef ? ef.strokeWidth : 1,
      opacity: ef ? ef.opacity : 1,
      fillRule: 'nonzero',
      group: targetGroup,
      subs: parsePath(`M${X} ${Y}L${X2} ${Y}L${X2} ${Y2}L${X} ${Y2}Z`, [1, 0, 0, 1, 0, 0])
    };
    frameObj = r > 0 ? setCornerRadius(baseFrame, r, {
      mode: 'circular'
    }) : baseFrame;
    nextSel.add(frameObj.id);
  }
  const out = [];
  let inserted = false;
  doc.objects.forEach(o => {
    if (existingFrame && o.id === existingFrame.id) {
      if (frameObj) {
        out.push(frameObj);
        inserted = true;
      }
      return;
    }
    if (moved.has(o.id)) {
      if (frameObj && !inserted) {
        out.push(frameObj);
        inserted = true;
      }
      const mo = moved.get(o.id);
      if (cfg.frame && targetGroup) out.push({
        ...mo,
        group: targetGroup,
        containerType: 'frame'
      });else if (!cfg.frame && existingFrame && mo.group === existingFrame.group) out.push({
        ...mo,
        group: null,
        containerType: null
      });else out.push(mo);
    } else out.push(o);
  });
  return {
    doc: {
      ...doc,
      objects: compactGroups(out)
    },
    selIds: nextSel,
    mem: {
      key,
      order: boxes.map(b => b.id),
      x: origX,
      y: origY,
      frameId: frameObj ? frameObj.id : null,
      group: targetGroup
    }
  };
}

/* ---- FRAME ala Figma: grup 'Frame-N' + objek latar (isAutoFrame/isFrameBg) tetap di posisi awal tanpa padding otomatis ---- */
/* ---- FRAME ala Figma: grup 'Frame-N' + objek latar (isAutoFrame/isFrameBg) tetap di posisi awal tanpa padding otomatis ---- */
function createFrame(doc, selObjs, cfg) {
  cfg = cfg || {};
  const picked = doc.objects.filter(o => selObjs.has(o.id) && !o.isAutoFrame);
  const used = new Set(doc.objects.map(o => o.group).filter(Boolean));
  let k = 1;
  while (used.has('Frame-' + k)) k++;
  const frameId = 'Frame-' + k,
    pad = cfg.pad != null ? Math.max(0, cfg.pad) : 0;
  let x0, y0, x1, y1;
  if (cfg.rect) {
    x0 = cfg.rect[0];
    y0 = cfg.rect[1];
    x1 = cfg.rect[2];
    y1 = cfg.rect[3];
  } else if (picked.length) {
    const bb = docBounds(doc, new Set(picked.map(o => o.id)));
    x0 = bb[0] - pad;
    y0 = bb[1] - pad;
    x1 = bb[2] + pad;
    y1 = bb[3] + pad;
  } else {
    const [vx, vy, vw, vh] = doc.viewBox;
    x0 = vx + vw * 0.25;
    y0 = vy + vh * 0.25;
    x1 = x0 + vw * 0.5;
    y1 = y0 + vh * 0.5;
  }
  const bgBase = {
    id: uid(),
    name: frameId + '-bg',
    type: 'path',
    isAutoFrame: true,
    isFrameBg: true,
    containerType: 'frame',
    fill: cfg.fill || '#ffffff',
    stroke: cfg.stroke || '#e4e4e7',
    strokeWidth: 1,
    opacity: 1,
    fillRule: 'nonzero',
    group: frameId,
    subs: parsePath(`M${rd(x0)} ${rd(y0)}L${rd(x1)} ${rd(y0)}L${rd(x1)} ${rd(y1)}L${rd(x0)} ${rd(y1)}Z`, [1, 0, 0, 1, 0, 0])
  };
  const bg = cfg.radius > 0 ? setCornerRadius(bgBase, Math.min(cfg.radius, (x1 - x0) / 2, (y1 - y0) / 2), {
    mode: 'circular'
  }) : bgBase;

  // Jika tidak ada objek yang dipilih (Frame kosong), atau jika pengguna hanya mengklik Frame yang sudah ada:
  // Pertahankan posisi indeks layer saat ini agar tidak melompat ke tengah/atas
  if (!picked.length) {
    const selArr = doc.objects.filter(o => selObjs.has(o.id));
    if (selArr.length) {
      const anchorIdx = doc.objects.findIndex(o => o.id === selArr[0].id);
      const out = doc.objects.slice();
      out.splice(anchorIdx, 0, bg);
      return {
        doc: {
          ...doc,
          objects: compactGroups(out)
        },
        frameId,
        selIds: new Set([bg.id])
      };
    }
    return {
      doc: {
        ...doc,
        objects: [...doc.objects, bg]
      },
      frameId,
      selIds: new Set([bg.id])
    };
  }

  // Pertahankan posisi di indeks tempat objek terpilih berada
  const S = new Set(picked.map(o => o.id)),
    first = doc.objects.findIndex(o => S.has(o.id));
  const kids = doc.objects.filter(o => S.has(o.id)).map(o => ({
    ...o,
    group: frameId,
    containerType: 'frame'
  }));
  const before = doc.objects.slice(0, first).filter(o => !S.has(o.id)),
    after = doc.objects.slice(first).filter(o => !S.has(o.id));
  return {
    doc: {
      ...doc,
      objects: [...before, bg, ...kids, ...after]
    },
    frameId,
    selIds: new Set([bg.id, ...kids.map(o => o.id)])
  };
}
/* ---- Auto-parenting Frame ala Figma (drop-in / drop-out) ---- */
/* ---- Auto-parenting Frame ala Figma (drop-in / drop-out) ---- */
const isFrameMember = o => !!o.group && (o.containerType === 'frame' || o.isAutoFrame || o.isFrameBg || /^frame/i.test(o.group));
const frameBgOf = (doc, fid) => doc.objects.find(o => o.group === fid && (o.isFrameBg || o.isAutoFrame)) || null;
/* kotak batas Frame: latar (bg) bila ada, selain itu gabungan anggota */
/* kotak batas Frame: latar (bg) bila ada, selain itu gabungan anggota */
function frameBounds(doc, fid) {
  const bg = frameBgOf(doc, fid);
  if (bg) return tightBBox(bg);
  const ids = new Set(doc.objects.filter(o => o.group === fid).map(o => o.id));
  return ids.size ? docBounds(doc, ids) : null;
}
/* daftar Frame + kotak batasnya, diurutkan dari area terkecil (Frame terdalam menang) */
/* daftar Frame + kotak batasnya, diurutkan dari area terkecil (Frame terdalam menang) */
function listFrames(doc, excludeIds) {
  const fMap = new Map();
  doc.objects.forEach(o => {
    if (!isFrameMember(o)) return;
    let a = fMap.get(o.group);
    if (!a) fMap.set(o.group, a = []);
    a.push(o);
  });
  const out = [];
  fMap.forEach((objs, fid) => {
    if (excludeIds && objs.every(o => excludeIds.has(o.id))) return;
    const bb = frameBounds(doc, fid);
    if (bb && isFinite(bb[0]) && bb[2] > bb[0] && bb[3] > bb[1]) out.push({
      id: fid,
      bb,
      area: (bb[2] - bb[0]) * (bb[3] - bb[1])
    });
  });
  return out.sort((a, b) => a.area - b.area);
}
/* Jaga anggota tiap Frame/Group SELALU bersebelahan di doc.objects (latar Frame di paling belakang).
   Tanpa ini layer di panel terlihat menyatu tetapi tergambar terpisah di kanvas/ekspor (<g> terpecah). */
/* Jaga anggota tiap Frame/Group SELALU bersebelahan di doc.objects (latar Frame di paling belakang).
   Tanpa ini layer di panel terlihat menyatu tetapi tergambar terpisah di kanvas/ekspor (<g> terpecah). */
function compactGroups(objs) {
  const byG = new Map();
  objs.forEach(o => {
    if (o.group) {
      let a = byG.get(o.group);
      if (!a) byG.set(o.group, a = []);
      a.push(o);
    }
  });
  const out = [],
    done = new Set(),
    isBg = q => !!(q.isFrameBg || q.isAutoFrame);
  objs.forEach(o => {
    if (!o.group) {
      out.push(o);
      return;
    }
    if (done.has(o.group)) return;
    done.add(o.group);
    const m = byG.get(o.group);
    m.filter(isBg).forEach(q => out.push(q));
    m.filter(q => !isBg(q)).forEach(q => out.push(q));
  });
  return out;
}
/* Algoritma Reparenting ala Figma:
   - Objek yang dilepas di atas Frame OTOMATIS masuk ke Frame itu (pindah antar Frame juga otomatis).
   - Menahan Ctrl/Cmd saat menggeser (preventNest) = objek hanya melayang, tidak masuk/keluar Frame.
   - Keluar dari Frame induk: otomatis keluar jika titik tengah objek ditarik melewati batas Frame induk,
     ATAU jika pengguna menahan Ctrl untuk memaksa lepas ke luar/pindah ke Frame lain. */
/* Algoritma Reparenting ala Figma:
   - Objek yang dilepas di atas Frame OTOMATIS masuk ke Frame itu (pindah antar Frame juga otomatis).
   - Menahan Ctrl/Cmd saat menggeser (preventNest) = objek hanya melayang, tidak masuk/keluar Frame.
   - Keluar dari Frame induk: otomatis keluar jika titik tengah objek ditarik melewati batas Frame induk,
     ATAU jika pengguna menahan Ctrl untuk memaksa lepas ke luar/pindah ke Frame lain. */
function reparentDroppedObjects(doc, draggedIds, opt) {
  opt = opt || {};
  const preventNest = !!opt.preventNest; /* Ctrl/Cmd saat menggeser = jangan masuk/keluar Frame (ala Figma) */
  const NO = {
    doc,
    targetFrame: null,
    action: null
  };
  if (preventNest) return NO;
  const dragged = doc.objects.filter(o => draggedIds.has(o.id));
  const bgGroups = new Set(dragged.filter(o => (o.isFrameBg || o.isAutoFrame) && o.group).map(o => o.group));
  const cands = dragged.filter(o => !o.isFrameBg && !o.isAutoFrame && !(o.group && bgGroups.has(o.group)));
  if (!cands.length) return NO;
  const cids = new Set(cands.map(o => o.id)),
    mbb = docBounds(doc, cids);
  if (!mbb) return NO;
  const cx = (mbb[0] + mbb[2]) / 2,
    cy = (mbb[1] + mbb[3]) / 2;
  const hit = listFrames(doc, draggedIds).find(f => cx >= f.bb[0] && cx <= f.bb[2] && cy >= f.bb[1] && cy <= f.bb[3]);
  if (hit) {
    const fid = hit.id;
    /* Jika semua objek memang sudah berada di dalam Frame ini, biarkan tetap di dalamnya */
    if (cands.every(o => o.group === fid)) return NO;
    const rest = doc.objects.filter(o => !cids.has(o.id));
    let last = -1;
    rest.forEach((o, i) => {
      if (o.group === fid) last = i;
    });
    rest.splice(last + 1, 0, ...cands.map(o => ({
      ...o,
      group: fid,
      containerType: 'frame'
    })));
    return {
      doc: {
        ...doc,
        objects: compactGroups(rest)
      },
      targetFrame: fid,
      action: 'in'
    };
  }

  /* Jika titik tengah (cx, cy) ditarik keluar dari batas Frame induknya → keluarkan ke kanvas luar */
  const eject = new Map(),
    ej = new Set();
  cands.forEach(o => {
    if (!o.group) return;
    const fbb = frameBounds(doc, o.group);
    if (!fbb) return;
    const b = tightBBox(o),
      ocx = (b[0] + b[2]) / 2,
      ocy = (b[1] + b[3]) / 2;
    const outsideCenter = ocx < fbb[0] || ocx > fbb[2] || ocy < fbb[1] || ocy > fbb[3];
    if (outsideCenter) {
      let a = eject.get(o.group);
      if (!a) eject.set(o.group, a = []);
      a.push(o);
      ej.add(o.id);
    }
  });
  if (!ej.size) return NO;
  const rest = doc.objects.filter(o => !ej.has(o.id));
  eject.forEach((list, gid) => {
    let last = -1;
    rest.forEach((o, i) => {
      if (o.group === gid) last = i;
    });
    rest.splice(last + 1, 0, ...list.map(o => ({
      ...o,
      group: null,
      containerType: null
    })));
  });
  return {
    doc: {
      ...doc,
      objects: compactGroups(rest)
    },
    targetFrame: null,
    action: 'out'
  };
}
/* inferensi arah/gap/padding Auto Layout dari geometri anak Frame (agar tidak "melompat") */
/* inferensi arah/gap/padding Auto Layout dari geometri anak Frame (agar tidak "melompat") */
function inferFrameAutoLayout(doc, frameGroup) {
  const members = doc.objects.filter(o => o.group === frameGroup);
  const bg = members.find(o => o.isAutoFrame || o.isFrameBg),
    items = members.filter(o => !o.isAutoFrame && !o.isFrameBg);
  if (!items.length) return {
    dir: 'row',
    gap: 12,
    pt: 0,
    pr: 0,
    pb: 0,
    pl: 0,
    cols: 3
  };
  const boxes = items.map(o => {
    const b = tightBBox(o);
    return {
      o,
      l: b[0],
      t: b[1],
      r: b[2],
      b: b[3],
      cx: (b[0] + b[2]) / 2,
      cy: (b[1] + b[3]) / 2
    };
  });
  const sortedY = boxes.slice().sort((a, b) => a.cy - b.cy),
    rows = [];
  sortedY.forEach(b => {
    const r = rows[rows.length - 1];
    if (r && b.cy >= r.t && b.cy <= r.b) {
      r.items.push(b);
      r.t = Math.min(r.t, b.t);
      r.b = Math.max(r.b, b.b);
    } else rows.push({
      items: [b],
      t: b.t,
      b: b.b
    });
  });
  let dir = 'row',
    cols = Math.max(1, boxes.length);
  if (boxes.length > 1 && rows.length === boxes.length) dir = 'col';else if (rows.length > 1) {
    dir = 'wrap';
    cols = Math.max(...rows.map(r => r.items.length));
  }
  const gaps = [];
  if (dir === 'col') for (let i = 0; i + 1 < sortedY.length; i++) gaps.push(Math.max(0, sortedY[i + 1].t - sortedY[i].b));else rows.forEach(r => {
    const sx = r.items.slice().sort((a, b) => a.cx - b.cx);
    for (let i = 0; i + 1 < sx.length; i++) gaps.push(Math.max(0, sx[i + 1].l - sx[i].r));
  });
  const gap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 12;
  const minL = Math.min(...boxes.map(b => b.l)),
    minT = Math.min(...boxes.map(b => b.t)),
    maxR = Math.max(...boxes.map(b => b.r)),
    maxB = Math.max(...boxes.map(b => b.b));
  let pt = 0,
    pr = 0,
    pb = 0,
    pl = 0;
  if (bg) {
    const fb = tightBBox(bg);
    pl = Math.max(0, Math.round(minL - fb[0]));
    pt = Math.max(0, Math.round(minT - fb[1]));
    pr = Math.max(0, Math.round(fb[2] - maxR));
    pb = Math.max(0, Math.round(fb[3] - maxB));
  }
  return {
    dir,
    cols,
    gap,
    pt,
    pr,
    pb,
    pl,
    frame: true
  };
}

/* 6. PADDING ARTBOARD: viewBox dibentuk ulang mengelilingi seleksi (atau seluruh konten) + padding 4 sisi */
/* 6. PADDING ARTBOARD: viewBox dibentuk ulang mengelilingi seleksi (atau seluruh konten) + padding 4 sisi */
function applyArtboardPadding(doc, selObjs, pad) {
  const only = selObjs && selObjs.size ? selObjs : null,
    bb = docBounds(doc, only);
  if (!bb) return doc;
  const pt = pad.pt != null ? pad.pt : 24,
    pr = pad.pr != null ? pad.pr : 24,
    pb = pad.pb != null ? pad.pb : 24,
    pl = pad.pl != null ? pad.pl : 24;
  return {
    ...doc,
    viewBox: [rd(bb[0] - pl), rd(bb[1] - pt), rd(Math.max(1, bb[2] - bb[0] + pl + pr)), rd(Math.max(1, bb[3] - bb[1] + pt + pb))]
  };
}

/* =========================================================================
   VECTORCRAFT NATIVE ORIENTED BOUNDING BOX, 8 HANDLES, & AFFINE TRANSFORM
   Port presisi dari:
   - crates/doc/src/orient.rs (OrientedBox, normalize_deg, transformed_angle, bbox_angle)
   - crates/tools/src/bbox.rs (Handle, hit_handle, in_rotate_zone, scale_for_drag, rotate_for_drag, handle_cursor)
   - crates/tools/src/select.rs (box_hit, active_box)
   - crates/tools/src/cursor.rs (rotate_about_in_view -> RotateToward(octant))
   ========================================================================= */

export { readingOrder, clusterLayoutUnits, applyFramePadding, applyAutoLayout, createFrame, isFrameMember, frameBgOf, frameBounds, listFrames, compactGroups, reparentDroppedObjects, inferFrameAutoLayout, applyArtboardPadding };
