/**
 * @file src/components/editor/GradientCanvasGizmo.jsx
 * @description Gizmo interaktif manipulasi titik & stop gradien langsung di atas kanvas (GradientCanvasGizmo)
 */
import React from 'react';
import { VE } from '../../engine/vectorEngine.jsx';
import { clampN } from '../../utils/colorMath.jsx';

const GradientCanvasGizmo = ({
  obj,
  zoom,
  toDoc,
  commitObjs,
  live,
  docRef,
  push,
  activeStopId,
  setActiveStopId
}) => {
  if (!obj || !VE.gradOn(obj)) return null;
  const g = obj.grad;
  const rawStops = g.rawStops && g.rawStops.length >= 2 ? g.rawStops : g.stops || [];
  const isRad = g.type === 'radial';
  const ang = g.handleAng || 0;
  const p1 = isRad ? {
    x: g.cx,
    y: g.cy
  } : {
    x: g.x1,
    y: g.y1
  };
  const p2 = isRad ? {
    x: g.cx + Math.cos(ang) * g.r,
    y: g.cy + Math.sin(ang) * g.r
  } : {
    x: g.x2,
    y: g.y2
  };
  const pf = isRad ? {
    x: g.fx != null ? g.fx : g.cx,
    y: g.fy != null ? g.fy : g.cy
  } : null;

  /* Drag handler langsung ke state dokumen tanpa lag (live preview + push history saat lepas) */
  const startGizmoDrag = (e, mode, stopPayload) => {
    e.stopPropagation();
    e.preventDefault();
    const baseDoc = docRef.current;
    let moved = false;
    const startPt = toDoc(e.clientX, e.clientY);
    const baseObj = baseDoc.objects.find(o => o.id === obj.id);
    const baseG = baseObj && baseObj.grad ? baseObj.grad : g;
    const onMove = ev => {
      const pt = toDoc(ev.clientX, ev.clientY);
      moved = true;
      const nextObjects = baseDoc.objects.map(o => {
        if (o.id !== obj.id) return o;
        const m = VE.ensureGradModel(o);
        const gg = {
          ...m.grad
        };
        if (mode === 'move') {
          /* Geser seluruh gradient (posisi bebas): semua titik kontrol ikut bergeser sama */
          let dx = pt.x - startPt.x,
            dy = pt.y - startPt.y;
          if (ev.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;else dx = 0;
          }
          const B = baseG;
          if (isRad) {
            gg.cx = VE.rd(B.cx + dx);
            gg.cy = VE.rd(B.cy + dy);
            gg.fx = VE.rd((B.fx ?? B.cx) + dx);
            gg.fy = VE.rd((B.fy ?? B.cy) + dy);
          } else {
            gg.x1 = VE.rd(B.x1 + dx);
            gg.y1 = VE.rd(B.y1 + dy);
            gg.x2 = VE.rd(B.x2 + dx);
            gg.y2 = VE.rd(B.y2 + dy);
          }
          return {
            ...m,
            grad: gg
          };
        }
        if (mode === 'p1') {
          if (isRad) {
            const dx = pt.x - gg.cx,
              dy = pt.y - gg.cy,
              ofx = gg.fx ?? gg.cx,
              ofy = gg.fy ?? gg.cy;
            gg.cx = VE.rd(pt.x);
            gg.cy = VE.rd(pt.y);
            gg.fx = VE.rd(ofx + dx);
            gg.fy = VE.rd(ofy + dy);
          } else {
            let nx = pt.x,
              ny = pt.y;
            if (ev.shiftKey) {
              const L = Math.hypot(nx - gg.x2, ny - gg.y2),
                a = Math.round(Math.atan2(ny - gg.y2, nx - gg.x2) / (Math.PI / 12)) * (Math.PI / 12);
              nx = gg.x2 + Math.cos(a) * L;
              ny = gg.y2 + Math.sin(a) * L;
            }
            gg.x1 = VE.rd(nx);
            gg.y1 = VE.rd(ny);
          }
          return {
            ...m,
            grad: gg
          };
        }
        if (mode === 'p2') {
          if (isRad) {
            gg.r = VE.rd(Math.max(2, Math.hypot(pt.x - gg.cx, pt.y - gg.cy)));
            gg.handleAng = Math.atan2(pt.y - gg.cy, pt.x - gg.cx);
          } else {
            let nx = pt.x,
              ny = pt.y;
            if (ev.shiftKey) {
              const L = Math.hypot(nx - gg.x1, ny - gg.y1),
                a = Math.round(Math.atan2(ny - gg.y1, nx - gg.x1) / (Math.PI / 12)) * (Math.PI / 12);
              nx = gg.x1 + Math.cos(a) * L;
              ny = gg.y1 + Math.sin(a) * L;
            }
            gg.x2 = VE.rd(nx);
            gg.y2 = VE.rd(ny);
          }
          return {
            ...m,
            grad: gg
          };
        }
        if (mode === 'focal' && isRad) {
          /* Batasi titik fokus (fx, fy) agar tetap berada di dalam lingkaran r (95%) */
          let dx = pt.x - gg.cx,
            dy = pt.y - gg.cy,
            d = Math.hypot(dx, dy),
            maxR = gg.r * 0.95;
          if (d > maxR) {
            dx = dx / d * maxR;
            dy = dy / d * maxR;
          }
          gg.fx = VE.rd(gg.cx + dx);
          gg.fy = VE.rd(gg.cy + dy);
          return {
            ...m,
            grad: gg
          };
        }
        if (mode === 'stop') {
          const t = VE.projectPointToGrad(gg, pt);
          const nextRaw = gg.rawStops.map((s, idx) => (stopPayload.id ? s.id === stopPayload.id : idx === stopPayload.idx) ? {
            ...s,
            offset: VE.rd(t)
          } : s);
          return VE.updateGradStops(m, nextRaw);
        }
        if (mode === 'mid') {
          const t = VE.projectPointToGrad(gg, pt);
          const {
            a,
            b
          } = stopPayload;
          const span = Math.max(1e-4, b.offset - a.offset);
          const mid = clampN((t - a.offset) / span, 0.15, 0.85);
          const nextRaw = gg.rawStops.map(s => s.id === a.id ? {
            ...s,
            mid: VE.rd(mid)
          } : s);
          return VE.updateGradStops(m, nextRaw);
        }
        return m;
      });
      live({
        ...baseDoc,
        objects: nextObjects
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved && docRef.current !== baseDoc) push(docRef.current, 'grad-gizmo');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* Klik ganda pada garis gizmo di kanvas untuk menyisipkan stop baru tepat di titik tersebut */
  const onLineDblClick = e => {
    e.stopPropagation();
    const pt = toDoc(e.clientX, e.clientY);
    const t = VE.projectPointToGrad(g, pt);
    const smp = VE.sampleGradAt(rawStops, t);
    const newId = VE.uid();
    commitObjs(o => {
      if (o.id !== obj.id) return o;
      const m = VE.ensureGradModel(o);
      return VE.updateGradStops(m, [...m.grad.rawStops, {
        id: newId,
        offset: VE.rd(t),
        color: smp.color,
        op: smp.op,
        mid: 0.5
      }]);
    });
    setActiveStopId && setActiveStopId(newId);
  };
  return <g className="ved-grad-gizmo">{isRad && <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke="var(--acc)" strokeWidth={1.4 / zoom} strokeDasharray={5 / zoom + ' ' + 3 / zoom} pointerEvents="none" />}{isRad && <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke="transparent" strokeWidth={12 / zoom} style={{
      cursor: 'move'
    }} onPointerDown={e => startGizmoDrag(e, 'move')} />}<line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ffffff" strokeWidth={4 / zoom} strokeLinecap="round" opacity="0.75" pointerEvents="none" /><line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--acc)" strokeWidth={2 / zoom} strokeLinecap="round" pointerEvents="none" /><line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={14 / zoom} strokeLinecap="round" style={{
      cursor: 'move'
    }} onPointerDown={e => startGizmoDrag(e, 'move')} onDoubleClick={onLineDblClick} />{rawStops.slice(0, -1).map(a => {
      const b = rawStops[rawStops.indexOf(a) + 1];
      if (!b) return null;
      if (rawStops.length > 8 && !(a.id === activeStopId || b.id === activeStopId)) return null;
      const t = a.offset + (b.offset - a.offset) * (a.mid ?? 0.5);
      const mp = VE.gradPointAt(g, t),
        sz = 4.2 / zoom;
      return <rect key={'gm-' + a.id} x={mp.x - sz} y={mp.y - sz} width={sz * 2} height={sz * 2} transform={'rotate(45 ' + mp.x + ' ' + mp.y + ')'} fill="#ffffff" stroke="var(--acc)" strokeWidth={1.3 / zoom} style={{
        cursor: 'grab'
      }} onPointerDown={e => startGizmoDrag(e, 'mid', {
        a,
        b
      })} />;
    })}{rawStops.map((s, idx) => {
      const sp = VE.gradPointAt(g, s.offset),
        on = s.id ? s.id === activeStopId : idx === 0;
      return <circle key={'gs-' + (s.id || idx)} cx={sp.x} cy={sp.y} r={(on ? 6.5 : rawStops.length > 8 ? 3.5 : 5) / zoom} fill={s.color} stroke="#ffffff" strokeWidth={(on ? 2.2 : 1.5) / zoom} style={{
        cursor: 'grab',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.45))'
      }} onPointerDown={e => {
        setActiveStopId && setActiveStopId(s.id);
        startGizmoDrag(e, 'stop', {
          ...s,
          idx
        });
      }} />;
    })}<circle cx={p1.x} cy={p1.y} r={6.5 / zoom} fill="#ffffff" stroke="var(--acc)" strokeWidth={2.2 / zoom} style={{
      cursor: 'move'
    }} onPointerDown={e => startGizmoDrag(e, 'p1')} /><circle cx={p2.x} cy={p2.y} r={6.5 / zoom} fill="var(--acc)" stroke="#ffffff" strokeWidth={2 / zoom} style={{
      cursor: 'move'
    }} onPointerDown={e => startGizmoDrag(e, 'p2')} />{isRad && pf && <rect x={pf.x - 4.5 / zoom} y={pf.y - 4.5 / zoom} width={9 / zoom} height={9 / zoom} transform={'rotate(45 ' + pf.x + ' ' + pf.y + ')'} fill="#f59e0b" stroke="#ffffff" strokeWidth={1.5 / zoom} style={{
      cursor: 'move'
    }} onPointerDown={e => startGizmoDrag(e, 'focal')} />}</g>;
};

export { GradientCanvasGizmo };
export default GradientCanvasGizmo;
