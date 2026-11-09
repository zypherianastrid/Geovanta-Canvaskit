/**
 * @file src/engine/straightenAndAlignNodes.jsx
 * @description Operasi pelurusan segmen kurva (Straighten) & penjajaran node/handle ke garis regresi
 */
import { cl, dist, sub, cross, nrm, dot } from './vectorPrimitives.jsx';

/* ---- operasi geometri (semua immutable) ---- */
const mapSubs = (o, f) => {
  const subs = o.subs.map(f).filter(Boolean);
  return subs.length ? {
    ...o,
    subs
  } : null;
};
function straightenSub(sp, tol, angDeg) {
  const src = sp.nodes.map(cl),
    n = src.length,
    ang = angDeg * Math.PI / 180;
  if (n < 3) return sp;
  const strait = (a, b) => {
    const L = dist(a, b) || 1e-9,
      ab = sub(b, a),
      dd = p => Math.abs(cross(ab, sub(p, a))) / L;
    return (!a.handleOut || dd(a.handleOut) <= tol) && (!b.handleIn || dd(b.handleIn) <= tol);
  };
  const turn = i => {
    const u = nrm(sub(src[i], src[(i - 1 + n) % n])),
      v = nrm(sub(src[(i + 1) % n], src[i]));
    return Math.abs(Math.atan2(cross(u, v), dot(u, v)));
  };
  let arr = src;
  if (sp.closed) {
    let st = -1;
    for (let i = 0; i < n; i++) if (turn(i) > ang || !strait(src[(i - 1 + n) % n], src[i]) || !strait(src[i], src[(i + 1) % n])) {
      st = i;
      break;
    }
    if (st < 0) return sp;
    arr = src.slice(st).concat(src.slice(0, st), [src[st]]);
  }
  const last = arr.length - 1;
  /* TLS (total least squares): garis terbaik lewat semua titik via eigen-vektor kovarians */
  const tlsFit = (i, k) => {
    let mx = 0,
      my = 0,
      m = k - i + 1;
    for (let t = i; t <= k; t++) {
      mx += arr[t].x;
      my += arr[t].y;
    }
    mx /= m;
    my /= m;
    let sxx = 0,
      syy = 0,
      sxy = 0;
    for (let t = i; t <= k; t++) {
      const dx = arr[t].x - mx,
        dy = arr[t].y - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy),
      d = {
        x: Math.cos(th),
        y: Math.sin(th)
      };
    let mxd = 0,
      ss = 0;
    for (let t = i; t <= k; t++) {
      const e = Math.abs(d.x * (arr[t].y - my) - d.y * (arr[t].x - mx));
      if (e > mxd) mxd = e;
      ss += e * e;
    }
    return {
      d,
      max: mxd,
      rms: Math.sqrt(ss / m)
    };
  };
  const can = (i, k) => {
    const a = arr[i],
      L = dist(a, arr[k]);
    if (L < 1e-9) return false;
    const ch = sub(arr[k], a),
      cd = nrm(ch);
    if (k - i >= 2) {
      const f = tlsFit(i, k);
      if (f.max > tol || f.rms > tol * 0.6) return false; /* validasi deviasi maks & RMS terhadap garis TLS */
      const dd = Math.abs(f.d.x * cd.x + f.d.y * cd.y);
      if (Math.acos(Math.min(1, dd)) > ang + 0.0175) return false; /* arah fit ≈ arah chord */
    }

    for (let t = i; t < k; t++) {
      if (!strait(arr[t], arr[t + 1])) return false;
      if (dist(arr[t], arr[t + 1]) > 1e-9 && Math.acos(Math.max(-1, Math.min(1, dot(nrm(sub(arr[t + 1], arr[t])), cd)))) > ang + 1e-6) return false;
      if (t > i && Math.abs(cross(ch, sub(arr[t], a))) / L > tol) return false;
    }
    return true;
  };
  const out = [arr[0]];
  let i = 0;
  /* sisi lain node ujung: tetap valid → sejajarkan bila hampir segaris, kalau tidak jadikan corner */
  const fixEnd = (nd, u, start) => {
    const h = start ? nd.handleIn : nd.handleOut;
    if (!h) return;
    if (nd.type === 'corner') return;
    const len = dist(nd, h);
    if (len < 1e-9) return;
    const hd = start ? nrm(sub(nd, h)) : nrm(sub(h, nd));
    if (Math.acos(Math.max(-1, Math.min(1, dot(hd, u)))) <= Math.max(ang, 0.0175)) {
      const q = {
        x: nd.x + (start ? -u.x : u.x) * len,
        y: nd.y + (start ? -u.y : u.y) * len
      };
      if (start) nd.handleIn = q;else nd.handleOut = q;
    } else nd.type = 'corner';
  };
  while (i < last) {
    let j = i + 1;
    while (j < last && can(i, j + 1)) j++;
    if (j > i + 1 || strait(arr[i], arr[j])) {
      const u = nrm(sub(arr[j], arr[i]));
      if (j > i + 1) {
        arr[i].handleOut = null;
        arr[j].handleIn = null;
        fixEnd(arr[i], u, true);
        fixEnd(arr[j], u, false);
      }
    }
    out.push(arr[j]);
    i = j;
  }
  if (sp.closed) out.pop();
  out.forEach(nd => {
    if (!nd.handleIn && !nd.handleOut) nd.type = 'corner';
  });
  return out.length >= 2 ? {
    ...sp,
    nodes: out
  } : sp;
}
const straighten = (o, tol, ang) => ({
  ...o,
  subs: o.subs.map(sp => straightenSub(sp, tol || 1, ang || 0))
});

/* ---- Luruskan SELEKSI: node / handle terpilih dijajarkan ke satu garis lurus ----
   Garis target = TLS (total least squares) dari titik terpilih; bila hampir horizontal/vertikal (≤ snapDeg) → di-snap ke sumbu.
   Titik diproyeksikan ke garis itu (node membawa handle-nya), segmen di antara node terpilih yang bersebelahan dijadikan garis lurus. */
/* ---- Luruskan SELEKSI: node / handle terpilih dijajarkan ke satu garis lurus ----
   Garis target = TLS (total least squares) dari titik terpilih; bila hampir horizontal/vertikal (≤ snapDeg) → di-snap ke sumbu.
   Titik diproyeksikan ke garis itu (node membawa handle-nya), segmen di antara node terpilih yang bersebelahan dijadikan garis lurus. */
const lineFit = (pts, snapDeg) => {
  const m = pts.length;
  let mx = 0,
    my = 0;
  pts.forEach(p => {
    mx += p.x;
    my += p.y;
  });
  mx /= m;
  my /= m;
  let d;
  if (m === 2) d = nrm(sub(pts[1], pts[0]));else {
    let sxx = 0,
      syy = 0,
      sxy = 0;
    pts.forEach(p => {
      const dx = p.x - mx,
        dy = p.y - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    });
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    d = {
      x: Math.cos(th),
      y: Math.sin(th)
    };
  }
  let snapped = false;
  const sd = Math.sin((snapDeg == null ? 15 : snapDeg) * Math.PI / 180);
  if (Math.abs(d.y) <= sd) {
    d = {
      x: 1,
      y: 0
    };
    snapped = true;
  } else if (Math.abs(d.x) <= sd) {
    d = {
      x: 0,
      y: 1
    };
    snapped = true;
  }
  return {
    c: {
      x: mx,
      y: my
    },
    d,
    snapped
  };
};
const projLine = (p, c, d) => {
  const t = (p.x - c.x) * d.x + (p.y - c.y) * d.y;
  return {
    x: c.x + d.x * t,
    y: c.y + d.y * t
  };
};
function alignNodes(o, ids, opt) {
  opt = opt || {};
  let moved = false;
  const subs = o.subs.map(sp => {
    const n = sp.nodes.length,
      idx = [];
    sp.nodes.forEach((nd, i) => {
      if (ids.has(nd.id)) idx.push(i);
    });
    if (idx.length < 2) return sp;
    const nodes = sp.nodes.map(cl),
      pts = idx.map(i => nodes[i]),
      ln = lineFit(pts, opt.snapDeg);
    if (Math.abs(ln.d.x) + Math.abs(ln.d.y) < 1e-9) return sp;
    const half = Math.max(...pts.map(p => Math.abs((p.x - ln.c.x) * ln.d.x + (p.y - ln.c.y) * ln.d.y))),
      span = half * 2 || 1;
    const pr = pts.map(p => projLine(p, ln.c, ln.d)),
      mv = Math.max(...pts.map((p, k) => dist(p, pr[k])));
    if (opt.soft && mv > 0.2 * span) return sp; /* mode lembut (tombol Corner): hanya koreksi kecil, bentuk lengkung besar tidak disentuh */
    let touched = false;
    pts.forEach((p, k) => {
      const dx = pr[k].x - p.x,
        dy = pr[k].y - p.y;
      if (Math.abs(dx) + Math.abs(dy) < 1e-7) return;
      p.x += dx;
      p.y += dy;
      if (p.handleIn) {
        p.handleIn.x += dx;
        p.handleIn.y += dy;
      }
      if (p.handleOut) {
        p.handleOut.x += dx;
        p.handleOut.y += dy;
      }
      p.fil = null;
      touched = true;
    });
    const S = new Set(idx);
    for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      if (i === j || !S.has(i) || !S.has(j)) continue;
      const a = nodes[i],
        b = nodes[j];
      if (!a.handleOut && !b.handleIn) continue;
      if (opt.soft) {
        const L = dist(a, b) || 1e-9,
          dd = h => Math.abs(cross(sub(b, a), sub(h, a))) / L;
        if (a.handleOut && dd(a.handleOut) > 0.25 * L || b.handleIn && dd(b.handleIn) > 0.25 * L) continue;
      }
      a.handleOut = null;
      b.handleIn = null;
      a.fil = null;
      b.fil = null;
      touched = true;
    }
    if (!touched) return sp;
    pts.forEach(p => {
      if (!p.handleIn && !p.handleOut) p.type = 'corner';else if (!(p.handleIn && p.handleOut) && p.type !== 'corner') p.type = 'corner';
    });
    moved = true;
    return {
      ...sp,
      nodes
    };
  });
  return moved ? {
    ...o,
    subs
  } : o;
}
/* keys = Set 'nodeId:in' / 'nodeId:out'.  (1) dua handle satu segmen → jatuh tepat di garis node–node (segmen lurus, handle tetap ada);
   (2) dua handle satu node → segaris lewat node; (3) sisanya ≥2 → satu garis bersama (snap sumbu); (4) satu handle → snap sumbu, atau arah ke node tetangga */
/* keys = Set 'nodeId:in' / 'nodeId:out'.  (1) dua handle satu segmen → jatuh tepat di garis node–node (segmen lurus, handle tetap ada);
   (2) dua handle satu node → segaris lewat node; (3) sisanya ≥2 → satu garis bersama (snap sumbu); (4) satu handle → snap sumbu, atau arah ke node tetangga */
function alignHandles(o, keys, opt) {
  opt = opt || {};
  let moved = false;
  const subs = o.subs.map(sp => {
    const n = sp.nodes.length;
    if (!sp.nodes.some(nd => keys.has(nd.id + ':in') || keys.has(nd.id + ':out'))) return sp;
    const nodes = sp.nodes.map(cl),
      K = w => w === 'in' ? 'handleIn' : 'handleOut',
      done = new Set(),
      before = JSON.stringify(nodes);
    const has = (i, w) => keys.has(nodes[i].id + ':' + w) && nodes[i][K(w)] && !done.has(i + w);
    const setH = (i, w, q) => {
      const nd = nodes[i];
      nd[K(w)] = {
        x: q.x,
        y: q.y
      };
      nd.fil = null;
      if ((nd.type === 'smooth' || nd.type === 'symmetric') && nd.handleIn && nd.handleOut) nd.type = 'corner';
      done.add(i + w);
    };
    for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      if (i === j || !has(i, 'out') || !has(j, 'in')) continue;
      const a = nodes[i],
        b = nodes[j];
      if (dist(a, b) < 1e-9) continue;
      const d = nrm(sub(b, a));
      setH(i, 'out', projLine(a.handleOut, a, d));
      setH(j, 'in', projLine(b.handleIn, a, d));
    }
    for (let i = 0; i < n; i++) if (has(i, 'in') && has(i, 'out')) {
      const a = nodes[i],
        ln = lineFit([a.handleIn, a, a.handleOut], opt.snapDeg);
      if (Math.abs(ln.d.x) + Math.abs(ln.d.y) < 1e-9) continue;
      setH(i, 'in', projLine(a.handleIn, a, ln.d));
      setH(i, 'out', projLine(a.handleOut, a, ln.d));
    }
    const rem = [];
    for (let i = 0; i < n; i++) for (const w of ['in', 'out']) if (has(i, w)) rem.push({
      i,
      w,
      p: nodes[i][K(w)]
    });
    if (rem.length >= 2) {
      const ln = lineFit(rem.map(r => r.p), opt.snapDeg);
      if (Math.abs(ln.d.x) + Math.abs(ln.d.y) > 1e-9) rem.forEach(r => setH(r.i, r.w, projLine(r.p, ln.c, ln.d)));
    } else if (rem.length === 1) {
      const r = rem[0],
        a = nodes[r.i],
        h = r.p,
        len = dist(h, a);
      if (len > 1e-9) {
        const nb = r.w === 'out' ? r.i < n - 1 || sp.closed ? nodes[(r.i + 1) % n] : null : r.i > 0 || sp.closed ? nodes[(r.i - 1 + n) % n] : null;
        let d = nrm(sub(h, a));
        const sd = Math.sin((opt.snapDeg == null ? 15 : opt.snapDeg) * Math.PI / 180);
        if (Math.abs(d.y) <= sd) d = {
          x: d.x < 0 ? -1 : 1,
          y: 0
        };else if (Math.abs(d.x) <= sd) d = {
          x: 0,
          y: d.y < 0 ? -1 : 1
        };else if (nb && dist(nb, a) > 1e-9) d = nrm(sub(nb, a));
        setH(r.i, r.w, {
          x: a.x + d.x * len,
          y: a.y + d.y * len
        });
      }
    }
    if (JSON.stringify(nodes) === before) return sp;
    moved = true;
    return {
      ...sp,
      nodes
    };
  });
  return moved ? {
    ...o,
    subs
  } : o;
}

/* geometri fillet: pv → c (sudut) → nx. mode 'circular' = busur lingkaran presisi; 'bezier' = handle lebih panjang/halus (squircle) */

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
function alignNodesAtAngle(o, ids, opt) {
  opt = opt || {};
  const mode = opt.angleMode || 'auto';
  const anchorMode = opt.anchor || 'center';
  const slide = opt.slideEdges !== false;
  const collapse = !!opt.collapse;
  let moved = false;
  const subs = o.subs.map(sp => {
    const n = sp.nodes.length,
      idx = [];
    sp.nodes.forEach((nd, i) => {
      if (ids.has(nd.id)) idx.push(i);
    });
    if (idx.length < 2) return sp;
    const nodes = sp.nodes.map(cl),
      S = new Set(idx);

    /* Deteksi apakah node terpilih membentuk satu rantai berurutan pada subpath (termasuk wrap-around) */
    let isChain = false,
      iStart = idx[0],
      iEnd = idx[idx.length - 1],
      chainIdx = idx.slice();
    if (idx.length < n) {
      const starts = idx.filter(i => !S.has((i - 1 + n) % n));
      if (starts.length === 1 && (sp.closed || !S.has(0) || !S.has(n - 1) || starts[0] === 0)) {
        isChain = true;
        iStart = starts[0];
        chainIdx = [iStart];
        let cur = iStart;
        while (S.has((cur + 1) % n)) {
          cur = (cur + 1) % n;
          chainIdx.push(cur);
        }
        iEnd = cur;
      }
    } else if (idx.length === 2) {
      isChain = true;
    }
    const pts = chainIdx.map(i => nodes[i]);
    const pFirst = pts[0],
      pLast = pts[pts.length - 1];

    /* Ambil arah rel sisi tetangga luar (sebelum iStart dan sesudah iEnd) */
    const iPrev = (iStart - 1 + n) % n,
      iNext = (iEnd + 1) % n;
    const hasPrev = (sp.closed || iStart > 0) && !S.has(iPrev) && dist(nodes[iPrev], nodes[iStart]) > 1e-6;
    const hasNext = (sp.closed || iEnd < n - 1) && !S.has(iNext) && dist(nodes[iEnd], nodes[iNext]) > 1e-6;
    const rPrev = hasPrev ? nrm(sub(nodes[iStart], nodes[iPrev])) : null;
    const rNext = hasNext ? nrm(sub(nodes[iEnd], nodes[iNext])) : null;

    /* 1. Tentukan vektor arah garis target d = (dx, dy) */
    let d = null;
    if (mode === 'custom' && opt.angleDeg != null && !isNaN(opt.angleDeg)) {
      /* Konvensi visual standar: 0° = Horizontal Kanan, 90° = Vertikal Atas/Bawah */
      const rad = -opt.angleDeg * Math.PI / 180;
      d = {
        x: Math.cos(rad),
        y: Math.sin(rad)
      };
    } else if (mode === 'perp') {
      /* Siku-siku (90°) terhadap rata-rata arah batang/sisi tetangga */
      const dirs = [];
      if (rPrev) dirs.push(rPrev);
      if (rNext) {
        let rn = rNext;
        if (rPrev && dot(rPrev, rn) < 0) rn = {
          x: -rn.x,
          y: -rn.y
        };
        dirs.push(rn);
      }
      if (dirs.length) {
        let sx = 0,
          sy = 0;
        dirs.forEach(v => {
          sx += v.x;
          sy += v.y;
        });
        const avg = nrm({
          x: sx,
          y: sy
        });
        d = {
          x: -avg.y,
          y: avg.x
        };
      }
    } else if (mode === 'parallel') {
      /* Sejajar dengan segmen seberang (jika subpath memiliki >= 4 node) */
      if (n >= 4 && hasPrev && hasNext && iPrev !== iNext) {
        const opp = sub(nodes[iNext], nodes[iPrev]);
        if (Math.hypot(opp.x, opp.y) > 1e-6) d = nrm(opp);
      }
    }
    if (!d) {
      const ln = lineFit(pts, opt.snapDeg);
      d = ln.d;
    }
    /* Pastikan orientasi d searah dengan bentang dari pFirst ke pLast */
    const chord = sub(pLast, pFirst);
    if (dot(d, chord) < 0) d = {
      x: -d.x,
      y: -d.y
    };

    /* 2. Tentukan titik patokan (Anchor c) */
    let c = {
      x: 0,
      y: 0
    };
    if (anchorMode === 'first') c = {
      x: pFirst.x,
      y: pFirst.y
    };else if (anchorMode === 'last') c = {
      x: pLast.x,
      y: pLast.y
    };else {
      pts.forEach(p => {
        c.x += p.x;
        c.y += p.y;
      });
      c.x /= pts.length;
      c.y /= pts.length;
    }

    /* Helper: perpotongan garis target (c, d) dengan rel sisi tetangga (pt, rRail), fallback ke proyeksi ortogonal */
    const span = Math.max(dist(pFirst, pLast), 10);
    const slideOrProj = (pt, rRail, straightNeighbor) => {
      const pProj = projLine(pt, c, d);
      if (!slide || !rRail || !straightNeighbor) return pProj;
      const det = cross(d, rRail);
      if (Math.abs(det) > 0.14) {
        /* Sudut potong antara garis target & rel sisi > ~8° */
        const t = cross(sub(pt, c), rRail) / det;
        const pInt = {
          x: c.x + d.x * t,
          y: c.y + d.y * t
        };
        if (dist(pInt, pProj) <= span * 0.85) return pInt;
      }
      return pProj;
    };
    const straightPrev = hasPrev && !nodes[iPrev].handleOut && !nodes[iStart].handleIn;
    const straightNext = hasNext && !nodes[iEnd].handleOut && !nodes[iNext].handleIn;

    /* 3. Hitung posisi baru untuk node ujung & node perantara */
    const newFirst = isChain ? slideOrProj(pFirst, rPrev, straightPrev) : projLine(pFirst, c, d);
    const newLast = isChain ? slideOrProj(pLast, rNext, straightNext) : projLine(pLast, c, d);

    /* Jika rantai >= 3 node dan opsi collapse aktif: lebur node tengah menjadi segmen L tunggal */
    if (isChain && collapse && chainIdx.length > 2 && n - (chainIdx.length - 2) >= (sp.closed ? 3 : 2)) {
      const A = nodes[iStart],
        B = nodes[iEnd];
      if (A.handleIn) {
        A.handleIn.x += newFirst.x - A.x;
        A.handleIn.y += newFirst.y - A.y;
      }
      if (B.handleOut) {
        B.handleOut.x += newLast.x - B.x;
        B.handleOut.y += newLast.y - B.y;
      }
      A.x = newFirst.x;
      A.y = newFirst.y;
      A.handleOut = null;
      A.type = 'corner';
      A.fil = null;
      B.x = newLast.x;
      B.y = newLast.y;
      B.handleIn = null;
      B.type = 'corner';
      B.fil = null;
      const dropIds = new Set(chainIdx.slice(1, -1).map(i => nodes[i].id));
      moved = true;
      return {
        ...sp,
        nodes: nodes.filter(nd => !dropIds.has(nd.id))
      };
    }

    /* Geser semua node terpilih ke garis target */
    let touched = false;
    chainIdx.forEach((ni, k) => {
      const p = nodes[ni];
      const target = isChain && k === 0 ? newFirst : isChain && k === chainIdx.length - 1 ? newLast : projLine(p, c, d);
      const dx = target.x - p.x,
        dy = target.y - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 1e-7) {
        p.x = target.x;
        p.y = target.y;
        if (p.handleIn) {
          p.handleIn.x += dx;
          p.handleIn.y += dy;
        }
        if (p.handleOut) {
          p.handleOut.x += dx;
          p.handleOut.y += dy;
        }
        p.fil = null;
        touched = true;
      }
    });

    /* Luruskan segmen di antara node-node terpilih yang bersebelahan */
    for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      if (i === j || !S.has(i) || !S.has(j)) continue;
      const a = nodes[i],
        b = nodes[j];
      if (a.handleOut || b.handleIn) {
        a.handleOut = null;
        b.handleIn = null;
        a.fil = null;
        b.fil = null;
        touched = true;
      }
    }
    if (!touched) return sp;
    chainIdx.forEach(ni => {
      const p = nodes[ni];
      if (!p.handleIn && !p.handleOut) p.type = 'corner';else if (!(p.handleIn && p.handleOut)) p.type = 'corner';
    });
    moved = true;
    return {
      ...sp,
      nodes
    };
  });
  return moved ? {
    ...o,
    subs
  } : o;
}

/* Hitung sudut derajat saat ini antara node pertama & terakhir yang dipilih (garis tak berarah: -90° s/d 90°, 0° = horizontal, 90° = vertikal) */
/* Hitung sudut derajat saat ini antara node pertama & terakhir yang dipilih (garis tak berarah: -90° s/d 90°, 0° = horizontal, 90° = vertikal) */
function measureSelectedNodesAngle(o, ids) {
  for (const sp of o.subs) {
    const pts = sp.nodes.filter(n => ids.has(n.id));
    if (pts.length >= 2) {
      const a = pts[0],
        b = pts[pts.length - 1];
      /* ukur selalu dari titik kiri ke kanan (atau bawah ke atas jika vertikal) agar arah winding path tidak memengaruhi bacaan */
      const flip = b.x < a.x - 1e-6 || Math.abs(b.x - a.x) <= 1e-6 && b.y > a.y;
      const dx = flip ? a.x - b.x : b.x - a.x,
        dy = flip ? a.y - b.y : b.y - a.y;
      const deg = -Math.atan2(dy, dx) * 180 / Math.PI;
      return Math.round(deg * 10) / 10;
    }
  }
  return 0;
}
/* =========================================================================
   ALGORITMA 2: UBAH RADIUS NODE TERPILIH (LIVE + MENDUKUNG KURVA IMPOR & CHAMFER)
   opt: {
     mode: 'circular' | 'bezier' | 'chamfer',
     smooth: 0.8,
     bevelDeg: null // Opsional: kunci sudut bukaan/potongan pada derajat tertentu (mis. 45°, 60°, 90°)
   }
   Mengembalikan { o, newSelIds, cnt } agar seleksi tetap menempel pada node sudut tersebut!
   ========================================================================= */

export { mapSubs, straightenSub, straighten, lineFit, projLine, alignNodes, alignHandles, alignNodesAtAngle, measureSelectedNodesAngle };
