/**
 * @file src/components/ui/TransformField.jsx
 * @description Komponen input angka transformasi dengan label scrubbable & tombol stepper (XfField)
 */
import React, { useState } from 'react';
import { CustomTextBox } from './CustomTextBox.jsx';

/* Input angka kustom (scrubbable label + stepper ▲/▼ + ketik langsung tanpa elemen input native) */
const evalNumericExpr = (raw, fallbackVal) => {
  const clean = String(raw ?? '').replace(/,/g, '.').trim();
  if (!clean) return fallbackVal;
  const direct = Number(clean);
  if (Number.isFinite(direct)) return direct;
  if (/^[0-9.+\-*/()\s]+$/.test(clean)) {
    try {
      const tokens = clean.match(/(\d+\.?\d*|\.\d+|[+\-*/()])/g);
      if (tokens && tokens.join('') === clean.replace(/\s+/g, '')) {
        let pos = 0;
        const parseExpr = () => {
          let v = parseTerm();
          while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
            const op = tokens[pos++];
            const r = parseTerm();
            v = op === '+' ? v + r : v - r;
          }
          return v;
        };
        const parseTerm = () => {
          let v = parseFactor();
          while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
            const op = tokens[pos++];
            const r = parseFactor();
            v = op === '*' ? v * r : r !== 0 ? v / r : v;
          }
          return v;
        };
        const parseFactor = () => {
          if (tokens[pos] === '+' || tokens[pos] === '-') {
            const s = tokens[pos++] === '-' ? -1 : 1;
            return s * parseFactor();
          }
          if (tokens[pos] === '(') {
            pos++;
            const v = parseExpr();
            if (tokens[pos] === ')') pos++;
            return v;
          }
          return parseFloat(tokens[pos++] || '0');
        };
        const res = parseExpr();
        if (Number.isFinite(res)) return res;
      }
    } catch (e) {}
  }
  return parseFloat(clean);
};
const XfField = ({
  label,
  value,
  on,
  dis,
  tip,
  step = 1,
  min = -1e7
}) => {
  const [ed, setEd] = useState(false);
  const valRef = React.useRef(value);
  valRef.current = value;
  const fmt = v => v == null || isNaN(v) ? '' : String(Math.round(v * 100) / 100);
  const commit = s => {
    setEd(false);
    const n = evalNumericExpr(s, value);
    if (!isNaN(n) && isFinite(n)) {
      const clamped = Math.max(min, Math.round(n * 100) / 100);
      if (clamped !== Math.round((value || 0) * 100) / 100) on(clamped);
    }
  };
  const bump = (d, e) => {
    if (dis) return;
    const mult = e && e.shiftKey ? 10 : e && e.altKey ? 0.1 : 1;
    const cur = Number(valRef.current) || 0;
    const n = Math.max(min, Math.round((cur + d * step * mult) * 100) / 100);
    valRef.current = n;
    on(n);
  };
  const startStepHold = (d, e) => {
    if (dis || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    bump(d, e);
    let iv = 0;
    const tm = setTimeout(() => {
      iv = setInterval(() => bump(d, e), 55);
    }, 280);
    const stop = () => {
      clearTimeout(tm);
      if (iv) clearInterval(iv);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  const startScrub = e => {
    if (dis || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX,
      v0 = Number(valRef.current) || 0;
    const mv = ev => {
      const dx = ev.clientX - startX;
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      const next = Math.max(min, Math.round((v0 + Math.round(dx / 2) * step * mult) * 100) / 100);
      valRef.current = next;
      on(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const onWheel = e => {
    if (dis || !ed && !e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY < 0 ? 1 : -1;
    bump(dir, e);
  };
  return <div className={'fld xf' + (dis ? ' dis' : '') + (ed ? ' ed' : '')} data-tip={tip} onWheel={onWheel}><span className="xf-l" onPointerDown={startScrub}>{label}</span><CustomTextBox value={fmt(value)} dis={dis} ariaLabel={label} filterRe={/[^0-9.,+\-*/()\s]/g} onChange={() => setEd(true)} onCommit={commit} onCancel={() => setEd(false)} onBump={bump} />{!dis && <div className="xf-step"><button type="button" className="xf-sb" tabIndex={-1} aria-label={'Naikkan ' + label} data-tip-text={'Naikkan ' + label} onPointerDown={e => startStepHold(1, e)} onClick={e => {
        e.stopPropagation();
        if (e.detail === 0) bump(1, e);
      }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m18 15-6-6-6 6" /></svg></button><button type="button" className="xf-sb" tabIndex={-1} aria-label={'Turunkan ' + label} data-tip-text={'Turunkan ' + label} onPointerDown={e => startStepHold(-1, e)} onClick={e => {
        e.stopPropagation();
        if (e.detail === 0) bump(-1, e);
      }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m6 9 6 6 6-6" /></svg></button></div>}</div>;
};
/* Matriks 3×3 titik poros / perataan */

export { XfField };
export default XfField;
