/**
 * @file src/components/editor/LayerTreeViewport.jsx
 * @description Viewport daftar hierarki layer tervirtualisasi berkecepatan tinggi (LayerTreeViewport)
 */
import React, { useState, useRef, useEffect } from 'react';

const LAYER_ROW_EST_PX = 34;
const LAYER_OVERSCAN = 8;
const LAYER_WINDOW_SIZE = 28;
const LAYER_SCROLL_STEP_ROWS = 4;
const LayerTreeViewport = React.memo(({
  virtualLayerRows,
  hasObjects,
  layerTreeDomRef,
  layerViewportCtrlRef,
  renderRowFn,
  dragLayerIds,
  moveObjsToGroup,
  setDragLayerIds,
  setOverFrameId,
  L
}) => {
  const [windowStartIdx, setWindowStartIdx] = useState(0);
  const [fastScroll, setFastScroll] = useState(false);
  const scrollStateRef = useRef({
    rafId: 0,
    settleTimer: 0,
    pendingRelSt: 0,
    lastStartIdx: 0,
    cachedOffsetTop: -1,
    scrolling: false
  });
  const total = virtualLayerRows.length;
  useEffect(() => () => {
    const st = scrollStateRef.current;
    if (st.rafId) cancelAnimationFrame(st.rafId);
    if (st.settleTimer) clearTimeout(st.settleTimer);
    if (typeof window !== 'undefined') window.__gvLayerFastScroll = false;
  }, []);
  if (layerViewportCtrlRef) {
    const applyRelScroll = relSt => {
      const st = scrollStateRef.current;
      if (total <= LAYER_WINDOW_SIZE + LAYER_OVERSCAN * 2) {
        st.lastStartIdx = 0;
        setWindowStartIdx(prev => prev !== 0 ? 0 : prev);
        return;
      }
      const stepRows = total >= 2000 ? 6 : LAYER_SCROLL_STEP_ROWS;
      const effOverscan = total >= 2000 && st.scrolling ? 2 : LAYER_OVERSCAN;
      const qRow = Math.floor(relSt / (LAYER_ROW_EST_PX * stepRows)) * stepRows - effOverscan;
      const nextStart = Math.max(0, Math.min(Math.max(0, total - LAYER_WINDOW_SIZE), qRow));
      const rowDelta = Math.abs(nextStart - st.lastStartIdx);
      st.lastStartIdx = nextStart;
      /* SCROLLFIX 2026-11-07 — mode hemat selama scroll aktif: SETIAP gerakan
         window (bukan cuma lompatan >=8 baris) mengaktifkan fastScroll, jadi
         baris baru mount sebagai skeleton murah (ikon generik + nama, tanpa
         preview SVG / tombol eject / badge) dan preview penuh tidak di-mount
         di tengah scroll. Settle 150 ms: preview baru muncul kalau scroll
         benar-benar berhenti, bukan di antara notch wheel (75 ms lama
         terlalu pendek: settle sempat menyala di tengah scroll). */
      if (rowDelta > 0) {
        if (typeof window !== 'undefined') window.__gvLayerFastScroll = true;
        setFastScroll(prev => prev ? prev : true);
        if (st.settleTimer) clearTimeout(st.settleTimer);
        st.settleTimer = setTimeout(() => {
          st.settleTimer = 0;
          st.scrolling = false;
          st.cachedOffsetTop = -1;
          if (typeof window !== 'undefined') window.__gvLayerFastScroll = false;
          setFastScroll(prev => prev ? false : prev);
        }, 150);
      }
      setWindowStartIdx(prev => prev !== nextStart ? nextStart : prev);
    };
    layerViewportCtrlRef.current = {
      syncScroll(relSt) {
        const st = scrollStateRef.current;
        st.pendingRelSt = Math.max(0, relSt || 0);
        if (st.rafId) return;
        st.rafId = requestAnimationFrame(() => {
          st.rafId = 0;
          applyRelScroll(st.pendingRelSt);
        });
      },
      syncScrollFromContainer(scrollTop) {
        const st = scrollStateRef.current;
        if (!st.scrolling || st.cachedOffsetTop < 0) {
          const treeEl = layerTreeDomRef && layerTreeDomRef.current;
          st.cachedOffsetTop = treeEl ? treeEl.offsetTop : 0;
          st.scrolling = true;
        }
        st.pendingRelSt = Math.max(0, (scrollTop || 0) - st.cachedOffsetTop);
        if (st.rafId) return;
        st.rafId = requestAnimationFrame(() => {
          st.rafId = 0;
          applyRelScroll(st.pendingRelSt);
        });
      }
    };
  }
  let rows,
    padTop = 0,
    padBot = 0;
  if (total <= LAYER_WINDOW_SIZE + LAYER_OVERSCAN * 2) {
    rows = virtualLayerRows;
  } else {
    const activeWin = fastScroll && total >= 1500 ? 20 : LAYER_WINDOW_SIZE;
    const activeOver = fastScroll && total >= 1500 ? 2 : LAYER_OVERSCAN;
    const startIdx = Math.max(0, Math.min(Math.max(0, total - activeWin), windowStartIdx));
    const endIdx = Math.min(total, startIdx + activeWin + activeOver * 2);
    rows = virtualLayerRows.slice(startIdx, endIdx);
    padTop = startIdx * LAYER_ROW_EST_PX;
    padBot = Math.max(0, (total - endIdx) * LAYER_ROW_EST_PX);
  }
  return <div ref={layerTreeDomRef} className="fig-tree" style={{
    paddingTop: padTop + 'px',
    paddingBottom: padBot + 'px',
    gap: '4px'
  }} onDragOver={e => {
    if (dragLayerIds) e.preventDefault();
  }} onDrop={e => {
    if (!dragLayerIds) return;
    e.preventDefault();
    moveObjsToGroup(dragLayerIds, null);
    setDragLayerIds(null);
    setOverFrameId(null);
  }}>{!hasObjects && <div className="text-[11px] mut px-2 py-4 text-center">{L ? L.edNoLayers : 'Belum ada layer — gambar dengan Frame/Pen/Shape atau impor file.'}</div>}{rows.map(row => renderRowFn(row, fastScroll))}</div>;
});

export { LAYER_ROW_EST_PX, LAYER_OVERSCAN, LAYER_WINDOW_SIZE, LAYER_SCROLL_STEP_ROWS, LayerTreeViewport };
