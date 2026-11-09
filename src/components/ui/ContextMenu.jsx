/**
 * @file src/components/ui/ContextMenu.jsx
 * @description Komponen menu konteks klik kanan bergaya gelap modern (CtxMenu)
 */
import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { usePresence } from '../../utils/presenceAndFilePicker.jsx';
import { clampN } from '../../utils/colorMath.jsx';
import { Vi } from './IconGlyphs.jsx';

const CtxMenu = ({
  menu,
  items,
  onClose
}) => {
  const [m, lv] = usePresence(!!menu, 140),
    last = useRef(menu),
    ref = useRef(null),
    [pos, setPos] = useState(null),
    [hi, setHi] = useState(-1);
  if (menu) last.current = menu;
  const L = last.current;
  useLayoutEffect(() => {
    if (!m || !L || !ref.current) return;
    const el = ref.current,
      w = el.offsetWidth,
      h = el.offsetHeight,
      left = clampN(L.x, 8, Math.max(8, innerWidth - w - 8)),
      flip = L.y + h > innerHeight - 8,
      top = flip ? Math.max(8, L.y - h) : L.y;
    setPos({
      left,
      top,
      ox: L.x - left,
      oy: flip ? Math.min(h, L.y - top) : 0
    });
  }, [m, L && L.x, L && L.y]);
  useEffect(() => {
    if (!m) setPos(null);
  }, [m]);
  useEffect(() => {
    if (menu) setHi(-1);
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const dn = e => {
      if (ref.current && ref.current.contains(e.target)) return;
      onClose();
    };
    const kd = e => {
      const en = [];
      items.forEach((it, i) => {
        if (!it.sep && !it.dis) en.push(i);
      });
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && en.length) {
        e.preventDefault();
        e.stopPropagation();
        const p = en.indexOf(hi);
        setHi(e.key === 'ArrowDown' ? en[(p + 1) % en.length] : en[(p <= 0 ? en.length : p) - 1]);
      } else if ((e.key === 'Enter' || e.key === ' ') && hi >= 0 && items[hi] && !items[hi].sep && !items[hi].dis) {
        e.preventDefault();
        e.stopPropagation();
        const it = items[hi];
        it.act();
        onClose();
      }
    };
    const cl = () => onClose();
    document.addEventListener('pointerdown', dn, true);
    document.addEventListener('keydown', kd, true);
    addEventListener('wheel', cl, {
      passive: true,
      capture: true
    });
    addEventListener('resize', cl);
    addEventListener('blur', cl);
    return () => {
      document.removeEventListener('pointerdown', dn, true);
      document.removeEventListener('keydown', kd, true);
      removeEventListener('wheel', cl, true);
      removeEventListener('resize', cl);
      removeEventListener('blur', cl);
    };
  });
  if (!m || !L) return null;
  return ReactDOM.createPortal(<div ref={ref} role="menu" className={'ctx ' + (lv ? 'out' : 'in')} onContextMenu={e => e.preventDefault()} style={{
    left: pos ? pos.left : 0,
    top: pos ? pos.top : 0,
    visibility: pos ? 'visible' : 'hidden',
    '--ox': (pos ? pos.ox : 0) + 'px',
    '--oy': (pos ? pos.oy : 0) + 'px'
  }}>{items.map((it, i) => it.sep ? <div key={'s' + i} className="ctx-s" /> : <button key={it.k} type="button" role="menuitem" data-tip={it.tip || undefined} disabled={it.dis} className={'ctx-i' + (hi === i ? ' hi' : '')} style={{
      '--i': i
    }} onMouseEnter={() => setHi(i)} onClick={() => {
      it.act();
      onClose();
    }}><Vi d={it.ic} s={15} /><span className="lb">{it.label}</span>{it.kbd && <span className="ctx-k">{it.kbd}</span>}</button>)}</div>, document.body);
};

/* Daftar opsi Snap (Custom Checklist) + warna penanda + matriks kapabilitas per alat (SN-006) */

export { CtxMenu };
export default CtxMenu;
