/**
 * @file src/components/editor/SelectionRotationAndRedlines.jsx
 * @description Overlay lencana ukuran seleksi, sudut rotasi, & garis ukur jarak Alt-redline
 */
import React from 'react';

const SelectionRotationAndRedlines = ({
  zoom,
  measureBadge,
  altMeasure
}) => {
  return <g className="ved-figma-overlays" pointerEvents="none">{measureBadge && (() => {
      const txt = String(measureBadge.text || '');
      const padX = 6 / zoom,
        h = 18 / zoom;
      const w = Math.max(44, txt.length * 6.4 + 12) / zoom;
      const bx = measureBadge.x + 14 / zoom,
        by = measureBadge.y + 14 / zoom;
      return <g pointerEvents="none"><rect x={bx} y={by} width={w} height={h} rx={3 / zoom} fill="rgba(24, 24, 27, 0.88)" /><text x={bx + padX} y={by + 12.5 / zoom} fontSize={10.5 / zoom} fontWeight="600" fontFamily="ui-monospace, monospace" fill="#ffffff">{txt}</text></g>;
    })()}{altMeasure && altMeasure.lines && altMeasure.lines.length > 0 && <g pointerEvents="none">{altMeasure.targetBox && <rect x={altMeasure.targetBox[0]} y={altMeasure.targetBox[1]} width={altMeasure.targetBox[2] - altMeasure.targetBox[0]} height={altMeasure.targetBox[3] - altMeasure.targetBox[1]} fill="none" stroke="#f43f5e" strokeWidth={1.2 / zoom} strokeDasharray={3 / zoom + ' ' + 2 / zoom} />}{altMeasure.lines.map((ln, idx) => {
        const mx = (ln.x1 + ln.x2) / 2,
          my = (ln.y1 + ln.y2) / 2;
        const horiz = Math.abs(ln.y2 - ln.y1) < 1e-4,
          tick = 4.5 / zoom;
        return <g key={'red-' + idx} stroke="#f43f5e" strokeWidth={1.3 / zoom}><line x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} />{horiz ? <><line x1={ln.x1} y1={ln.y1 - tick} x2={ln.x1} y2={ln.y1 + tick} /><line x1={ln.x2} y1={ln.y2 - tick} x2={ln.x2} y2={ln.y2 + tick} /></> : <><line x1={ln.x1 - tick} y1={ln.y1} x2={ln.x1 + tick} y2={ln.y1} /><line x1={ln.x2 - tick} y1={ln.y2} x2={ln.x2 + tick} y2={ln.y2} /></>}{ln.aux && (ln.aux.x != null ? <line x1={ln.aux.x} y1={ln.aux.y1} x2={ln.aux.x} y2={ln.aux.y2} strokeDasharray={2.5 / zoom + ' ' + 2.5 / zoom} /> : <line x1={ln.aux.x1} y1={ln.aux.y} x2={ln.aux.x2} y2={ln.aux.y} strokeDasharray={2.5 / zoom + ' ' + 2.5 / zoom} />)}<rect x={mx - 16 / zoom} y={my - 8 / zoom} width={32 / zoom} height={16 / zoom} rx={4 / zoom} fill="#f43f5e" stroke="none" /><text x={mx} y={my + 3.4 / zoom} textAnchor="middle" fontSize={9.5 / zoom} fontWeight="700" fontFamily="ui-monospace, monospace" fill="#ffffff" stroke="none">{ln.label}</text></g>;
      })}</g>}</g>;
};

/* v7.4 — Anti-Seam Vector Renderer & Winding-Safe Path Compositing:
   1) CanvasObj: merender objek tunggal dengan subpixel seam-guard (paint-order: stroke fill, non-scaling-stroke)
      pada path isi penuh tanpa garis tepi agar batas antarpath beda warna tidak bocor warna background.
   2) CompositePathObj: menggabungkan beberapa path yang memiliki properti visual identik (fill/gradient/stroke)
      ke dalam satu komposit <path> (dengan normalisasi orientasi winding nonzero) sehingga browser merasterisasi
      bentuk-bentuk yang saling menempel dalam satu pass tanpa celah anti-aliasing (0% subpixel seam). */

export { SelectionRotationAndRedlines };
export default SelectionRotationAndRedlines;
