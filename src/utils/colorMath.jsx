/**
 * @file src/utils/colorMath.jsx
 * @description Konversi ruang warna sRGB, OKLab, dan HSV
 */
/* Linearisasi sRGB untuk konversi ke OKLab */
const lin = v => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
function rgb2ok(r, g, b) {
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const ok2hex = (L, a, b) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const e = v => {
    v = Math.max(0, Math.min(1, v));
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return '#' + e(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) + e(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) + e(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
};
/* profil 1D (u in [0,1]) -> daftar stop via 32 bin + RDP warna; kembalikan {st:[{u,c}], rmse} */
/* profil 1D (u in [0,1]) -> daftar stop via 32 bin + RDP warna; kembalikan {st:[{u,c}], rmse} */
const hex2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
const toHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
const hsv2hex = (h, s, v) => {
  const f = n => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex(f(5) * 255, f(3) * 255, f(1) * 255);
};
const hex2hsv = hx => {
  const r = parseInt(hx.slice(1, 3), 16) / 255,
    g = parseInt(hx.slice(3, 5), 16) / 255,
    b = parseInt(hx.slice(5, 7), 16) / 255,
    mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) {
    h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, mx ? d / mx : 0, mx];
};
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

export { lin, rgb2ok, ok2hex, hex2, toHex, hsv2hex, hex2hsv, clampN };
