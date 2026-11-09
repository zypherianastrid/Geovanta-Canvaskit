/**
 * @file src/engine/figcraftSnap.jsx
 * @description Port setia mesin snapping Figcraft ke JavaScript.
 *
 * Sumber (dibaca langsung dari kode, bukan ringkasan):
 * - figcraft/crates/engine/src/canvas/snap.rs        (Targets, snap_move,
 *   snap_point, snap_points, snap_rect, snap_axis, spacings, equal_spacing,
 *   spacing_guides, guides_spans, round_move)
 * - figcraft/crates/engine/src/canvas/vectoredit/point_snap.rs
 *   (targets, snap, MAX_POINTS / MAX_NODES / MAX_MOVING)
 * - figcraft/crates/engine/src/canvas/guides.rs      (ruler_step, line_in,
 *   axis_aligned, frame_axis, EPS)
 * - figcraft/crates/engine/src/canvas/distance.rs    (label)
 * - figcraft/crates/layout/src/lib.rs                 (grid_snap_lines_in —
 *   TIDAK di-port: Geovanta01 tidak punya layout grid; lihat SPEK)
 * - figcraft/crates/engine/src/canvas/tools/handles.rs (SNAP_PX)
 * - figcraft/crates/engine/src/canvas/tools/drag.rs   (urutan pemakaian)
 *
 * Lisensi Figcraft: MIT OR Apache-2.0. Port ini dibuat dari repo milik user
 * yang sama (zypherianastrid/figcraft → zypherianastrid/Geovanta01).
 *
 * KONVENSI (dipetakan dari tipe Rust):
 * - Rect      -> { x0, y0, x1, y1 }
 * - Point/Vec2-> { x, y }
 * - Span      -> { v, a, b, kind }  (posisi pada satu sumbu + rentang sumbu
 *                                    lain; `kind` tambahan Geovanta01 untuk
 *                                    renderer, tidak memengaruhi matematika)
 * - Guide     -> bentuk guide Geovanta01 { type:'line', x1,y1,x2,y2, label,
 *                dashed, kind } — sama dengan Guide Figcraft (x0,y0,x1,y1,
 *                label, dashed) dengan penamaan ujung yang berbeda.
 * - Affine    -> [a,b,c,d,e,f] (urutan koefisien SVG); IDENTITY = [1,0,0,1,0,0].
 *                Geovanta01 tidak punya hierarki parent frame, jadi `space`
 *                selalu IDENTITY; fungsi affine tetap diimplementasi penuh
 *                agar modul ini port yang benar, bukan tiruan.
 *
 * ATURAN YANG DIPERTAHANKAN PERSIS (jangan "diperbaiki"):
 * - Threshold inklusif: |d| <= threshold; pemenang = |d| terkecil, tie =
 *   yang pertama ditemukan (perbandingan strict `<`).
 * - TIDAK ADA skor berbobot (tanpa pengali 1.04/1.05/1.12/1.15/0.85).
 * - Equal spacing menang atas garis hanya bila |e| < |v| (strict).
 * - Guide = garis yang SETELAH koreksi berimpit dengan target (|l-v| < 1e-6),
 *   span = gabungan span bergerak + span target, clamp ±1e6.
 * - Spacing guide hanya bila spacing TEPAT tercapai (|d| < 1e-6), label =
 *   distanceLabel (2 desimal).
 * - Point snap itu PER SUMBU (X boleh ke satu target, Y ke target lain),
 *   bukan Euclidean terdekat; marker = guide panjang-nol pada titik target
 *   yang tepat didarati (jarak < 1e-6).
 * - Pixel (roundMove) DULU, lalu layer snap menang pada sumbu yang di-snap.
 */

/* SNAP_PX: jangkauan snap dalam piksel layar (handles.rs:75). */
const SNAP_PX = 5.0;
/* EPS panduan (distance.rs): garis lebih pendek dari ini tidak digambar. */
const GUIDE_EPS = 1e-6;
/* EPS sumbu (guides.rs): koefisien transform di bawah ini dianggap nol. */
const AXIS_EPS = 1e-7;
/* Clamp span guide (snap.rs guides_spans) dan span guide halaman (gather). */
const GUIDE_CLAMP = 1e6;
const PAGE_GUIDE_SPAN = 1e7;
/* Caps point snap (point_snap.rs). */
const MAX_POINTS = 20000;
const MAX_NODES = 200000;
const MAX_MOVING = 256;

const IDENTITY = [1, 0, 0, 1, 0, 0];

/* ------------------------------------------------------------------ */
/* Label jarak (distance.rs::label): maks 2 desimal, tanpa nol trailing. */
function distanceLabel(d) {
  const v = Math.round(Math.abs(d) * 100) / 100;
  if (Number.isInteger(v) && v < 1e15) return String(v);
  return String(v);
}

/* Langkah tick penggaris pada zoom (guides.rs::ruler_step). */
function rulerStep(zoom) {
  const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  for (let i = 0; i < STEPS.length; i++) {
    if (STEPS[i] * zoom >= 50) return STEPS[i];
  }
  return 10000;
}

/* ------------------------------------------------------------------ */
/* Affine [a,b,c,d,e,f]: (x,y) -> (a*x + c*y + e, b*x + d*y + f). */
function affineIsIdentity(m) {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}
function affineMul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}
function affineInverse(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!isFinite(det) || det === 0) return null;
  const a = m[3] / det,
    b = -m[1] / det,
    c = -m[2] / det,
    d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
function affinePoint(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
/* Vektor oleh matriks (tanpa translasi) — figcraft snap.rs::linear. */
function affineVec(m, v) {
  return { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y };
}
/* Skala sumbu owner (snap_guide): |kolom| transform. */
function affineAxisScale(m, vertical) {
  return vertical ? Math.hypot(m[0], m[1]) : Math.hypot(m[2], m[3]);
}
/* Apakah transform menjaga garis sejajar sumbu (guides.rs::axis_aligned). */
function axisAligned(m) {
  return Math.abs(m[1]) < AXIS_EPS && Math.abs(m[2]) < AXIS_EPS;
}
/* Garis x=offset (vertical) atau y=offset oleh m, bila tetap sejajar sumbu
   (guides.rs::line_in). Kembalikan { vertical, offset } atau null. */
function lineIn(m, vertical, offset) {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
  let out;
  if (vertical) {
    if (Math.abs(c) < AXIS_EPS) out = { vertical: true, offset: a * offset + e };
    else if (Math.abs(d) < AXIS_EPS) out = { vertical: false, offset: b * offset + f };
    else return null;
  } else if (Math.abs(b) < AXIS_EPS) {
    out = { vertical: false, offset: d * offset + f };
  } else if (Math.abs(a) < AXIS_EPS) {
    out = { vertical: true, offset: c * offset + e };
  } else {
    return null;
  }
  return isFinite(out.offset) ? out : null;
}

/* ------------------------------------------------------------------ */
/* Rect helpers. */
function rectCenter(r) {
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
}
function rectUnion(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1)
  };
}
function rectIsFinite(r) {
  return r && isFinite(r.x0) && isFinite(r.y0) && isFinite(r.x1) && isFinite(r.y1);
}
function rectFromArray(bb) {
  return { x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3] };
}
/* BBox axis-aligned dari rect yang ditransformasi (transform_rect_bbox). */
function transformRectBbox(m, r) {
  const pts = [
    affinePoint(m, { x: r.x0, y: r.y0 }),
    affinePoint(m, { x: r.x1, y: r.y0 }),
    affinePoint(m, { x: r.x0, y: r.y1 }),
    affinePoint(m, { x: r.x1, y: r.y1 })
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (!isFinite(p.x) || !isFinite(p.y)) return null;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/* ------------------------------------------------------------------ */
/* Guide bentuk Geovanta01. `a`,`b` titik ujung. */
function makeGuide(a, b, label, dashed, kind) {
  return {
    type: 'line',
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    label: label != null ? label : null,
    dashed: !!dashed,
    kind: kind || 'bbox'
  };
}
function guidesEqual(g, h) {
  return g.x1 === h.x1 && g.y1 === h.y1 && g.x2 === h.x2 && g.y2 === h.y2 &&
    g.label === h.label && g.dashed === h.dashed && g.kind === h.kind;
}

/* ------------------------------------------------------------------ */
/* Targets: kandidat snap yang dikumpulkan sekali di awal gesture
   (snap.rs::Targets). `space` = affine page <- snap space. */
function createTargets(space) {
  return {
    xs: [],
    ys: [],
    boxes: [],
    points: [],
    space: space ? space.slice() : IDENTITY.slice(),
    moving: null
  };
}

/* Kotak target: garis tepi + tengah, dan masuk daftar spacing (add_box). */
function addBox(t, r, kind) {
  const c = rectCenter(r);
  for (const x of [r.x0, c.x, r.x1]) t.xs.push({ v: x, a: r.y0, b: r.y1, kind: kind || 'bbox' });
  for (const y of [r.y0, c.y, r.y1]) t.ys.push({ v: y, a: r.x0, b: r.x1, kind: kind || 'bbox' });
  t.boxes.push(r);
}
/* Garis saja (kotak parent frame / artboard): TIDAK masuk daftar spacing. */
function addBoxLines(t, r, kind) {
  const c = rectCenter(r);
  for (const x of [r.x0, c.x, r.x1]) t.xs.push({ v: x, a: r.y0, b: r.y1, kind: kind || 'artboard' });
  for (const y of [r.y0, c.y, r.y1]) t.ys.push({ v: y, a: r.x0, b: r.x1, kind: kind || 'artboard' });
}
/* Tarik kembali apa yang addBox tambahkan untuk r (remove_box). */
function removeBox(t, r) {
  const take = (arr, s) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].v === s.v && arr[i].a === s.a && arr[i].b === s.b) {
        arr.splice(i, 1);
        return;
      }
    }
  };
  const c = rectCenter(r);
  for (const x of [r.x0, c.x, r.x1]) take(t.xs, { v: x, a: r.y0, b: r.y1 });
  for (const y of [r.y0, c.y, r.y1]) take(t.ys, { v: y, a: r.x0, b: r.x1 });
  for (let i = t.boxes.length - 1; i >= 0; i--) {
    const b = t.boxes[i];
    if (b.x0 === r.x0 && b.y0 === r.y0 && b.x1 === r.x1 && b.y1 === r.y1) {
      t.boxes.splice(i, 1);
      return;
    }
  }
}
/* Titik target (add_point): garis melalui titik pada kedua sumbu + marker.
   points menyimpan {x, y, kind} agar marker tahu jenis titik yang didarati. */
function addPoint(t, p, kind) {
  const k = kind || 'node';
  t.xs.push({ v: p.x, a: p.y, b: p.y, kind: k });
  t.ys.push({ v: p.y, a: p.x, b: p.x, kind: k });
  t.points.push({ x: p.x, y: p.y, kind: k });
}

/* Garis tepi + tengah sebuah kotak sebagai garis bergerak (rect_spans). */
function rectSpans(r) {
  const c = rectCenter(r);
  return {
    xs: [
      { v: r.x0, a: r.y0, b: r.y1 },
      { v: c.x, a: r.y0, b: r.y1 },
      { v: r.x1, a: r.y0, b: r.y1 }
    ],
    ys: [
      { v: r.y0, a: r.x0, b: r.x1 },
      { v: c.y, a: r.x0, b: r.x1 },
      { v: r.y1, a: r.x0, b: r.x1 }
    ]
  };
}

/* --- pemetaan ruang (identity bila space == IDENTITY) --- */
function toSpaceVec(t, v) {
  if (affineIsIdentity(t.space)) return v;
  const inv = affineInverse(t.space);
  return inv ? affineVec(inv, v) : v;
}
function toPageVec(t, v) {
  if (affineIsIdentity(t.space)) return v;
  return affineVec(t.space, v);
}
function toPageGuides(t, guides) {
  if (affineIsIdentity(t.space)) return guides;
  return guides.map(g => {
    const a = affinePoint(t.space, { x: g.x1, y: g.y1 });
    const b = affinePoint(t.space, { x: g.x2, y: g.y2 });
    return { ...g, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

/* ------------------------------------------------------------------ */
/* Garis-garis yang berimpit dengan target (guides_spans). `xs`/`ys` adalah
   garis bergerak SETELAH koreksi. */
function guidesSpans(t, xs, ys) {
  const spanOf = (cands, s) => {
    let lo = s.a, hi = s.b, kind = null, found = false;
    for (const h of cands) {
      if (Math.abs(h.v - s.v) < GUIDE_EPS) {
        found = true;
        lo = Math.min(lo, h.a);
        hi = Math.max(hi, h.b);
        if (kind === null && h.kind) kind = h.kind;
      }
    }
    if (!found) return null;
    return {
      lo: Math.max(-GUIDE_CLAMP, lo),
      hi: Math.min(GUIDE_CLAMP, hi),
      kind
    };
  };
  const out = [];
  for (const x of xs) {
    const sp = spanOf(t.xs, x);
    if (sp) out.push(makeGuide({ x: x.v, y: sp.lo }, { x: x.v, y: sp.hi }, null, false, sp.kind));
  }
  for (const y of ys) {
    const sp = spanOf(t.ys, y);
    if (sp) out.push(makeGuide({ x: sp.lo, y: y.v }, { x: sp.hi, y: y.v }, null, false, sp.kind));
  }
  return out;
}

/* Guide untuk tepi kotak r yang berimpit dengan target (guides_for). */
function guidesFor(t, r) {
  const sp = rectSpans(r);
  return guidesSpans(t, sp.xs, sp.ys);
}

/* Koreksi tiap sumbu ke garis target terdekat (snap_spans). Kembalikan
   { dx, dy, guides } dengan dx/dy null bila tak ada yang dalam jangkauan. */
function snapSpans(t, xs, ys, threshold) {
  const best = (cands, vals) => {
    let b = null;
    for (const c of cands) {
      for (const v of vals) {
        const d = c.v - v.v;
        if (Math.abs(d) <= threshold && (b === null || Math.abs(d) < Math.abs(b))) b = d;
      }
    }
    return b;
  };
  const dx = best(t.xs, xs);
  const dy = best(t.ys, ys);
  const ox = dx === null ? 0 : dx;
  const oy = dy === null ? 0 : dy;
  const xs2 = xs.map(s => ({ v: s.v + ox, a: s.a + oy, b: s.b + oy, kind: s.kind }));
  const ys2 = ys.map(s => ({ v: s.v + oy, a: s.a + ox, b: s.b + ox, kind: s.kind }));
  return { dx, dy, guides: guidesSpans(t, xs2, ys2) };
}

/* Snap kotak bergerak r (snap_rect): garis saja, tanpa spacing.
   dx/dy null per sumbu bila tak ada yang dalam jangkauan (mirip Option Rust),
   agar pemanggil bisa membedakan "snap 0" dari "tidak snap" untuk fallback. */
function snapRect(t, r, threshold) {
  const sp = rectSpans(r);
  const res = snapSpans(t, sp.xs, sp.ys, threshold);
  if (res.dx === null && res.dy === null) return { dx: null, dy: null, guides: toPageGuides(t, res.guides) };
  const d = toPageVec(t, { x: res.dx === null ? 0 : res.dx, y: res.dy === null ? 0 : res.dy });
  return {
    dx: res.dx === null ? null : d.x,
    dy: res.dy === null ? null : d.y,
    guides: toPageGuides(t, res.guides)
  };
}

/* Snap satu titik (snap_point): koreksi per sumbu + guide (dx/dy null bila
   sumbu itu tidak snap). */
function snapPoint(t, x, y, threshold) {
  const inv = affineInverse(t.space);
  const q = inv ? affinePoint(inv, { x, y }) : { x, y };
  const res = snapSpans(t,
    [{ v: q.x, a: q.y, b: q.y }],
    [{ v: q.y, a: q.x, b: q.x }],
    threshold);
  if (res.dx === null && res.dy === null) return { dx: null, dy: null, guides: toPageGuides(t, res.guides) };
  const d = toPageVec(t, { x: res.dx === null ? 0 : res.dx, y: res.dy === null ? 0 : res.dy });
  return {
    dx: res.dx === null ? null : d.x,
    dy: res.dy === null ? null : d.y,
    guides: toPageGuides(t, res.guides)
  };
}

/* Snap beberapa titik bergerak bersama (snap_points): koreksi per sumbu +
   marker pada tiap titik target yang tepat didarati. */
function snapPoints(t, pts, threshold) {
  const use = pts.length > MAX_MOVING ? pts.slice(0, MAX_MOVING) : pts;
  const xs = use.map(p => ({ v: p.x, a: p.y, b: p.y }));
  const ys = use.map(p => ({ v: p.y, a: p.x, b: p.x }));
  const res = snapSpans(t, xs, ys, threshold);
  const d = { x: res.dx === null ? 0 : res.dx, y: res.dy === null ? 0 : res.dy };
  const guides = res.guides.slice();
  for (const p of use) {
    const q = { x: p.x + d.x, y: p.y + d.y };
    let landedKind = null;
    for (const tp of t.points) {
      if (Math.hypot(tp.x - q.x, tp.y - q.y) < GUIDE_EPS) { landedKind = tp.kind || 'node'; break; }
    }
    if (landedKind) {
      const marker = makeGuide(q, q, null, false, landedKind);
      if (!guides.some(g => guidesEqual(g, marker))) guides.push(marker);
    }
  }
  if (res.dx === null && res.dy === null) return { dx: null, dy: null, guides: toPageGuides(t, guides) };
  const pd = toPageVec(t, d);
  return {
    dx: res.dx === null ? null : pd.x,
    dy: res.dy === null ? null : pd.y,
    guides: toPageGuides(t, guides)
  };
}

/* Koreksi sepanjang satu sumbu ke garis target terdekat (snap_axis). */
function snapAxis(t, vertical, offset, threshold) {
  if (!isFinite(offset) || !isFinite(threshold) || threshold < 0) return null;
  const lines = vertical ? t.xs : t.ys;
  let best = null;
  for (const ln of lines) {
    const d = ln.v - offset;
    if (isFinite(d) && Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best;
}

/* Snap guide ruler (snap_guide): offset baru dalam koordinat owner, atau null. */
function snapGuideOffset(t, vertical, offset, zoom, axisScale) {
  const axis = Math.max(1e-6, axisScale == null ? 1 : axisScale);
  const threshold = SNAP_PX / (Math.max(1e-6, zoom) * axis);
  const d = snapAxis(t, vertical, offset, threshold);
  if (d === null) return null;
  const v = offset + d;
  return isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ */
/* Equal spacing (spacings / equal_spacing / spacing_guides).
   `horizontal=true` = baris (sumbu x); false = kolom (sumbu y). */
function spacings(t, r, horizontal) {
  /* Proyeksi ke ruang 1D sepanjang sumbu: { lo, hi, clo, chi, center }. */
  const proj = b => horizontal
    ? { lo: b.x0, hi: b.x1, clo: b.y0, chi: b.y1, center: (b.x0 + b.x1) / 2 }
    : { lo: b.y0, hi: b.y1, clo: b.x0, chi: b.x1, center: (b.y0 + b.y1) / 2 };
  const rp = proj(r);
  const row = [];
  for (const b of t.boxes) {
    const pb = proj(b);
    /* Overlap pada sumbu ACROSS (b.y0 < r.y1 && b.y1 > r.y0 untuk baris). */
    if (pb.clo < rp.chi && pb.chi > rp.clo) row.push(pb);
  }
  const before = [], after = [];
  for (const pb of row) {
    if (pb.center < rp.center) before.push(pb);
    else after.push(pb);
  }
  before.sort((a, b) => b.hi - a.hi);
  after.sort((a, b) => a.lo - b.lo);
  const mid = (a, b) => (Math.max(a.clo, b.clo) + Math.min(a.chi, b.chi)) / 2;
  const w = rp.hi - rp.lo;
  const out = [];
  const l = before[0], n = after[0];
  if (l && n && n.lo - l.hi > w) {
    const x0 = (l.hi + n.lo - w) / 2;
    out.push({ x0, gaps: [
      { from: l.hi, to: x0, across: mid(l, rp) },
      { from: x0 + w, to: n.lo, across: mid(rp, n) }
    ] });
  }
  const l2 = before[1];
  if (l && l2 && l.lo > l2.hi) {
    const x0 = l.hi + (l.lo - l2.hi);
    out.push({ x0, gaps: [
      { from: l2.hi, to: l.lo, across: mid(l2, l) },
      { from: l.hi, to: x0, across: mid(l, rp) }
    ] });
  }
  const n2 = after[1];
  if (n && n2 && n2.lo > n.hi) {
    const x0 = n.lo - (n2.lo - n.hi) - w;
    out.push({ x0, gaps: [
      { from: x0 + w, to: n.lo, across: mid(rp, n) },
      { from: n.hi, to: n2.lo, across: mid(n, n2) }
    ] });
  }
  return out
    .map(c => ({ d: c.x0 - rp.lo, gaps: c.gaps }))
    .filter(c => isFinite(c.d));
}

function equalSpacing(t, r, threshold, horizontal) {
  let best = null;
  for (const c of spacings(t, r, horizontal)) {
    if (Math.abs(c.d) <= threshold && (best === null || Math.abs(c.d) < Math.abs(best))) best = c.d;
  }
  return best;
}

/* Guide berlabel untuk gap yang sama rata di sekitar r (spacing_guides):
   hanya kandidat yang TEPAT tercapai. */
function spacingGuides(t, r, horizontal) {
  const out = [];
  for (const c of spacings(t, r, horizontal)) {
    if (Math.abs(c.d) >= GUIDE_EPS) continue;
    for (const g of c.gaps) {
      const a = horizontal ? { x: g.from, y: g.across } : { x: g.across, y: g.from };
      const b = horizontal ? { x: g.to, y: g.across } : { x: g.across, y: g.to };
      const line = {
        type: 'spacing',
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        label: distanceLabel(g.to - g.from),
        dashed: false,
        kind: 'spacing'
      };
      if (!out.some(o => o.x1 === line.x1 && o.y1 === line.y1 && o.x2 === line.x2 &&
          o.y2 === line.y2 && o.label === line.label)) out.push(line);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Snap layer yang bergerak sejauh vektor d (snap_move): koreksi halaman +
   guide. `t.moving` harus sudah diisi (union kotak bergerak, snap space). */
function snapMove(t, d, threshold) {
  if (!t.moving) return { dx: 0, dy: 0, guides: [] };
  const sd = toSpaceVec(t, d);
  const r = {
    x0: t.moving.x0 + sd.x, y0: t.moving.y0 + sd.y,
    x1: t.moving.x1 + sd.x, y1: t.moving.y1 + sd.y
  };
  const sp = rectSpans(r);
  const res = snapSpans(t, sp.xs, sp.ys, threshold);
  let dx = res.dx, dy = res.dy;
  const eX = equalSpacing(t, r, threshold, true);
  if (eX !== null && (dx === null || Math.abs(eX) < Math.abs(dx))) dx = eX;
  const eY = equalSpacing(t, r, threshold, false);
  if (eY !== null && (dy === null || Math.abs(eY) < Math.abs(dy))) dy = eY;
  const c = { x: dx === null ? 0 : dx, y: dy === null ? 0 : dy };
  const at = { x0: r.x0 + c.x, y0: r.y0 + c.y, x1: r.x1 + c.x, y1: r.y1 + c.y };
  let guides = guidesFor(t, at);
  guides = guides.concat(spacingGuides(t, at, true), spacingGuides(t, at, false));
  if (dx === null && dy === null) return { dx: null, dy: null, guides: toPageGuides(t, guides) };
  const pc = toPageVec(t, c);
  return {
    dx: dx === null ? null : pc.x,
    dy: dy === null ? null : pc.y,
    guides: toPageGuides(t, guides)
  };
}

/* Gerakan dibulatkan ke piksel bulat dalam snap space (round_move). */
function roundMove(t, d) {
  if (!t.moving) return d;
  const l = toSpaceVec(t, d);
  const r = {
    x: Math.round(t.moving.x0 + l.x) - t.moving.x0,
    y: Math.round(t.moving.y0 + l.y) - t.moving.y0
  };
  return toPageVec(t, r);
}

/* ------------------------------------------------------------------ */
/* Target untuk point snapping vector (point_snap.rs::targets), dipetakan ke
   model Geovanta01. `getVec` memasok titik + midpoint tiap objek:
   getVec(obj) -> { points: [{x,y}...], mids: [{x,y}...] }.
   `editedId`: objek yang diedit (kotaknya dikeluarkan dari target layer,
   tapi titiknya — kecuali yang bergerak — tetap jadi target).
   `movingNodeIds`: Set id node yang sedang digeser (di-skip).
   `extraPoints`: titik tambahan (mis. path pen). */
function targetsForPoints(baseTargets, getVec, objects, editedId, movingNodeIds, extraPoints) {
  const t = baseTargets;
  let budget = MAX_POINTS;
  for (const p of extraPoints || []) {
    if (budget <= 0) break;
    if (!isFinite(p.x) || !isFinite(p.y)) continue;
    addPoint(t, p, 'node');
    budget--;
  }
  let visited = 0;
  const addVec = (obj, skip) => {
    if (!obj || obj.hidden || obj.isFrameBg || obj.isAutoFrame) return;
    const v = getVec(obj);
    if (!v) return;
    for (const p of v.points) {
      if (budget <= 0) return;
      if (skip && skip.has(p.id)) continue;
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      addPoint(t, p, 'node');
      budget--;
    }
    for (const p of v.mids) {
      if (budget <= 0) return;
      if (skip && skip.has(p.id)) continue;
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      addPoint(t, p, 'midpoint');
      budget--;
    }
  };
  const edited = editedId ? objects.find(o => o.id === editedId) : null;
  if (edited) addVec(edited, movingNodeIds);
  for (const o of objects) {
    visited++;
    if (visited > MAX_NODES) break;
    if (!o || o.hidden || o.isFrameBg || o.isAutoFrame) continue;
    if (edited && o.id === edited.id) continue;
    addVec(o, null);
  }
  return t;
}

export {
  SNAP_PX, GUIDE_EPS, AXIS_EPS, GUIDE_CLAMP, PAGE_GUIDE_SPAN,
  MAX_POINTS, MAX_NODES, MAX_MOVING,
  distanceLabel, rulerStep, axisAligned, lineIn,
  affineMul, affineInverse, affinePoint, affineVec, affineAxisScale, affineIsIdentity,
  rectCenter, rectUnion, rectIsFinite, rectFromArray, transformRectBbox,
  createTargets, addBox, addBoxLines, removeBox, addPoint,
  rectSpans, guidesSpans, guidesFor, snapSpans, snapRect, snapPoint, snapPoints,
  snapAxis, snapGuideOffset, spacings, equalSpacing, spacingGuides, snapMove, roundMove,
  targetsForPoints
};
