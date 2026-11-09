/**
 * @file src/components/ui/SegmentedControl.jsx
 * @description Komponen kontrol bersegmen animasi pil (Seg & GradChoice)
 */
import React from 'react';
import { Ico } from './IconGlyphs.jsx';

/* Segmented control dengan pil penanda yang bergeser halus */
const Seg = ({
  o,
  v,
  on,
  tip,
  tips,
  cls
}) => {
  const i = o.findIndex(x => x[0] === v);
  return <div className={'seg' + (cls ? ' ' + cls : '')} data-tip={tip || undefined}><div className="seg-p" style={{
      width: `calc((100% - 6px) / ${o.length})`,
      transform: `translateX(${Math.max(0, i) * 100}%)`,
      opacity: i < 0 ? 0 : 1
    }} />{o.map(([k, t, ic]) => <button key={k} data-tip={tips && tips[k] || undefined} className={v === k ? 'on' : ''} onClick={() => on(k)}>{ic && <Ico n={ic} size={cls && cls.includes('stk') ? 15 : 13} />}<span>{t}</span></button>)}</div>;
};
/* ---------- Tooltip kustom (delegasi event pada atribut data-tip) ---------- */

const GradChoice = ({
  value,
  options,
  on,
  cols,
  tip,
  tips
}) => <div className="gch" data-tip={tip} style={{
  gridTemplateColumns: `repeat(${cols || options.length}, minmax(0, 1fr))`
}}>{options.map(([k, label]) => <button key={k} type="button" data-tip={tips && tips[k]} className={value === k ? 'on' : ''} onClick={() => on(k)}>{label}</button>)}</div>;

export { Seg, GradChoice };
