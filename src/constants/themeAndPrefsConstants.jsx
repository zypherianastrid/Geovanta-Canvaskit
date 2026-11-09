/**
 * @file src/constants/themeAndPrefsConstants.jsx
 * @description Konstanta preferensi tema, palet aksen, dan batas zoom
 */
/* ---------- Panel Pengaturan ---------- */
const LS_KEY = 'trace-svg-settings-v1';
const DEFAULT_PREFS = {
  theme: 'light',
  motion: 'system',
  tips: true,
  persist: true,
  gpu: true,
  accent: '#13b152',
  m3White: true,
  lang: 'id'
};
const ACCENT_PALETTE = [['#13b152', 'Geovanta'], ['#0d99ff', 'Figma Blue'], ['#6366f1', 'Indigo'], ['#8b5cf6', 'Violet'], ['#ec4899', 'Pink'], ['#f43f5e', 'Rose'], ['#f97316', 'Orange'], ['#f59e0b', 'Amber'], ['#84cc16', 'Lime'], ['#10b981', 'Emerald'], ['#14b8a6', 'Teal'], ['#06b6d4', 'Cyan'], ['#ef4444', 'Red'], ['#eab308', 'Yellow'], ['#22c55e', 'Green'], ['#0ea5e9', 'Sky'], ['#3b82f6', 'Blue'], ['#a855f7', 'Purple'], ['#d946ef', 'Fuchsia'], ['#dc2626', 'Crimson'], ['#ff6b6b', 'Coral'], ['#4f46e5', 'Royal'], ['#65a30d', 'Olive'], ['#b45309', 'Bronze'], ['#475569', 'Slate']];
const TECH = [{
  g: "Antarmuka",
  ic: "layers",
  items: [["React", "18.3.1", "atom", "Komponen dan state (build UMD produksi)."], ["htm", "3.1.1", "code", "Pustaka kecil bernama htm (bukan HTML) untuk menulis template ala JSX tanpa langkah build."], ["Tailwind CSS", "3.4.17", "wind", "Utility class lewat CDN."], ["SVG + CSS variables", "", "shapes", "Kanvas vektor serta tema terang/gelap."]]
}, {
  g: "API browser",
  ic: "settings",
  items: [["EyeDropper API", "", "pipette", "Pipet warna di seluruh layar, dengan cadangan pipet halaman."], ["Blob + Object URL", "", "download", "Ekspor SVG langsung dari browser, tanpa server."], ["DOMParser", "", "code", "Membaca dan mengimpor file SVG menjadi objek yang bisa diedit."], ["localStorage", "", "database", "Menyimpan preferensi dan posisi dock."]]
}];
const VZMIN = 0.0005,
  VZMAX = 5000,
  VZ_LOG_SPAN = Math.log(VZMAX / VZMIN);

export { LS_KEY, DEFAULT_PREFS, ACCENT_PALETTE, TECH, VZMIN, VZMAX, VZ_LOG_SPAN };
