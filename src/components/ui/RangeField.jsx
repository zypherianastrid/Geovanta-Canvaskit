/**
 * @file src/components/ui/RangeField.jsx
 * @description Komponen baris kontrol slider berlabel nilai (Range)
 */
import React, { useState } from 'react';
import { Slider } from './Slider.jsx';
import { CustomTextBox } from './CustomTextBox.jsx';
import { clampN } from '../../utils/colorMath.jsx';

const Range = ({
  l,
  v,
  min,
  max,
  step = 1,
  on,
  f = x => x,
  tip
}) => {
  const [editingVal, setEditingVal] = useState(false);
  const commitDirect = raw => {
    setEditingVal(false);
    const num = parseFloat(String(raw ?? '').replace(',', '.').replace(/[^0-9.\-+]/g, ''));
    if (Number.isFinite(num)) {
      on(clampN(+(Math.round((num - min) / step) * step + min).toFixed(6), min, max));
    }
  };
  const startLabelScrub = e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX,
      v0 = Number(v) || 0,
      span = Math.max(1e-6, max - min);
    const mv = ev => {
      const dx = ev.clientX - sx;
      const mult = ev.shiftKey ? 4 : ev.altKey ? 0.2 : 1;
      const rawNext = v0 + dx / 140 * span * mult;
      const snapped = clampN(+(Math.round((rawNext - min) / step) * step + min).toFixed(6), min, max);
      on(snapped);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return <div className="block" data-tip={tip}><div className="flex items-center justify-between gap-1.5 text-xs mb-1.5 min-w-0"><span className="mut truncate min-w-0" style={{
      cursor: 'var(--cur-ew)'
    }} data-tip="veRangeScrub" onPointerDown={startLabelScrub}>{l}</span>{editingVal ? <div className="fld px-1.5 py-0.5" style={{
      width: 68,
      height: 22
    }}><CustomTextBox autoFocus={true} selectOnFocus={true} value={String(Math.round((Number(v) || 0) * 1000) / 1000)} ariaLabel={l} filterRe={/[^0-9.,-]/g} onCommit={commitDirect} onCancel={() => setEditingVal(false)} onBump={(d, ev) => {
        const mult = ev && ev.shiftKey ? 10 : 1;
        on(clampN(+((Number(v) || 0) + d * step * mult).toFixed(6), min, max));
      }} /></div> : <button type="button" className="font-medium tabular-nums whitespace-nowrap flex-none px-1.5 py-0.5 rounded hover:bg-[var(--sub)]" style={{
      border: 0,
      background: 'transparent',
      color: 'var(--ink)'
    }} data-tip="veRangeType" onClick={() => setEditingVal(true)}>{f(v)}</button>}</div><Slider min={min} max={max} step={step} value={v} on={on} label={l} /></div>;
};
/* Segmented control dengan pil penanda yang bergeser halus */

export { Range };
export default Range;
