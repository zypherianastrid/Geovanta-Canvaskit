/**
 * @file src/components/editor/EditorOffsetStrip.jsx
 * @description Komponen bilah melayang Offset Path dengan pratinjau langsung (EditorOffsetStrip)
 */
import React from 'react';
import { Ico } from '../ui/IconGlyphs.jsx';
import { Slider } from '../ui/Slider.jsx';

const JOINS = [['miter', 'Miter'], ['bevel', 'Bevel'], ['round', 'Round']];

const EditorOffsetStrip = ({
  leftPx = 400,
  topPx = 64,
  offStrip,
  updateOffsetStrip,
  confirmOffsetStrip,
  cancelOffsetStrip
}) => <div className="vc-simp-strip fade" style={{
  left: leftPx + 'px',
  top: topPx + 'px'
}} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}><div style={{
    width: 148
  }} className="px-1"><Slider min={-100} max={100} step={1} value={offStrip.dist} on={d => updateOffsetStrip({
      dist: d
    })} label="Offset" tip="veOffsetDist" /></div><span className="vc-simp-badge" data-tip="veOffsetBadge">{offStrip.dist > 0 ? '+' : ''}{offStrip.dist}pt · {offStrip.before} → {offStrip.after}</span><div className="flex items-center gap-1" data-tip="veOffsetJoin">{JOINS.map(([j, lbl]) => <button key={j} type="button" className="ved-pill text-[10.5px]" style={offStrip.join === j ? {
      background: 'var(--acc)',
      color: '#fff',
      borderColor: 'transparent'
    } : null} onClick={() => updateOffsetStrip({
      join: j
    })}>{lbl}</button>)}</div><button type="button" className="vc-ibtn pri" data-tip="veOffsetApply" onClick={confirmOffsetStrip}><Ico n="check" size={14} /></button><button type="button" className="vc-ibtn" data-tip="veOffsetCancel" onClick={cancelOffsetStrip}><Ico n="x" size={14} /></button></div>;

export { EditorOffsetStrip };
export default EditorOffsetStrip;
