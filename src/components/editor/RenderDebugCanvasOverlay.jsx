/**
 * @file src/components/editor/RenderDebugCanvasOverlay.jsx
 * @description Overlay visualisasi kotak batas, wireframe mesh GPU, & diagnostik teselasi (RenderDebugCanvasOverlay)
 */
import React from 'react';
import { vinfo } from '../../renderer/pathWindingAndBatching.jsx';
import { getObjectTessellationLOD } from '../../renderer/objectTessellationLod.jsx';
import { buildObjectGpuBuffers, isObjectSeamCandidate } from '../../renderer/polygonTriangulatorAndStroke.jsx';
import { RENDER_CONFIG } from '../../utils/renderConfigAndTelemetry.jsx';

/* Komponen Overlay Visualisasi 7 Debug Modes di Kanvas (Bagian 10) */
const RenderDebugCanvasOverlay = ({
  doc,
  zoom,
  debugMode,
  cullBounds
}) => {
  if (!debugMode || debugMode === 'none' || !doc || !doc.objects) return null;
  const [vx0, vy0, vx1, vy1] = cullBounds || [-1e9, -1e9, 1e9, 1e9];
  const invZ = 1 / Math.max(1e-4, zoom || 1);
  const visObjs = doc.objects.filter(o => {
    if (!o || o.hidden || o.img) return false;
    const bb = vinfo(o).bb;
    return bb[2] >= vx0 && bb[0] <= vx1 && bb[3] >= vy0 && bb[1] <= vy1;
  });
  if (debugMode === 'original') {
    let anchorPath = '',
      ctrlLines = '';
    const r = 3.2 * invZ;
    visObjs.forEach(o => {
      o.subs.forEach(sp => {
        sp.nodes.forEach(n => {
          anchorPath += `M${n.x - r} ${n.y - r}h${r * 2}v${r * 2}h${-r * 2}Z`;
          if (n.handleIn) ctrlLines += `M${n.x} ${n.y}L${n.handleIn.x} ${n.handleIn.y}`;
          if (n.handleOut) ctrlLines += `M${n.x} ${n.y}L${n.handleOut.x} ${n.handleOut.y}`;
        });
      });
    });
    return <g className="ved-debug-overlay" pointerEvents="none">{visObjs.map(o => <path key={'dbg-orig-' + o.id} d={vinfo(o).d} fill="none" stroke="#0d99ff" strokeWidth={1.8 * invZ} />)}{ctrlLines && <path d={ctrlLines} fill="none" stroke="#f59e0b" strokeWidth={1.1 * invZ} strokeDasharray={3 * invZ + ' ' + 2 * invZ} />}{anchorPath && <path d={anchorPath} fill="#ffffff" stroke="#0d99ff" strokeWidth={1.3 * invZ} />}</g>;
  }
  if (debugMode === 'polyline') {
    let polyD = '',
      vertD = '';
    const r = 2.2 * invZ;
    let vBudget = 3500;
    visObjs.forEach(o => {
      const lod = getObjectTessellationLOD(o, zoom);
      lod.polylines.forEach(pl => {
        const c = pl.coords,
          m = c.length >> 1;
        if (!m) return;
        polyD += `M${c[0]} ${c[1]}`;
        for (let k = 1; k < m; k++) polyD += `L${c[k * 2]} ${c[k * 2 + 1]}`;
        if (pl.closed) polyD += 'Z';
        const step = Math.max(1, Math.ceil(m / 400));
        for (let k = 0; k < m && vBudget > 0; k += step, vBudget--) {
          const vx = c[k * 2],
            vy = c[k * 2 + 1];
          vertD += `M${vx - r} ${vy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
        }
      });
    });
    return <g className="ved-debug-overlay" pointerEvents="none">{polyD && <path d={polyD} fill="none" stroke="#10b981" strokeWidth={1.5 * invZ} />}{vertD && <path d={vertD} fill="#f43f5e" stroke="#ffffff" strokeWidth={0.8 * invZ} />}</g>;
  }
  if (debugMode === 'mesh' || debugMode === 'fill_tris' || debugMode === 'stroke_tris') {
    let earWireD = '',
      fanWireD = '',
      strokeWireD = '';
    let triBudget = 4500;
    const appendTris = (arr, ox, oy) => {
      if (!arr) return '';
      let d = '';
      const totalTris = Math.floor(arr.length / 6);
      const step = Math.max(1, Math.ceil(totalTris / 1500));
      for (let i = 0; i < arr.length && triBudget > 0; i += 6 * step, triBudget--) {
        const x1 = arr[i] + ox,
          y1 = arr[i + 1] + oy;
        const x2 = arr[i + 2] + ox,
          y2 = arr[i + 3] + oy;
        const x3 = arr[i + 4] + ox,
          y3 = arr[i + 5] + oy;
        d += `M${x1} ${y1}L${x2} ${y2}L${x3} ${y3}Z`;
      }
      return d;
    };
    visObjs.forEach(o => {
      const gm = buildObjectGpuBuffers(o, zoom);
      const ox = gm.originX,
        oy = gm.originY;
      if (debugMode === 'mesh' || debugMode === 'fill_tris') {
        if (gm.earArray) earWireD += appendTris(gm.earArray, ox, oy);else if (gm.fanArray) fanWireD += appendTris(gm.fanArray, ox, oy);
      }
      if (debugMode === 'mesh' || debugMode === 'stroke_tris') {
        if (gm.strokeArray) strokeWireD += appendTris(gm.strokeArray, ox, oy);
      }
    });
    return <g className="ved-debug-overlay" pointerEvents="none">{earWireD && <path d={earWireD} fill="rgba(16, 185, 129, 0.14)" stroke="#10b981" strokeWidth={0.9 * invZ} />}{fanWireD && <path d={fanWireD} fill="rgba(13, 153, 255, 0.14)" stroke="#0d99ff" strokeWidth={0.9 * invZ} />}{strokeWireD && <path d={strokeWireD} fill="rgba(245, 158, 11, 0.22)" stroke="#f59e0b" strokeWidth={0.9 * invZ} />}</g>;
  }
  if (debugMode === 'seam_guard') {
    const seamObjs = visObjs.filter(isObjectSeamCandidate);
    const activeCol = RENDER_CONFIG.seamGuard ? '#ec4899' : '#06b6d4';
    return <g className="ved-debug-overlay" pointerEvents="none">{seamObjs.map(o => <path key={'dbg-seam-' + o.id} d={vinfo(o).d} fill="none" stroke={activeCol} strokeWidth={2.4 * invZ} strokeDasharray={RENDER_CONFIG.seamGuard ? undefined : 4 * invZ + ' ' + 3 * invZ} />)}</g>;
  }
  if (debugMode === 'edge_coverage') {
    return <g className="ved-debug-overlay" pointerEvents="none">{visObjs.map(o => <g key={'dbg-edge-' + o.id}><path d={vinfo(o).d} fill="none" stroke="#ef4444" strokeOpacity="0.35" strokeWidth={3.5 * invZ} strokeLinejoin="round" strokeLinecap="round" /><path d={vinfo(o).d} fill="none" stroke="#eab308" strokeOpacity="0.65" strokeWidth={1.6 * invZ} strokeLinejoin="round" strokeLinecap="round" /><path d={vinfo(o).d} fill="none" stroke="#10b981" strokeOpacity="0.95" strokeWidth={0.6 * invZ} strokeLinejoin="round" strokeLinecap="round" /></g>)}</g>;
  }
  return null;
};

export { RenderDebugCanvasOverlay };
export default RenderDebugCanvasOverlay;
