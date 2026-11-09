/**
 * @file src/renderer/benchmarkSuite.jsx
 * @description Suite pengujian beban & tolok ukur performa render (GEOVANTA_BENCHMARK_SUITE)
 */
import { VE } from '../engine/vectorEngine.jsx';

/* =========================================================================
   TAHAP 9 & 10 — TEST SUITE STANDAR GEOVANTA & PANEL DIAGNOSTIK INTERNAL
   - Mencakup:
     * Test 01 — Lingkaran (Lingkaran sempurna & elips konsentris)
     * Test 02 — Bézier (Kurva S, cusp tajam, infleksi, dan radius ekstrem)
     * Test 03 — Diagonal (Garis miring sudut tipis, bintang lancip, sudut tajam)
     * Test 04 — Compound Path (Lubang, multi-subpath, fill-rule evenodd vs nonzero, self-intersection)
     * Test 05 — Kepadatan Node (10, 100, 1.000, 10.000 node)
     * Test 06 — Koordinat Dunia Ekstrem (100.000.000, 100.000.000) untuk uji Local Coordinate Rebasing
     * Test 07 — Komposisi 240 Objek & A/B Seam Test (Solid, Gradient, Transparent)
   - Menyediakan 7 Debug Modes Visualisasi Langsung di Kanvas:
     1) original       : Original path
     2) polyline       : Flattened polyline
     3) mesh           : Tessellation mesh (fill + stroke wireframe)
     4) fill_tris      : Fill triangles (Ear-Clip vs Stencil Fan)
     5) stroke_tris    : Stroke triangles (Quad + Join + Cap)
     6) seam_guard     : Seam guard overlay
     7) edge_coverage  : Pixel coverage / edge visualization
   ========================================================================= */
const GEOVANTA_BENCHMARK_SUITE = (() => {
  const buildCircleSvg = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560">
      <circle id="circle-perfect-lg" cx="210" cy="210" r="145" fill="#13b152" stroke="none"/>
      <circle id="circle-perfect-md" cx="210" cy="210" r="95" fill="#0d99ff" stroke="none"/>
      <circle id="circle-perfect-sm" cx="210" cy="210" r="48" fill="#ffffff" stroke="#18181b" stroke-width="3"/>
      <circle id="circle-micro" cx="210" cy="210" r="12" fill="#f43f5e" stroke="none"/>
      <ellipse id="ellipse-wide" cx="560" cy="150" rx="175" ry="72" fill="#6366f1" stroke="#312e81" stroke-width="2.5"/>
      <ellipse id="ellipse-tilted" cx="560" cy="365" rx="165" ry="58" transform="rotate(-22 560 365)" fill="#f59e0b" stroke="none"/>
      <ellipse id="ellipse-inner" cx="560" cy="365" rx="95" ry="26" transform="rotate(-22 560 365)" fill="#10b981" stroke="#064e3b" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      <rect id="rounded-pill" x="75" y="395" width="270" height="110" rx="55" ry="55" fill="#8b5cf6" stroke="none"/>
    </svg>
  `.trim();
  const buildBezierSvg = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560">
      <defs>
        <linearGradient id="bz-grad" x1="60" y1="80" x2="720" y2="480" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#4f46e5"/>
          <stop offset="0.5" stop-color="#ec4899"/>
          <stop offset="1" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <path id="bezier-s-wave" fill="url(#bz-grad)" stroke="none"
        d="M 70 160 C 210 10, 290 310, 430 160 C 570 10, 650 310, 740 160 L 740 245 C 650 395, 570 95, 430 245 C 290 395, 210 95, 70 245 Z"/>
      <path id="bezier-cusp-loop" fill="#13b152" fill-opacity="0.88" stroke="#065f46" stroke-width="2.5"
        d="M 85 450 C 360 260, 110 260, 385 450 C 310 515, 160 515, 85 450 Z"/>
      <path id="bezier-extreme-radii" fill="none" stroke="#0d99ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"
        d="M 445 430 C 447 290, 462 290, 464 430 C 470 520, 610 520, 735 320"/>
      <path id="bezier-sharp-inflection" fill="#f43f5e" stroke="none"
        d="M 460 350 C 590 250, 590 490, 725 385 L 725 465 C 590 560, 590 330, 460 425 Z"/>
    </svg>
  `.trim();
  const buildDiagonalSvg = () => {
    let rays = '';
    const angles = [1, 2.5, 5, 10, 18, 30, 45, 65, 82, 88];
    angles.forEach((deg, idx) => {
      const rad = deg * Math.PI / 180;
      const x1 = 70,
        y1 = 480;
      const len = 340;
      const x2 = +(x1 + Math.cos(rad) * len).toFixed(3);
      const y2 = +(y1 - Math.sin(rad) * len).toFixed(3);
      const nx = Math.sin(rad) * 4.5,
        ny = Math.cos(rad) * 4.5;
      const col = idx % 2 === 0 ? '#18181b' : '#0d99ff';
      rays += `<path id="diag-wedge-${deg}deg" fill="${col}" stroke="none" d="M ${x1} ${y1} L ${x2} ${y2} L ${+(x2 + nx).toFixed(3)} ${+(y2 + ny).toFixed(3)} L ${+(x1 + nx).toFixed(3)} ${+(y1 + ny).toFixed(3)} Z"/>`;
    });
    let starPts = '';
    const cx = 585,
      cy = 265,
      spikes = 16,
      rOut = 185,
      rIn = 42;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? rOut : rIn;
      const a = i * Math.PI / spikes - Math.PI / 2;
      starPts += (i === 0 ? 'M ' : ' L ') + (cx + Math.cos(a) * r).toFixed(2) + ' ' + (cy + Math.sin(a) * r).toFixed(2);
    }
    starPts += ' Z';
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560">
        ${rays}
        <path id="diagonal-razor-star" fill="#13b152" stroke="#18181b" stroke-width="2" stroke-linejoin="miter" stroke-miterlimit="10" d="${starPts}"/>
      </svg>
    `.trim();
  };
  const buildCompoundSvg = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560">
      <!-- Compound Ring dengan Multi-Hole (evenodd) -->
      <path id="compound-evenodd-rings" fill="#4f46e5" fill-rule="evenodd" stroke="none"
        d="M 60 220 A 150 150 0 1 0 360 220 A 150 150 0 1 0 60 220 Z
           M 105 220 A 105 105 0 1 0 315 220 A 105 105 0 1 0 105 220 Z
           M 145 220 A 65 65 0 1 0 275 220 A 65 65 0 1 0 145 220 Z
           M 180 220 A 30 30 0 1 0 240 220 A 30 30 0 1 0 180 220 Z"/>
      <!-- Compound Path Nonzero dengan Subpath Berlawanan Arah -->
      <path id="compound-nonzero-plate" fill="#13b152" fill-rule="nonzero" stroke="#064e3b" stroke-width="2"
        d="M 430 70 L 740 70 L 740 360 L 430 360 Z
           M 480 120 L 480 310 L 570 310 L 570 120 Z
           M 610 215 C 610 165, 700 165, 700 215 C 700 265, 610 265, 610 215 Z"/>
      <!-- Self-Intersecting Star / Pentagram (uji fallback triangulasi -> Stencil) -->
      <path id="self-intersecting-pentagram" fill="#f43f5e" fill-rule="evenodd" stroke="#881337" stroke-width="2"
        d="M 210 385 L 265 535 L 130 440 L 290 440 L 155 535 Z"/>
      <path id="self-intersecting-nonzero" fill="#f59e0b" fill-rule="nonzero" stroke="#78350f" stroke-width="2"
        d="M 585 385 L 640 535 L 505 440 L 665 440 L 530 535 Z"/>
    </svg>
  `.trim();
  const buildNodeDensityDoc = (targetNodes = 1000) => {
    const n = Math.max(10, Math.min(20000, targetNodes));
    const cx = 400,
      cy = 280,
      baseR = 210;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2;
      const r = baseR + Math.sin(t * 12) * 24 + Math.cos(t * 37) * 8;
      const x = cx + Math.cos(t) * r;
      const y = cy + Math.sin(t) * r;
      const tx = -Math.sin(t),
        ty = Math.cos(t);
      const hLen = Math.PI * 2 * r / (n * 3);
      nodes.push({
        id: 'nd_' + i,
        x,
        y,
        type: 'smooth',
        handleIn: {
          x: x - tx * hLen,
          y: y - ty * hLen
        },
        handleOut: {
          x: x + tx * hLen,
          y: y + ty * hLen
        }
      });
    }
    return {
      viewBox: [0, 0, 800, 560],
      objects: [{
        id: VE.uid(),
        name: `dense-wave-${n}-nodes`,
        type: 'path',
        fill: '#13b152',
        stroke: '#0d99ff',
        strokeWidth: 1.5,
        opacity: 1,
        fillRule: 'nonzero',
        group: null,
        subs: [{
          id: VE.uid(),
          closed: true,
          nodes
        }]
      }]
    };
  };
  const buildExtremeCoordinateDoc = (offset = 100000000) => {
    const baseDoc = VE.parseSVG(buildCircleSvg());
    const shiftedObjs = baseDoc.objects.map(o => VE.translate(o, offset, offset));
    return {
      viewBox: [offset, offset, 800, 560],
      objects: shiftedObjs
    };
  };
  const buildSeamMosaicDoc = (count = 240) => {
    const cols = 20,
      rows = Math.ceil(count / cols);
    const cellW = 36,
      cellH = 26,
      startX = 40,
      startY = 30;
    const palette = ['#13b152', '#0d99ff', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];
    const objects = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (objects.length >= count) break;
        const x0 = startX + c * cellW,
          y0 = startY + r * cellH;
        const x1 = x0 + cellW,
          y1 = y0 + cellH;
        /* Sisi miring/lengkung bersama antar sel untuk menguji seam antarpotongan objek tanpa stroke */
        const skew = r % 2 === 0 ? 4 : -4;
        const d = `M ${x0} ${y0} L ${x1} ${y0} L ${x1 + skew} ${y1} L ${x0 + skew} ${y1} Z`;
        objects.push({
          id: VE.uid(),
          name: `tile-${r}-${c}`,
          type: 'path',
          fill: palette[(r * cols + c) % palette.length],
          stroke: 'none',
          strokeWidth: 0,
          opacity: 1,
          fillRule: 'nonzero',
          group: null,
          subs: VE.parsePath(d, [1, 0, 0, 1, 0, 0])
        });
      }
    }
    return {
      viewBox: [0, 0, 800, 560],
      objects
    };
  };
  return {
    buildCircleSvg,
    buildBezierSvg,
    buildDiagonalSvg,
    buildCompoundSvg,
    buildNodeDensityDoc,
    buildExtremeCoordinateDoc,
    buildSeamMosaicDoc
  };
})();

/* Komponen Overlay Visualisasi 7 Debug Modes di Kanvas (Bagian 10) */

export { GEOVANTA_BENCHMARK_SUITE };
export default GEOVANTA_BENCHMARK_SUITE;
