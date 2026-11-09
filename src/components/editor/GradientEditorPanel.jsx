/**
 * @file src/components/editor/GradientEditorPanel.jsx
 * @description Panel inspektor editor gradien multi-stop tingkat lanjut (GradientEditorPanel)
 */
import React, { useRef } from 'react';
import { VE } from '../../engine/vectorEngine.jsx';
import { cssToHex, parseColorWithAlpha } from '../../utils/colorParserAndFormatter.jsx';
import { clampN } from '../../utils/colorMath.jsx';
import { GradChoice } from '../ui/SegmentedControl.jsx';
import { ColorField } from '../ui/ColorPickerField.jsx';
import { Ico } from '../ui/IconGlyphs.jsx';
import { Range } from '../ui/RangeField.jsx';
import { GRAD_PRESETS } from '../../constants/editorToolsAndShapes.jsx';

const GradientEditorPanel = ({
  L,
  obj,
  selObjs,
  commitObjs,
  say,
  activeStopId,
  setActiveStopId
}) => {
  const barRef = useRef(null);
  const g = obj && VE.gradOn(obj) ? obj.grad : null;
  const fillMode = !obj ? 'solid' : obj.fill === 'none' ? 'none' : g ? g.type : 'solid';

  /* Pastikan rawStops tersedia untuk diedit */
  const rawStops = React.useMemo(() => {
    if (!g) return [];
    if (g.rawStops && g.rawStops.length >= 2) return g.rawStops;
    const st = g.stops || [];
    if (st.length > 5) return VE.simplifyGradStopsTo(st, 10, 0.018);
    return st.map((s, i) => ({
      id: s.id || 's' + i,
      offset: s.offset,
      color: cssToHex(s.color),
      op: s.op ?? 1,
      mid: 0.5
    }));
  }, [g]);
  const curStop = rawStops.find(s => s.id === activeStopId) || rawStops[0] || null;

  /* Terapkan perubahan gradien ke semua objek terpilih */
  const applyGrad = (mutator, histKey = 'grad-edit') => {
    const ids = new Set(selObjs.map(o => o.id));
    commitObjs(o => ids.has(o.id) && !o.img ? mutator(o) : o, histKey);
  };

  /* Ganti mode Fill: Solid | Linear | Radial | None */
  const setMode = m => {
    if (m === 'none') {
      applyGrad(o => ({
        ...o,
        fill: 'none'
      }), 'p:fill');
    } else if (m === 'solid') {
      const col = g ? g.base : obj.fill !== 'none' ? cssToHex(obj.fill) : '#4f46e5';
      applyGrad(o => ({
        ...o,
        fill: col,
        grad: null
      }), 'p:fill');
    } else {
      applyGrad(o => VE.ensureGradModel(o, m), 'grad-mode');
    }
  };

  /* Dragging Stop atau Midpoint pada Bar Gradien */
  const startBarDrag = (e, kind, idx) => {
    e.stopPropagation();
    e.preventDefault();
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = ev => {
      const t = clampN((ev.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      if (kind === 'stop') {
        const targetId = rawStops[idx].id;
        applyGrad(o => {
          const m = VE.ensureGradModel(o);
          const next = m.grad.rawStops.map(s => s.id === targetId ? {
            ...s,
            offset: VE.rd(t)
          } : s);
          return VE.updateGradStops(m, next);
        }, 'grad-stop-drag');
      } else if (kind === 'mid') {
        const a = rawStops[idx],
          b = rawStops[idx + 1];
        if (!a || !b) return;
        const span = Math.max(1e-4, b.offset - a.offset);
        const mid = clampN((t - a.offset) / span, 0.15, 0.85);
        applyGrad(o => {
          const m = VE.ensureGradModel(o);
          const next = m.grad.rawStops.map(s => s.id === a.id ? {
            ...s,
            mid: VE.rd(mid)
          } : s);
          return VE.updateGradStops(m, next);
        }, 'grad-mid-drag');
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* Klik pada area kosong di bar gradien -> Tambah Stop Baru */
  const onBarClick = e => {
    if (!g || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const t = clampN((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const smp = VE.sampleGradAt(rawStops, t);
    const newId = VE.uid();
    applyGrad(o => {
      const m = VE.ensureGradModel(o);
      const next = [...m.grad.rawStops, {
        id: newId,
        offset: VE.rd(t),
        color: smp.color,
        op: smp.op,
        mid: 0.5
      }];
      return VE.updateGradStops(m, next);
    }, 'grad-add-stop');
    setActiveStopId(newId);
    say && say('Stop gradien ditambahkan pada ' + Math.round(t * 100) + '%');
  };

  /* Hapus stop terpilih (minimal 2 stop harus tersisa) */
  const deleteStop = id => {
    if (rawStops.length <= 2) return say && say('Minimal harus ada 2 stop warna');
    applyGrad(o => {
      const m = VE.ensureGradModel(o);
      const next = m.grad.rawStops.filter(s => s.id !== id);
      return VE.updateGradStops(m, next);
    }, 'grad-del-stop');
    const rem = rawStops.filter(s => s.id !== id);
    if (rem.length) setActiveStopId(rem[0].id);
  };

  /* Operasi Cepat: Balik (Reverse), Sebar Merata (Distribute), & Sederhanakan RDP */
  const reverseStops = () => applyGrad(o => {
    const m = VE.ensureGradModel(o);
    const rev = m.grad.rawStops.slice().reverse().map((s, i, arr) => ({
      ...s,
      offset: VE.rd(1 - s.offset),
      mid: i < arr.length - 1 ? VE.rd(1 - (arr[i + 1].mid ?? 0.5)) : 0.5
    }));
    return VE.updateGradStops(m, rev);
  });
  const distributeStops = () => applyGrad(o => {
    const m = VE.ensureGradModel(o),
      n = m.grad.rawStops.length;
    const dist = m.grad.rawStops.map((s, i) => ({
      ...s,
      offset: VE.rd(i / Math.max(1, n - 1)),
      mid: 0.5
    }));
    return VE.updateGradStops(m, dist);
  });
  const simplifyStopsAction = (maxN = 6) => applyGrad(o => {
    const m = VE.ensureGradModel(o);
    const simp = VE.simplifyGradStopsTo(m.grad.rawStops, maxN, 0.01);
    say && say(`Disederhanakan menjadi ${simp.length} stop utama`);
    return VE.updateGradStops(m, simp);
  });

  /* Lane: stop yang berdekatan (dalam piksel) dipindah ke baris rel di bawah bar agar tidak bertumpuk */
  const BAR_W = barRef.current && barRef.current.getBoundingClientRect().width || 240;
  const many = rawStops.length > 6;
  const lanes = React.useMemo(() => {
    const MIN = 15,
      ends = [],
      out = {};
    rawStops.slice().sort((a, b) => a.offset - b.offset).forEach(s => {
      const x = s.offset * BAR_W;
      let l = 0;
      while (l < ends.length && x - ends[l] < MIN) l++;
      ends[l] = x;
      out[s.id] = l;
    });
    return out;
  }, [rawStops, BAR_W]);
  const laneCount = Math.max(1, ...Object.values(lanes).map(l => l + 1), 1);
  const showMid = i => !many || curStop && (rawStops[i].id === curStop.id || rawStops[i + 1] && rawStops[i + 1].id === curStop.id);
  const cssGradPreview = React.useMemo(() => {
    if (!g) return 'none';
    const st = (g.stops || []).map(s => `${s.color} ${Math.round(s.offset * 1000) / 10}%`).join(', ');
    return `linear-gradient(90deg, ${st})`;
  }, [g]);
  return <div className="space-y-3"><div><div className="text-[11px] mut mb-1.5">{L.gradMode}</div><GradChoice value={fillMode} on={setMode} cols={2} options={[['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial'], ['none', L.gradNone]]} tip="veGradMode" tips={{
        solid: 'veGradSolid',
        linear: 'veGradLinear',
        radial: 'veGradRadial',
        none: 'veGradNone'
      }} /></div>{(fillMode === 'linear' || fillMode === 'radial') && g && <div className="space-y-3 fade"><div><div className="flex items-center justify-between text-[11px] mut mb-1"><span>{L.gradStopsN.replace('{n}', rawStops.length)}</span><span className="text-[10px]">{L.gradBarHint}</span></div><div ref={barRef} onClick={onBarClick} data-tip="veGradBar" className="chk relative h-7 rounded-xl cursor-copy select-none" style={{
          border: '1px solid var(--line)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,.08)'
        }}><div className="absolute inset-0 rounded-xl" style={{
            background: cssGradPreview
          }} />{rawStops.slice(0, -1).map((a, i) => {
            if (!showMid(i)) return null;
            const b = rawStops[i + 1];
            const pos = a.offset + (b.offset - a.offset) * (a.mid ?? 0.5);
            return <div key={'mid-' + a.id} data-tip="veGradMid" onPointerDown={e => startBarDrag(e, 'mid', i)} onClick={e => e.stopPropagation()} onDoubleClick={e => {
              e.stopPropagation();
              applyGrad(o => {
                const m = VE.ensureGradModel(o);
                return VE.updateGradStops(m, m.grad.rawStops.map(s => s.id === a.id ? {
                  ...s,
                  mid: 0.5
                } : s));
              });
            }} style={{
              position: 'absolute',
              left: pos * 100 + '%',
              top: -5,
              width: 8,
              height: 8,
              marginLeft: -4,
              transform: 'rotate(45deg)',
              background: 'var(--card)',
              border: '1.5px solid var(--acc)',
              cursor: 'ew-resize',
              zIndex: 2
            }} />;
          })}{rawStops.map((s, i) => {
            const on = curStop && curStop.id === s.id;
            return <div key={s.id || i} data-tip="veGradStop" onPointerDown={e => {
              setActiveStopId(s.id);
              startBarDrag(e, 'stop', i);
            }} onClick={e => {
              e.stopPropagation();
              setActiveStopId(s.id);
            }} onDoubleClick={e => {
              e.stopPropagation();
              deleteStop(s.id);
            }} style={{
              position: 'absolute',
              left: s.offset * 100 + '%',
              top: '50%',
              width: on ? 14 : many ? 4 : 11,
              height: on ? 22 : many ? 22 : 18,
              transform: 'translate(-50%, -50%)',
              borderRadius: many && !on ? 2 : 6,
              background: s.color,
              border: on ? '2.5px solid #fff' : '1.5px solid #fff',
              boxShadow: on ? '0 0 0 2px var(--acc), 0 2px 6px rgba(0,0,0,.35)' : '0 1px 3px rgba(0,0,0,.35)',
              cursor: 'grab',
              zIndex: on ? 4 : 3,
              transition: 'width .15s, height .15s'
            }} />;
          })}</div>{many && <div className="gbar-rail" style={{
          height: laneCount * 16
        }}>{rawStops.map(s => {
            const on = curStop && curStop.id === s.id;
            return <div key={'rl-' + s.id} data-tip="veGradStop" onPointerDown={e => {
              setActiveStopId(s.id);
              startBarDrag(e, 'stop', rawStops.indexOf(s));
            }} onDoubleClick={e => {
              e.stopPropagation();
              deleteStop(s.id);
            }} style={{
              position: 'absolute',
              left: s.offset * 100 + '%',
              top: (lanes[s.id] || 0) * 16,
              width: 12,
              height: 12,
              marginLeft: -6,
              borderRadius: 4,
              background: s.color,
              border: on ? '2px solid var(--acc)' : '1.5px solid var(--card)',
              boxShadow: '0 0 0 1px var(--line)',
              cursor: 'grab',
              zIndex: on ? 3 : 1
            }} />;
          })}</div>}{many && <div className="mt-2 space-y-1.5"><div className="flex items-center justify-between text-[10px] mut"><span>{L.gradStopList.replace('{n}', rawStops.length)}</span></div><div className="gstop-list">{rawStops.slice().sort((a, b) => a.offset - b.offset).map(s => <button key={'ch-' + s.id} type="button" className={'gstop-chip' + (curStop && curStop.id === s.id ? ' on' : '')} data-tip-text={L.gradStopTip.replace('{hex}', cssToHex(s.color)).replace('{pct}', Math.round(s.offset * 100))} onClick={() => setActiveStopId(s.id)}><i style={{
                background: s.color
              }} /><span className="truncate">{Math.round(s.offset * 100)}%</span></button>)}</div><div className="flex items-center gap-1.5 flex-wrap"><span className="text-[10px] mut">{L.gradCondense}</span>{[4, 6, 8].filter(n => n < rawStops.length).map(n => <button key={n} type="button" className="ved-pill" onClick={() => simplifyStopsAction(n)}>{n}</button>)}</div></div>}</div>{curStop && <div className="p-2.5 rounded-xl space-y-2.5" style={{
        background: 'var(--sub)',
        border: '1px solid var(--line)'
      }}><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0 flex-1"><ColorField L={L} tip="veGradStopColor" value={cssToHex(curStop.color)} opacity={curStop.op ?? 1} onOpacity={op => applyGrad(o => {
              const m = VE.ensureGradModel(o);
              return VE.updateGradStops(m, m.grad.rawStops.map(s => s.id === curStop.id ? {
                ...s,
                op
              } : s));
            }, 'grad-op')} on={v => applyGrad(o => {
              const m = VE.ensureGradModel(o);
              if (v === 'none') return VE.updateGradStops(m, m.grad.rawStops.map(s => s.id === curStop.id ? {
                ...s,
                op: 0
              } : s));
              const p = parseColorWithAlpha(v);
              return VE.updateGradStops(m, m.grad.rawStops.map(s => s.id === curStop.id ? {
                ...s,
                color: p.hex,
                op: s.op === 0 && p.a > 0 ? p.a : p.a < 1 ? p.a : s.op ?? 1
              } : s));
            }, 'grad-col')} /><span className="text-[11px] font-mono uppercase truncate">{cssToHex(curStop.color)}</span></div><span className="text-[11px] font-mono mut">{Math.round(curStop.offset * 100)}%</span><button type="button" className="btn sec text-[10px]" style={{
            padding: '4px 8px'
          }} disabled={rawStops.length <= 2} onClick={() => deleteStop(curStop.id)} data-tip="veGradDelStop"><Ico n="trash" size={12} /></button></div><Range tip="veGradStopPos" l={L.gradStopPos} v={Math.round(curStop.offset * 100)} min={0} max={100} step={1} on={v => applyGrad(o => {
          const m = VE.ensureGradModel(o);
          return VE.updateGradStops(m, m.grad.rawStops.map(s => s.id === curStop.id ? {
            ...s,
            offset: v / 100
          } : s));
        }, 'grad-pos')} f={v => v + '%'} /><Range tip="veGradStopOp" l="Opacity Stop" v={Math.round((curStop.op ?? 1) * 100)} min={0} max={100} step={1} on={v => applyGrad(o => {
          const m = VE.ensureGradModel(o);
          return VE.updateGradStops(m, m.grad.rawStops.map(s => s.id === curStop.id ? {
            ...s,
            op: v / 100
          } : s));
        }, 'grad-op')} f={v => v + '%'} /></div>}{fillMode === 'linear' && <div className="space-y-2"><Range tip="veGradAngle" l={L.gradAngle} v={VE.gradAngleDeg(g)} min={-180} max={180} step={1} on={deg => applyGrad(o => VE.setGradAngleDeg(VE.ensureGradModel(o), deg), 'grad-ang')} f={v => v + '°'} /><div className="ved-pills">{[-90, -45, 0, 45, 90, 135, 180].map(d => <button key={d} type="button" data-tip="veGradAnglePreset" className={'ved-pill' + (Math.round(VE.gradAngleDeg(g)) === d ? ' on' : '')} onClick={() => applyGrad(o => VE.setGradAngleDeg(VE.ensureGradModel(o), d))}>{d}°</button>)}</div></div>}<div><div className="text-[11px] mut mb-1.5">{L.gradInterp}</div><GradChoice cols={2} value={g.oklab === false ? 'srgb' : 'oklab'} on={k => applyGrad(o => {
          const m = VE.ensureGradModel(o);
          return VE.updateGradStops(m, m.grad.rawStops, {
            oklab: k === 'oklab'
          });
        })} options={[['oklab', L.gradOklab], ['srgb', 'sRGB']]} tip="veGradInterp" tips={{
          oklab: 'veGradOk',
          srgb: 'veGradSrgb'
        }} /></div><div><div className="text-[11px] mut mb-1.5">Spread Method</div><GradChoice cols={3} value={g.spread || 'pad'} on={sp => applyGrad(o => ({
          ...o,
          grad: {
            ...o.grad,
            spread: sp
          }
        }))} options={[['pad', 'Pad'], ['reflect', 'Reflect'], ['repeat', 'Repeat']]} tip="veGradSpread" tips={{
          pad: 'veGradPad',
          reflect: 'veGradReflect',
          repeat: 'veGradRepeat'
        }} /></div><div className="flex flex-wrap gap-1.5"><button type="button" className="btn sec text-[11px] flex-1" style={{
          padding: '6px 8px'
        }} onClick={reverseStops} data-tip="veGradReverse">{L.gradFlip}</button><button type="button" className="btn sec text-[11px] flex-1" style={{
          padding: '6px 8px'
        }} onClick={distributeStops} data-tip="veGradDistribute">{L.gradFlatten}</button>{rawStops.length > 4 && <button type="button" className="btn sec text-[11px] flex-1" style={{
          padding: '6px 8px'
        }} onClick={() => simplifyStopsAction(6)} data-tip="veGradRdp">✦ RDP</button>}</div><div><div className="text-[11px] mut mb-1">{L.gradPreset}</div><div className="grid grid-cols-6 gap-1.5">{GRAD_PRESETS.map(([name, stops]) => {
            const bgStr = 'linear-gradient(135deg,' + stops.map(([c, u]) => `${c} ${u * 100}%`).join(',') + ')';
            return <button key={name} type="button" data-tip-text={name} className="h-6 rounded-lg border border-[var(--line)] transition-transform hover:scale-105" style={{
              background: bgStr
            }} onClick={() => applyGrad(o => {
              const m = VE.ensureGradModel(o);
              const raw = stops.map(([c, u]) => ({
                id: VE.uid(),
                offset: u,
                color: c,
                op: 1,
                mid: 0.5
              }));
              return VE.updateGradStops(m, raw);
            })} />;
          })}</div></div></div>}</div>;
};

export { GradientEditorPanel };
export default GradientEditorPanel;
