/**
 * @file src/engine/cornerFilletEngine.jsx
 * @description Mesin pembulatan sudut (Corner Fillet / Radius) analitik pada garis dan kurva Bézier
 */
import { dist, nrm, sub, cross, dot, lerp, cl, uid } from './vectorPrimitives.jsx';

/* geometri fillet: pv → c (sudut) → nx. mode 'circular' = busur lingkaran presisi; 'bezier' = handle lebih panjang/halus (squircle) */
function filletGeo(pv, cu, nx, radius, opt) {
  const l1 = dist(pv, cu),
    l2 = dist(cu, nx);
  if (l1 < 1e-6 || l2 < 1e-6) return null;
  const v1 = nrm(sub(cu, pv)),
    v2 = nrm(sub(nx, cu)),
    phi = Math.abs(Math.atan2(cross(v1, v2), dot(v1, v2)));
  if (phi < 0.02 || phi > Math.PI - 0.05) return null;
  const effPhi = opt && opt.bevelDeg ? (180 - Math.max(15, Math.min(165, opt.bevelDeg))) * Math.PI / 180 : phi;
  const tn = Math.tan(effPhi / 2),
    d = Math.min(radius * tn, l1 * 0.45, l2 * 0.45),
    r = d / Math.max(1e-4, Math.tan(phi / 2));
  const h = opt && opt.mode === 'chamfer' ? 0 : opt && opt.mode === 'bezier' ? d * Math.max(0.3, Math.min(1, opt.smooth == null ? 0.8 : opt.smooth)) : 4 / 3 * Math.tan(phi / 4) * r;
  const a = {
      x: cu.x - v1.x * d,
      y: cu.y - v1.y * d
    },
    b = {
      x: cu.x + v2.x * d,
      y: cu.y + v2.y * d
    };
  return {
    a,
    b,
    ha: h > 0 ? {
      x: a.x + v1.x * h,
      y: a.y + v1.y * h
    } : null,
    hb: h > 0 ? {
      x: b.x - v2.x * h,
      y: b.y - v2.y * h
    } : null,
    rEff: r,
    clamped: d < radius * tn - 1e-9
  };
}
/* de Casteljau: belah kubik [p0,c1,c2,p3] di t -> {l, r} */
/* de Casteljau: belah kubik [p0,c1,c2,p3] di t -> {l, r} */
function bzSplit(p0, c1, c2, p3, t) {
  const L = (a, b) => lerp(a, b, t),
    a = L(p0, c1),
    b = L(c1, c2),
    c = L(c2, p3),
    d = L(a, b),
    e = L(b, c),
    m = L(d, e);
  return {
    l: [p0, a, d, m],
    r: [m, e, c, p3]
  };
}
/* Curve-aware fillet dengan metadata parametrik (slider Corner radius & refillet tetap bekerja pada kurva impor) */
/* Curve-aware fillet dengan metadata parametrik (slider Corner radius & refillet tetap bekerja pada kurva impor) */
function filletCurveGeo(pv, cu, nx, radius, opt) {
  const E = .2;
  const hIn = cu.handleIn && dist(cu.handleIn, cu) > E ? cu.handleIn : pv.handleOut && dist(pv.handleOut, pv) > E ? pv.handleOut : pv;
  const hOut = cu.handleOut && dist(cu.handleOut, cu) > E ? cu.handleOut : nx.handleIn && dist(nx.handleIn, nx) > E ? nx.handleIn : nx;
  const v1 = nrm(sub(cu, hIn)),
    v2 = nrm(sub(hOut, cu)),
    phi = Math.abs(Math.atan2(cross(v1, v2), dot(v1, v2)));
  if (phi < 0.05 || phi > Math.PI - 0.05) return null;
  const c1 = pv.handleOut || pv,
    c2 = cu.handleIn || cu,
    d1 = cu.handleOut || cu,
    d2 = nx.handleIn || nx;
  const L1 = (dist(pv, c1) + dist(c1, c2) + dist(c2, cu) + dist(pv, cu)) / 2;
  const L2 = (dist(cu, d1) + dist(d1, d2) + dist(d2, nx) + dist(cu, nx)) / 2;
  if (L1 < 1e-6 || L2 < 1e-6) return null;
  const effPhi = opt && opt.bevelDeg ? (180 - Math.max(15, Math.min(165, opt.bevelDeg))) * Math.PI / 180 : phi;
  const tn = Math.tan(effPhi / 2),
    d = Math.min(radius * tn, L1 * 0.45, L2 * 0.45);
  const sI = bzSplit(pv, c1, c2, cu, 1 - d / L1),
    sO = bzSplit(cu, d1, d2, nx, d / L2);
  const a = sI.l[3],
    b = sO.r[0];
  const TA = dist(sI.l[2], a) > 1e-6 ? nrm(sub(a, sI.l[2])) : v1;
  const TB = dist(sO.r[1], b) > 1e-6 ? nrm(sub(sO.r[1], b)) : v2;
  const phiEff = Math.abs(Math.atan2(cross(TA, TB), dot(TA, TB))) || phi;
  const rEff = d / Math.max(1e-4, Math.tan(phiEff / 2));
  const h = opt && opt.mode === 'chamfer' ? 0 : opt && opt.mode === 'bezier' ? d * Math.max(0.3, Math.min(1, opt.smooth == null ? 0.8 : opt.smooth)) : 4 / 3 * Math.tan(phiEff / 4) * rEff;
  return {
    a,
    b,
    TA,
    TB,
    h,
    sI,
    sO
  };
}
function fillet(o, ids, radius, opt) {
  const idSet = ids instanceof Set ? ids : new Set(ids || []);
  return setSelectedNodesRadius(o, idSet, radius, opt || {
    mode: 'circular'
  }).o;
}
/* ubah radius/mode fillet yang sudah dibuat (parametrik) — memakai metadata sudut asal. gids: Set gid, atau null = semua fillet */
/* ubah radius/mode fillet yang sudah dibuat (parametrik) — memakai metadata sudut asal. gids: Set gid, atau null = semua fillet */
function refillet(o, gids, radius, opt) {
  opt = opt || {
    mode: 'circular'
  };
  let cnt = 0;
  const subs = o.subs.map(sp => {
    let nodes = sp.nodes.map(cl),
      n = nodes.length,
      ch = false;
    for (let i = 0; i < nodes.length; i++) {
      const A = nodes[i];
      if (!A.fil || A.fil.role !== 'a' || gids && !gids.has(A.fil.gid)) continue;
      n = nodes.length;
      const j = (i + 1) % n,
        B = nodes[j];
      if (!B.fil || B.fil.role !== 'b' || B.fil.gid !== A.fil.gid) continue;
      const pv = nodes[(i - 1 + n) % n],
        nx = nodes[(j + 1) % n];
      if (n < 4 && !sp.closed) continue;
      if (pv === B || nx === A) continue;
      if (A.fil.curved) {
        const pvOrig = {
          ...pv,
          handleOut: A.fil.pvOut ? {
            ...A.fil.pvOut
          } : null
        };
        const nxOrig = {
          ...nx,
          handleIn: A.fil.nxIn ? {
            ...A.fil.nxIn
          } : null
        };
        const cuOrig = A.fil.c;
        const sIn = !pvOrig.handleOut && !cuOrig.handleIn,
          sOut = !cuOrig.handleOut && !nxOrig.handleIn;
        const cg = filletCurveGeo(pvOrig, cuOrig, nxOrig, radius, opt);
        if (!cg) continue;
        const meta = {
          ...A.fil,
          r: radius,
          mode: opt.mode,
          smooth: opt.smooth == null ? 0.8 : opt.smooth,
          bevelDeg: opt.bevelDeg || null
        };
        const nT = opt.mode === 'chamfer' ? 'corner' : 'smooth';
        if (!sIn) pv.handleOut = {
          x: cg.sI.l[1].x,
          y: cg.sI.l[1].y
        };
        if (!sOut) nx.handleIn = {
          x: cg.sO.r[2].x,
          y: cg.sO.r[2].y
        };
        nodes[i] = {
          ...A,
          x: cg.a.x,
          y: cg.a.y,
          handleIn: sIn ? null : {
            x: cg.sI.l[2].x,
            y: cg.sI.l[2].y
          },
          handleOut: cg.h > 0 ? {
            x: cg.a.x + cg.TA.x * cg.h,
            y: cg.a.y + cg.TA.y * cg.h
          } : null,
          type: nT,
          fil: {
            ...meta,
            role: 'a'
          }
        };
        nodes[j] = {
          ...B,
          x: cg.b.x,
          y: cg.b.y,
          handleIn: cg.h > 0 ? {
            x: cg.b.x - cg.TB.x * cg.h,
            y: cg.b.y - cg.TB.y * cg.h
          } : null,
          handleOut: sOut ? null : {
            x: cg.sO.r[1].x,
            y: cg.sO.r[1].y
          },
          type: nT,
          fil: {
            ...meta,
            role: 'b'
          }
        };
        ch = true;
        cnt++;
        continue;
      }
      if (pv.handleOut || nx.handleIn) continue;
      const g = filletGeo(pv, A.fil.c, nx, radius, opt);
      if (!g) continue;
      const meta = {
        gid: A.fil.gid,
        r: radius,
        mode: opt.mode,
        smooth: opt.smooth == null ? 0.8 : opt.smooth,
        bevelDeg: opt.bevelDeg || null,
        c: A.fil.c
      };
      const nT2 = opt.mode === 'chamfer' ? 'corner' : 'smooth';
      nodes[i] = {
        ...A,
        ...g.a,
        handleIn: null,
        handleOut: g.ha,
        type: nT2,
        fil: {
          ...meta,
          role: 'a'
        }
      };
      nodes[j] = {
        ...B,
        ...g.b,
        handleIn: g.hb,
        handleOut: null,
        type: nT2,
        fil: {
          ...meta,
          role: 'b'
        }
      };
      ch = true;
      cnt++;
    }
    return ch ? {
      ...sp,
      nodes
    } : sp;
  });
  return {
    o: cnt ? {
      ...o,
      subs
    } : o,
    cnt
  };
}
/* =========================================================================
   ALGORITMA 1: SEJAJARKAN NODE (2 NODE ATAU LEBIH) DENGAN DERAJAT & REL SISI
   opt: {
     angleMode: 'auto' | 'custom' | 'perp' | 'parallel',
     angleDeg: 0,           // Derajat kustom (-180 s/d 180, 0° = horizontal, 90° = vertikal)
     anchor: 'center' | 'first' | 'last', // Titik patokan garis
     slideEdges: true,      // Geser di sepanjang rel sisi tetangga (agar batang miring tidak bengkok)
     collapse: false,       // Hapus node perantara jika memilih >= 3 node berurutan
     snapDeg: 15
   }
   ========================================================================= */

/* =========================================================================
   ALGORITMA 2: UBAH RADIUS NODE TERPILIH (LIVE + MENDUKUNG KURVA IMPOR & CHAMFER)
   opt: {
     mode: 'circular' | 'bezier' | 'chamfer',
     smooth: 0.8,
     bevelDeg: null // Opsional: kunci sudut bukaan/potongan pada derajat tertentu (mis. 45°, 60°, 90°)
   }
   Mengembalikan { o, newSelIds, cnt } agar seleksi tetap menempel pada node sudut tersebut!
   ========================================================================= */
function setSelectedNodesRadius(o, selIds, radius, opt) {
  opt = opt || {
    mode: 'circular'
  };
  const newSelIds = new Set();
  let cnt = 0;
  const subs = o.subs.map(sp => {
    let ns = sp.nodes.map(cl),
      n = ns.length;
    if (n < 3) return sp;

    /* Tahap A: Jika node terpilih adalah bagian dari pasangan fillet (role 'a' atau 'b'),
       atau 2 node berdekatan hasil impor tanpa metadata fil, lebur dulu ke sudut tajam asalnya (Apex)
       agar bisa di-fillet ulang ke radius berapapun (termasuk r = 0 untuk meruncingkan kembali) */
    const pairGids = new Set();
    ns.forEach(nd => {
      if (selIds.has(nd.id) && nd.fil && nd.fil.gid) pairGids.add(nd.fil.gid);
    });
    if (pairGids.size > 0) {
      const pair = (A, B) => A && B && A.fil && B.fil && A.fil.role === 'a' && B.fil.role === 'b' && A.fil.gid === B.fil.gid && pairGids.has(A.fil.gid);
      const restoreOne = (pv, A, nx) => {
        if (A.fil.curved) {
          if (pv) pv.handleOut = A.fil.pvOut ? {
            ...A.fil.pvOut
          } : null;
          if (nx) nx.handleIn = A.fil.nxIn ? {
            ...A.fil.nxIn
          } : null;
        }
        const cid = uid();
        newSelIds.add(cid);
        return {
          id: cid,
          x: A.fil.c.x,
          y: A.fil.c.y,
          type: 'corner',
          handleIn: A.fil.c.handleIn ? {
            ...A.fil.c.handleIn
          } : null,
          handleOut: A.fil.c.handleOut ? {
            ...A.fil.c.handleOut
          } : null
        };
      };
      if (sp.closed && ns.length > 2 && pair(ns[ns.length - 1], ns[0])) {
        const c = restoreOne(ns[ns.length - 2], ns[ns.length - 1], ns[1]);
        ns = ns.slice(1, -1).concat([c]);
        cnt++;
      }
      const out = [];
      for (let i = 0; i < ns.length; i++) {
        if (pair(ns[i], ns[i + 1])) {
          const pv = out.length ? out[out.length - 1] : sp.closed ? ns[ns.length - 1] : null;
          const nx = i + 2 < ns.length ? ns[i + 2] : sp.closed ? out[0] || ns[0] : null;
          out.push(restoreOne(pv, ns[i], nx));
          i++;
          cnt++;
        } else out.push(ns[i]);
      }
      ns = out;
      n = ns.length;
    } else {
      /* Cek apakah ada 2 node bersebelahan terpilih yang merupakan sudut tumpul/bulat hasil impor (tanpa fil) */
      const drop = new Set();
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (!sp.closed && i === n - 1) continue;
        if (!selIds.has(ns[i].id) || !selIds.has(ns[j].id) || drop.has(i) || drop.has(j) || n - drop.size <= 3) continue;
        const A = ns[i],
          B = ns[j],
          pv = ns[(i - 1 + n) % n],
          nx = ns[(j + 1) % n];
        const uIn = A.handleIn && dist(A.handleIn, A) > 0.05 ? nrm(sub(A, A.handleIn)) : nrm(sub(A, pv));
        const uOut = B.handleOut && dist(B.handleOut, B) > 0.05 ? nrm(sub(B.handleOut, B)) : nrm(sub(nx, B));
        const det = cross(uIn, uOut);
        if (Math.abs(det) > 0.12) {
          const t = cross(sub(B, A), uOut) / det,
            pI = {
              x: A.x + uIn.x * t,
              y: A.y + uIn.y * t
            };
          if (dist(pI, lerp(A, B, 0.5)) <= dist(A, B) * 3.5 + 1e-6) {
            A.x = pI.x;
            A.y = pI.y;
            A.handleIn = null;
            A.handleOut = null;
            A.type = 'corner';
            A.fil = null;
            newSelIds.add(A.id);
            drop.add(j);
            cnt++;
          }
        }
      }
      if (drop.size) {
        ns = ns.filter((_, i) => !drop.has(i));
        n = ns.length;
      }
    }

    /* Kumpulkan semua target node sudut yang akan diberi radius */
    ns.forEach(nd => {
      if (selIds.has(nd.id)) newSelIds.add(nd.id);
    });
    if (!(radius > 0)) {
      /* Radius = 0 berarti sudut dibuat tajam (Corner) */
      ns.forEach(nd => {
        if (newSelIds.has(nd.id)) {
          nd.type = 'corner';
          nd.fil = null;
          cnt++;
        }
      });
      return {
        ...sp,
        nodes: ns
      };
    }

    /* Tahap B: Hitung geometri fillet secara simultan terhadap ring verteks asli (origNs)
       agar membulatkan beberapa sudut bersebelahan menghasilkan radius yang 100% simetris dan konsisten */
    const origNs = ns.map(cl);
    const origLen = origNs.length;
    const replacements = new Map();
    const pvHandleUpdates = new Map();
    const nxHandleUpdates = new Map();
    for (let i = 0; i < origLen; i++) {
      const cu = origNs[i];
      if (!newSelIds.has(cu.id)) continue;
      if (origLen < 3 || !sp.closed && (i === 0 || i === origLen - 1)) continue;
      const pvIdx = (i - 1 + origLen) % origLen,
        nxIdx = (i + 1) % origLen;
      const pv = origNs[pvIdx],
        nx = origNs[nxIdx];
      const sIn = !pv.handleOut && !cu.handleIn,
        sOut = !cu.handleOut && !nx.handleIn;
      const gid = uid();
      if (sIn && sOut) {
        const l1 = dist(pv, cu),
          l2 = dist(cu, nx);
        if (l1 < 1e-6 || l2 < 1e-6) continue;
        const v1 = nrm(sub(cu, pv)),
          v2 = nrm(sub(nx, cu)),
          phi = Math.abs(Math.atan2(cross(v1, v2), dot(v1, v2)));
        if (phi < 0.02 || phi > Math.PI - 0.02) continue;
        const effPhi = opt.bevelDeg ? (180 - Math.max(15, Math.min(165, opt.bevelDeg))) * Math.PI / 180 : phi;
        const tn = Math.tan(effPhi / 2);
        const cap1 = newSelIds.has(pv.id) ? l1 * 0.49 : l1 * 0.92;
        const cap2 = newSelIds.has(nx.id) ? l2 * 0.49 : l2 * 0.92;
        const d = Math.min(radius * tn, cap1, cap2);
        const rEff = d / Math.max(1e-4, Math.tan(phi / 2));
        const h = opt.mode === 'chamfer' ? 0 : opt.mode === 'bezier' ? d * Math.max(0.3, Math.min(1, opt.smooth == null ? 0.8 : opt.smooth)) : 4 / 3 * Math.tan(phi / 4) * rEff;
        const a = {
            x: cu.x - v1.x * d,
            y: cu.y - v1.y * d
          },
          b = {
            x: cu.x + v2.x * d,
            y: cu.y + v2.y * d
          };
        const meta = {
          gid,
          r: Math.round(rEff * 100) / 100,
          reqR: radius,
          mode: opt.mode,
          smooth: opt.smooth == null ? 0.8 : opt.smooth,
          bevelDeg: opt.bevelDeg || null,
          c: {
            x: cu.x,
            y: cu.y
          }
        };
        const nType = opt.mode === 'chamfer' ? 'corner' : 'smooth';
        const A = {
          id: uid(),
          ...a,
          type: nType,
          handleIn: null,
          handleOut: h > 0 ? {
            x: a.x + v1.x * h,
            y: a.y + v1.y * h
          } : null,
          fil: {
            ...meta,
            role: 'a'
          }
        };
        const B = {
          id: uid(),
          ...b,
          type: nType,
          handleIn: h > 0 ? {
            x: b.x - v2.x * h,
            y: b.y - v2.y * h
          } : null,
          handleOut: null,
          fil: {
            ...meta,
            role: 'b'
          }
        };
        replacements.set(i, [A, B]);
        newSelIds.delete(cu.id);
        newSelIds.add(A.id);
        newSelIds.add(B.id);
        cnt++;
        continue;
      }
      const cg = filletCurveGeo(pv, cu, nx, radius, opt);
      if (!cg) continue;
      const meta = {
        gid,
        r: radius,
        reqR: radius,
        mode: opt.mode,
        smooth: opt.smooth == null ? 0.8 : opt.smooth,
        bevelDeg: opt.bevelDeg || null,
        c: {
          x: cu.x,
          y: cu.y,
          handleIn: cu.handleIn && {
            ...cu.handleIn
          },
          handleOut: cu.handleOut && {
            ...cu.handleOut
          }
        },
        pvOut: pv.handleOut ? {
          ...pv.handleOut
        } : null,
        nxIn: nx.handleIn ? {
          ...nx.handleIn
        } : null,
        curved: true
      };
      if (!sIn) pvHandleUpdates.set(pvIdx, {
        x: cg.sI.l[1].x,
        y: cg.sI.l[1].y
      });
      if (!sOut) nxHandleUpdates.set(nxIdx, {
        x: cg.sO.r[2].x,
        y: cg.sO.r[2].y
      });
      const h = opt.mode === 'chamfer' ? 0 : cg.h;
      const nType = opt.mode === 'chamfer' ? 'corner' : 'smooth';
      const A = {
        id: uid(),
        x: cg.a.x,
        y: cg.a.y,
        type: nType,
        handleIn: sIn ? null : {
          x: cg.sI.l[2].x,
          y: cg.sI.l[2].y
        },
        handleOut: h > 0 ? {
          x: cg.a.x + cg.TA.x * h,
          y: cg.a.y + cg.TA.y * h
        } : null,
        fil: {
          ...meta,
          role: 'a'
        }
      };
      const B = {
        id: uid(),
        x: cg.b.x,
        y: cg.b.y,
        type: nType,
        handleIn: h > 0 ? {
          x: cg.b.x - cg.TB.x * h,
          y: cg.b.y - cg.TB.y * h
        } : null,
        handleOut: sOut ? null : {
          x: cg.sO.r[1].x,
          y: cg.sO.r[1].y
        },
        fil: {
          ...meta,
          role: 'b'
        }
      };
      replacements.set(i, [A, B]);
      newSelIds.delete(cu.id);
      newSelIds.add(A.id);
      newSelIds.add(B.id);
      cnt++;
    }
    if (replacements.size > 0) {
      const finalNs = [];
      for (let i = 0; i < origLen; i++) {
        const rep = replacements.get(i);
        if (rep) {
          finalNs.push(rep[0], rep[1]);
        } else {
          const nd = {
            ...origNs[i]
          };
          if (pvHandleUpdates.has(i)) nd.handleOut = pvHandleUpdates.get(i);
          if (nxHandleUpdates.has(i)) nd.handleIn = nxHandleUpdates.get(i);
          finalNs.push(nd);
        }
      }
      ns = finalNs;
    }
    return {
      ...sp,
      nodes: ns
    };
  });
  return {
    o: cnt ? {
      ...o,
      subs
    } : o,
    newSelIds,
    cnt
  };
}
const hasFillet = o => o.subs.some(sp => sp.nodes.some(n => n.fil));
/* kembalikan fillet parametrik menjadi sudut tajam asal (node bermetadata fil saja) */
/* kembalikan fillet parametrik menjadi sudut tajam asal (node bermetadata fil saja) */
function restoreFillets(o) {
  let ch = false;
  const subs = o.subs.map(sp => {
    let ns = sp.nodes.map(cl);
    if (!ns.some(n => n.fil)) return sp;
    const pair = (A, B) => A && B && A.fil && B.fil && A.fil.role === 'a' && B.fil.role === 'b' && A.fil.gid === B.fil.gid;
    const restorePair = (pv, A, nx) => {
      if (A.fil.curved) {
        if (pv) pv.handleOut = A.fil.pvOut ? {
          ...A.fil.pvOut
        } : null;
        if (nx) nx.handleIn = A.fil.nxIn ? {
          ...A.fil.nxIn
        } : null;
      }
      return {
        id: uid(),
        x: A.fil.c.x,
        y: A.fil.c.y,
        type: 'corner',
        handleIn: A.fil.c.handleIn ? {
          ...A.fil.c.handleIn
        } : null,
        handleOut: A.fil.c.handleOut ? {
          ...A.fil.c.handleOut
        } : null
      };
    };
    if (sp.closed && ns.length > 2 && pair(ns[ns.length - 1], ns[0])) {
      const c = restorePair(ns[ns.length - 2], ns[ns.length - 1], ns[1]);
      ns = ns.slice(1, -1).concat([c]);
      ch = true;
    }
    const out = [];
    for (let i = 0; i < ns.length; i++) {
      if (pair(ns[i], ns[i + 1])) {
        const pv = out.length ? out[out.length - 1] : sp.closed ? ns[ns.length - 1] : null;
        const nx = i + 2 < ns.length ? ns[i + 2] : sp.closed ? out[0] || ns[0] : null;
        out.push(restorePair(pv, ns[i], nx));
        i++;
        ch = true;
      } else out.push(ns[i]);
    }
    return {
      ...sp,
      nodes: out
    };
  });
  return ch ? {
    ...o,
    subs
  } : o;
}
/* corner radius objek: kembalikan fillet lama lalu bulatkan semua sudut tajam dengan radius r (0 = sudut tajam) */
/* corner radius objek: kembalikan fillet lama lalu bulatkan semua sudut tajam dengan radius r (0 = sudut tajam) */
function setCornerRadius(o, r, opt) {
  const base = restoreFillets(o);
  if (!(r > 0)) return base;
  const ids = new Set();
  base.subs.forEach(sp => sp.nodes.forEach(n => {
    if (n.type === 'corner') ids.add(n.id);
  }));
  return ids.size ? fillet(base, ids, r, opt || {
    mode: 'circular'
  }) : base;
}
/* Universal Sharpen Corners: sepasang node bersebelahan yang membentuk sudut tumpul/membulat (fillet tanpa metadata, hasil impor, SVG luar)
   dilebur jadi SATU node corner di perpotongan garis singgung masuk & keluar (ray-intersection). ids=null -> deteksi otomatis pada seluruh objek:
   hanya pasangan yang jaraknya pendek dibanding segmen tetangganya (agar lingkaran/kurva mulus tidak ikut dilancipkan). */
/* Universal Sharpen Corners (lihat komentar di atas). Node hasil peleburan tidak ikut dileburkan lagi (merged). */

export { filletGeo, bzSplit, filletCurveGeo, fillet, refillet, setSelectedNodesRadius, hasFillet, restoreFillets, setCornerRadius };
