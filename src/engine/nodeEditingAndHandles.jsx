/**
 * @file src/engine/nodeEditingAndHandles.jsx
 * @description Operasi penajaman sudut, penghalusan node, Auto-Handle Catmull-Rom, & pencerminan handle
 */
import { cl, dist, nrm, sub, cross, lerp, dot, add } from './vectorPrimitives.jsx';
import { mapSubs } from './straightenAndAlignNodes.jsx';

/* Universal Sharpen Corners: sepasang node bersebelahan yang membentuk sudut tumpul/membulat (fillet tanpa metadata, hasil impor, SVG luar)
   dilebur jadi SATU node corner di perpotongan garis singgung masuk & keluar (ray-intersection). ids=null -> deteksi otomatis pada seluruh objek:
   hanya pasangan yang jaraknya pendek dibanding segmen tetangganya (agar lingkaran/kurva mulus tidak ikut dilancipkan). */
/* Universal Sharpen Corners (lihat komentar di atas). Node hasil peleburan tidak ikut dileburkan lagi (merged). */
function sharpenCorners(o, ids) {
  return {
    ...o,
    subs: o.subs.map(sp => {
      const ns = sp.nodes.map(cl),
        n = ns.length;
      if (n < 3) return sp;
      const S = new Set();
      ns.forEach((nd, i) => {
        if (!ids || ids.has(nd.id)) S.add(i);
      });
      if (!S.size) return sp;
      const drop = new Set(),
        merged = new Set();
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (!sp.closed && i === n - 1) continue;
        if (!S.has(i) || !S.has(j) || drop.has(i) || drop.has(j) || merged.has(ns[i].id) || merged.has(ns[j].id) || n - drop.size <= 3) continue;
        const A = ns[i],
          B = ns[j],
          pv = ns[(i - 1 + n) % n],
          nx = ns[(j + 1) % n];
        if (!ids && dist(A, B) > 0.6 * Math.min(dist(pv, A), dist(B, nx))) continue;
        const uIn = A.handleIn && dist(A.handleIn, A) > 0.05 ? nrm(sub(A, A.handleIn)) : nrm(sub(A, pv));
        const uOut = B.handleOut && dist(B.handleOut, B) > 0.05 ? nrm(sub(B.handleOut, B)) : nrm(sub(nx, B));
        const det = cross(uIn, uOut);
        if (Math.abs(det) <= 0.15) continue;
        const t = cross(sub(B, A), uOut) / det,
          pI = {
            x: A.x + uIn.x * t,
            y: A.y + uIn.y * t
          };
        if (!(dist(pI, lerp(A, B, 0.5)) <= dist(A, B) * 1.8 + 1e-6 + (ids ? dist(A, B) * 4 : 0))) continue;
        A.x = pI.x;
        A.y = pI.y;
        A.handleOut = B.handleOut;
        A.type = 'corner';
        A.fil = null;
        drop.add(j);
        merged.add(A.id);
      }
      const out = ns.filter((_, i) => !drop.has(i));
      if (ids) out.forEach(nd => {
        if (ids.has(nd.id) && !merged.has(nd.id)) {
          nd.type = 'corner';
          nd.handleIn = null;
          nd.handleOut = null;
          nd.fil = null;
        }
      });
      return {
        ...sp,
        nodes: out
      };
    })
  };
}
/* Interactive smoothing: Taubin lambda|mu pada posisi node terpilih (tanpa menyusut) lalu handle G1 dihitung ulang (arah centripetal Catmull-Rom). */
/* Interactive smoothing: Taubin lambda|mu pada posisi node terpilih (tanpa menyusut) lalu handle G1 dihitung ulang (arah centripetal Catmull-Rom). */
function smoothSelectedNodes(o, ids, strength) {
  strength = strength == null ? 0.5 : strength;
  const lam = 0.35 * strength,
    mu = -0.37 * strength;
  return {
    ...o,
    subs: o.subs.map(sp => {
      const ns = sp.nodes.map(cl),
        n = ns.length;
      if (n < 3 || !ns.some(nd => ids.has(nd.id))) return sp;
      const step = f => {
        const nx2 = ns.map(p => ({
          x: p.x,
          y: p.y
        }));
        for (let i = 0; i < n; i++) {
          if (!ids.has(ns[i].id) || !sp.closed && (i === 0 || i === n - 1)) continue;
          const pv = ns[(i - 1 + n) % n],
            nx = ns[(i + 1) % n];
          nx2[i].x += f * ((pv.x + nx.x) / 2 - ns[i].x);
          nx2[i].y += f * ((pv.y + nx.y) / 2 - ns[i].y);
        }
        for (let i = 0; i < n; i++) {
          ns[i].x = nx2[i].x;
          ns[i].y = nx2[i].y;
        }
      };
      for (let it = 0; it < 2; it++) {
        step(lam);
        step(mu);
      }
      for (let i = 0; i < n; i++) {
        if (!ids.has(ns[i].id)) continue;
        const nd = ns[i];
        const pv = sp.closed || i > 0 ? ns[(i - 1 + n) % n] : null,
          nx = sp.closed || i < n - 1 ? ns[(i + 1) % n] : null;
        if (!pv || !nx) continue;
        const d1 = Math.sqrt(Math.max(1e-6, dist(pv, nd))),
          d2 = Math.sqrt(Math.max(1e-6, dist(nd, nx)));
        const dir = nrm({
          x: (nd.x - pv.x) / d1 + (nx.x - nd.x) / d2,
          y: (nd.y - pv.y) / d1 + (nx.y - nd.y) / d2
        });
        const l1 = dist(pv, nd) / 3,
          l2 = dist(nd, nx) / 3;
        nd.type = 'smooth';
        nd.fil = null;
        nd.handleIn = {
          x: nd.x - dir.x * l1,
          y: nd.y - dir.y * l1
        };
        nd.handleOut = {
          x: nd.x + dir.x * l2,
          y: nd.y + dir.y * l2
        };
      }
      return {
        ...sp,
        nodes: ns
      };
    })
  };
}
/* ---- Auto-Handle: Shape-Preserving (Tanpa Mengubah Bentuk) & Catmull-Rom ----
   - Jika opt.preserveShape === true (default):
     Menambahkan handle Bézier kolinier tepat pada segmen lurus di posisi 1/3 dan 2/3
     panjang segmen (C1 = P0 + 1/3(P1-P0), C2 = P0 + 2/3(P1-P0)), serta melengkapi
     handle pasangan yang kosong pada segmen kurva pada titik ankornya.
     Secara matematis 100% mempertahankan bentuk asli objek (0% distorsi).
   - Jika opt.preserveShape === false:
     Menggunakan algoritma Centripetal Catmull-Rom (alpha = 0.5) saat menyeret ketegangan (tau). */
/* ---- Auto-Handle: Shape-Preserving (Tanpa Mengubah Bentuk) & Catmull-Rom ----
   - Jika opt.preserveShape === true (default):
     Menambahkan handle Bézier kolinier tepat pada segmen lurus di posisi 1/3 dan 2/3
     panjang segmen (C1 = P0 + 1/3(P1-P0), C2 = P0 + 2/3(P1-P0)), serta melengkapi
     handle pasangan yang kosong pada segmen kurva pada titik ankornya.
     Secara matematis 100% mempertahankan bentuk asli objek (0% distorsi).
   - Jika opt.preserveShape === false:
     Menggunakan algoritma Centripetal Catmull-Rom (alpha = 0.5) saat menyeret ketegangan (tau). */
function autoHandles(o, spId, opt) {
  opt = opt || {};
  const tau = opt.tau == null ? 1 / 3 : opt.tau;
  const minA = (opt.minAngle || 0) * Math.PI / 180;
  const ids = opt.ids || null;
  const clear = !!opt.clear || !opt.preserveShape && tau < 0.005;
  const preserve = opt.preserveShape !== false && !clear;
  let changed = false;
  const subs = o.subs.map(sp => {
    const n = sp.nodes.length;
    if (spId && sp.id !== spId || n < 2) return sp;
    if (ids && !sp.nodes.some(q => ids.has(q.id))) return sp;
    const src = sp.nodes;
    const out = src.map(cl);
    const closed = !!sp.closed;
    if (clear) {
      for (let i = 0; i < n; i++) {
        if (ids && !ids.has(src[i].id)) continue;
        const nd = out[i];
        if (nd.handleIn || nd.handleOut || nd.type !== 'corner') changed = true;
        nd.handleIn = null;
        nd.handleOut = null;
        nd.type = 'corner';
        nd.fil = null;
      }
      return {
        ...sp,
        nodes: out
      };
    }

    /* MODE 1: PRESERVE SHAPE (100% Tanpa Mengubah Bentuk Geometri Objek) */
    if (preserve) {
      const segCount = closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const j = (i + 1) % n;
        const a = out[i],
          b = out[j];
        const touchA = !ids || ids.has(a.id);
        const touchB = !ids || ids.has(b.id);
        if (!touchA && !touchB) continue;
        if (!a.handleOut && !b.handleIn) {
          /* Segmen lurus L(a, b) -> C(a + 1/3(b-a), a + 2/3(b-a), b)
             Menghasilkan garis lurus identik namun kedua node memiliki handle Bézier penuh */
          const d = dist(a, b);
          if (d > 1e-6) {
            if (touchA) {
              a.handleOut = lerp(a, b, 1 / 3);
              changed = true;
            }
            if (touchB) {
              b.handleIn = lerp(a, b, 2 / 3);
              changed = true;
            }
          }
        } else if (!a.handleOut && b.handleIn && touchA) {
          /* Segmen kurva dengan handleOut kosong: buat handle kolinier ke arah handleIn pasangan (1/3 jarak) */
          const d = dist(a, b.handleIn);
          if (d > 1e-6) {
            a.handleOut = lerp(a, b.handleIn, 1 / 3);
            changed = true;
          }
        } else if (a.handleOut && !b.handleIn && touchB) {
          /* Segmen kurva dengan handleIn kosong: buat handle kolinier ke arah handleOut pasangan (1/3 jarak) */
          const d = dist(b, a.handleOut);
          if (d > 1e-6) {
            b.handleIn = lerp(b, a.handleOut, 1 / 3);
            changed = true;
          }
        }
      }

      /* Perbarui tipe node ('smooth' / 'symmetric' / 'corner') sesuai kesejajaran handle */
      for (let i = 0; i < n; i++) {
        const nd = out[i];
        if (nd.handleIn && nd.handleOut) {
          const vi = sub(nd, nd.handleIn),
            vo = sub(nd.handleOut, nd);
          const li = Math.hypot(vi.x, vi.y),
            lo = Math.hypot(vo.x, vo.y);
          if (li > 1e-6 && lo > 1e-6 && Math.abs(Math.atan2(cross(vi, vo), dot(vi, vo))) < 0.05) {
            nd.type = Math.abs(li - lo) < 0.5 ? 'symmetric' : 'smooth';
          } else {
            nd.type = 'corner';
          }
        }
      }
      return {
        ...sp,
        nodes: out
      };
    }

    /* MODE 2: CENTRIPETAL CATMULL-ROM (Saat menyeret ketegangan τ untuk menghaluskan poligon) */
    if (closed && n < 3) return sp;
    for (let i = 0; i < n; i++) {
      const P = src[i];
      if (ids && !ids.has(P.id)) continue;
      const nd = out[i];
      const hasPrev = closed || i > 0,
        hasNext = closed || i < n - 1;
      const Pp = hasPrev ? src[(i - 1 + n) % n] : {
        x: 2 * P.x - src[1].x,
        y: 2 * P.y - src[1].y
      };
      const Pn = hasNext ? src[(i + 1) % n] : {
        x: 2 * P.x - src[n - 2].x,
        y: 2 * P.y - src[n - 2].y
      };
      const d1 = Math.hypot(P.x - Pp.x, P.y - Pp.y),
        d2 = Math.hypot(Pn.x - P.x, Pn.y - P.y);
      const t1 = Math.sqrt(Math.max(d1, 1e-6)),
        t2 = Math.sqrt(Math.max(d2, 1e-6));
      if (minA > 0 && hasPrev && hasNext && d1 > 1e-9 && d2 > 1e-9) {
        const c = ((Pp.x - P.x) * (Pn.x - P.x) + (Pp.y - P.y) * (Pn.y - P.y)) / (d1 * d2);
        if (Math.acos(Math.max(-1, Math.min(1, c))) < minA) continue;
      }
      let vx = t2 * (P.x - Pp.x) / (t1 * (t1 + t2)) + t1 * (Pn.x - P.x) / (t2 * (t1 + t2));
      let vy = t2 * (P.y - Pp.y) / (t1 * (t1 + t2)) + t1 * (Pn.y - P.y) / (t2 * (t1 + t2));
      let L = Math.hypot(vx, vy);
      if (L < 1e-9) {
        vx = Pn.x - Pp.x;
        vy = Pn.y - Pp.y;
        L = Math.hypot(vx, vy);
      }
      if (L < 1e-9) continue;
      const tx = vx / L,
        ty = vy / L;
      nd.handleIn = hasPrev ? {
        x: P.x - tx * tau * d1,
        y: P.y - ty * tau * d1
      } : null;
      nd.handleOut = hasNext ? {
        x: P.x + tx * tau * d2,
        y: P.y + ty * tau * d2
      } : null;
      nd.type = hasPrev && hasNext && Math.abs(d1 - d2) < 0.5 ? 'symmetric' : 'smooth';
      nd.fil = null;
      changed = true;
    }
    return {
      ...sp,
      nodes: out
    };
  });
  return changed ? {
    ...o,
    subs
  } : o;
}
function deleteNodes(o, ids) {
  return mapSubs(o, sp => {
    const nodes = sp.nodes.filter(n => !ids.has(n.id));
    return nodes.length < 2 ? null : nodes.length === sp.nodes.length ? sp : {
      ...sp,
      nodes
    };
  });
}
/* ---- Mirroring handle ala Figma ----
   mode: 'corner' = No mirroring | 'smooth' = Mirror angle | 'symmetric' = Mirror angle and length.
   hkeys (Set 'nodeId:in'/'nodeId:out', opsional): bila tepat satu handle node dipilih, handle itu jadi acuan dan yang seberang menyesuaikan.
   Bentuk TIDAK berubah pada No mirroring, maupun pada node yang belum punya dua handle (hanya mode yang disimpan). */
/* ---- Mirroring handle ala Figma ----
   mode: 'corner' = No mirroring | 'smooth' = Mirror angle | 'symmetric' = Mirror angle and length.
   hkeys (Set 'nodeId:in'/'nodeId:out', opsional): bila tepat satu handle node dipilih, handle itu jadi acuan dan yang seberang menyesuaikan.
   Bentuk TIDAK berubah pada No mirroring, maupun pada node yang belum punya dua handle (hanya mode yang disimpan). */
function mirrorNodes(o, ids, mode, hkeys) {
  let any = false;
  const subs = o.subs.map(sp => {
    if (!sp.nodes.some(n => ids.has(n.id))) return sp;
    let ch = false;
    const ns = sp.nodes,
      len = ns.length;
    const nodes = ns.map((n, idx) => {
      if (!ids.has(n.id)) return n;
      const nd = cl(n),
        was = n.type === 'smooth' || n.type === 'symmetric' || n.type === 'freeCurve' ? n.type : 'corner';
      let moved = false;
      const targetType = mode === 'freeCurve' ? 'corner' : mode;
      nd.type = targetType;
      nd.freeCurve = mode === 'freeCurve' || mode === 'corner';

      /* Pastikan jika node dipilih ke mode No Mirroring / Free Curve dan belum punya handle,
         buatkan handle otomatis di 1/3 segmen agar langsung bisa ditarik melengkung */
      const pv = sp.closed || idx > 0 ? ns[(idx - 1 + len) % len] : null;
      const nx = sp.closed || idx < len - 1 ? ns[(idx + 1) % len] : null;
      if ((mode === 'corner' || mode === 'freeCurve') && (!nd.handleIn || !nd.handleOut)) {
        if (pv && !nd.handleIn) {
          nd.handleIn = lerp(nd, pv, 1 / 3);
          moved = true;
        }
        if (nx && !nd.handleOut) {
          nd.handleOut = lerp(nd, nx, 1 / 3);
          moved = true;
        }
      }
      if (targetType !== 'corner' && nd.handleIn && nd.handleOut) {
        const li = dist(nd, nd.handleIn),
          lo = dist(nd, nd.handleOut);
        if (li > 1e-9 && lo > 1e-9) {
          const kIn = !!(hkeys && hkeys.has(n.id + ':in')),
            kOut = !!(hkeys && hkeys.has(n.id + ':out'));
          const anchor = kIn && !kOut ? 'in' : kOut && !kIn ? 'out' : null;
          let dir = anchor === 'in' ? nrm(sub(nd, nd.handleIn)) : anchor === 'out' ? nrm(sub(nd.handleOut, nd)) : nrm(add(nrm(sub(nd, nd.handleIn)), nrm(sub(nd.handleOut, nd))));
          if (Math.hypot(dir.x, dir.y) < 1e-9) dir = nrm(sub(nd.handleOut, nd));
          let Li = li,
            Lo = lo;
          if (targetType === 'symmetric') {
            const L = anchor === 'in' ? li : anchor === 'out' ? lo : (li + lo) / 2;
            Li = Lo = L;
          }
          const nIn = {
              x: nd.x - dir.x * Li,
              y: nd.y - dir.y * Li
            },
            nOut = {
              x: nd.x + dir.x * Lo,
              y: nd.y + dir.y * Lo
            };
          if (dist(nIn, nd.handleIn) > 1e-6 || dist(nOut, nd.handleOut) > 1e-6) {
            nd.handleIn = nIn;
            nd.handleOut = nOut;
            nd.fil = null;
            moved = true;
          }
        }
      }
      if (!moved && was === mode && !!n.freeCurve === !!nd.freeCurve) return n;
      ch = true;
      return nd;
    });
    if (!ch) return sp;
    any = true;
    return {
      ...sp,
      nodes
    };
  });
  return any ? {
    ...o,
    subs
  } : o;
}
function typeNodes(o, ids, type) {
  return {
    ...o,
    subs: o.subs.map(sp => {
      if (!sp.nodes.some(n => ids.has(n.id))) return sp;
      const n = sp.nodes.length,
        nodes = sp.nodes.map(cl);
      nodes.forEach((nd, i) => {
        if (!ids.has(nd.id)) return;
        nd.type = type;
        if (type === 'corner') return;
        const pv = sp.closed || i > 0 ? nodes[(i - 1 + n) % n] : null,
          nx = sp.closed || i < n - 1 ? nodes[(i + 1) % n] : null;
        let li, lo, dir;
        if (nd.handleIn && nd.handleOut) {
          li = dist(nd, nd.handleIn);
          lo = dist(nd, nd.handleOut);
          dir = nrm(add(nrm(sub(nd, nd.handleIn)), nrm(sub(nd.handleOut, nd))));
        } else {
          dir = nrm(sub(nx || nd, pv || nd));
          li = pv ? dist(pv, nd) / 3 : 0;
          lo = nx ? dist(nx, nd) / 3 : 0;
          if (nd.handleIn) li = dist(nd, nd.handleIn);
          if (nd.handleOut) lo = dist(nd, nd.handleOut);
        }
        if (type === 'symmetric') {
          const L = li && lo ? (li + lo) / 2 : li || lo;
          li = lo = L;
        }
        nd.handleIn = pv && li ? {
          x: nd.x - dir.x * li,
          y: nd.y - dir.y * li
        } : nd.handleIn;
        nd.handleOut = nx && lo ? {
          x: nd.x + dir.x * lo,
          y: nd.y + dir.y * lo
        } : nd.handleOut;
      });
      return {
        ...sp,
        nodes
      };
    })
  };
}
/* ---- splitSeg: Subdivisi De Casteljau & Kolinier (Node baru SELALU punya handle Bézier tanpa mengubah bentuk) ---- */

export { sharpenCorners, smoothSelectedNodes, autoHandles, deleteNodes, mirrorNodes, typeNodes };
