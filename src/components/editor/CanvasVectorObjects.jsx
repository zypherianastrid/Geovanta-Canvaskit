/**
 * @file src/components/editor/CanvasVectorObjects.jsx
 * @description Komponen memoized perender elemen SVG kanvas & pratinjau ikon layer (LayerSvgPreview, CanvasObj, CompositePathObj)
 */
import React from 'react';
import { vinfo, isOpaquePaint, SEAM_STROKE_PX } from '../../renderer/pathWindingAndBatching.jsx';
import { Ico } from '../ui/IconGlyphs.jsx';
import { VE } from '../../engine/vectorEngine.jsx';
import { RENDER_CONFIG } from '../../utils/renderConfigAndTelemetry.jsx';

/* ============================================================================
   PHASE 3 — LAYER PANEL: LIVE SVG SHAPE PREVIEW
   - Menampilkan bentuk miniatur nyata dari objek SVG di setiap baris Layer
   - Menggunakan cache vinfo(o) (WeakMap) & React.memo agar tetap 60fps
   - Mendukung Path, Circle, Rect, Star, Polygon, Image, dan Text
   ============================================================================ */
const LAYER_PREVIEW_JSX_CACHE = new WeakMap();
const LayerSvgPreview = React.memo(({
  o,
  /* SCROLLFIX: true selama scroll layer aktif — dicek SEBELUM cache, supaya
     baris yang masuk kembali ke window saat scroll juga mount ikon generik
     (bukan preview penuh dari cache). Prop ini juga yang menginvalidasi memo
     saat settle, jadi preview penuh benar-benar kembali setelah scroll
     berhenti (sebelumnya: memo bail-out membuat ikon generik menempel
     permanen pada baris yang ke-mount saat fast-scroll). */
  fastScroll
}) => {
  if (!o) return null;
  if (fastScroll) return <Ico n="shapes" size={15} />;
  const cachedEl = LAYER_PREVIEW_JSX_CACHE.get(o);
  if (cachedEl !== undefined) return cachedEl;
  if (o.img) {
    const el = <svg width="16" height="16" viewBox="0 0 16 16" className="block flex-none" style={{
      borderRadius: 3,
      overflow: 'hidden',
      background: 'var(--sub)'
    }}><image href={o.img.href} x="1" y="1" width="14" height="14" preserveAspectRatio="xMidYMid slice" /></svg>;
    LAYER_PREVIEW_JSX_CACHE.set(o, el);
    return el;
  }
  if (o.text) {
    const t = o.text;
    const raw = (t.content || 'T').trim().slice(0, 2) || 'T';
    const fillCol = !o.fill || o.fill === 'none' || o.fill === 'transparent' ? 'currentColor' : o.fill;
    const el = <svg width="16" height="16" viewBox="0 0 24 24" className="block flex-none" style={{
      overflow: 'visible'
    }}><text x="12" y="17.5" textAnchor="middle" fontFamily={t.fontFamily || 'Inter, sans-serif'} fontWeight={t.fontWeight || 700} fontStyle={t.fontStyle || 'normal'} fontSize="14.5" fill={fillCol} opacity={Math.max(0.35, o.opacity ?? 1)}>{raw}</text></svg>;
    LAYER_PREVIEW_JSX_CACHE.set(o, el);
    return el;
  }
  const info = vinfo(o);
  const bb = info && info.bb;
  if (!bb || info.n > 120 || !isFinite(bb[0]) || bb[2] < bb[0] || bb[3] < bb[1]) {
    const fallbackEl = <Ico n="shapes" size={15} />;
    LAYER_PREVIEW_JSX_CACHE.set(o, fallbackEl);
    return fallbackEl;
  }
  const bw = Math.max(1e-3, bb[2] - bb[0]);
  const bh = Math.max(1e-3, bb[3] - bb[1]);
  const maxDim = Math.max(bw, bh);
  const pad = maxDim * 0.14;
  const cx = (bb[0] + bb[2]) * 0.5;
  const cy = (bb[1] + bb[3]) * 0.5;
  const vbSize = maxDim + pad * 2;
  const vx = cx - vbSize * 0.5;
  const vy = cy - vbSize * 0.5;
  const hasFill = o.fill && o.fill !== 'none' && o.fill !== 'transparent';
  const hasStroke = o.stroke && o.stroke !== 'none' && o.stroke !== 'transparent' && (o.strokeWidth || 0) > 0;
  const fillCol = hasFill ? o.fill : 'none';
  const strokeCol = hasStroke ? o.stroke : !hasFill ? 'currentColor' : 'none';
  const sw = hasStroke ? Math.min(2.2, Math.max(1.1, o.strokeWidth ? 1.35 : 1.2)) : !hasFill ? 1.4 : 0;
  const swVb = sw > 0 ? sw * (vbSize / 16) : 0;
  const el = <svg width="16" height="16" viewBox={`${vx} ${vy} ${vbSize} ${vbSize}`} className="block flex-none" style={{
    overflow: 'visible'
  }}><path d={info.d} fill={fillCol} fillRule={o.fillRule || 'nonzero'} stroke={strokeCol} strokeWidth={swVb} strokeLinejoin={o.strokeLinejoin || 'round'} strokeLinecap={o.strokeLinecap || 'round'} opacity={Math.max(0.35, o.opacity ?? 1)} /></svg>;
  LAYER_PREVIEW_JSX_CACHE.set(o, el);
  return el;
}, (prev, next) => prev.o === next.o && prev.fastScroll === next.fastScroll);
const CanvasObj = React.memo(({
  o,
  clipAttr,
  seamGuardOn
}) => {
  const effOpacity = (o.opacity ?? 1) * (o.groupOpacity ?? 1);
  if (o.img) {
    const imTf = (m => m ? 'matrix(' + m.join(' ') + ')' : undefined)(VE.imageMatrix(o));
    return <image data-drag-id={o.id} data-base-tf={imTf} clipPath={clipAttr} href={o.img.href} width={o.img.w} height={o.img.h} preserveAspectRatio={o.img.par || 'xMidYMid meet'} transform={imTf} opacity={effOpacity} style={{
      imageRendering: 'auto'
    }} />;
  }
  const fillAttr = VE.gradOn(o) ? 'url(#vgr-' + o.id + ')' : o.fill;
  const strokeAttr = VE.strokeGradOn(o) ? 'url(#vsgr-' + o.id + ')' : o.stroke;
  if (o.text) {
    const t = o.text;
    const m = VE.textMatrix(o);
    const baseTf = m ? 'matrix(' + m.join(' ') + ')' : undefined;
    const mb = VE.measureTextBox(t);
    const lines = mb.lines;
    const fs = Math.max(1, Number(t.fontSize) || 32);
    const lh = Math.max(0.5, Number(t.lineHeight) || 1.2);
    const bShift = Number(t.baselineShift) || 0;
    const hasExplicitStroke = o.stroke !== 'none' && o.strokeWidth > 0;
    const effClip = clipAttr || (o.clipPathD ? 'url(#vcp-obj-' + o.id + ')' : undefined);
    const dec = t.textDecoration || 'none';
    const lsPx = (Number(t.letterSpacing) || 0) + 'px';
    const wsPx = (Number(t.wordSpacing) || 0) + 'px';
    const fStyle = t.fontStyle === 'oblique' ? 'italic' : t.fontStyle || 'normal';
    const textStyleObj = {
      fontFamily: t.fontFamily || 'Inter, system-ui, sans-serif',
      fontSize: fs + 'px',
      fontWeight: t.fontWeight || 400,
      fontStyle: fStyle,
      fontSynthesis: 'weight style',
      letterSpacing: lsPx,
      wordSpacing: wsPx,
      userSelect: 'none',
      WebkitUserSelect: 'none',
      whiteSpace: 'pre'
    };
    const decLines = [];
    if (dec && dec !== 'none') {
      const decStroke = fillAttr && fillAttr !== 'none' ? fillAttr : hasExplicitStroke ? strokeAttr : '#18181b';
      const decW = Math.max(1, fs * 0.065);
      const dyOff = dec === 'underline' ? fs * 0.12 : dec === 'line-through' ? -fs * 0.28 : -fs * 0.78;
      for (let idx = 0; idx < lines.length; idx++) {
        const lw = mb.lineWidths && mb.lineWidths[idx] || mb.w;
        const lx0 = t.textAnchor === 'middle' ? -lw * 0.5 : t.textAnchor === 'end' ? -lw : 0;
        const ly = -bShift + idx * fs * lh + dyOff;
        decLines.push(<line key={'dec-' + idx} x1={lx0} y1={ly} x2={lx0 + lw} y2={ly} stroke={decStroke} strokeWidth={decW} strokeLinecap="round" />);
      }
    }
    return <g data-drag-id={o.id} data-base-tf={baseTf} clipPath={effClip} transform={baseTf} opacity={effOpacity} style={{
      pointerEvents: 'all'
    }}><text x="0" y={-bShift} fontFamily={t.fontFamily || 'Inter, system-ui, sans-serif'} fontSize={fs} fontWeight={t.fontWeight || 400} fontStyle={fStyle} textAnchor={t.textAnchor || 'start'} letterSpacing={lsPx} wordSpacing={wsPx} fill={fillAttr} stroke={hasExplicitStroke ? strokeAttr : 'none'} strokeWidth={hasExplicitStroke ? o.strokeWidth : 0} strokeLinejoin={hasExplicitStroke ? o.strokeLinejoin || 'round' : undefined} strokeLinecap={hasExplicitStroke ? o.strokeLinecap || 'round' : undefined} paintOrder="stroke fill" style={textStyleObj}>{lines.map((ln, idx) => <tspan key={idx} x="0" dy={idx === 0 ? 0 : fs * lh} style={{
          letterSpacing: lsPx,
          wordSpacing: wsPx
        }}>{ln || '\u00A0'}</tspan>)}</text>{decLines}</g>;
  }
  const hasExplicitStroke = o.stroke !== 'none' && o.strokeWidth > 0;
  const hasFill = fillAttr && fillAttr !== 'none' && fillAttr !== 'transparent';
  const useSeamGuard = RENDER_CONFIG.seamGuard && !hasExplicitStroke && hasFill && isOpaquePaint(o) && !o.isFrameBg && !o.isAutoFrame;
  const effClip = clipAttr || (o.clipPathD ? 'url(#vcp-obj-' + o.id + ')' : undefined);
  return <path data-drag-id={o.id} clipPath={effClip} d={vinfo(o).d} fill={fillAttr} stroke={hasExplicitStroke ? strokeAttr : useSeamGuard ? fillAttr : 'none'} strokeWidth={hasExplicitStroke ? o.strokeWidth : useSeamGuard ? SEAM_STROKE_PX : 0} vectorEffect={o.nonScalingStroke || useSeamGuard ? 'non-scaling-stroke' : undefined} paintOrder={useSeamGuard ? 'stroke fill' : undefined} strokeLinejoin={o.strokeLinejoin || 'round'} strokeLinecap={o.strokeLinecap || 'round'} strokeMiterlimit={o.strokeMiterlimit} opacity={effOpacity} fillRule={o.fillRule} />;
});
const CompositePathObj = React.memo(({
  objs,
  dCombined,
  idsStr,
  seamGuardOn
}) => {
  const first = objs[0];
  const isStrokeOnly = first.fill === 'none';
  const fillAttr = isStrokeOnly ? 'none' : VE.gradOn(first) ? 'url(#vgr-' + first.id + ')' : first.fill;
  const strokeAttr = VE.strokeGradOn(first) ? 'url(#vsgr-' + first.id + ')' : first.stroke;
  if (isStrokeOnly) {
    return <path data-drag-batch={idsStr} d={dCombined} fill="none" stroke={strokeAttr} strokeWidth={first.strokeWidth} vectorEffect={first.nonScalingStroke ? 'non-scaling-stroke' : undefined} strokeLinejoin={first.strokeLinejoin || 'round'} strokeLinecap={first.strokeLinecap || 'round'} strokeMiterlimit={first.strokeMiterlimit} opacity={first.opacity} />;
  }
  const useSeamGuard = RENDER_CONFIG.seamGuard && isOpaquePaint(first) && !first.isFrameBg && !first.isAutoFrame;
  return <path data-drag-batch={idsStr} d={dCombined} fill={fillAttr} stroke={useSeamGuard ? fillAttr : 'none'} strokeWidth={useSeamGuard ? SEAM_STROKE_PX : 0} vectorEffect={useSeamGuard ? 'non-scaling-stroke' : undefined} paintOrder={useSeamGuard ? 'stroke fill' : undefined} strokeLinejoin="round" strokeLinecap="round" opacity={first.opacity} fillRule="nonzero" />;
});

/* =========================================================================
   TAHAP 9 & 10 — TEST SUITE STANDAR GEOVANTA & PANEL DIAGNOSTIK INTERNAL
   - Mencakup:
     * Test 01 — Lingkaran (Lingkaran sempurna & elips konsentris)
     * Test 02 — Bézier (Kurva S, cusp tajam, infleksi, dan radius ekstrem)
     * Test 03 — Diagonal (Garis miring sudut tipis, bintang lancip, sudut tajam)
     * Test 04 — Compound Path (Lubang, multi-subpath, fill-rule evenodd vs nonzero, self-intersection)
     * Test 05 — Kepadatan Node (10, 100, 1.000, 10.000 node)
     * Test 06 — Koordinat Dunia Ekstrem (100.000.000, 100.000.000) untuk uji Local Coordinate Rebasing
     * Test 07 — Komposisi 240 Objek & A/B Seam Test (Solid, Gradient, Transparent)
   - Menyediakan 7 Debug Modes Visualisasi Langsung di Kanvas:
     1) original       : Original path
     2) polyline       : Flattened polyline
     3) mesh           : Tessellation mesh (fill + stroke wireframe)
     4) fill_tris      : Fill triangles (Ear-Clip vs Stencil Fan)
     5) stroke_tris    : Stroke triangles (Quad + Join + Cap)
     6) seam_guard     : Seam guard overlay
     7) edge_coverage  : Pixel coverage / edge visualization
   ========================================================================= */

export { LayerSvgPreview, CanvasObj, CompositePathObj };
