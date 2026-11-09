/**
 * @file src/components/ui/FloatPopover.jsx
 * @description Komponen panel melayang (Popover) dengan penyesuaian posisi viewport otomatis
 */
import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { usePresence } from '../../utils/presenceAndFilePicker.jsx';
import { clampN } from '../../utils/colorMath.jsx';

/* Panel mengambang (portal) + animasi masuk/keluar, posisi otomatis (flip ke atas), tutup via klik luar / Esc */
const Float = ({
  anchor,
  open,
  onClose,
  w,
  cls = '',
  preferUp = false,
  children
}) => {
  const [m, lv] = usePresence(open),
    [pos, setPos] = useState(null),
    ref = useRef(null);
  useLayoutEffect(() => {
    if (!open || !m) return;
    const place = () => {
      const btnEl = anchor.current,
        el = ref.current;
      if (!btnEl || !el) return;
      const a = btnEl.getBoundingClientRect();
      const W = w || a.width,
        h = el.offsetHeight || 220;
      const inBottomBar = !!(btnEl.closest && btnEl.closest('.fig-floating-bar'));
      const spaceBelow = window.innerHeight - a.bottom - 12;
      const spaceAbove = a.top - 12;

      /* Buka ke atas jika di floating bar bawah, preferUp aktif, atau ruang bawah sempit */
      let up = preferUp || inBottomBar || spaceBelow < h && spaceAbove > spaceBelow;
      let top = up ? a.top - h - 10 : a.bottom + 8;

      /* Jaring pengaman agar tidak pernah keluar dari batas atas/bawah viewport */
      top = clampN(top, 8, Math.max(8, window.innerHeight - h - 8));
      /* Pusatkan horizontal terhadap tombol bila di floating bar, lalu kunci di dalam layar */
      const rawLeft = inBottomBar ? a.left + a.width / 2 - W / 2 : a.left;
      const left = clampN(rawLeft, 8, Math.max(8, window.innerWidth - W - 8));
      setPos({
        left,
        top,
        up,
        W
      });
    };
    place();
    const raf = requestAnimationFrame(place);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, m, w, preferUp]);
  useEffect(() => {
    if (!open) return;
    const dn = e => {
      const t = e.target;
      if (ref.current && ref.current.contains(t) || anchor.current && anchor.current.contains(t)) return;
      onClose();
    };
    const kd = e => {
      if (e.key === 'Escape') onClose();
    };
    /* Capture phase: klik di dalam .fig-floating-bar dihentikan propagasinya
       (onPointerDown stopPropagation) sehingga listener bubble di document
       tidak pernah menerima klik tombol Pengaturan — dropdown harus tetap
       tertutup saat Pengaturan diklik. Capture jalan sebelum fase bubble. */
    document.addEventListener('pointerdown', dn, true);
    document.addEventListener('keydown', kd);
    return () => {
      document.removeEventListener('pointerdown', dn, true);
      document.removeEventListener('keydown', kd);
    };
  }, [open]);
  if (!m) return null;
  return ReactDOM.createPortal(<div ref={ref} className={'flt ' + cls + (lv ? ' out' : ' in') + (pos && pos.up ? ' up' : '')} style={{
    left: pos ? pos.left : 0,
    top: pos ? pos.top : 0,
    width: pos ? pos.W : undefined,
    visibility: pos ? 'visible' : 'hidden'
  }}>{children}</div>, document.fullscreenElement || document.body);
};

/* Dropdown kustom (pengganti <select>) */

export { Float };
export default Float;
