/**
 * @file src/constants/editorToolsAndShapes.jsx
 * @description Definisi grup alat Vector Editor, pustaka bentuk (SHAPES), opsi snap, & preset gradien
 */
import { shPoly, SHK, shUnit, K2, shNgon, shStar } from '../utils/shapeGenerators.jsx';
import { TIPS, TIPS_EN } from './tooltipsCatalog.jsx';

/* Grup 1: Alat Node & Handle — Set Ikon Geometris Terpadu (24x24, radius & stroke selaras) */
const VE_NODE_GROUP = [['node', 'veNode', 'M4 19C6.5 11 11 6.5 19 4 M9.5 10.5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2z M5.5 5.5h3v3h-3z M15.5 15.5h3v3h-3z M8.5 7L10 9.5 M14 14.5L15.5 17'], ['addnode', 'veAddNode', 'M4 18C6 10 10 6 18 4 M9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0 M17.5 14.5v5 M15 17h5'], ['addhandle', 'veAddHandle', 'M4 18C8 10 16 10 20 18 M5 9h14 M10 9a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M3.5 9a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0 M17.5 9a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'], ['autohandle', 'veAutoHandle', 'M3.5 16.5C7 7.5 11 7.5 12 12s5 4.5 8.5-4.5 M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M5 6.5h4 M15 17.5h4']];

/* Grup 2: Alat Geometri & Rapikan Path — Set Ikon Geometris Terpadu */
/* Grup 2: Alat Geometri & Rapikan Path — Set Ikon Geometris Terpadu */
const VE_GEO_GROUP = [['straighten', 'veStraight', 'M4 7h16 M4 12h16 M4 17h10 M17.5 14.5L20 17l-2.5 2.5'], ['simplify', 'veSimplify', 'M4 19l9.5-9.5 M15 4l1.2 3.3L19.5 8.5l-3.3 1.2L15 13l-1.2-3.3L10.5 8.5l3.3-1.2z M18.5 15l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z']];

/* Daftar item pada floating bar (urutan tetap sama, desain ikon konsisten & selaras) */
/* Daftar item pada floating bar (urutan tetap sama, desain ikon konsisten & selaras) */
const VE_TOOLS = [{
  type: 'single',
  item: ['select', 'veSelect', 'M5.5 4.2l12.8 6.4a1.2 1.2 0 0 1-.12 2.2l-5.2 1.65-2.15 5.05a1.2 1.2 0 0 1-2.25-.12L4.1 5.6a1.1 1.1 0 0 1 1.4-1.4z']
}, {
  type: 'group',
  id: 'nodeGrp',
  items: VE_NODE_GROUP
}, {
  type: 'single',
  item: ['pen', 'vePen', 'M12 19l7-7 2.5 2.5-7 7-2.5-2.5z M18 13l-1.4-7.2L3.5 3.5l2.3 13.1L13 18l5-5z M3.5 3.5l6.8 6.8 M11.5 11.5a1.5 1.5 0 1 0 0 0.01']
}, {
  type: 'single',
  item: ['hand', 'veHand', 'M18 11V7.5a1.75 1.75 0 0 0-3.5 0V10 M14.5 9.5V5.75a1.75 1.75 0 0 0-3.5 0V9.5 M11 9.5V6.5a1.75 1.75 0 0 0-3.5 0v7l-1.6-1.6a1.75 1.75 0 0 0-2.48 2.48l4.18 4.18A5.5 5.5 0 0 0 11.5 20.2h2A5.5 5.5 0 0 0 19 14.7V11a1.75 1.75 0 0 0-1-1.58']
}, {
  type: 'group',
  id: 'geoGrp',
  items: VE_GEO_GROUP
}];
/* ---------- Pustaka shape: setiap generator mengembalikan path M/L/C/Z di kotak (x, y, w, h) ---------- */

const SHAPES = [['rect', 'Persegi', (x, y, w, h) => shPoly([[0, 0], [1, 0], [1, 1], [0, 1]], x, y, w, h)], ['rrect', 'Persegi bulat', (x, y, w, h) => {
  const r = Math.min(w, h) * 0.22,
    k = r * (1 - SHK),
    X = x + w,
    Y = y + h,
    f = n => +n.toFixed(2);
  return `M${f(x + r)} ${f(y)}L${f(X - r)} ${f(y)}C${f(X - k)} ${f(y)} ${f(X)} ${f(y + k)} ${f(X)} ${f(y + r)}L${f(X)} ${f(Y - r)}C${f(X)} ${f(Y - k)} ${f(X - k)} ${f(Y)} ${f(X - r)} ${f(Y)}L${f(x + r)} ${f(Y)}C${f(x + k)} ${f(Y)} ${f(x)} ${f(Y - k)} ${f(x)} ${f(Y - r)}L${f(x)} ${f(y + r)}C${f(x)} ${f(y + k)} ${f(x + k)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
}], ['ellipse', 'Lingkaran / elips', (x, y, w, h) => shUnit(['M', 1, .5, 'C', 1, .5 + K2, .5 + K2, 1, .5, 1, 'C', .5 - K2, 1, 0, .5 + K2, 0, .5, 'C', 0, .5 - K2, .5 - K2, 0, .5, 0, 'C', .5 + K2, 0, 1, .5 - K2, 1, .5, 'Z'], x, y, w, h)], ['triangle', 'Segitiga', (x, y, w, h) => shPoly([[.5, 0], [1, 1], [0, 1]], x, y, w, h)], ['rtriangle', 'Segitiga siku', (x, y, w, h) => shPoly([[0, 0], [1, 1], [0, 1]], x, y, w, h)], ['diamond', 'Belah ketupat', (x, y, w, h) => shPoly([[.5, 0], [1, .5], [.5, 1], [0, .5]], x, y, w, h)], ['parallelogram', 'Jajar genjang', (x, y, w, h) => shPoly([[.25, 0], [1, 0], [.75, 1], [0, 1]], x, y, w, h)], ['trapezoid', 'Trapesium', (x, y, w, h) => shPoly([[.2, 0], [.8, 0], [1, 1], [0, 1]], x, y, w, h)], ['pentagon', 'Segilima', (x, y, w, h) => shPoly(shNgon(5, -90), x, y, w, h)], ['hexagon', 'Segienam', (x, y, w, h) => shPoly(shNgon(6, 0), x, y, w, h)], ['octagon', 'Segidelapan', (x, y, w, h) => shPoly(shNgon(8, 22.5), x, y, w, h)], ['star5', 'Bintang 5', (x, y, w, h) => shPoly(shStar(5, 0.382), x, y, w, h)], ['star4', 'Bintang 4', (x, y, w, h) => shPoly(shStar(4, 0.38), x, y, w, h)], ['star6', 'Bintang 6', (x, y, w, h) => shPoly(shStar(6, 0.55), x, y, w, h)], ['arrow', 'Panah', (x, y, w, h) => shPoly([[0, .35], [.6, .35], [.6, .08], [1, .5], [.6, .92], [.6, .65], [0, .65]], x, y, w, h)], ['chevron', 'Chevron', (x, y, w, h) => shPoly([[0, 0], [.6, 0], [1, .5], [.6, 1], [0, 1], [.4, .5]], x, y, w, h)], ['plus', 'Plus', (x, y, w, h) => shPoly([[.35, 0], [.65, 0], [.65, .35], [1, .35], [1, .65], [.65, .65], [.65, 1], [.35, 1], [.35, .65], [0, .65], [0, .35], [.35, .35]], x, y, w, h)], ['heart', 'Hati', (x, y, w, h) => shUnit(['M', .5, 1, 'C', .1, .68, 0, .46, 0, .28, 'C', 0, .1, .13, 0, .27, 0, 'C', .38, 0, .46, .06, .5, .16, 'C', .54, .06, .62, 0, .73, 0, 'C', .87, 0, 1, .1, 1, .28, 'C', 1, .46, .9, .68, .5, 1, 'Z'], x, y, w, h)], ['drop', 'Tetesan', (x, y, w, h) => shUnit(['M', .5, 0, 'C', .5, 0, 1, .5, 1, .68, 'C', 1, .87, .78, 1, .5, 1, 'C', .22, 1, 0, .87, 0, .68, 'C', 0, .5, .5, 0, .5, 0, 'Z'], x, y, w, h)], ['ring', 'Cincin', (x, y, w, h) => {
  const ri = .275,
    ki = ri * SHK;
  return shUnit(['M', 1, .5, 'C', 1, .5 + K2, .5 + K2, 1, .5, 1, 'C', .5 - K2, 1, 0, .5 + K2, 0, .5, 'C', 0, .5 - K2, .5 - K2, 0, .5, 0, 'C', .5 + K2, 0, 1, .5 - K2, 1, .5, 'Z', 'M', .5 + ri, .5, 'C', .5 + ri, .5 - ki, .5 + ki, .5 - ri, .5, .5 - ri, 'C', .5 - ki, .5 - ri, .5 - ri, .5 - ki, .5 - ri, .5, 'C', .5 - ri, .5 + ki, .5 - ki, .5 + ri, .5, .5 + ri, 'C', .5 + ki, .5 + ri, .5 + ri, .5 + ki, .5 + ri, .5, 'Z'], x, y, w, h);
}, true]];
/* Nama bentuk versi English (hanya label picker & tooltip; nama objek
   di layer tetap memakai label Indonesia agar konten pengguna stabil). */
const SHAPE_EN = {
  rect: 'Rectangle',
  rrect: 'Rounded rectangle',
  ellipse: 'Circle / ellipse',
  triangle: 'Triangle',
  rtriangle: 'Right triangle',
  diamond: 'Diamond',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  star5: '5-point star',
  star4: '4-point star',
  star6: '6-point star',
  arrow: 'Arrow',
  chevron: 'Chevron',
  plus: 'Plus',
  heart: 'Heart',
  drop: 'Droplet',
  ring: 'Ring'
};
SHAPES.forEach(([k, lb]) => {
  TIPS['veShp_' + k] = {
    t: lb,
    d: TIPS.veShapeItem.d
  };
  TIPS_EN['veShp_' + k] = {
    t: SHAPE_EN[k] || lb,
    d: TIPS_EN.veShapeItem.d
  };
});
/* Daftar opsi Snap (Custom Checklist) + warna penanda + matriks kapabilitas per alat (SN-006) */
const DEFAULT_SNAP_CFG = {
  bbox: true,
  spacing: true,
  artboard: true,
  node: true,
  axial: false,
  midpoint: true,
  edge: true,
  perp: true,
  grid: false,
  pixel: false
};
const SNAP_OPTS_EN = [['bbox', 'Smart Guides (Box & Center)', '#f43f5e'], ['spacing', 'Equal Spacing', '#ec4899'], ['artboard', 'Artboard Edges & Center', '#6366f1'], ['node', 'Node & Handle Points', '#f43f5e'], ['axial', 'Node Axis Alignment (X/Y)', '#fb7185'], ['midpoint', 'Segment Midpoint', '#10b981'], ['edge', 'Path Contour / Edges', '#10b981'], ['perp', 'Right Angle (90°) & Line Extension', '#f59e0b'], ['grid', 'Adaptive Grid Lines (needs Grid on)', '#6366f1'], ['pixel', 'Snap to Pixel (1 px)', '#71717a']];
const SNAP_OPTS = [['bbox', 'Smart Guides (Kotak & Pusat)', '#f43f5e'], ['spacing', 'Jarak Sama Rata (Equal Spacing)', '#ec4899'], ['artboard', 'Tepi & Pusat Artboard', '#6366f1'], ['node', 'Titik Node & Handle', '#f43f5e'], ['axial', 'Sejajar Sumbu Node (X/Y)', '#fb7185'], ['midpoint', 'Titik Tengah Segmen (Midpoint)', '#10b981'], ['edge', 'Kontur / Tepi Path', '#10b981'], ['perp', 'Siku (90°) & Perpanjangan Garis', '#f59e0b'], ['grid', 'Garis Grid Adaptif (butuh Grid aktif)', '#6366f1'], ['pixel', 'Bulatkan ke Piksel (1 px)', '#71717a']];
const SNAP_TOOL_CAPABILITIES = {
  select: {
    bbox: true,
    spacing: true,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: false,
    grid: true,
    pixel: true
  },
  node: {
    bbox: true,
    spacing: false,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: true,
    grid: true,
    pixel: true
  },
  pen: {
    bbox: true,
    spacing: false,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: true,
    grid: true,
    pixel: true
  },
  shape: {
    bbox: true,
    spacing: true,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: false,
    grid: true,
    pixel: true
  },
  frame: {
    bbox: true,
    spacing: true,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: false,
    grid: true,
    pixel: true
  },
  addnode: {
    bbox: false,
    spacing: false,
    artboard: false,
    node: true,
    axial: false,
    midpoint: true,
    edge: true,
    perp: false,
    grid: true,
    pixel: false
  },
  addhandle: {
    bbox: true,
    spacing: false,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: false,
    grid: true,
    pixel: true
  },
  autohandle: {
    bbox: true,
    spacing: false,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: false,
    grid: true,
    pixel: true
  },
  corner: {
    bbox: true,
    spacing: false,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: true,
    grid: true,
    pixel: true
  },
  straighten: {
    bbox: true,
    spacing: false,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: true,
    grid: true,
    pixel: true
  },
  text: {
    bbox: true,
    spacing: true,
    artboard: true,
    node: true,
    axial: true,
    midpoint: true,
    edge: true,
    perp: false,
    grid: true,
    pixel: true
  }
};
/* Tombol Alignment: [mode, kunci TIPS, path ikon] */
/* Tombol Alignment: [mode, kunci TIPS, path ikon] */
const ALN_BTNS = [['left', 'veAlnLeft', 'M4 3v18 M8 7h12 M8 14h7'], ['hcenter', 'veAlnHC', 'M12 3v18 M5 7h14 M8 14h8'], ['right', 'veAlnRight', 'M20 3v18 M4 7h12 M9 14h7'], ['top', 'veAlnTop', 'M3 4h18 M7 8v12 M14 8v7'], ['vcenter', 'veAlnVC', 'M3 12h18 M7 5v14 M14 8v8'], ['bottom', 'veAlnBottom', 'M3 20h18 M7 4v12 M14 9v7'], ['distH', 'veAlnDistH', 'M4 4v16 M20 4v16 M9 8h6v8H9z'], ['distV', 'veAlnDistV', 'M4 4h16 M4 20h16 M8 9h8v6H8z']];
/* ===== Editor Gradien Tingkat Lanjut (v4.9) ===== */
/* Preset Gradien Kurasi (OKLab-ready) */
/* ===== Editor Gradien Tingkat Lanjut (v4.9) ===== */
/* Preset Gradien Kurasi (OKLab-ready) */
const GRAD_PRESETS = [['Indigo Sunset', [['#4f46e5', 0], ['#ec4899', 0.52], ['#f59e0b', 1]]], ['Emerald Ocean', [['#06b6d4', 0], ['#10b981', 0.5], ['#047857', 1]]], ['Cyber Violet', [['#0f172a', 0], ['#6d28d9', 0.5], ['#f43f5e', 1]]], ['Aurora Lime', [['#14b8a6', 0], ['#84cc16', 0.55], ['#fef08a', 1]]], ['Chrome Silver', [['#f8fafc', 0], ['#94a3b8', 0.48], ['#334155', 0.52], ['#e2e8f0', 1]]], ['Peach Flame', [['#fb7185', 0], ['#fb923c', 0.5], ['#fde047', 1]]]];

export { SHAPE_EN, VE_NODE_GROUP, VE_GEO_GROUP, VE_TOOLS, SHAPES, DEFAULT_SNAP_CFG, SNAP_OPTS, SNAP_OPTS_EN, SNAP_TOOL_CAPABILITIES, ALN_BTNS, GRAD_PRESETS };
