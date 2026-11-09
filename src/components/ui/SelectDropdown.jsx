/**
 * @file src/components/ui/SelectDropdown.jsx
 * @description Komponen menu pilihan (Select Dropdown) kustom berbasis FloatPopover
 */
import React, { useRef, useState } from 'react';
import { clampN } from '../../utils/colorMath.jsx';
import { Ico, Chev } from './IconGlyphs.jsx';
import { Float } from './FloatPopover.jsx';

/* Dropdown kustom (pengganti <select>) */
const Select = ({
  value,
  options,
  on,
  tip
}) => {
  const btn = useRef(null),
    [open, setOpen] = useState(false),
    [hi, setHi] = useState(0),
    idx = options.findIndex(o => o[0] === value),
    cur = options[idx] || options[0];
  const toggle = () => {
    setHi(Math.max(0, idx));
    setOpen(o => !o);
  };
  const choose = k => {
    on(k);
    setOpen(false);
    btn.current && btn.current.focus();
  };
  const key = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return toggle();
      setHi(h => clampN(h + (e.key === 'ArrowDown' ? 1 : -1), 0, options.length - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open ? choose(options[hi][0]) : toggle();
    } else if (e.key === 'Escape') setOpen(false);
  };
  return <div><button ref={btn} type="button" data-tip={tip} className={'fld sel' + (open ? ' open' : '')} onClick={toggle} onKeyDown={key} aria-haspopup="listbox" aria-expanded={open}><span className="sel-l">{cur[2] && <Ico n={cur[2]} size={14} />}<span>{cur[1]}</span></span><Chev open={open} /></button><Float anchor={btn} open={open} onClose={() => setOpen(false)}>{options.map(([k, t, ic], i) => <div key={k} role="option" aria-selected={k === value} className={'opt' + (i === hi ? ' hi' : '') + (k === value ? ' on' : '')} onMouseEnter={() => setHi(i)} onClick={() => choose(k)}><span className="sel-l">{ic && <Ico n={ic} size={14} />}<span>{t}</span></span><svg className="ck" style={{
          opacity: k === value ? 1 : 0
        }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></div>)}</Float></div>;
};

/* CustomTextBox: kontrol input teks & angka modern 100% kustom tanpa elemen input native */

export { Select };
export default Select;
