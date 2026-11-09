/**
 * @file src/engine/autoRefineGeometry.jsx
 * @description Analisis zona sudut multi-skala & penghapusan node non-sudut otomatis (Auto-Refine)
 */
import { sub, cross, dot, dist, rd, cl, nrm } from './vectorPrimitives.jsx';
import { kasaFit, hasH, segStraight, findFacetedCurves, refitChain, schneiderFit, findWobblySpans } from './curveFittingAndAnomalies.jsx';
import { segPoint } from './bezierSubdivisionAndMove.jsx';
import { cssToHex } from '../utils/colorParserAndFormatter.jsx';
import { alignNodesAtAngle, measureSelectedNodesAngle } from './straightenAndAlignNodes.jsx';
import { setSelectedNodesRadius } from './cornerFilletEngine.jsx';

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
function turningAngle3Pt(pPrev, pCurr, pNext) {
  const u = sub(pCurr, pPrev),
    v = sub(pNext, pCurr);
  const lu = Math.hypot(u.x, u.y),
    lv = Math.hypot(v.x, v.y);
  if (lu < 1e-6 || lv < 1e-6) return {
    rad: 0,
    deg: 0,
    signedDeg: 0
  };
  const rad = Math.atan2(cross(u, v), dot(u, v));
  const signedDeg = rad * 180 / Math.PI;
  return {
    rad,
    deg: Math.abs(signedDeg),
    signedDeg
  };
}

/* Helper: Regresi Linear Lokal (Orthogonal / Total Least Squares) pada himpunan titik */
/* Helper: Regresi Linear Lokal (Orthogonal / Total Least Squares) pada himpunan titik */
function fitLocalLineOLS(pts) {
  const m = pts.length;
  if (m < 2) return null;
  let mx = 0,
    my = 0;
  for (let i = 0; i < m; i++) {
    mx += pts[i].x;
    my += pts[i].y;
  }
  mx /= m;
  my /= m;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (let i = 0; i < m; i++) {
    const dx = pts[i].x - mx,
      dy = pts[i].y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dir = {
    x: Math.cos(th),
    y: Math.sin(th)
  };
  /* Arahkan vektor mengikuti urutan titik dari awal ke akhir */
  const chord = sub(pts[m - 1], pts[0]);
  if (dot(dir, chord) < 0) dir = {
    x: -dir.x,
    y: -dir.y
  };
  let maxDev = 0,
    ss = 0;
  for (let i = 0; i < m; i++) {
    const dev = Math.abs((pts[i].x - mx) * dir.y - (pts[i].y - my) * dir.x);
    if (dev > maxDev) maxDev = dev;
    ss += dev * dev;
  }
  const rms = Math.sqrt(ss / m);
  const span = dist(pts[0], pts[m - 1]);
  return {
    c: {
      x: mx,
      y: my
    },
    dir,
    rms,
    maxDev,
    span
  };
}

/* Deteksi Multi-Node apakah suatu rentang pendek [iStart..iEnd] merupakan:
   - 'sharp'   : dua lengan lurus bertemu dengan perubahan arah mendadak pada area sempit
                 (walaupun di puncaknya terpecah menjadi 2-5 node kecil akibat noise tracing).
   - 'rounded' : perubahan arah berlangsung bertahap mengikuti busur (Kåsa circle fit / kurva halus).
   - 'none'    : bukan belokan signifikan. */
/* Deteksi Multi-Node apakah suatu rentang pendek [iStart..iEnd] merupakan:
   - 'sharp'   : dua lengan lurus bertemu dengan perubahan arah mendadak pada area sempit
                 (walaupun di puncaknya terpecah menjadi 2-5 node kecil akibat noise tracing).
   - 'rounded' : perubahan arah berlangsung bertahap mengikuti busur (Kåsa circle fit / kurva halus).
   - 'none'    : bukan belokan signifikan. */
function analyzeMultiScaleCornerZone(ns, closed, idxCenter, armLookahead = 5, mode = 'logo') {
  const n = ns.length;
  if (n < 4) return {
    kind: 'none'
  };
  const idx = k => closed ? (k % n + n) % n : Math.max(0, Math.min(n - 1, k));

  /* 1. Kumpulkan cluster mikro di sekitar idxCenter (node-node berjarak sangat rapat <= 3.8 px) */
  const clusterEps = mode === 'logo' ? 4.2 : 3.2;
  let iL = idxCenter,
    iR = idxCenter,
    clusterSpan = 0;
  const clusterIndices = [idxCenter];
  for (let step = 1; step <= 3; step++) {
    const prevIdx = idx(iL - 1);
    if (!closed && prevIdx === iL) break;
    const d = dist(ns[prevIdx], ns[iL]);
    if (d <= clusterEps && clusterSpan + d <= clusterEps * 1.85) {
      iL = prevIdx;
      clusterSpan += d;
      clusterIndices.unshift(iL);
    } else break;
  }
  for (let step = 1; step <= 3; step++) {
    const nextIdx = idx(iR + 1);
    if (!closed && nextIdx === iR) break;
    const d = dist(ns[iR], ns[nextIdx]);
    if (d <= clusterEps && clusterSpan + d <= clusterEps * 1.85) {
      iR = nextIdx;
      clusterSpan += d;
      clusterIndices.push(iR);
    } else break;
  }

  /* 2. Kumpulkan sampel titik pada lengan kiri (sebelum iL) dan lengan kanan (sesudah iR)
        untuk Regresi Linear Lokal */
  const leftPts = [],
    rightPts = [];
  let accL = 0,
    accR = 0;
  for (let k = 0; k <= armLookahead; k++) {
    const pIdx = idx(iL - k);
    if (!closed && iL - k < 0) break;
    if (k > 0) accL += dist(ns[idx(iL - k + 1)], ns[pIdx]);
    leftPts.unshift({
      x: ns[pIdx].x,
      y: ns[pIdx].y,
      idx: pIdx
    });
    if (accL >= 28 && leftPts.length >= 3) break;
  }
  for (let k = 0; k <= armLookahead; k++) {
    const nIdx = idx(iR + k);
    if (!closed && iR + k >= n) break;
    if (k > 0) accR += dist(ns[idx(iR + k - 1)], ns[nIdx]);
    rightPts.push({
      x: ns[nIdx].x,
      y: ns[nIdx].y,
      idx: nIdx
    });
    if (accR >= 28 && rightPts.length >= 3) break;
  }
  if (leftPts.length < 2 || rightPts.length < 2) return {
    kind: 'none'
  };
  const fitL = fitLocalLineOLS(leftPts);
  const fitR = fitLocalLineOLS(rightPts);
  if (!fitL || !fitR || fitL.span < 2.0 || fitR.span < 2.0) return {
    kind: 'none'
  };

  /* 3. Hitung perubahan arah antara kedua garis regresi lokal */
  const turnRad = Math.atan2(cross(fitL.dir, fitR.dir), dot(fitL.dir, fitR.dir));
  const turnDeg = Math.abs(turnRad) * 180 / Math.PI;

  /* Kalibrasi ambang sudut berdasarkan mode gambar */
  const minCornerDeg = mode === 'logo' ? 16 : mode === 'illustration' ? 20 : 25;
  if (turnDeg < minCornerDeg) return {
    kind: 'none',
    turnDeg
  };

  /* 4. Periksa apakah kedua lengan benar-benar lurus (kelengkungan lengan rendah) */
  const armsStraight = fitL.rms <= Math.max(0.55, fitL.span * 0.035) && fitR.rms <= Math.max(0.55, fitR.span * 0.035);

  /* 5. Hitung titik potong (Apex) dari kedua garis regresi */
  const det = cross(fitL.dir, fitR.dir);
  let apex = null;
  if (Math.abs(det) > 0.08) {
    const w = sub(fitR.c, fitL.c);
    const t = cross(w, fitR.dir) / det;
    apex = {
      x: fitL.c.x + fitL.dir.x * t,
      y: fitL.c.y + fitL.dir.y * t
    };
  }

  /* 6. Bedakan SHARP CORNER vs ROUNDED CORNER:
        - Jika transisi terjadi di area sempit (clusterSpan kecil dibanding panjang lengan)
          DAN titik-titik di dalam zona transisi sangat dekat dengan puncak perpotongan (apex),
          maka ini adalah SHARP CORNER (meskipun terpecah menjadi beberapa node).
        - Jika terdapat >= 3 titik transisi dengan pembelokan bertahap searah (monoton)
          dan jarak puncak apex ke kurva cukup besar (d_apex >= 1.25 px) serta cocok dengan busur Kåsa,
          maka ini adalah ROUNDED CORNER. */
  const minArmLen = Math.min(fitL.span, fitR.span);
  const centerPt = ns[idxCenter];
  const distToApex = apex ? dist(centerPt, apex) : 999;

  /* Cek apakah titik sekitar membentuk busur membulat bertahap */
  const zonePts = [];
  for (let k = -2; k <= 2; k++) {
    const zi = idx(idxCenter + k);
    if (!closed && (idxCenter + k < 0 || idxCenter + k >= n)) continue;
    zonePts.push(ns[zi]);
  }
  const circleFit = zonePts.length >= 4 ? kasaFit(zonePts) : null;
  const hasCurvedHandles = clusterIndices.some(ci => hasH(ns[ci], ns[ci].handleIn) || hasH(ns[ci], ns[ci].handleOut));

  /* Kriteria Sharp Corner:
     - Lengan kiri & kanan lurus (armsStraight)
     - Perubahan arah mendadak pada area sempit (clusterSpan <= min(6.5, minArmLen * 0.45))
     - Jarak ke apex perpotongan dekat (distToApex <= max(2.2, clusterSpan * 1.15)) */
  if (armsStraight && clusterSpan <= Math.min(6.5, minArmLen * 0.45) && distToApex <= Math.max(2.2, clusterSpan * 1.15)) {
    /* Pastikan bukan busur sengaja yang lebar */
    const isIntentionalArc = hasCurvedHandles && clusterIndices.length >= 2 && distToApex > 1.35 && circleFit && circleFit.rms < 0.35 && circleFit.rad >= 2.5;
    if (!isIntentionalArc) {
      return {
        kind: 'sharp',
        turnDeg,
        iL,
        iR,
        clusterIndices,
        apex: apex && distToApex <= 3.5 ? {
          x: rd(apex.x),
          y: rd(apex.y)
        } : {
          x: centerPt.x,
          y: centerPt.y
        },
        fitL,
        fitR
      };
    }
  }

  /* Kriteria Rounded Corner:
     Perubahan arah bertahap, memiliki kelengkungan busur yang konsisten */
  if (circleFit && circleFit.rad >= 1.5 && circleFit.rad <= minArmLen * 0.85 && circleFit.rms <= Math.max(0.45, circleFit.rad * 0.06)) {
    return {
      kind: 'rounded',
      turnDeg,
      radius: rd(circleFit.rad),
      center: {
        x: circleFit.cx,
        y: circleFit.cy
      },
      clusterIndices
    };
  }

  /* Fallback: sudut 1-node tajam dengan perubahan arah besar (> 45° prioritas tinggi, atau 20°-45° dengan lengan lurus) */
  const t3 = turningAngle3Pt(ns[idx(idxCenter - 1)], centerPt, ns[idx(idxCenter + 1)]);
  if (!hasCurvedHandles && (t3.deg > 45 || t3.deg >= 20 && armsStraight)) {
    return {
      kind: 'sharp',
      turnDeg: Math.max(turnDeg, t3.deg),
      iL: idxCenter,
      iR: idxCenter,
      clusterIndices: [idxCenter],
      apex: {
        x: centerPt.x,
        y: centerPt.y
      },
      fitL,
      fitR
    };
  }
  return {
    kind: 'none',
    turnDeg
  };
}

/* Klasifikasi Dinamis Seluruh Node pada Subpath menjadi 4 Status:
   - 'protected-corner' : Sudut tajam terdeteksi (atau ujung subpath terbuka) -> JANGAN HAPUS!
   - 'redundant'        : Node pada segmen lurus dengan sudut belok 0°–5° & simpangan kolinier <= tol -> HAPUS!
   - 'smooth'           : Node pada kurva halus / rounded corner bertahap -> SEDERHANAKAN HATI-HATI!
   - 'uncertain'        : Node konteks lokal 5°–20° atau ambigu -> JANGAN HAPUS kecuali lolos validasi geometri! */
/* Klasifikasi Dinamis Seluruh Node pada Subpath menjadi 4 Status:
   - 'protected-corner' : Sudut tajam terdeteksi (atau ujung subpath terbuka) -> JANGAN HAPUS!
   - 'redundant'        : Node pada segmen lurus dengan sudut belok 0°–5° & simpangan kolinier <= tol -> HAPUS!
   - 'smooth'           : Node pada kurva halus / rounded corner bertahap -> SEDERHANAKAN HATI-HATI!
   - 'uncertain'        : Node konteks lokal 5°–20° atau ambigu -> JANGAN HAPUS kecuali lolos validasi geometri! */
function classifySubpathNodesDynamic(sp, opt = {}) {
  const ns = sp.nodes,
    n = ns.length,
    closed = sp.closed;
  const colTol = opt.collinearTol != null ? opt.collinearTol : 0.32;
  const mode = opt.mode || 'logo';
  const status = new Array(n).fill('uncertain');
  const meta = new Array(n).fill(null);
  if (n < 3) {
    for (let i = 0; i < n; i++) status[i] = 'protected-corner';
    return {
      status,
      meta
    };
  }
  const idx = k => closed ? (k % n + n) % n : Math.max(0, Math.min(n - 1, k));
  for (let i = 0; i < n; i++) {
    /* Ujung subpath terbuka wajib dilindungi */
    if (!closed && (i === 0 || i === n - 1)) {
      status[i] = 'protected-corner';
      continue;
    }
    const pv = ns[idx(i - 1)],
      cu = ns[i],
      nx = ns[idx(i + 1)];
    const t3 = turningAngle3Pt(pv, cu, nx);
    const segInStraight = segStraight(pv, cu);
    const segOutStraight = segStraight(cu, nx);

    /* 1. Cek apakah bagian dari Sharp Corner atau Rounded Corner via Multi-Scale Local Regression */
    const zone = analyzeMultiScaleCornerZone(ns, closed, i, 5, mode);
    if (zone.kind === 'sharp') {
      status[i] = 'protected-corner';
      meta[i] = zone;
      continue;
    }

    /* 2. Aturan Sudut Belok > 45° (Prioritas Tinggi untuk Dipertahankan) */
    if (t3.deg > 45 && (cu.type === 'corner' || segInStraight && segOutStraight)) {
      status[i] = 'protected-corner';
      meta[i] = {
        kind: 'sharp',
        turnDeg: t3.deg,
        iL: i,
        iR: i,
        clusterIndices: [i],
        apex: {
          x: cu.x,
          y: cu.y
        }
      };
      continue;
    }

    /* 3. Aturan Sudut Belok 20°–45° (Kandidat sudut yang perlu dilindungi jika segmen lurus bertemu) */
    if (t3.deg >= 20 && t3.deg <= 45 && segInStraight && segOutStraight) {
      const l1 = dist(pv, cu),
        l2 = dist(cu, nx);
      if (l1 >= 2.5 && l2 >= 2.5) {
        status[i] = 'protected-corner';
        meta[i] = {
          kind: 'sharp',
          turnDeg: t3.deg,
          iL: i,
          iR: i,
          clusterIndices: [i],
          apex: {
            x: cu.x,
            y: cu.y
          }
        };
        continue;
      }
    }

    /* 4. Aturan Sudut Belok 0°–5° (Kandidat Node Redundan pada Garis Lurus) */
    if (t3.deg <= 5.0 && segInStraight && segOutStraight && !cu.fil) {
      const chord = dist(pv, nx);
      if (chord > 1e-6) {
        const perpDist = Math.abs(cross(sub(nx, pv), sub(cu, pv))) / chord;
        const proj = dot(sub(cu, pv), sub(nx, pv));
        if (perpDist <= colTol && proj > 0 && proj < chord * chord) {
          status[i] = 'redundant';
          meta[i] = {
            perpDist,
            turnDeg: t3.deg
          };
          continue;
        }
      }
    }

    /* 5. Evaluasi Konteks Lokal (5°–20°):
          Jika berada di antara dua segmen lurus panjang dan hanya merupakan jitter tangga piksel
          (simpangan tegak lurus ke tali busur tetangga sangat kecil), tandai sebagai 'redundant'.
          Namun jika merupakan ujung lancip huruf (mis. sudut dalam huruf A yang < 20° dengan lengan panjang),
          lindungi sebagai 'protected-corner'! */
    if (t3.deg > 5.0 && t3.deg < 20.0 && segInStraight && segOutStraight && !cu.fil) {
      const chord = dist(pv, nx);
      const perpDist = chord > 1e-6 ? Math.abs(cross(sub(nx, pv), sub(cu, pv))) / chord : 999;
      const l1 = dist(pv, cu),
        l2 = dist(cu, nx);
      if (perpDist <= colTol * 0.85 && Math.min(l1, l2) < 8.0) {
        status[i] = 'redundant';
        meta[i] = {
          perpDist,
          turnDeg: t3.deg
        };
        continue;
      }
      if (l1 >= 10 && l2 >= 10 && perpDist > colTol * 2.2) {
        status[i] = 'protected-corner';
        meta[i] = {
          kind: 'sharp',
          turnDeg: t3.deg,
          iL: i,
          iR: i,
          clusterIndices: [i],
          apex: {
            x: cu.x,
            y: cu.y
          }
        };
        continue;
      }
    }

    /* 6. Kurva Halus / Rounded Corner: perubahan arah bertahap atau memiliki handle G1 */
    if (zone.kind === 'rounded' || cu.type === 'smooth' || cu.type === 'symmetric' || hasH(cu, cu.handleIn) || hasH(cu, cu.handleOut)) {
      status[i] = 'smooth';
      meta[i] = zone.kind === 'rounded' ? zone : {
        kind: 'smoothCurve',
        turnDeg: t3.deg
      };
      continue;
    }

    /* 7. Sisanya berstatus 'uncertain' (ambigu: jangan dihapus kecuali lolos validasi ketat) */
    status[i] = 'uncertain';
    meta[i] = {
      turnDeg: t3.deg
    };
  }
  return {
    status,
    meta
  };
}

/* Konsolidasi Cluster Sudut Tajam Multi-Node:
   Jika puncak tajam (seperti puncak huruf A) terpecah menjadi 2–5 node kecil yang berdekatan,
   lebur node-node mikro di zona puncak tersebut menjadi SATU sharp-corner anchor tepat di Apex
   hasil regresi linear lokal kedua sisinya. */
/* Konsolidasi Cluster Sudut Tajam Multi-Node:
   Jika puncak tajam (seperti puncak huruf A) terpecah menjadi 2–5 node kecil yang berdekatan,
   lebur node-node mikro di zona puncak tersebut menjadi SATU sharp-corner anchor tepat di Apex
   hasil regresi linear lokal kedua sisinya. */
function consolidateSharpCornerClusters(sp, isSharedNode, opt = {}) {
  const minKeep = sp.closed ? 3 : 2;
  if (sp.nodes.length <= minKeep) return {
    sp,
    consolidated: 0
  };
  let ns = sp.nodes.map(cl),
    n = ns.length;
  let consolidated = 0;
  const mode = opt.mode || 'logo';

  /* Cari zona sharp-corner yang terdiri dari > 1 node rapat */
  const visited = new Set();
  const merges = [];
  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    if (!sp.closed && (i === 0 || i === n - 1)) continue;
    const zone = analyzeMultiScaleCornerZone(ns, sp.closed, i, 5, mode);
    if (zone.kind === 'sharp' && zone.clusterIndices && zone.clusterIndices.length >= 2) {
      const cIdxs = zone.clusterIndices;
      if (cIdxs.some(ci => visited.has(ci) || ns[ci].fil || isSharedNode && isSharedNode(ns[ci]))) continue;
      if (!sp.closed && (cIdxs.includes(0) || cIdxs.includes(n - 1))) continue;
      if (n - (cIdxs.length - 1) < minKeep) continue;
      cIdxs.forEach(ci => visited.add(ci));
      merges.push(zone);
    }
  }
  if (!merges.length) return {
    sp,
    consolidated: 0
  };
  const dropIds = new Set();
  const replaceMap = new Map();
  for (const m of merges) {
    const firstNode = ns[m.clusterIndices[0]];
    const lastNode = ns[m.clusterIndices[m.clusterIndices.length - 1]];
    replaceMap.set(firstNode.id, {
      id: firstNode.id,
      x: m.apex.x,
      y: m.apex.y,
      type: 'corner',
      protectedCorner: true,
      handleIn: hasH(firstNode, firstNode.handleIn) ? {
        ...firstNode.handleIn
      } : null,
      handleOut: hasH(lastNode, lastNode.handleOut) ? {
        ...lastNode.handleOut
      } : null,
      fil: null
    });
    for (let k = 1; k < m.clusterIndices.length; k++) {
      dropIds.add(ns[m.clusterIndices[k]].id);
    }
    consolidated++;
  }
  const nextNodes = [];
  for (const nd of ns) {
    if (replaceMap.has(nd.id)) nextNodes.push(replaceMap.get(nd.id));else if (!dropIds.has(nd.id)) nextNodes.push(nd);
  }
  return {
    sp: {
      ...sp,
      nodes: nextNodes
    },
    consolidated
  };
}

/* Penyederhanaan Subpath dengan Sharp-Corner Preservation:
   - Memisahkan subpath menjadi segmen-segmen di antara 'protected-corner' anchors.
   - Node 'protected-corner' TIDAK PERNAH dihapus.
   - Node 'redundant' di antara sudut-sudut tajam dihapus selama simpangan terhadap semua
     titik asli tetap <= colTol.
   - Rantai node 'smooth' (rounded corner / kurva bertahap) disederhanakan dengan Schneider Bézier
     fitting tanpa menghilangkan radius kelengkungannya.
   - Node 'uncertain' hanya dihapus apabila lolos validasi geometri ketat. */
/* Penyederhanaan Subpath dengan Sharp-Corner Preservation:
   - Memisahkan subpath menjadi segmen-segmen di antara 'protected-corner' anchors.
   - Node 'protected-corner' TIDAK PERNAH dihapus.
   - Node 'redundant' di antara sudut-sudut tajam dihapus selama simpangan terhadap semua
     titik asli tetap <= colTol.
   - Rantai node 'smooth' (rounded corner / kurva bertahap) disederhanakan dengan Schneider Bézier
     fitting tanpa menghilangkan radius kelengkungannya.
   - Node 'uncertain' hanya dihapus apabila lolos validasi geometri ketat. */
function simplifyWithSharpCornerPreservation(sp, isSharedNode, opt = {}) {
  const minKeep = sp.closed ? 3 : 2;
  if (sp.nodes.length <= minKeep) return {
    sp,
    removed: 0,
    protectedCount: sp.nodes.length
  };
  const colTol = opt.collinearTol != null ? opt.collinearTol : 0.32;
  const curveTol = opt.curveTol != null ? opt.curveTol : 0.75;
  const mode = opt.mode || 'logo';

  /* Langkah 1: Konsolidasi puncak tajam yang terpecah menjadi banyak node kecil (mis. puncak huruf A) */
  const cons = consolidateSharpCornerClusters(sp, isSharedNode, {
    mode
  });
  let curSp = cons.sp;
  let totalRemoved = sp.nodes.length - curSp.nodes.length;

  /* Langkah 2: Pangkas node 'redundant' secara iteratif dengan menghitung ulang (recompute)
                status 4-kelas setiap kali geometri berubah, sambil memverifikasi simpangan
                terhadap seluruh titik asli yang dihapus */
  const skippedPts = new Map(); // id node -> daftar titik asli yang telah dihapus setelah node tsb

  const verifyChordDeviation = (A, B, originalPts, maxTol) => {
    const L = dist(A, B);
    if (L < 1e-6) return false;
    for (const q of originalPts) {
      const d = Math.abs(cross(sub(B, A), sub(q, A))) / L;
      const pr = dot(sub(q, A), sub(B, A));
      if (d > maxTol || pr < -0.05 * L || pr > L * L + 0.05 * L) return false;
    }
    return true;
  };
  for (let pass = 0; pass < 12 && curSp.nodes.length > minKeep; pass++) {
    const ns = curSp.nodes,
      n = ns.length;
    /* Hitung ulang klasifikasi node secara dinamis pada geometri saat ini */
    const {
      status
    } = classifySubpathNodesDynamic(curSp, {
      collinearTol: colTol,
      mode
    });
    const rmIds = new Set();
    const touchedNeighbors = new Set();
    for (let i = 0; i < n; i++) {
      if (curSp.nodes.length - rmIds.size <= minKeep) break;
      const nd = ns[i];
      if (status[i] === 'protected-corner' || nd.protectedCorner) continue;
      if (isSharedNode && isSharedNode(nd)) continue;
      if (nd.fil) continue;

      /* Hanya kandidat 'redundant' atau 'uncertain' (dengan validasi ekstra ketat) pada segmen lurus */
      const isRedundant = status[i] === 'redundant';
      const isUncertainCandidate = status[i] === 'uncertain' && segStraight(ns[(i - 1 + n) % n], nd) && segStraight(nd, ns[(i + 1) % n]);
      if (!isRedundant && !isUncertainCandidate) continue;
      const pi = (i - 1 + n) % n,
        ni = (i + 1) % n;
      if (touchedNeighbors.has(pi) || touchedNeighbors.has(i) || touchedNeighbors.has(ni)) continue;
      const P0 = ns[pi],
        N0 = ns[ni];
      const testPts = (skippedPts.get(P0.id) || []).concat([{
        x: nd.x,
        y: nd.y
      }], skippedPts.get(nd.id) || []);
      const allowedTol = isRedundant ? colTol : colTol * 0.55; // Validasi ekstra ketat untuk node 'uncertain'

      if (verifyChordDeviation(P0, N0, testPts, allowedTol)) {
        skippedPts.set(P0.id, testPts);
        rmIds.add(nd.id);
        touchedNeighbors.add(pi);
        touchedNeighbors.add(i);
        touchedNeighbors.add(ni);
      }
    }
    if (!rmIds.size) break;
    totalRemoved += rmIds.size;
    curSp = {
      ...curSp,
      nodes: curSp.nodes.filter(nd => !rmIds.has(nd.id))
    };
  }

  /* Langkah 3: Sederhanakan rantai 'smooth' (kurva halus / rounded corner berlebih) di antara
                dua 'protected-corner' tanpa menyentuh posisi 'protected-corner' */
  const finalClass = classifySubpathNodesDynamic(curSp, {
    collinearTol: colTol,
    mode
  });
  let protectedCount = 0;
  finalClass.status.forEach((st, idx) => {
    if (st === 'protected-corner') {
      curSp.nodes[idx].protectedCorner = true;
      protectedCount++;
    }
  });

  /* Re-fit rantai faset/arc padat yang bukan 'protected-corner' menggunakan Schneider Bézier Fit */
  if (curSp.nodes.length >= 5) {
    const faceted = findFacetedCurves(curSp.nodes, curSp.closed);
    for (const f of faceted) {
      /* Jangan re-fit melewati node yang berstatus protected-corner di bagian dalam rantai */
      const innerIds = f.nodeIds.slice(1, -1);
      const hasProtectedInner = curSp.nodes.some(nd => innerIds.includes(nd.id) && (nd.protectedCorner || isSharedNode && isSharedNode(nd)));
      if (hasProtectedInner) continue;
      const refitted = refitChain(curSp.nodes, curSp.closed, f.nodeIds, curveTol);
      if (refitted && refitted.length >= minKeep && refitted.length < curSp.nodes.length) {
        totalRemoved += curSp.nodes.length - refitted.length;
        curSp = {
          ...curSp,
          nodes: refitted
        };
      }
    }
  }
  return {
    sp: curSp,
    removed: totalRemoved,
    protectedCount
  };
}

/* =========================================================================
   v7.3 — AUTO HAPUS NODE NON-SUDUT (Corner-Anchored Span Simplification)
   Algoritma:
     1. Densifikasi kontur (kurva Bézier disampel) → polyline rapat berparameter panjang busur.
     2. Deteksi sudut tajam: dua lengan (regresi linear lokal, dengan celah anti-noise) di kiri-kanan tiap node;
        sudut dianggap TAJAM bila belok >= cornerDeg DAN kontur asli menempel pada titik potong
        kedua lengan (apex) dalam sharpTol. Sudut membulat / lengkungan tidak lolos uji apex → bukan sudut.
        Non-maximum suppression: satu sudut = satu node (yang paling menempel apex).
     3. Node sudut (+ ujung path terbuka, node bersama antar objek, fillet) menjadi JANGKAR yang tak terhapus.
     4. Di antara dua jangkar: rekursif (gaya Douglas-Peucker) — bila SEMUA titik kontur asli berada dalam
        `tol` dari garis lurus → hapus semua node di antaranya; bila cocok 1 kurva Bézier (Schneider) → ganti
        dengan 1 segmen kurva; bila tidak, pecah di node dengan simpangan terbesar lalu ulangi.
     Jaminan: penyimpangan hasil terhadap kontur asli <= tol; node sudut tidak pernah hilang.
   ========================================================================= */
/* =========================================================================
   v7.3 — AUTO HAPUS NODE NON-SUDUT (Corner-Anchored Span Simplification)
   Algoritma:
     1. Densifikasi kontur (kurva Bézier disampel) → polyline rapat berparameter panjang busur.
     2. Deteksi sudut tajam: dua lengan (regresi linear lokal, dengan celah anti-noise) di kiri-kanan tiap node;
        sudut dianggap TAJAM bila belok >= cornerDeg DAN kontur asli menempel pada titik potong
        kedua lengan (apex) dalam sharpTol. Sudut membulat / lengkungan tidak lolos uji apex → bukan sudut.
        Non-maximum suppression: satu sudut = satu node (yang paling menempel apex).
     3. Node sudut (+ ujung path terbuka, node bersama antar objek, fillet) menjadi JANGKAR yang tak terhapus.
     4. Di antara dua jangkar: rekursif (gaya Douglas-Peucker) — bila SEMUA titik kontur asli berada dalam
        `tol` dari garis lurus → hapus semua node di antaranya; bila cocok 1 kurva Bézier (Schneider) → ganti
        dengan 1 segmen kurva; bila tidak, pecah di node dengan simpangan terbesar lalu ulangi.
     Jaminan: penyimpangan hasil terhadap kontur asli <= tol; node sudut tidak pernah hilang.
   ========================================================================= */
function pruneNonCornerSub(sp, isShared, opt = {}) {
  const tol = opt.tol != null ? opt.tol : 0.75;
  const cornerDeg = opt.cornerDeg != null ? opt.cornerDeg : 28;
  const sharpTol = opt.sharpTol != null ? opt.sharpTol : 1.2;
  const snapApex = opt.snapApex !== false;
  const ARM_GAP = 1.5,
    ARM_LEN = 9,
    SUPP = 4;
  const closed = sp.closed,
    n = sp.nodes.length;
  if (n <= (closed ? 3 : 2)) return {
    sp,
    removed: 0,
    corners: n
  };
  const ns = sp.nodes.map(cl);

  /* --- 1. densifikasi --- */
  const D = [],
    dIdx = new Array(n),
    segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = ns[i],
      b = ns[(i + 1) % n],
      L = dist(a, b),
      straight = segStraight(a, b);
    const cnt = straight ? Math.max(1, Math.min(40, Math.ceil(L / 3))) : Math.max(8, Math.min(48, Math.ceil(L / 2)));
    dIdx[i] = D.length;
    for (let k = 0; k < cnt; k++) D.push(k === 0 ? {
      x: a.x,
      y: a.y
    } : segPoint(a, b, k / cnt));
  }
  if (!closed) {
    dIdx[n - 1] = D.length;
    D.push({
      x: ns[n - 1].x,
      y: ns[n - 1].y
    });
  }
  const m = D.length;
  const at = k => closed ? D[(k % m + m) % m] : D[Math.max(0, Math.min(m - 1, k))];
  const inR = k => closed || k >= 0 && k < m;

  /* titik pada jarak busur >= dd dari indeks k0 searah dir (+1/-1) */
  const pointAtArc = (k0, dir, dd) => {
    let acc = 0,
      prev = at(k0);
    for (let s = 1; s < m; s++) {
      const k = k0 + dir * s;
      if (!inR(k)) return prev;
      const p = at(k);
      acc += dist(prev, p);
      prev = p;
      if (acc >= dd) return p;
    }
    return prev;
  };
  const armPts = (k0, dir) => {
    const pts = [];
    let acc = 0,
      prev = at(k0);
    for (let s = 1; s < m; s++) {
      const k = k0 + dir * s;
      if (!inR(k)) break;
      const p = at(k);
      acc += dist(prev, p);
      prev = p;
      if (acc >= ARM_GAP) pts.push(p);
      if (acc > ARM_GAP + ARM_LEN) break;
    }
    return pts;
  };
  const ptSeg = (p, a, b) => {
    const ab = sub(b, a),
      l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
    return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
  };
  const tanDir = (k, mode) => {
    const f = pointAtArc(k, 1, 3),
      b = pointAtArc(k, -1, 3),
      c = at(k);
    const v = mode === 'fwd' ? sub(f, c) : mode === 'bwd' ? sub(b, c) : sub(f, b);
    const l = Math.hypot(v.x, v.y);
    return l < 1e-6 ? null : {
      x: v.x / l,
      y: v.y / l
    };
  };

  /* --- 2. deteksi sudut tajam (lengan regresi + uji apex) --- */
  const cand = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const k0 = dIdx[i],
      fw = armPts(k0, 1),
      bw = armPts(k0, -1);
    if (fw.length < 2 || bw.length < 2) continue;
    const fF = fitLocalLineOLS(fw),
      fB = fitLocalLineOLS(bw);
    if (!fF || !fB) continue;
    const dB = {
        x: -fB.dir.x,
        y: -fB.dir.y
      },
      dF = fF.dir; /* arah maju kedua lengan */
    const det = cross(dB, dF),
      turn = Math.abs(Math.atan2(det, dot(dB, dF))) * 180 / Math.PI;
    if (turn < cornerDeg || Math.abs(det) < 0.3) continue;
    const t = cross(sub(fF.c, fB.c), dF) / det;
    const apex = {
      x: fB.c.x + dB.x * t,
      y: fB.c.y + dB.y * t
    };
    const dNA = dist(apex, ns[i]);
    if (dNA > 3.5) continue; /* node sudut harus berada di dekat apex */
    let dMin = 1e9; /* kontur asli harus menempel pada apex */
    for (let s = -6; s < 6; s++) {
      const ka = k0 + s,
        kb = k0 + s + 1;
      if (!inR(ka) || !inR(kb)) continue;
      const d = ptSeg(apex, at(ka), at(kb));
      if (d < dMin) dMin = d;
    }
    if (dMin > sharpTol) continue;
    cand.push({
      i,
      turn,
      apex,
      dMin,
      score: turn - 8 * dMin - 4 * dNA
    });
  }
  cand.sort((p, q) => q.score - p.score);
  const S = new Float64Array(m);
  for (let k = 1; k < m; k++) S[k] = S[k - 1] + dist(D[k - 1], D[k]);
  const total = S[m - 1] + (closed ? dist(D[m - 1], D[0]) : 0);
  const arcD = (i, j) => {
    const d = Math.abs(S[dIdx[i]] - S[dIdx[j]]);
    return closed ? Math.min(d, total - d) : d;
  };
  const corners = [];
  for (const c of cand) if (corners.every(q => arcD(q.i, c.i) >= SUPP && dist(q.apex, c.apex) >= 4)) corners.push(c);
  const cornerMap = new Map(corners.map(c => [c.i, c]));

  /* --- 3. jangkar --- */
  const anch = new Set(),
    pseudo = new Set();
  corners.forEach(c => anch.add(c.i));
  for (let i = 0; i < n; i++) {
    const nd = ns[i];
    if (!closed && (i === 0 || i === n - 1) || nd.fil || nd.protectedCorner || isShared && isShared(nd)) anch.add(i);
  }
  if (closed) {
    if (anch.size === 0) {
      anch.add(0);
      anch.add(n >> 1);
      pseudo.add(0);
      pseudo.add(n >> 1);
    } else if (anch.size === 1) {
      const a = [...anch][0],
        p = (a + (n >> 1)) % n;
      anch.add(p);
      pseudo.add(p);
    }
  }
  const A = [...anch].sort((x, y) => x - y);
  if (A.length < 2) return {
    sp,
    removed: 0,
    corners: corners.length
  };

  /* snap sudut ke apex (hanya node bebas) */
  if (snapApex) corners.forEach(c => {
    const nd = ns[c.i];
    if (nd.fil || isShared && isShared(nd) || dist(c.apex, nd) > 3) return;
    const dx = c.apex.x - nd.x,
      dy = c.apex.y - nd.y;
    nd.x = rd(c.apex.x);
    nd.y = rd(c.apex.y);
    if (nd.handleIn) nd.handleIn = {
      x: rd(nd.handleIn.x + dx),
      y: rd(nd.handleIn.y + dy)
    };
    if (nd.handleOut) nd.handleOut = {
      x: rd(nd.handleOut.x + dx),
      y: rd(nd.handleOut.y + dy)
    };
    D[dIdx[c.i]] = {
      x: nd.x,
      y: nd.y
    };
  });

  /* --- 4. penyederhanaan rekursif per rentang antar jangkar --- */
  const keep = new Set(A.map(i => ns[i].id)),
    touched = new Set();
  const spans = closed ? A.length : A.length - 1;
  for (let sI = 0; sI < spans; sI++) {
    const ia = A[sI],
      ib = A[(sI + 1) % A.length];
    const seq = [],
      di = [];
    for (let j = ia, guard = 0; guard <= n; guard++, j = (j + 1) % n) {
      seq.push(ns[j]);
      let d = dIdx[j];
      if (di.length && d <= di[di.length - 1]) d += m;
      di.push(d);
      if (j === ib && guard > 0) break;
    }
    if (seq.length < 3) continue;
    const ptsR = (k0, k1) => {
      const r = [];
      for (let k = k0; k <= k1; k++) r.push(D[k % m]);
      return r;
    };
    const isCornerNode = nd => cornerMap.has(ns.indexOf(nd));
    const solve = (a, b, tA, tB) => {
      if (b - a === 1) return [{
        a,
        b,
        kind: 'orig'
      }];
      const pts = ptsR(di[a], di[b]),
        PA = seq[a],
        PB = seq[b],
        L = dist(PA, PB);
      let maxDev = 0;
      if (L < 1e-6) maxDev = Infinity;else for (const p of pts) {
        const dev = Math.abs(cross(sub(PB, PA), sub(p, PA))) / L,
          pr = dot(sub(p, PA), sub(PB, PA)) / L;
        if (pr < -tol || pr > L + tol) {
          maxDev = Infinity;
          break;
        }
        if (dev > maxDev) maxDev = dev;
      }
      if (maxDev <= tol) return [{
        a,
        b,
        kind: 'line'
      }];
      const t1 = tA || tanDir(di[a] % m, 'fwd'),
        t2 = tB || tanDir(di[b] % m, 'bwd');
      if (t1 && t2 && pts.length >= 4) {
        const fit = schneiderFit(pts, t1, t2, tol * 0.85);
        if (fit.length === 1) {
          /* verifikasi dua arah: kurva hasil ↔ kontur asli harus <= tol */
          const B = fit[0],
            cs = [];
          for (let q = 0; q <= 32; q++) {
            const t = q / 32,
              u = 1 - t;
            cs.push({
              x: u * u * u * B[0][0] + 3 * u * u * t * B[1][0] + 3 * u * t * t * B[2][0] + t * t * t * B[3][0],
              y: u * u * u * B[0][1] + 3 * u * u * t * B[1][1] + 3 * u * t * t * B[2][1] + t * t * t * B[3][1]
            });
          }
          const far = (P, Q) => {
            let mx = 0;
            for (const p of P) {
              let mn = 1e9;
              for (let q = 0; q < Q.length - 1; q++) {
                const d = ptSeg(p, Q[q], Q[q + 1]);
                if (d < mn) mn = d;
              }
              if (mn > mx) mx = mn;
            }
            return mx;
          };
          if (Math.max(far(cs, pts), far(pts, cs)) <= tol) return [{
            a,
            b,
            kind: 'bez',
            c1: {
              x: rd(B[1][0]),
              y: rd(B[1][1])
            },
            c2: {
              x: rd(B[2][0]),
              y: rd(B[2][1])
            }
          }];
        }
      }
      let bj = -1,
        bd = -1;
      for (let j = a + 1; j < b; j++) {
        const p = D[di[j] % m],
          dv = L < 1e-6 ? dist(p, PA) : Math.abs(cross(sub(PB, PA), sub(p, PA))) / L;
        if (dv > bd) {
          bd = dv;
          bj = j;
        }
      }
      const tc = tanDir(di[bj] % m, 'ctr');
      return solve(a, bj, tA, tc ? {
        x: -tc.x,
        y: -tc.y
      } : null).concat(solve(bj, b, tc, tB));
    };
    const pieces = solve(0, seq.length - 1, null, null);
    /* tangen jangkar non-sudut (pseudo) memakai tangen tengah agar G1 */
    pieces.forEach(pc => {
      const PA = seq[pc.a],
        PB = seq[pc.b];
      keep.add(PA.id);
      keep.add(PB.id);
      if (pc.kind === 'line') {
        PA.handleOut = null;
        PB.handleIn = null;
        touched.add(PA.id);
        touched.add(PB.id);
      } else if (pc.kind === 'bez') {
        PA.handleOut = pc.c1;
        PB.handleIn = pc.c2;
        touched.add(PA.id);
        touched.add(PB.id);
      }
    });
  }
  const out = ns.filter(nd => keep.has(nd.id));
  const hasBez = out.some(nd => nd.handleIn || nd.handleOut);
  if (out.length >= ns.length || out.length < (closed ? hasBez ? 2 : 3 : 2)) return {
    sp,
    removed: 0,
    corners: corners.length
  };
  cornerMap.forEach((c, i) => {
    ns[i].protectedCorner = true;
  });
  out.forEach(nd => {
    if (!touched.has(nd.id) || nd.fil) return;
    const idx = ns.indexOf(nd);
    nd.type = cornerMap.has(idx) ? 'corner' : hasH(nd, nd.handleIn) && hasH(nd, nd.handleOut) ? 'smooth' : 'corner';
  });
  return {
    sp: {
      ...sp,
      nodes: out
    },
    removed: ns.length - out.length,
    corners: corners.length
  };
}

/* Terapkan ke seluruh objek dokumen (opsi `only`: Set id objek). Mengembalikan jumlah node terhapus & sudut terjaga */
/* Terapkan ke seluruh objek dokumen (opsi `only`: Set id objek). Mengembalikan jumlah node terhapus & sudut terjaga */
function deleteNonCornerNodes(doc, opt = {}) {
  const only = opt.only || null;
  const coordKey = (x, y) => Math.round(x * 20) + ',' + Math.round(y * 20);
  const shared = new Map();
  doc.objects.forEach(o => {
    if (o.hidden || o.locked || o.img) return;
    const seen = new Set();
    o.subs.forEach(sp => sp.nodes.forEach(n => {
      const k = coordKey(n.x, n.y);
      if (!seen.has(k)) {
        seen.add(k);
        shared.set(k, (shared.get(k) || 0) + 1);
      }
    }));
  });
  const isShared = n => (shared.get(coordKey(n.x, n.y)) || 0) > 1;
  let removedCount = 0,
    cornerCount = 0;
  const objects = doc.objects.map(obj => {
    if (obj.hidden || obj.locked || obj.img || obj.isFrameBg || obj.isAutoFrame || !obj.subs) return obj;
    if (only && !only.has(obj.id)) return obj;
    try {
      let ch = false;
      const subs = obj.subs.map(sp => {
        const r = pruneNonCornerSub(sp, isShared, opt);
        cornerCount += r.corners;
        if (r.removed > 0) {
          removedCount += r.removed;
          ch = true;
          return r.sp;
        }
        return sp;
      });
      return ch ? {
        ...obj,
        subs
      } : obj;
    } catch (e) {
      return obj;
    }
  });
  return {
    doc: {
      ...doc,
      objects
    },
    removedCount,
    cornerCount,
    changed: removedCount > 0
  };
}

/* =========================================================================
   v7.2 — AUTO-REFINE GEOMETRI (Auto-Luruskan 2 Node + Auto-Smooth Corner)
   Tahap 1: luruskan segmen meleyot (rantai >=3 node & pasangan 2 node) + snap sumbu 0°/90°/±45°
   Tahap 2: Smooth Corner otomatis (>=2 node patah-patah maupun 1 node sudut) via setSelectedNodesRadius
   Peningkatan dari draf: setiap langkah mengambil ulang sub-path terbaru berdasarkan id (bebas indeks basi),
   kandidat dikumpulkan dulu lalu diterapkan satu per satu, proteksi batas bersama antar objek,
   try/catch per objek, dan opsi `only` (Set id objek) untuk dipakai dari editor.
   ========================================================================= */
/* =========================================================================
   v7.2 — AUTO-REFINE GEOMETRI (Auto-Luruskan 2 Node + Auto-Smooth Corner)
   Tahap 1: luruskan segmen meleyot (rantai >=3 node & pasangan 2 node) + snap sumbu 0°/90°/±45°
   Tahap 2: Smooth Corner otomatis (>=2 node patah-patah maupun 1 node sudut) via setSelectedNodesRadius
   Peningkatan dari draf: setiap langkah mengambil ulang sub-path terbaru berdasarkan id (bebas indeks basi),
   kandidat dikumpulkan dulu lalu diterapkan satu per satu, proteksi batas bersama antar objek,
   try/catch per objek, dan opsi `only` (Set id objek) untuk dipakai dari editor.
   ========================================================================= */
function autoRefineGeometry(doc, opt = {}) {
  const lineTol = opt.lineTol != null ? opt.lineTol : 0.85;
  const sagRatio = opt.sagRatio != null ? opt.sagRatio : 0.032;
  const axisSnapDeg = opt.axisSnapDeg != null ? opt.axisSnapDeg : 2.2;
  const minSegLen = opt.minSegLen != null ? opt.minSegLen : 6.0;
  const doStraight = opt.straighten !== false,
    doCorner = opt.corners !== false;
  const only = opt.only || null;
  const ref = opt.ref || null;
  const rw = opt.w || doc.viewBox && doc.viewBox[2] || 0;
  const rh = opt.h || doc.viewBox && doc.viewBox[3] || 0;
  const mode = opt.mode || 'logo';
  const doPrune = opt.pruneNonCorner === true,
    pruneTol = opt.pruneTol != null ? opt.pruneTol : Math.max(0.4, Math.min(1.0, lineTol * 0.9));
  let straightenedCount = 0,
    smoothedCornerCount = 0,
    preservedSharpCount = 0,
    prunedRedundantCount = 0,
    prunedNonCornerCount = 0;

  /* batas bersama antar objek: node yang koordinatnya dipakai >1 objek tidak digeser/dilebur (cegah celah) */
  const coordKey = (x, y) => Math.round(x * 20) + ',' + Math.round(y * 20);
  const sharedCoordCount = new Map();
  doc.objects.forEach(o => {
    if (o.hidden || o.locked || o.img) return;
    const seen = new Set();
    o.subs.forEach(sp => sp.nodes.forEach(n => {
      const k = coordKey(n.x, n.y);
      if (!seen.has(k)) {
        seen.add(k);
        sharedCoordCount.set(k, (sharedCoordCount.get(k) || 0) + 1);
      }
    }));
  });
  const isShared = n => (sharedCoordCount.get(coordKey(n.x, n.y)) || 0) > 1;
  const fillToRgb = f => {
    if (!f || f === 'none' || /^url\(/.test(f)) return null;
    try {
      let hx = typeof cssToHex === 'function' ? cssToHex(f) : f;
      if (/^#[0-9a-f]{3}$/i.test(hx)) hx = '#' + hx.slice(1).split('').map(x => x + x).join('');
      if (!/^#[0-9a-f]{6}$/i.test(hx)) return null;
      return [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
    } catch (e) {
      return null;
    }
  };

  /* segmen Bézier a→b sebenarnya "lurus tapi meleyot"? */
  const isWobblySeg = (a, b) => {
    if (!hasH(a, a.handleOut) && !hasH(b, b.handleIn)) return false;
    if (a.fil || b.fil) return false; /* jangan rusak busur fillet */
    const L = dist(a, b);
    if (L < minSegLen) return false;
    const ab = sub(b, a),
      sd = p => cross(ab, sub(p, a)) / L;
    const d1 = a.handleOut ? sd(a.handleOut) : 0,
      d2 = b.handleIn ? sd(b.handleIn) : 0;
    let maxDev = 0;
    for (let k = 1; k < 8; k++) {
      const dv = Math.abs(sd(segPoint(a, b, k / 8)));
      if (dv > maxDev) maxDev = dv;
    }
    const tol = Math.min(lineTol * 1.35, Math.max(0.45, L * sagRatio));
    if (maxDev <= tol) return true; /* hampir lurus sempurna */
    if (d1 * d2 < 0 && maxDev <= tol * 1.75) return true; /* kurva S (infleksi) khas artefak auto-trace */
    return false;
  };
  const canonicalAngle = (a, b) => {
    const flip = b.x < a.x - 1e-6 || Math.abs(b.x - a.x) <= 1e-6 && b.y > a.y;
    const dx = flip ? a.x - b.x : b.x - a.x,
      dy = flip ? a.y - b.y : b.y - a.y;
    const deg = -Math.atan2(dy, dx) * 180 / Math.PI;
    for (const t of [0, 90, -90, 45, -45]) if (Math.abs(deg - t) <= axisSnapDeg) return t;
    return null;
  };

  /* radius sudut tunggal: dari handle pendek, atau dari piksel gambar asli (ref) */
  const estimateSingleRadius = (pv, cu, nx, fillRgb) => {
    const l1 = dist(pv, cu),
      l2 = dist(cu, nx);
    if (l1 < 5 || l2 < 5) return 0;
    const v1 = nrm(sub(cu, pv)),
      v2 = nrm(sub(nx, cu));
    const phi = Math.abs(Math.atan2(cross(v1, v2), dot(v1, v2)));
    if (phi < 0.61 || phi > 2.44) return 0; /* belokan 35°–140° */
    const hIn = cu.handleIn ? dist(cu, cu.handleIn) : 0,
      hOut = cu.handleOut ? dist(cu, cu.handleOut) : 0;
    if (hIn > 0.2 && hIn < l1 * 0.22 || hOut > 0.2 && hOut < l2 * 0.22) {
      const rEst = Math.max(hIn, hOut) * 1.35 / Math.max(0.15, Math.tan(phi / 2));
      if (rEst >= 1.2 && rEst <= Math.min(l1, l2) * 0.35) return rd(rEst);
    }
    if (!ref || !fillRgb || rw < 8 || rh < 8) return 0;
    const bis = nrm({
      x: -v1.x + v2.x,
      y: -v1.y + v2.y
    });
    if (Math.hypot(bis.x, bis.y) < 1e-4) return 0;
    const diff = (x, y) => {
      const ix = Math.max(0, Math.min(rw - 1, Math.round(x))),
        iy = Math.max(0, Math.min(rh - 1, Math.round(y))),
        o = (iy * rw + ix) * 4;
      if (ref[o + 3] < 64) return 255;
      return (Math.abs(ref[o] - fillRgb[0]) + Math.abs(ref[o + 1] - fillRgb[1]) + Math.abs(ref[o + 2] - fillRgb[2])) / 3;
    };
    const mn = Math.min(l1, l2);
    const errApex = diff(cu.x + bis.x * 0.6, cu.y + bis.y * 0.6);
    const errDeep = diff(cu.x + bis.x * Math.min(6, mn * 0.35), cu.y + bis.y * Math.min(6, mn * 0.35));
    if (errApex <= errDeep + 18 || errDeep > 32) return 0; /* puncak tidak "terpotong" di gambar asli */
    let dT = 0;
    const maxProbe = Math.min(10, mn * 0.4);
    for (let s = 1.0; s <= maxProbe; s += 0.5) if (diff(cu.x + bis.x * s, cu.y + bis.y * s) <= (errApex + errDeep) * 0.5) {
      dT = s;
      break;
    }
    if (dT < 1.0) return 0;
    const sec = 1 / Math.max(0.15, Math.sin((Math.PI - phi) / 2)) - 1;
    if (sec <= 0.05) return 0;
    const rImg = dT / sec;
    return rImg >= 1.5 && rImg <= mn * 0.4 ? rd(rImg) : 0;
  };
  const subOf = (o, sid) => o.subs.find(s => s.id === sid);
  const idxOf = (sp, id) => sp.nodes.findIndex(n => n.id === id);
  const refineObject = obj => {
    let cur = obj;
    const fillRgb = fillToRgb(cur.fill);
    const subIds = cur.subs.map(s => s.id);

    /* TAHAP 0: Sharp-Corner Preservation + klasifikasi dinamis 4-status
       (lebur cluster puncak, kunci sudut tajam, pangkas node redundan) */
    if (doStraight) {
      cur = {
        ...cur,
        subs: cur.subs.map(sp => {
          const r0 = simplifyWithSharpCornerPreservation(sp, isShared, {
            collinearTol: Math.min(0.42, lineTol * 0.45),
            curveTol: lineTol,
            mode
          });
          preservedSharpCount += r0.protectedCount;
          if (r0.removed > 0) {
            prunedRedundantCount += r0.removed;
            straightenedCount++;
          }
          return r0.sp;
        })
      };
    }
    if (doStraight) {
      /* 1A. rantai meleyot (>=3 node) → rata + collapse + ikuti rel sisi */
      subIds.forEach(sid => {
        const sp0 = subOf(cur, sid);
        if (!sp0) return;
        findWobblySpans(sp0.nodes, sp0.closed).forEach(w => {
          if (!w.nodeIds || w.nodeIds.length < 3) return;
          const sp = subOf(cur, sid);
          if (!sp) return;
          if (!w.nodeIds.every(id => idxOf(sp, id) >= 0)) return;
          if (sp.nodes.some(n => w.nodeIds.includes(n.id) && isShared(n))) return;
          /* jangan lebur bila ada sharp corner terlindungi di bagian dalam rantai */
          const stW = classifySubpathNodesDynamic(sp, {
            collinearTol: lineTol * 0.45,
            mode
          }).status;
          const protW = new Set();
          sp.nodes.forEach((nd, k) => {
            if (stW[k] === 'protected-corner' || nd.protectedCorner) protW.add(nd.id);
          });
          if (w.nodeIds.slice(1, -1).some(id => protW.has(id))) return;
          const before = cur;
          cur = alignNodesAtAngle(cur, new Set(w.nodeIds), {
            angleMode: 'auto',
            anchor: 'center',
            slideEdges: true,
            collapse: true,
            snapDeg: axisSnapDeg
          });
          if (cur !== before) straightenedCount++;
        });
      });

      /* 1B. segmen 2 node meleyot karena handle → buang handle */
      cur = {
        ...cur,
        subs: cur.subs.map(sp => {
          const ns = sp.nodes.map(cl),
            n = ns.length;
          if (n < 2) return sp;
          let ch = false;
          for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
            const a = ns[i],
              b = ns[(i + 1) % n];
            if (!isWobblySeg(a, b)) continue;
            a.handleOut = null;
            b.handleIn = null;
            if (!a.handleIn) a.type = 'corner';
            if (!b.handleOut) b.type = 'corner';
            ch = true;
            straightenedCount++;
          }
          return ch ? {
            ...sp,
            nodes: ns
          } : sp;
        })
      };

      /* 1C. segmen lurus yang hampir sejajar sumbu kanonik → snap (ikuti rel sisi) */
      subIds.forEach(sid => {
        const sp0 = subOf(cur, sid);
        if (!sp0 || sp0.nodes.length < 3) return;
        const n0 = sp0.nodes.length,
          pairs = [];
        for (let i = 0; i < (sp0.closed ? n0 : n0 - 1); i++) pairs.push([sp0.nodes[i].id, sp0.nodes[(i + 1) % n0].id]);
        pairs.forEach(([ia, ib]) => {
          const sp = subOf(cur, sid);
          if (!sp) return;
          const ai = idxOf(sp, ia),
            bi = idxOf(sp, ib);
          if (ai < 0 || bi < 0) return;
          const a = sp.nodes[ai],
            b = sp.nodes[bi];
          if (!segStraight(a, b) || dist(a, b) < minSegLen * 1.25 || isShared(a) || isShared(b)) return;
          const target = canonicalAngle(a, b);
          if (target === null) return;
          const ids = new Set([ia, ib]),
            curDeg = measureSelectedNodesAngle(cur, ids);
          if (Math.abs(curDeg - target) > 0.05 && Math.abs(curDeg - target) <= axisSnapDeg) {
            const nx = alignNodesAtAngle(cur, ids, {
              angleMode: 'custom',
              angleDeg: target,
              anchor: 'center',
              slideEdges: true,
              collapse: false
            });
            if (nx !== cur) {
              cur = nx;
              straightenedCount++;
            }
          }
        });
      });
    }
    if (doCorner) {
      subIds.forEach(sid => {
        /* 2A. >=2 node patah-patah di satu belokan → Smooth Corner (fillet sirkular) */
        const sp0 = subOf(cur, sid);
        if (!sp0 || sp0.nodes.length < 4) return;
        const ns = sp0.nodes,
          n = ns.length,
          used = new Set(),
          cand = [];
        for (let i = 0; i < (sp0.closed ? n : n - 1); i++) {
          const j = (i + 1) % n,
            A = ns[i],
            B = ns[j];
          if (A.fil || B.fil || isShared(A) || isShared(B) || used.has(A.id) || used.has(B.id)) continue;
          const pv = ns[(i - 1 + n) % n],
            nx = ns[(j + 1) % n];
          if (pv === B || nx === A) continue;
          const dAB = dist(A, B),
            dPrev = dist(pv, A),
            dNext = dist(B, nx);
          if (dAB < 1.2 || dAB > 16 || dPrev < dAB * 1.6 || dNext < dAB * 1.6) continue;
          if (hasH(A, A.handleOut) && hasH(B, B.handleIn)) continue;
          {
            const zn = analyzeMultiScaleCornerZone(ns, sp0.closed, i, 5, mode);
            if (zn.kind === 'sharp' && dAB <= 3.5) continue;
          }
          const uIn = hasH(A, A.handleIn) ? nrm(sub(A, A.handleIn)) : nrm(sub(A, pv));
          const uOut = hasH(B, B.handleOut) ? nrm(sub(B.handleOut, B)) : nrm(sub(nx, B));
          const phi = Math.abs(Math.atan2(cross(uIn, uOut), dot(uIn, uOut)));
          if (phi < 0.45 || phi > 2.4) continue;
          const r = rd(dAB / Math.max(0.2, 2 * Math.sin(phi / 2)));
          if (r < 1.2 || r > Math.min(dPrev, dNext) * 0.42) continue;
          used.add(A.id);
          used.add(B.id);
          cand.push([A.id, B.id, r]);
        }
        cand.forEach(([ia, ib, r]) => {
          const sp = subOf(cur, sid);
          if (!sp || idxOf(sp, ia) < 0 || idxOf(sp, ib) < 0) return;
          const res = setSelectedNodesRadius(cur, new Set([ia, ib]), r, {
            mode: 'circular'
          });
          if (res.cnt > 0 && res.o !== cur) {
            cur = res.o;
            smoothedCornerCount += res.cnt;
          }
        });

        /* 2B. 1 node sudut tunggal yang seharusnya membulat */
        const spB = subOf(cur, sid);
        if (!spB || spB.nodes.length < 3) return;
        const ln = spB.nodes.length,
          single = [];
        for (let i = 0; i < ln; i++) {
          if (!spB.closed && (i === 0 || i === ln - 1)) continue;
          const cu = spB.nodes[i];
          if (!cu || cu.type !== 'corner' || cu.fil || isShared(cu) || used.has(cu.id)) continue;
          {
            const t3 = turningAngle3Pt(spB.nodes[(i - 1 + ln) % ln], cu, spB.nodes[(i + 1) % ln]);
            if (t3.deg > 142) continue;
          }
          const r = estimateSingleRadius(spB.nodes[(i - 1 + ln) % ln], cu, spB.nodes[(i + 1) % ln], fillRgb);
          if (r >= 1.2) single.push([cu.id, r]);
        }
        single.forEach(([id, r]) => {
          const sp = subOf(cur, sid);
          if (!sp || idxOf(sp, id) < 0) return;
          const res = setSelectedNodesRadius(cur, new Set([id]), r, {
            mode: 'circular'
          });
          if (res.cnt > 0 && res.o !== cur) {
            cur = res.o;
            smoothedCornerCount += res.cnt;
          }
        });
      });
    }

    /* pembersihan node redundan ditangani langsung oleh simplifyWithSharpCornerPreservation di bawah */
    /* pembersihan akhir yang tetap menghormati sharp-corner */
    if (doStraight && cur !== obj) cur = {
      ...cur,
      subs: cur.subs.map(sp => {
        const r1 = simplifyWithSharpCornerPreservation(sp, isShared, {
          collinearTol: 0.25,
          curveTol: lineTol,
          mode
        });
        prunedRedundantCount += r1.removed;
        return r1.sp;
      })
    };
    /* TAHAP AKHIR (opsional, dipakai pipeline Refine): hapus node non-sudut di antara sudut-sudut tajam */
    if (doPrune) cur = {
      ...cur,
      subs: cur.subs.map(sp => {
        const r2 = pruneNonCornerSub(sp, isShared, {
          tol: pruneTol,
          cornerDeg: opt.pruneCornerDeg
        });
        if (r2.removed > 0) {
          prunedNonCornerCount += r2.removed;
          return r2.sp;
        }
        return sp;
      })
    };
    return cur;
  };
  const nextObjects = doc.objects.map(obj => {
    if (obj.hidden || obj.locked || obj.img || obj.isFrameBg || obj.isAutoFrame) return obj;
    if (only && !only.has(obj.id)) return obj;
    try {
      return refineObject(obj);
    } catch (e) {
      return obj;
    }
  });
  return {
    doc: {
      ...doc,
      objects: nextObjects
    },
    straightenedCount,
    smoothedCornerCount,
    preservedSharpCount,
    prunedRedundantCount,
    prunedNonCornerCount,
    changed: straightenedCount > 0 || smoothedCornerCount > 0 || prunedRedundantCount > 0 || prunedNonCornerCount > 0
  };
}

export { turningAngle3Pt, fitLocalLineOLS, analyzeMultiScaleCornerZone, classifySubpathNodesDynamic, consolidateSharpCornerClusters, simplifyWithSharpCornerPreservation, pruneNonCornerSub, deleteNonCornerNodes, autoRefineGeometry };
