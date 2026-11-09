/**
 * @file src/engine/multiSnapSolver.jsx
 * @description Mesin snapping presisi tinggi (Grid, BBox, Node, Kurva, Sumbu, & Smart Spacing)
 *
 * Sejak port Figcraft (2026-11-07): jalur UTAMA snapping mengikuti persis
 * algoritma Figcraft (lihat src/engine/figcraftSnap.jsx — port setia dari
 * figcraft/crates/engine/src/canvas/snap.rs, point_snap.rs, guides.rs,
 * distance.rs; MIT OR Apache-2.0):
 * - Threshold SNAP_PX = 5 px layar (dulu 8 px); perbandingan |d| <= threshold,
 *   tanpa skor berbobot (pengali 1.04/1.05/1.12/1.15/0.85 dihapus dari jalur
 *   utama); equal spacing menang hanya bila |e| < |v|.
 * - Drag objek: snapMove Figcraft (garis tepi+tengah + equal spacing +
 *   guide). Drag titik/node: snapPoints Figcraft (per sumbu + marker).
 * - Target titik = node + midpoint saja (handle BUKAN target di Figcraft).
 * - Fitur Geovanta01 tanpa padanan Figcraft (sinar perp 90°/180°, garis
 *   axial, kontur/edge, grid uniform, pixel) DIPERTAHANKAN sebagai tahap
 *   fallback HANYA pada sumbu yang dibiarkan bebas oleh tahap Figcraft.
 * Lihat ~/workspace/geovanta_snap/SPEK_PEMETAAN_SNAP.md (di repo kerja).
 */
import { getDocSpatialIndex, nearOnSeg, tightBBox } from './spatialIndexAndHitTest.jsx';
import { sub, dist, nrm, cross } from './vectorPrimitives.jsx';
import { segPoint } from './bezierSubdivisionAndMove.jsx';
import { PERF_TELEMETRY } from '../utils/renderConfigAndTelemetry.jsx';
import {
  SNAP_PX,
  createTargets, addBoxLines, addPoint,
  snapPoint, snapPoints, snapMove,
  rectFromArray, rectUnion, rectIsFinite
} from './figcraftSnap.jsx';

/* snapPt — port Figcraft (point_snap.rs + snap.rs::snap_point): satu titik
   snap ke garis target (node / midpoint / tepi & pusat layer) PER SUMBU,
   dalam threshold (inklusif). Target titik = node + midpoint saja; handle
   BUKAN target di Figcraft, begitu pula hline (garis handle) dan kontur/edge
   (tidak ada di Figcraft untuk point snap). Grid uniform dipertahankan
   sebagai fallback bila grid > 0.
   Tanda tangan dipertahankan: snapPt(p, objects, exObjs, exNodes, thr, grid,
   noEdge, noHandle, hLines, noNode, midpoints). noEdge/noHandle/hLines kini
   tidak berpengaruh (lihat SPEK §3); noNode = lewati node; midpoints =
   sertakan midpoint. Kembalikan { x, y, ind, kind, subKind } seperti dulu. */
function kindOfLanded(x, y, nodes, mids, snappedX, snappedY) {
  for (const q of nodes) {
    if (Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6) return 'node';
  }
  for (const q of mids) {
    if (Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6) return 'midpoint';
  }
  if (snappedX) {
    for (const q of nodes) if (Math.abs(q.x - x) < 1e-6) return 'node';
    for (const q of mids) if (Math.abs(q.x - x) < 1e-6) return 'midpoint';
  }
  if (snappedY) {
    for (const q of nodes) if (Math.abs(q.y - y) < 1e-6) return 'node';
    for (const q of mids) if (Math.abs(q.y - y) < 1e-6) return 'midpoint';
  }
  return 'node';
}
function snapPt(p, objects, exObjs, exNodes, thr, grid, noEdge, noHandle, hLines, noNode, midpoints) {
  const t = createTargets();
  const nodes = [], mids = [];
  for (const o of objects || []) {
    if (!o || o.hidden || o.isFrameBg || o.isAutoFrame) continue;
    if (exObjs && exObjs.has(o.id)) continue;
    let hasExNode = false;
    for (const sp of o.subs) {
      for (const nd of sp.nodes) {
        if (exNodes && exNodes.has(nd.id)) { hasExNode = true; break; }
      }
      if (hasExNode) break;
    }
    /* Garis layer (tepi & pusat bbox) — Figcraft: layer yang diedit (yang
       node-nya dikecualikan) bukan target layer. */
    if (!hasExNode) {
      const bb = tightBBox(o);
      if (bb[0] <= bb[2] && bb[1] <= bb[3]) addBoxLines(t, rectFromArray(bb), 'bbox');
    }
    for (const sp of o.subs) {
      const ns = sp.nodes, n = ns.length;
      for (let i = 0; i < n; i++) {
        const nd = ns[i];
        if (exNodes && exNodes.has(nd.id)) continue;
        if (!noNode) {
          addPoint(t, nd, 'node');
          nodes.push(nd);
        }
      }
      if (midpoints) {
        for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
          const a = ns[i], b = ns[(i + 1) % n];
          if (exNodes && (exNodes.has(a.id) || exNodes.has(b.id))) continue;
          const mp = segPoint(a, b, 0.5);
          addPoint(t, mp, 'midpoint');
          mids.push(mp);
        }
      }
    }
  }
  const r = snapPoint(t, p.x, p.y, thr);
  let { x, y } = p, ind = false, kind = null;
  if (r.dx !== null || r.dy !== null) {
    x = p.x + (r.dx === null ? 0 : r.dx);
    y = p.y + (r.dy === null ? 0 : r.dy);
    ind = true;
    kind = kindOfLanded(x, y, nodes, mids, r.dx !== null, r.dy !== null);
  }
  if (!ind && grid) {
    const gx = Math.round(x / grid) * grid, gy = Math.round(y / grid) * grid;
    if (Math.abs(gx - x) < thr) { x = gx; ind = true; }
    if (Math.abs(gy - y) < thr) { y = gy; ind = true; }
    if (ind) kind = 'grid';
  }
  return { x, y, ind, kind, subKind: kind };
}

/* snapMany — port Figcraft (snap_points): banyak titik sekaligus snap
   BERSAMA per sumbu (satu koreksi dx/dy untuk semua), bukan satu-per-satu
   Euclidean. Dipakai edgeFn saat drag objek. opt.noNode = lewati node
   (maka null); opt.noEdge kini tidak berpengaruh (tanpa kontur di Figcraft).
   Kembalikan { dx, dy, x, y, kind } atau null. */
function snapMany(pts, objects, exObjs, exNodes, thr, opt) {
  opt = opt || {};
  if (!pts || !pts.length) return null;
  if (opt.noNode) return null;
  const t = createTargets();
  for (const o of objects || []) {
    if (!o || o.hidden || o.isFrameBg || o.isAutoFrame) continue;
    if (exObjs && exObjs.has(o.id)) continue;
    let hasExNode = false;
    for (const sp of o.subs) {
      for (const nd of sp.nodes) {
        if (exNodes && exNodes.has(nd.id)) { hasExNode = true; break; }
      }
      if (hasExNode) break;
    }
    if (!hasExNode) {
      const bb = tightBBox(o);
      if (bb[0] <= bb[2] && bb[1] <= bb[3]) addBoxLines(t, rectFromArray(bb), 'bbox');
    }
    for (const sp of o.subs) {
      for (const nd of sp.nodes) {
        if (exNodes && exNodes.has(nd.id)) continue;
        addPoint(t, nd, 'node');
      }
    }
  }
  const r = snapPoints(t, pts, thr);
  if (r.dx === null && r.dy === null) return null;
  const dx = r.dx === null ? 0 : r.dx, dy = r.dy === null ? 0 : r.dy;
  const marker = r.guides.find(g => g.x1 === g.x2 && g.y1 === g.y2);
  return { dx, dy, x: pts[0].x + dx, y: pts[0].y + dy, kind: marker ? marker.kind : 'node' };
}


/* node dengan handle 'w' ('in'/'out') dipindah ke t; handle lawan ikut untuk smooth/symmetric (kecuali alt) */
/* node dengan handle 'w' ('in'/'out') dipindah ke t; handle lawan ikut untuk smooth/symmetric (kecuali alt) */
function rebuildHandle(n, w, t, alt) {
  const key = w === 'in' ? 'handleIn' : 'handleOut',
    oth = w === 'in' ? 'handleOut' : 'handleIn',
    nn = {
      ...n,
      fil: null,
      [key]: {
        x: t.x,
        y: t.y
      }
    };
  if (alt && (n.type === 'smooth' || n.type === 'symmetric')) nn.type = 'corner';
  if ((n.type === 'smooth' || n.type === 'symmetric') && n[oth] && !alt) {
    const v = nrm(sub(n, t)),
      L = n.type === 'symmetric' ? dist(n, t) : dist(n, n[oth]);
    nn[oth] = {
      x: n.x + v.x * L,
      y: n.y + v.y * L
    };
  }
  return nn;
}

/* snapHandleCurve — port Figcraft: drag handle = snap_point biasa pada
   posisi handle (point_snap.rs::snap; drag.rs handle memakai snap_point).
   Optimasi kontak kurva lama (coarse-to-fine N=24 + Newton Jacobian, GV-005)
   DIHAPUS: Figcraft tidak punya itu; "sama persis" = handle snap seperti
   titik biasa ke node/midpoint/tepi & pusat layer lain.
   Tanda tangan + bentuk return dipertahankan: { tg, x, y, kind } atau null.
   noNode = true -> tidak ada target titik -> null. */
function snapHandleCurve(objects, objId, nodeId, w, tg, alt, thr, noNode) {
  if (noNode) return null;
  const o = (objects || []).find(x => x.id === objId);
  if (!o) return null;
  const t = createTargets();
  for (const ob of objects || []) {
    if (!ob || ob.hidden || ob.isFrameBg || ob.isAutoFrame) continue;
    if (ob.id === objId) continue;
    const bb = tightBBox(ob);
    if (bb[0] <= bb[2] && bb[1] <= bb[3]) addBoxLines(t, rectFromArray(bb), 'bbox');
    for (const sp of ob.subs) {
      for (const nd of sp.nodes) addPoint(t, nd, 'node');
      const ns = sp.nodes, n = ns.length;
      for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
        addPoint(t, segPoint(ns[i], ns[(i + 1) % n], 0.5), 'midpoint');
      }
    }
  }
  const r = snapPoint(t, tg.x, tg.y, thr);
  if (r.dx === null && r.dy === null) return null;
  const nx = tg.x + (r.dx === null ? 0 : r.dx);
  const ny = tg.y + (r.dy === null ? 0 : r.dy);
  const marker = r.guides.find(g => g.x1 === g.x2 && g.y1 === g.y2);
  return { tg: { x: nx, y: ny }, x: nx, y: ny, kind: marker ? marker.kind : 'node' };
}

/* snapOutline — port Figcraft (snap_points): sampel outline yang bergerak
   snap BERSAMA per sumbu ke node/tepi & pusat layer lain. Bagian lama yang
   men-snap segmen bergerak ke node objek lain DIHAPUS (tidak ada di Figcraft;
   layer move snap-nya kotak, bukan segmen). Tanda tangan dipertahankan;
   `segs` kini tidak dipakai. Kembalikan { dx, dy, x, y, kind } atau null. */
function snapOutline(samples, segs, objects, exObjs, thr, dx, dy, opt) {
  opt = opt || {};
  if (opt.noNode && opt.noEdge) return null;
  if (!samples || !samples.length) return null;
  if (opt.noNode) return null;
  const t = createTargets();
  for (const ob of objects || []) {
    if (!ob || ob.hidden || ob.isFrameBg || ob.isAutoFrame) continue;
    if (exObjs && exObjs.has(ob.id)) continue;
    const bb = tightBBox(ob);
    if (bb[0] <= bb[2] && bb[1] <= bb[3]) addBoxLines(t, rectFromArray(bb), 'bbox');
    for (const sp of ob.subs) {
      for (const nd of sp.nodes) addPoint(t, nd, 'node');
    }
  }
  const pts = samples.map(s => ({ x: s.x + dx, y: s.y + dy }));
  const r = snapPoints(t, pts, thr);
  if (r.dx === null && r.dy === null) return null;
  const ddx = r.dx === null ? 0 : r.dx, ddy = r.dy === null ? 0 : r.dy;
  const marker = r.guides.find(g => g.x1 === g.x2 && g.y1 === g.y2);
  return { dx: ddx, dy: ddy, x: pts[0].x + ddx, y: pts[0].y + ddy, kind: marker ? marker.kind : 'node' };
}

/* =========================================================================
   MULTI-SNAP SKALA BESAR (Full Spatial-Indexed TANPA BATAS JUMLAH / WAKTU)
   - Seluruh node, handleIn, handleOut, midpoint, ray, spacing, dan garis bantu
     dievaluasi secara penuh tanpa pemotongan MAX_LOCAL_PTS atau time-budget cutoff.
   ========================================================================= */
/* =========================================================================
   MULTI-SNAP SKALA BESAR (Full Spatial-Indexed TANPA BATAS JUMLAH / WAKTU)
   - Seluruh node, handleIn, handleOut, midpoint, ray, spacing, dan garis bantu
     dievaluasi secara penuh tanpa pemotongan MAX_LOCAL_PTS atau time-budget cutoff.
   ========================================================================= */
const LINE_BUCKET_SZ = 24;
function addLineToBuckets(buckets, ln) {
  const b = Math.floor(ln.v / LINE_BUCKET_SZ);
  let arr = buckets.get(b);
  if (!arr) {
    arr = [];
    buckets.set(b, arr);
  }
  arr.push(ln);
}
function queryLineBuckets(buckets, val, thr, fn) {
  if (!buckets || !buckets.size) return;
  const b0 = Math.floor((val - thr) / LINE_BUCKET_SZ);
  const b1 = Math.floor((val + thr) / LINE_BUCKET_SZ);
  for (let b = b0; b <= b1; b++) {
    const arr = buckets.get(b);
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) fn(arr[i]);
  }
}
/* buildSnapCache — gather ala Figcraft (snap.rs::Targets::gather +
   point_snap.rs::targets), dipetakan ke model Geovanta01:
   - `targets`: jalur TITIK (snapPoints/snapPoint) = garis artboard + garis
     kotak saudara (tepi & pusat) + garis titik (node & midpoint) + daftar
     titik untuk marker. `xLines`/`yLines` ADALAH targets.xs/ys (satu array
     yang sama) agar unshift axial pemanggil (handle drag) ikut terbaca.
   - `boxTargets`: jalur OBJEK (snapMove) = garis artboard + garis kotak
     saudara saja (tanpa garis titik — Figcraft: layer move tidak snap ke
     titik). `moving` = union bbox objek yang dikecualikan (yang bergerak).
   - Artboard (viewBox) = kotak parent frame Figcraft: garis saja, BUKAN
     kotak spacing. Objek frame (isFrameBg/isAutoFrame) diperlakukan sama.
   - Tidak ada ruler guide & layout grid di Geovanta01 (lihat SPEK §3).
   - cfg.axial: di Figcraft garis titik SELALU jadi target titik; toggle ini
     kini hanya berarti "garis titik ikut jadi target jalur OBJEK juga"
     (tambahan Geovanta01, default mati).
   - Sinar perp (90°/180°), boxes spacing legacy, spatial index, dan bucket
     garis dipertahankan untuk tahap fallback / kompatibilitas bentuk cache.
   - Target titik = node + midpoint SAJA (handle bukan target di Figcraft). */
function buildSnapCache(doc, exObjs, exNodes, cfg, noBoxObjs) {
  cfg = cfg || {};
  const targets = createTargets();
  const boxTargets = createTargets();
  const xLines = targets.xs,
    yLines = targets.ys,
    pts = [],
    boxes = [],
    rays = [];
  const xBuckets = new Map(),
    yBuckets = new Map();
  const pushBothX = ln => {
    targets.xs.push(ln);
    boxTargets.xs.push(ln);
    addLineToBuckets(xBuckets, ln);
  };
  const pushBothY = ln => {
    targets.ys.push(ln);
    boxTargets.ys.push(ln);
    addLineToBuckets(yBuckets, ln);
  };
  const vb = doc.viewBox || [0, 0, 0, 0],
    vx = vb[0],
    vy = vb[1],
    vw = vb[2],
    vh = vb[3];
  if (cfg.artboard && vw > 0 && vh > 0) {
    [vx, vx + vw / 2, vx + vw].forEach(v => pushBothX({
      v,
      a: vy,
      b: vy + vh,
      kind: 'artboard'
    }));
    [vy, vy + vh / 2, vy + vh].forEach(v => pushBothY({
      v,
      a: vx,
      b: vx + vw,
      kind: 'artboard'
    }));
  }
  let hasTargetObjs = false;
  for (let oi = 0, L = doc.objects.length; oi < L; oi++) {
    const o = doc.objects[oi];
    if (!o || o.hidden || o.isFrameBg || o.isAutoFrame) continue;
    if (!(exObjs && exObjs.has(o.id))) {
      hasTargetObjs = true;
      break;
    }
  }
  const sIdx = hasTargetObjs ? getDocSpatialIndex(doc.objects) : null;
  /* moving = union bbox objek yang dikecualikan (yang bergerak), untuk
     snapMove jalur objek. */
  let moving = null;
  if (exObjs) {
    for (let oi = 0, L = doc.objects.length; oi < L; oi++) {
      const o = doc.objects[oi];
      if (!o || o.hidden || o.isFrameBg || o.isAutoFrame) continue;
      if (!exObjs.has(o.id)) continue;
      const bb = tightBBox(o);
      if (bb[0] <= bb[2] && bb[1] <= bb[3]) moving = rectUnion(moving, rectFromArray(bb));
    }
  }
  if (rectIsFinite(moving)) boxTargets.moving = moving;
  for (let oi = 0, L = doc.objects.length; oi < L; oi++) {
    const o = doc.objects[oi];
    if (!o || o.hidden) continue;
    const isExObj = !!(exObjs && exObjs.has(o.id));
    const isBg = !!(o.isFrameBg || o.isAutoFrame);
    if (!isExObj && !(noBoxObjs && noBoxObjs.has(o.id)) && (cfg.bbox || cfg.spacing)) {
      const bb = tightBBox(o);
      if (bb[0] <= bb[2] && bb[1] <= bb[3]) {
        const cx = (bb[0] + bb[2]) / 2,
          cy = (bb[1] + bb[3]) / 2;
        if (cfg.bbox) {
          [bb[0], cx, bb[2]].forEach(v => pushBothX({
            v,
            a: bb[1],
            b: bb[3],
            kind: isBg ? 'artboard' : 'bbox'
          }));
          [bb[1], cy, bb[3]].forEach(v => pushBothY({
            v,
            a: bb[0],
            b: bb[2],
            kind: isBg ? 'artboard' : 'bbox'
          }));
        }
        if (cfg.spacing && !isBg) {
          boxes.push({
            id: o.id,
            l: bb[0],
            t: bb[1],
            r: bb[2],
            b: bb[3],
            w: bb[2] - bb[0],
            h: bb[3] - bb[1]
          });
          /* Figcraft: kotak sibling masuk Targets.boxes agar equalSpacing
             (spacings) punya bahan banding; garis saja tidak cukup. */
          boxTargets.boxes.push(rectFromArray(bb));
        }
      }
    }
    if (isBg) continue;
    for (let si = 0; si < o.subs.length; si++) {
      const sp = o.subs[si],
        ns = sp.nodes,
        n = ns.length;
      for (let i = 0; i < n; i++) {
        const nd = ns[i];
        const isExNode = isExObj || !!(exNodes && exNodes.has(nd.id));
        if (!isExNode) {
          if (cfg.node) {
            pts.push({
              x: nd.x,
              y: nd.y,
              kind: 'node'
            });
            addPoint(targets, nd, 'node');
          }
          if (cfg.axial) {
            boxTargets.xs.push({
              v: nd.x,
              a: nd.y,
              b: nd.y,
              kind: 'axial'
            });
            boxTargets.ys.push({
              v: nd.y,
              a: nd.x,
              b: nd.x,
              kind: 'axial'
            });
          }
        } else if (cfg.perp && exNodes && exNodes.has(nd.id) && n >= 2) {
          for (const st of [-1, 1]) {
            if (!sp.closed && (i + st < 0 || i + st >= n)) continue;
            const nb = ns[(i + st + n) % n];
            if (exNodes.has(nb.id)) continue;
            if (n >= 3 && (sp.closed || i + 2 * st >= 0 && i + 2 * st < n)) {
              const nb2 = ns[(i + 2 * st + 2 * n) % n];
              if (!exNodes.has(nb2.id) && dist(nb, nb2) >= 1e-4) {
                const u = nrm(sub(nb, nb2));
                rays.push({
                  o: {
                    x: nb.x,
                    y: nb.y
                  },
                  d: u,
                  src: {
                    x: nd.x,
                    y: nd.y
                  },
                  label: '180°',
                  kind: 'perp'
                });
                rays.push({
                  o: {
                    x: nb.x,
                    y: nb.y
                  },
                  d: {
                    x: -u.y,
                    y: u.x
                  },
                  src: {
                    x: nd.x,
                    y: nd.y
                  },
                  label: '90°',
                  kind: 'perp'
                });
              }
            }
          }
        }
      }
      if (cfg.midpoint && !isExObj) {
        for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
          const a = ns[i],
            b = ns[(i + 1) % n];
          if (exNodes && (exNodes.has(a.id) || exNodes.has(b.id))) continue;
          const mp = segPoint(a, b, 0.5);
          pts.push({
            x: mp.x,
            y: mp.y,
            kind: 'midpoint'
          });
          addPoint(targets, mp, 'midpoint');
          if (cfg.axial) {
            boxTargets.xs.push({
              v: mp.x,
              a: mp.y,
              b: mp.y,
              kind: 'axial'
            });
            boxTargets.ys.push({
              v: mp.y,
              a: mp.x,
              b: mp.x,
              kind: 'axial'
            });
          }
        }
      }
    }
  }
  const boxesByX = cfg.spacing && boxes.length >= 2 ? boxes.slice().sort((a, b) => a.l - b.l) : [];
  const boxesByY = cfg.spacing && boxes.length >= 2 ? boxes.slice().sort((a, b) => a.t - b.t) : [];
  return {
    xLines,
    yLines,
    xBuckets,
    yBuckets,
    pts,
    boxes,
    boxesByX,
    boxesByY,
    rays,
    hash: null,
    spatialIndex: sIdx,
    hasTargetObjs,
    targets,
    boxTargets
  };
}
function ptHash(C, cell) {
  const safeCell = Math.max(1e-4, cell || 8);
  if (C.hash && Math.abs(C.hash.cell - safeCell) < 1e-6) return C.hash;
  const map = new Map(),
    key = (ix, iy) => ix * 73856093 ^ iy * 19349663;
  for (const q of C.pts) {
    const k = key(Math.floor(q.x / safeCell), Math.floor(q.y / safeCell));
    const b = map.get(k);
    if (b) b.push(q);else map.set(k, [q]);
  }
  C.hash = {
    cell: safeCell,
    map,
    key
  };
  return C.hash;
}

/* snapMove Figcraft dengan kotak yang SUDAH bergeser (r), tanpa `moving` +
   delta — dipakai bila moving tidak diketahui (shape/frame drawing via
   snapAt, exObjs kosong). Algoritmanya identik dengan snapMove. */
function snapMovedBox(t, r, threshold) {
  return snapMove({ ...t, moving: r }, { x: 0, y: 0 }, threshold);
}

/* Titik terdekat pada kontur (segmen) objek lain — fallback Geovanta01 untuk
   cfg.edge (tidak ada di Figcraft). Dipakai tahap edge solveMultiSnap bila
   extra.edgeFn tidak disediakan. */
function snapEdgePoint(p, objects, exObjs, exNodes, thr) {
  const sIdx = getDocSpatialIndex(objects);
  if (!sIdx) return null;
  let eb = null, ed = thr;
  sIdx.querySegments(p.x, p.y, thr, sg => {
    const o = sg.o;
    if (exObjs && exObjs.has(o.id) || o.hidden || o.isFrameBg || o.isAutoFrame) return;
    if (exNodes && exNodes.has(sg.a.id) && exNodes.has(sg.b.id)) return;
    const r = nearOnSeg(sg.a, sg.b, p);
    if (r.d < ed) {
      ed = r.d;
      eb = r;
    }
  });
  if (!eb) return null;
  return { x: eb.x, y: eb.y, dx: eb.x - p.x, dy: eb.y - p.y, kind: 'edge' };
}

/* Saring guide menurut sumbu yang koreksinya dipakai (guide garis vertikal =
   snap sumbu X; garis horizontal = snap sumbu Y; spacing horizontal = sumbu
   X, spacing vertikal = sumbu Y; marker hanya bila kedua sumbu dipakai). */
function guidesForAxes(guides, useX, useY) {
  return guides.filter(g => {
    if (g.x1 === g.x2 && g.y1 === g.y2) return useX && useY;
    if (g.type === 'spacing') {
      return Math.abs(g.y2 - g.y1) < 1e-9 ? useX : useY;
    }
    return Math.abs(g.x2 - g.x1) < 1e-9 ? useX : useY;
  });
}

/* solveMultiSnap — pipeline Figcraft-first (lihat header file).
   Tahap 1 (Figcraft): drag objek -> snapMove (garis + equal spacing, persis
   drag.rs); drag titik/node -> snapPoints (per sumbu + marker, persis
   point_snap.rs::snap). Tahap 2 (fallback Geovanta01, HANYA pada sumbu yang
   dibiarkan bebas tahap 1): bbox dragBBox, sinar perp, edge/kontur, grid
   uniform, pixel. Tanpa skor berbobot. Tanda tangan + bentuk return
   dipertahankan: { x, y, dx, dy, ix, iy, ind, kind, cross, guides }. */
function solveMultiSnap(p, cache, objects, exObjs, exNodes, thr, gridStep, cfg, dragBBox, extra) {
  const nowFn = () => typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const tSnap0 = nowFn();
  cfg = cfg || {};
  extra = extra || {};
  const C = cache || {
    xLines: [],
    yLines: [],
    pts: [],
    boxes: [],
    rays: []
  };
  const hasTargets = C.hasTargetObjs !== false;
  const targets = C.targets || null;
  const boxTargets = C.boxTargets || null;
  const probes = extra.probes && extra.probes.length ? extra.probes : [p],
    delta = extra.delta || null;
  const figmaObj = !!(extra.figmaObjectMode && dragBBox);
  const preX = extra.lockAxis === 'y',
    preY = extra.lockAxis === 'x';
  let dx = 0,
    dy = 0,
    lockX = preX,
    lockY = preY,
    kind = null,
    ptKind = null,
    ind = null;
  const guides = [];
  let gxHit = null,
    gyHit = null;
  const dragRect = dragBBox ? rectFromArray(dragBBox) : null;

  /* 1. FIGCRAFT — jalur utama. */
  if (hasTargets && targets && boxTargets) {
    if (figmaObj && dragRect) {
      /* Drag objek: snapMove Figcraft (drag.rs). Figcraft memakai delta
         {x, y} (Vec2); Geovanta01 memakai {dx, dy} — normalisasi di sini. */
      let res;
      if (boxTargets.moving && delta) {
        const dv = { x: delta.dx != null ? delta.dx : delta.x || 0, y: delta.dy != null ? delta.dy : delta.y || 0 };
        res = snapMove(boxTargets, dv, thr);
      } else res = snapMovedBox(boxTargets, dragRect, thr);
      if (res.dx !== null && !lockX) { dx = res.dx; lockX = true; }
      if (res.dy !== null && !lockY) { dy = res.dy; lockY = true; }
      if (res.guides.length) {
        guides.push(...guidesForAxes(res.guides, !preX, !preY));
        if (!kind) {
          kind = res.guides.some(g => g.type === 'spacing') ? 'spacing'
            : (res.guides.find(g => g.type === 'line') || {}).kind || 'bbox';
        }
      } else if (lockX || lockY) {
        kind = kind || 'bbox';
      }
    } else if (cfg.node || cfg.midpoint) {
      /* Drag titik/node: snapPoints Figcraft (point_snap.rs::snap). */
      const res = snapPoints(targets, probes, thr);
      if (res.dx !== null && !lockX) { dx = res.dx; lockX = true; }
      if (res.dy !== null && !lockY) { dy = res.dy; lockY = true; }
      if (res.guides.length) {
        guides.push(...guidesForAxes(res.guides, !preX, !preY));
        const marker = res.guides.find(g => g.x1 === g.x2 && g.y1 === g.y2);
        if (marker && !preX && !preY) {
          kind = ptKind = marker.kind;
          ind = { x: marker.x1, y: marker.y1 };
        } else if (!kind) {
          const ln = res.guides.find(g => g.type === 'line');
          kind = ln ? ln.kind || 'bbox' : 'bbox';
        }
      }
    }
  }

  /* 1b. Fallback Geovanta01: bbox dragBBox pada sumbu bebas (drag node &
     gambar shape/frame; di Figcraft drag titik tidak snap bbox, tapi
     perilaku ini dipertahankan sebagai fallback agar UX lama tidak hilang). */
  if (dragRect && !figmaObj && (cfg.bbox || cfg.spacing) && boxTargets && (!lockX || !lockY)) {
    const res = snapMovedBox(boxTargets, dragRect, thr);
    const useX = !lockX && res.dx !== null;
    const useY = !lockY && res.dy !== null;
    if (useX) { dx = res.dx; lockX = true; }
    if (useY) { dy = res.dy; lockY = true; }
    if (res.guides.length && (useX || useY)) {
      guides.push(...guidesForAxes(res.guides, useX, useY));
      if (!kind) {
        kind = res.guides.some(g => g.type === 'spacing') ? 'spacing' : 'bbox';
      }
    }
  }

  /* 2. Fallback Geovanta01: sinar siku-siku (90°) & perpanjangan garis
     (180°) — hanya bila kedua sumbu bebas. */
  if (!figmaObj && !lockX && !lockY && cfg.perp && C.rays && C.rays.length) {
    const hitRays = [];
    for (let ri = 0; ri < C.rays.length; ri++) {
      const r = C.rays[ri];
      const pr = r.src && delta ? {
        x: r.src.x + delta.dx,
        y: r.src.y + delta.dy
      } : p;
      const t = (pr.x - r.o.x) * r.d.x + (pr.y - r.o.y) * r.d.y,
        pj = {
          x: r.o.x + r.d.x * t,
          y: r.o.y + r.d.y * t
        };
      const d = Math.hypot(pr.x - pj.x, pr.y - pj.y);
      if (d < thr) hitRays.push({
        r,
        pr,
        pj,
        d
      });
    }
    hitRays.sort((a, b) => a.d - b.d);
    const rayLim = hitRays.length;
    if (rayLim >= 2) {
      let bi = null,
        bid = thr * 1.6;
      for (let i = 0; i < rayLim; i++) for (let j = i + 1; j < rayLim; j++) {
        const A = hitRays[i],
          B = hitRays[j];
        if (Math.abs(A.r.src.x - B.r.src.x) > 1e-6 || Math.abs(A.r.src.y - B.r.src.y) > 1e-6) continue;
        if (Math.hypot(A.r.o.x - B.r.o.x, A.r.o.y - B.r.o.y) < 1e-6) continue;
        const det = cross(A.r.d, B.r.d);
        if (Math.abs(det) <= 0.15) continue;
        const w = sub(B.r.o, A.r.o),
          t = cross(w, B.r.d) / det,
          inter = {
            x: A.r.o.x + A.r.d.x * t,
            y: A.r.o.y + A.r.d.y * t
          };
        const dd = Math.hypot(inter.x - A.pr.x, inter.y - A.pr.y);
        if (dd < bid) {
          bid = dd;
          bi = {
            A,
            B,
            inter
          };
        }
      }
      if (bi) {
        dx = bi.inter.x - bi.A.pr.x;
        dy = bi.inter.y - bi.A.pr.y;
        lockX = lockY = true;
        kind = ptKind = 'perp';
        ind = {
          x: bi.inter.x,
          y: bi.inter.y
        };
        guides.push({
          type: 'line',
          x1: bi.A.r.o.x,
          y1: bi.A.r.o.y,
          x2: bi.inter.x,
          y2: bi.inter.y,
          kind: 'perp',
          label: bi.A.r.label
        });
        guides.push({
          type: 'line',
          x1: bi.B.r.o.x,
          y1: bi.B.r.o.y,
          x2: bi.inter.x,
          y2: bi.inter.y,
          kind: 'perp',
          label: bi.B.r.label
        });
      }
    }
    if (!lockX && !lockY && rayLim > 0) {
      const best = hitRays[0];
      dx = best.pj.x - best.pr.x;
      dy = best.pj.y - best.pr.y;
      lockX = lockY = true;
      kind = ptKind = 'perp';
      ind = {
        x: best.pj.x,
        y: best.pj.y
      };
      guides.push({
        type: 'line',
        x1: best.r.o.x,
        y1: best.r.o.y,
        x2: best.pj.x,
        y2: best.pj.y,
        kind: 'perp',
        label: best.r.label
      });
    }
  }

  /* 3. Fallback Geovanta01: tepi / kontur path — hanya pada sumbu bebas
     (dulu bisa mengalahkan guide bila skor < 0.85x; Figcraft: layer snap
     menang, jadi override itu dihapus). */
  if (hasTargets && !figmaObj && cfg.edge && !ptKind) {
    let r = null;
    if (extra.edgeFn) r = extra.edgeFn();
    else r = snapEdgePoint({ x: p.x, y: p.y }, objects || [], exObjs, exNodes, thr);
    if (r) {
      if (!lockX && !lockY) {
        dx = r.dx;
        dy = r.dy;
        lockX = lockY = true;
        kind = ptKind = r.kind || 'edge';
        ind = {
          x: r.x,
          y: r.y
        };
      } else if (!lockX) {
        dx = r.dx;
        lockX = true;
        ptKind = r.kind || 'edge';
        kind = kind || ptKind;
        ind = {
          x: r.x,
          y: p.y + dy
        };
      } else if (!lockY) {
        dy = r.dy;
        lockY = true;
        ptKind = r.kind || 'edge';
        kind = kind || ptKind;
        ind = {
          x: p.x + dx,
          y: r.y
        };
      }
    }
  }

  /* 4. Fallback Geovanta01: grid adaptif per sumbu (hanya sumbu bebas). */
  const xT = dragBBox ? [dragBBox[0], (dragBBox[0] + dragBBox[2]) / 2, dragBBox[2]] : [p.x];
  const yT = dragBBox ? [dragBBox[1], (dragBBox[1] + dragBBox[3]) / 2, dragBBox[3]] : [p.y];
  if (cfg.grid && gridStep > 0) {
    const gThr = Math.min(thr, gridStep * 0.35);
    if (!lockX) {
      let bestDx = 0,
        bestGx = null,
        bestD = gThr;
      for (let i = 0; i < xT.length; i++) {
        const tx = xT[i],
          g = Math.round(tx / gridStep) * gridStep,
          d = Math.abs(g - tx);
        if (d < bestD) {
          bestD = d;
          bestDx = g - tx;
          bestGx = g;
        }
      }
      if (bestGx !== null) {
        dx = bestDx;
        gxHit = bestGx;
        lockX = true;
        kind = kind || 'grid';
      }
    }
    if (!lockY) {
      let bestDy = 0,
        bestGy = null,
        bestD = gThr;
      for (let i = 0; i < yT.length; i++) {
        const ty = yT[i],
          g = Math.round(ty / gridStep) * gridStep,
          d = Math.abs(g - ty);
        if (d < bestD) {
          bestD = d;
          bestDy = g - ty;
          bestGy = g;
        }
      }
      if (bestGy !== null) {
        dy = bestDy;
        gyHit = bestGy;
        lockY = true;
        kind = kind || 'grid';
      }
    }
  }

  /* 5. Fallback Geovanta01: pixel — bulatkan sumbu yang belum terkunci. */
  if (cfg.pixel) {
    if (dragBBox) {
      if (!lockX) dx = Math.round(dragBBox[0]) - dragBBox[0];
      if (!lockY) dy = Math.round(dragBBox[1]) - dragBBox[1];
    } else {
      if (!lockX) dx = Math.round(p.x) - p.x;
      if (!lockY) dy = Math.round(p.y) - p.y;
    }
  }

  /* Susun panduan visual pada posisi akhir. */
  const px = p.x + dx,
    py = p.y + dy;
  const xr = dragBBox ? [dragBBox[0] + dx, dragBBox[2] + dx] : [px, px],
    yr = dragBBox ? [dragBBox[1] + dy, dragBBox[3] + dy] : [py, py];
  if (dragBBox) {
    const ext = thr * 2.5;
    if (gxHit !== null) guides.push({
      type: 'line',
      x1: gxHit,
      y1: yr[0] - ext,
      x2: gxHit,
      y2: yr[1] + ext,
      kind: 'artboard'
    });
    if (gyHit !== null) guides.push({
      type: 'line',
      x1: xr[0] - ext,
      y1: gyHit,
      x2: xr[1] + ext,
      y2: gyHit,
      kind: 'artboard'
    });
  }
  const any = lockX && !preX || lockY && !preY;
  if (!ind) ind = {
    x: px,
    y: py
  };
  const tSnap1 = nowFn();
  PERF_TELEMETRY.updateSceneMetrics({
    snapQueryMs: tSnap1 - tSnap0
  });
  return {
    x: px,
    y: py,
    dx,
    dy,
    ix: ind.x,
    iy: ind.y,
    ind: any,
    kind,
    cross: !!ptKind || kind === 'grid' && !dragBBox,
    guides
  };
}

/* =========================================================================
   DETEKSI GEOMETRI (INSPECTION ONLY) & AUTO-SIMPLIFY NODE ALGORITHMS
   Berdasarkan rekomendasi: Ray-Intersection Collapse, Schneider Bézier Fit,
   Kåsa Circle Fit, Monotonic Exterior Angle, Curvature Sign Alternation, DBSCAN
   ========================================================================= */

/* 1. Kåsa Algebraic Circle Fit Test */

export { SNAP_PX, snapPt, snapMany, rebuildHandle, snapHandleCurve, snapOutline, LINE_BUCKET_SZ, addLineToBuckets, queryLineBuckets, buildSnapCache, ptHash, solveMultiSnap };
