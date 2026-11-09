/**
 * @file src/components/ui/PinGridSelector.jsx
 * @description Komponen kisi pemilih titik poros transformasi 3x3 (PinGrid)
 */
import React from 'react';

/* Matriks 3×3 titik poros / perataan */
const PinGrid = ({
  value,
  on,
  tip,
  label,
  L
}) => {
  const lbl = label || (L ? L.riPinPoint : 'Titik poros');
  return <div className="pin3" role="group" aria-label={lbl} data-tip={tip}>{[0, 0.5, 1].map(uy => [0, 0.5, 1].map(ux => <button key={ux + '-' + uy} type="button" className={value[0] === ux && value[1] === uy ? 'on' : ''} aria-label={lbl + ' ' + ux + ',' + uy} data-tip-text={lbl + ' ' + ux + ',' + uy} aria-pressed={value[0] === ux && value[1] === uy} onClick={() => on([ux, uy])} />))}</div>;
};

/* Input angka kustom: tombol − / + , ketik langsung, panah atas/bawah */

export { PinGrid };
export default PinGrid;
