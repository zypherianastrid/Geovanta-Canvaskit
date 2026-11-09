/**
 * @file src/components/ui/IconGlyphs.jsx
 * @description Komponen perender ikon SVG (Ico, Chev, Vi, ShapeGlyph, IconBtn, Keys)
 */
import React from 'react';
import { ICONS } from '../../constants/brandAndIcons.jsx';
import { SHAPES } from '../../constants/editorToolsAndShapes.jsx';
import { TIPS, TIPS_EN } from '../../constants/tooltipsCatalog.jsx';

const Ico = ({
  n,
  size = 14
}) => {
  const d = ICONS[n];
  if (!d) return null;
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
};
const Chev = ({
  open
}) => <svg className="chev" style={{
  transform: open ? 'rotate(180deg)' : 'none'
}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;

/* Slider kustom: track + thumb, pointer drag, klik-lompat halus, keyboard (panah, PageUp/Down, Home/End) */

/* ---------- Keyboard shortcut: tampilan tombol, panel bantuan ---------- */
const Keys = ({
  s
}) => <span className="keys">{s.split(' | ').map((c, i) => <span key={i} className="keyc">{i > 0 && <i>/</i>}{c.split(' + ').map((k, j) => <kbd key={j} className="kbd">{k}</kbd>)}</span>)}</span>;
const ShapeGlyph = ({
  k,
  s = 24
}) => {
  const S = SHAPES.find(q => q[0] === k) || SHAPES[0];
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={S[2](3, 3, 18, 18)} fill="none" fillRule={S[3] ? 'evenodd' : 'nonzero'} /></svg>;
};
const Vi = ({
  d,
  s = 16
}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const IconBtn = ({
  on,
  tip,
  d,
  s = 14,
  dis,
  act,
  lang
}) => <button type="button" className={'tool-btn' + (on ? ' on' : '')} disabled={dis} data-tip={tip} aria-label={(lang === 'en' ? TIPS_EN : TIPS)[tip] ? (lang === 'en' ? TIPS_EN : TIPS)[tip].t : undefined} onClick={act}><Vi d={d} s={s} /></button>;

export { Ico, Chev, Keys, ShapeGlyph, Vi, IconBtn };
