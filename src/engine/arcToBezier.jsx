/**
 * @file src/engine/arcToBezier.jsx
 * @description Konversi busur elips SVG (A/a) menjadi segmen kurva Bézier kubik
 */
import { NUM, isFiniteCoord } from './vectorPrimitives.jsx';

/* ---- arc -> cubic bezier ---- */
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry || x1 === x2 && y1 === y2) return null;
  const phi = phiDeg * Math.PI / 180,
    c = Math.cos(phi),
    s = Math.sin(phi);
  const dx = (x1 - x2) / 2,
    dy = (y1 - y2) / 2,
    xp = c * dx + s * dy,
    yp = -s * dx + c * dy;
  const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
  if (lam > 1) {
    const q = Math.sqrt(lam);
    rx *= q;
    ry *= q;
  }
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let co = Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / (den || 1)));
  if (!!fa === !!fs) co = -co;
  const cxp = co * rx * yp / ry,
    cyp = -co * ry * xp / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2,
    cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const th1 = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx);
  const ux = (xp - cxp) / rx,
    uy = (yp - cyp) / ry,
    vx = (-xp - cxp) / rx,
    vy = (-yp - cyp) / ry;
  let dth = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!fs && dth > 0) dth -= 2 * Math.PI;else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)),
    dl = dth / n,
    t = 4 / 3 * Math.tan(dl / 4);
  const pt = a => [cx + rx * Math.cos(a) * c - ry * Math.sin(a) * s, cy + rx * Math.cos(a) * s + ry * Math.sin(a) * c];
  const dv = a => [-rx * Math.sin(a) * c - ry * Math.cos(a) * s, -rx * Math.sin(a) * s + ry * Math.cos(a) * c];
  const out = [];
  let a = th1;
  for (let i = 0; i < n; i++) {
    const b = a + dl,
      p0 = pt(a),
      d0 = dv(a),
      p1 = i === n - 1 ? [x2, y2] : pt(b),
      d1 = dv(b);
    out.push([p0[0] + t * d0[0], p0[1] + t * d0[1], p1[0] - t * d1[0], p1[1] - t * d1[1], p1[0], p1[1]]);
    a = b;
  }
  return out;
}
function arcArgs(str, warnCb) {
  const rn = new RegExp('\\s*,?\\s*(' + NUM + ')', 'y'),
    rf = /\s*,?\s*([01])/y;
  let pos = 0;
  const out = [];
  const rdr = r => {
    r.lastIndex = pos;
    const m = r.exec(str);
    if (!m) return null;
    pos = r.lastIndex;
    return +m[1];
  };
  for (;;) {
    while (pos < str.length && /[\s,]/.test(str[pos])) pos++;
    if (pos >= str.length) break;
    const v = [];
    for (const k of 'nnnffnn') {
      const t = rdr(k === 'f' ? rf : rn);
      if (t === null || !isFiniteCoord(t)) {
        if (warnCb) warnCb('path', null, 'invalid-arc-args');
        return out;
      }
      v.push(t);
    }
    out.push(v);
  }
  return out;
}

/* ---- parse path -> subpath[] (with GV-A11 strict grammar & finite coordinate validation) ---- */

export { arcToCubics, arcArgs };
