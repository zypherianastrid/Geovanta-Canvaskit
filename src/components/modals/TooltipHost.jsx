/**
 * @file src/components/modals/TooltipHost.jsx
 * @description Komponen host delegasi tooltip mengambang global (TipHost)
 */
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { usePresence } from '../../utils/presenceAndFilePicker.jsx';
import { TIPS, TIPS_EN } from '../../constants/tooltipsCatalog.jsx';
import { readLangPref } from '../../utils/themeAndPrefsManager.jsx';
import { clampN } from '../../utils/colorMath.jsx';
import { Keys } from '../ui/IconGlyphs.jsx';

const TipHost = () => {
  const [st, setSt] = useState({
      k: null,
      tx: null
    }),
    [pos, setPos] = useState(null),
    ref = useRef(null),
    last = useRef(null);
  if (st.k || st.tx) last.current = st;
  /* Bahasa tooltip mengikuti preferensi tab Pengaturan; kunci yang tidak
     ada di overlay English tetap memakai katalog Indonesia. */
  const lang = readLangPref(),
    en = lang === 'en',
    tipFor = k => (en && TIPS_EN[k]) || TIPS[k];
  const [m, lv] = usePresence(!!(st.k || st.tx), 140),
    d = last.current && (last.current.tx ? {
      t: last.current.tx
    } : tipFor(last.current.k));
  useEffect(() => {
    let timer = 0,
      grace = 0,
      life = 0,
      cur = null,
      sup = null,
      shown = false,
      kb = false,
      fm = false,
      mx = -1,
      my = -1,
      lastScrollT = 0;
    const find = t => {
      if (!t || !t.closest) return null;
      let el = t.closest('[data-tip], [data-tip-text]');
      while (el) {
        const k = el.getAttribute('data-tip');
        if (k && (TIPS[k] || TIPS_EN[k]) || el.getAttribute('data-tip-text')) return el;
        el = el.parentElement && el.parentElement.closest ? el.parentElement.closest('[data-tip], [data-tip-text]') : null;
      }
      return null;
    };
    /* hide: dipanggil dari SEMUA jalur penutup; selalu membersihkan timer, elemen aktif, dan mode fokus */
    const hide = () => {
      clearTimeout(timer);
      clearTimeout(life);
      timer = life = 0;
      cur = null;
      fm = false;
      setSt(s => s.k || s.tx ? {
        k: null,
        tx: null
      } : s);
      clearTimeout(grace);
      grace = setTimeout(() => {
        shown = false;
      }, 260);
    };
    const show = (el, now, byFocus) => {
      cur = el;
      fm = !!byFocus;
      clearTimeout(timer);
      clearTimeout(grace);
      clearTimeout(life);
      const k = el.getAttribute('data-tip'),
        tx = el.getAttribute('data-tip-text');
      if (!tx && !(TIPS[k] || TIPS_EN[k])) return;
      const go = () => {
        if (cur !== el || !el.isConnected) return;
        /* PERF: jangan munculkan tooltip di tengah scroll — saat scroll cepat,
           baris layer yang lewat di bawah kursor memicu pointerover beruntun
           dan tiap go() memaksa React render + baca layout (offsetWidth).
           Tunda sampai 250 ms setelah scroll terakhir berhenti. */
        if (performance.now() - lastScrollT < 250) {
          clearTimeout(timer);
          timer = setTimeout(go, 260);
          return;
        }
        shown = true;
        const as = innerWidth >= 1024 ? el.closest('aside') : null;
        setSt({
          k: tx ? null : k,
          tx: tx || null,
          r: el.getBoundingClientRect(),
          ar: as ? as.getBoundingClientRect() : null
        });
        clearTimeout(life);
        life = setTimeout(hide, 20000); /* jaring pengaman: tooltip tak pernah tertinggal lebih dari 20 detik */
      };

      if (shown || now) go();else timer = setTimeout(go, 420);
    };
    const inside = (el, x, y) => {
      if (!el || !el.isConnected) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1;
    };
    const over = e => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;
      kb = false;
      const el = find(e.target);
      if (!el) {
        if (cur) hide();
        return;
      }
      if (el === cur || el === sup) return;
      show(el);
    };
    const out = e => {
      const rt = e.relatedTarget;
      if (sup && !(rt && sup.contains(rt))) sup = null;
      if (cur && !(rt && cur.contains(rt))) hide();
    };
    /* pointermove: jika kursor tak lagi berada di elemen pemilik tooltip (pointerout tidak terkirim: tombol disabled, elemen berpindah/disembunyikan,
       pointer capture, dll.) -> tutup. Ini juga menutup tooltip hasil fokus begitu mouse digerakkan. */
    const move = e => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;
      if (cur && !(cur.contains(e.target) && inside(cur, mx, my))) hide();
    };
    const down = e => {
      kb = false;
      sup = find(e.target);
      if (cur || timer) hide();
    };
    /* focusin hanya memunculkan tooltip bila fokus datang dari KEYBOARD (Tab/panah); klik mouse pada input tidak lagi memunculkannya */
    const fin = e => {
      const el = find(e.target);
      if (kb && el && e.target.matches && e.target.matches(':focus-visible')) show(el, true, true);
    };
    const key = e => {
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        if (e.key === 'Tab') kb = true;
        return;
      }
      kb = true;
      if (cur || timer || fm) hide(); /* Esc, mengetik, atau pintasan apa pun menutup tooltip */
    };

    const any = () => {
      if (cur || timer) hide();
    };
    /* PERF: scroll/wheel dicatat waktunya agar go() bisa menunda tooltip
       sampai scroll benar-benar berhenti (lihat guard di go()). */
    const scrl = () => {
      lastScrollT = performance.now();
      any();
    };
    const vis = () => {
      if (document.hidden) any();
    };
    const root = document.documentElement;
    const iv = setInterval(() => {
      if (!cur) return;
      if (!cur.isConnected || cur.getClientRects().length === 0 || cur.disabled && !fm && !inside(cur, mx, my)) {
        hide();
        return;
      }
      if (!fm && mx >= 0 && !inside(cur, mx, my)) hide(); /* elemen bergeser/berganti di bawah kursor yang diam */
    }, 300);
    const L = (t, n, f, o) => t.addEventListener(n, f, o),
      R = (t, n, f, o) => t.removeEventListener(n, f, o);
    const evs = [[document, 'pointerover', over], [document, 'pointerout', out], [document, 'pointermove', move, true], [document, 'pointerdown', down, true], [document, 'focusin', fin], [document, 'focusout', any], [document, 'keydown', key, true], [document, 'scroll', scrl, true], [document, 'wheel', scrl, {
      passive: true,
      capture: true
    }], [document, 'contextmenu', any], [document, 'dragstart', any], [document, 'pointercancel', any], [document, 'touchstart', any, {
      passive: true
    }], [document, 'visibilitychange', vis], [root, 'pointerleave', any], [root, 'mouseleave', any], [window, 'blur', any], [window, 'resize', any]];
    evs.forEach(x => L(x[0], x[1], x[2], x[3]));
    return () => {
      clearInterval(iv);
      clearTimeout(timer);
      clearTimeout(grace);
      clearTimeout(life);
      evs.forEach(x => R(x[0], x[1], x[2], x[3]));
    };
  }, []);
  useLayoutEffect(() => {
    if (!m || !ref.current || !last.current) return;
    const {
        r,
        ar
      } = last.current,
      el = ref.current,
      w = el.offsetWidth,
      h = el.offsetHeight,
      G = 10;
    let left,
      top,
      side = 'bottom';
    if (ar && ar.right + G + w <= innerWidth - 8) {
      side = 'right';
      left = ar.right + G;
      top = clampN(r.top + r.height / 2 - h / 2, 8, Math.max(8, innerHeight - h - 8));
    } else {
      left = clampN(r.left + r.width / 2 - w / 2, 8, Math.max(8, innerWidth - w - 8));
      top = r.bottom + G;
      if (top + h > innerHeight - 8 && r.top - h - G > 8) {
        top = r.top - h - G;
        side = 'top';
      }
    }
    setPos({
      left,
      top,
      side
    });
  }, [m, st.k, st.tx, st.r]);
  if (!m || !d) return null;
  return ReactDOM.createPortal(<div ref={ref} className={'tt ' + (lv ? 'out' : 'in') + ' s-' + (pos ? pos.side : 'bottom')} style={{
    left: pos ? pos.left : 0,
    top: pos ? pos.top : 0,
    visibility: pos ? 'visible' : 'hidden'
  }}><div className="tt-t"><span>{d.t}</span>{d.k && <Keys s={d.k} />}</div>{d.d && <div className="tt-d">{d.d}</div>}{d.w && <div className="tt-r"><b>{en ? 'When to use' : 'Kapan dipakai'}</b>{d.w}</div>}{d.pk && d.pk.map(([n, x], i) => <div key={i} className="tt-r"><b>{en ? 'Choose ' + n + ' if' : 'Pilih ' + n + ' jika'}</b>{x}</div>)}{d.up && <div className="tt-r"><b>↑ {en ? 'Increase if' : 'Naikkan jika'}</b>{d.up}</div>}{d.dn && <div className="tt-r"><b>↓ {en ? 'Decrease if' : 'Turunkan jika'}</b>{d.dn}</div>}</div>, document.fullscreenElement || document.body);
};
/* ---------- Keyboard shortcut: tampilan tombol, panel bantuan ---------- */

export { TipHost };
export default TipHost;
