/**
 * @file src/constants/fontCatalog.jsx
 * @description Daftar font bawaan dan bobot tipografi
 */
/* ============================================================================
   PHASE 4 — GOOGLE FONTS URL MANAGER & PERSISTENT STORAGE
   - Validasi URL Google Fonts (css / css2)
   - Injeksi <link rel="stylesheet"> dinamis ke <head>
   - Parsing nama font family & daftar weight (100..900) dari URL
   - Penyimpanan persisten di localStorage & IndexedDB (WorkspaceDB metadata)
   - Reload otomatis saat editor dibuka & hapus manual tanpa menghapus objek teks
   ============================================================================ */
const ALL_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const BUILTIN_FONTS = [{
  id: 'builtin-inter',
  name: 'Inter',
  family: 'Inter, system-ui, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-jakarta',
  name: 'Plus Jakarta Sans',
  family: '"Plus Jakarta Sans", sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-roboto',
  name: 'Roboto',
  family: 'Roboto, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-poppins',
  name: 'Poppins',
  family: 'Poppins, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-montserrat',
  name: 'Montserrat',
  family: 'Montserrat, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-playfair',
  name: 'Playfair Display',
  family: '"Playfair Display", serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-merriweather',
  name: 'Merriweather',
  family: 'Merriweather, serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-lora',
  name: 'Lora',
  family: 'Lora, serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-oswald',
  name: 'Oswald',
  family: 'Oswald, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-bebas',
  name: 'Bebas Neue',
  family: '"Bebas Neue", sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-dancing',
  name: 'Dancing Script',
  family: '"Dancing Script", cursive',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-pacifico',
  name: 'Pacifico',
  family: 'Pacifico, cursive',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-Arial',
  name: 'Arial',
  family: 'Arial, Helvetica, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-georgia',
  name: 'Georgia',
  family: 'Georgia, serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-times',
  name: 'Times New Roman',
  family: '"Times New Roman", Times, serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-verdana',
  name: 'Verdana',
  family: 'Verdana, Geneva, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-trebuchet',
  name: 'Trebuchet MS',
  family: '"Trebuchet MS", sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-impact',
  name: 'Impact',
  family: 'Impact, Charcoal, sans-serif',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-courier',
  name: 'Courier New',
  family: '"Courier New", Courier, monospace',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}, {
  id: 'builtin-jetbrains',
  name: 'JetBrains Mono',
  family: '"JetBrains Mono", monospace',
  weights: ALL_FONT_WEIGHTS,
  builtin: true
}];
const FONT_WEIGHT_LABELS = {
  100: '100 — Thin',
  200: '200 — Extra Light',
  300: '300 — Light',
  400: '400 — Regular',
  500: '500 — Medium',
  600: '600 — Semi Bold',
  700: '700 — Bold',
  800: '800 — Extra Bold',
  900: '900 — Black'
};

export { ALL_FONT_WEIGHTS, BUILTIN_FONTS, FONT_WEIGHT_LABELS };
