/**
 * @file src/components/editor/LayerRows.jsx
 * @description Baris daftar layer yang di-memo (LayerObjRow, LayerGroupRow,
 * LayerBucketRow, LayerEmptyRow).
 *
 * PERF: sebelumnya seluruh JSX baris dibuat inline di EditorLeftSidebar dan
 * setiap pergantian window virtualisasi (tiap ~4 baris scroll) me-render ulang
 * SEMUA baris yang terlihat — lengkap dengan closure handler + objek style
 * baru per baris. Sekarang tiap baris adalah React.memo dengan props primitif
 * + callback yang stabil selama scroll (VectorEditor tidak re-render saat
 * scroll layer), sehingga pergantian window hanya mount/unmount baris yang
 * masuk/keluar — baris yang bertahan tidak di-render ulang sama sekali.
 * Semua perilaku (klik, Shift+klik range, drag-drop, rename, lock/hide,
 * context menu, bucket, collapse) dipertahankan persis seperti sebelumnya.
 */
import React from 'react';
import { Ico, Vi } from '../ui/IconGlyphs.jsx';
import { CustomTextBox } from '../ui/CustomTextBox.jsx';
import { LayerSvgPreview } from './CanvasVectorObjects.jsx';

const RenInput = React.memo(({
  renameVal,
  layerNameLabel,
  onRenameVal,
  onRenameCommit,
  onRenameCancel
}) => <div className="fig-ren-box" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><CustomTextBox autoFocus={true} value={renameVal} ariaLabel={layerNameLabel} onChange={onRenameVal} onCommit={onRenameCommit} onCancel={onRenameCancel} /></div>);

const LayerObjRow = React.memo(({
  o,
  child,
  nodeCount,
  selected,
  renaming,
  renameVal,
  layerInsPos,
  layerNameLabel,
  clickSkipRef,
  onPick,
  onDragStart,
  onDragEnd,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onOpenCtx,
  onToggleLock,
  onToggleHide,
  onEjectChild,
  onStartRename,
  onRenameVal,
  onRenameCommit,
  onRenameCancel,
  /* SCROLLFIX: true selama scroll layer aktif — baris dirender sebagai
     skeleton murah (ikon generik + swatch + nama; tanpa tombol eject/badge)
     dan prop ini yang menginvalidasi memo saat settle, agar preview penuh
     benar-benar kembali setelah scroll berhenti. */
  fastScroll
}) => <div key={o.id} data-layer-id={o.id} draggable={!renaming} onDragStart={e => onDragStart(e, [o.id])} onDragEnd={onDragEnd} style={child ? {
    marginLeft: 14,
    paddingLeft: 10
  } : undefined} className={'fig-row' + (child ? ' child' : ' root-item') + (selected ? ' on' : '') + (o.hidden ? ' dim' : '') + (layerInsPos ? layerInsPos === 'top' ? ' ins-top' : ' ins-bot' : '')} data-tip="veLayer" onContextMenu={e => onOpenCtx(e, o)} onDragOver={e => onRowDragOver(e, o)} onDragLeave={e => onRowDragLeave(e, o)} onDrop={e => onRowDrop(e, o)} onClick={e => {
    if (e.detail > 1 || renaming) return;
    clickSkipRef.current = true;
    onPick([o.id], e, selected);
  }} onDoubleClick={e => {
    e.preventDefault();
    e.stopPropagation();
    clickSkipRef.current = true;
    onStartRename(o);
  }}><span className="fig-lay-ico" data-tip={o.text ? 'veLayerText' : o.img ? 'veLayerImage' : 'veLayerShape'}><LayerSvgPreview o={o} fastScroll={fastScroll} /></span><span className="ved-swatch" style={o.img ? {
      width: 15,
      height: 15,
      backgroundImage: 'url(' + o.img.href + ')',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    } : {
      width: 15,
      height: 15,
      background: o.fill === 'none' ? 'transparent' : o.fill
    }} />{renaming ? <RenInput renameVal={renameVal} layerNameLabel={layerNameLabel} onRenameVal={onRenameVal} onRenameCommit={v => onRenameCommit(o, v)} onRenameCancel={onRenameCancel} /> : <span className="truncate" style={{ flex: "0 1 auto", minWidth: 0, maxWidth: 150 }} onDoubleClick={e => {
      e.preventDefault();
      e.stopPropagation();
      clickSkipRef.current = true;
      onStartRename(o);
    }}>{o.name}</span>}{!(fastScroll && !renaming) && (<><button type="button" className={'fig-eject' + (o.locked ? ' act' : '')} data-tip={o.locked ? 'layUnlock' : 'layLock'} onClick={e => {
      e.stopPropagation();
      onToggleLock(o);
    }}><Vi s={14} d={o.locked ? 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4' : 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.8-1.2'} /></button><button type="button" className={'fig-eject' + (o.hidden ? ' act' : '')} data-tip={o.hidden ? 'layShow' : 'layHide'} onClick={e => {
      e.stopPropagation();
      onToggleHide(o);
    }}><Ico n={o.hidden ? 'eyeOff' : 'eye'} size={14} /></button>{child && <button type="button" className="fig-eject" data-tip="layEject" onClick={e => {
      e.stopPropagation();
      onEjectChild(o);
    }}><Vi s={14} d="M7 17L17 7M9 7h8v8" /></button>}</>)}</div>);

const LayerGroupRow = React.memo(({
  item,
  allIds,
  gKey,
  isCollapsed,
  allHidden,
  allLocked,
  isAllSel,
  isSomeSel,
  dropOn,
  renaming,
  renameVal,
  layerNameLabel,
  clickSkipRef,
  onPick,
  onDragStart,
  onDragEnd,
  onGroupDragOver,
  onGroupDragLeave,
  onGroupDrop,
  onToggleCollapse,
  onToggleGroupLock,
  onToggleGroupHide,
  onUngroup,
  onBgClick,
  onStartRenameGroup,
  onRenameVal,
  onRenameCommitGroup,
  onRenameCancel
}) => <div key={'grp-hdr-' + item.id} data-layer-id={item.id} className={'fig-row frame-hdr' + (isAllSel || isCollapsed && isSomeSel ? ' on' : '') + (dropOn ? ' drop-on' : '')} onDragOver={e => onGroupDragOver(e, item)} onDragLeave={e => onGroupDragLeave(e, item)} onDrop={e => onGroupDrop(e, item)} onClick={e => {
    if (e.detail > 1 || renaming) return;
    clickSkipRef.current = true;
    onPick(allIds, e, isAllSel);
  }} onDoubleClick={e => {
    e.preventDefault();
    e.stopPropagation();
    clickSkipRef.current = true;
    onStartRenameGroup(gKey, item.id);
  }}><span className="fig-chev" role="button" aria-expanded={!isCollapsed} data-tip={isCollapsed ? 'layOpenFrame' : 'layCloseFrame'} style={{
      transform: isCollapsed ? 'rotate(-90deg)' : 'none'
    }} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={e => onToggleCollapse(item.id, e)}><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5L6 7.5L9 4.5" /></svg></span><span className="fig-lay-ico"><Ico n={item.isFrame ? 'hash' : 'objects'} size={15} /></span>{item.bg && <span className="ved-swatch" style={{
      width: 14,
      height: 14,
      cursor: 'pointer',
      background: item.bg.fill === 'none' ? 'transparent' : item.bg.fill
    }} data-tip="layFrameBg" onDoubleClick={e => e.stopPropagation()} onClick={e => {
      e.stopPropagation();
      clickSkipRef.current = true;
      onBgClick(item.bg.id);
    }} />}{renaming ? <RenInput renameVal={renameVal} layerNameLabel={layerNameLabel} onRenameVal={onRenameVal} onRenameCommit={v => onRenameCommitGroup(item.id, v)} onRenameCancel={onRenameCancel} /> : <span className="truncate" style={{ flex: "0 1 auto", minWidth: 0, maxWidth: 150 }} onDoubleClick={e => {
      e.preventDefault();
      e.stopPropagation();
      clickSkipRef.current = true;
      onStartRenameGroup(gKey, item.id);
    }}>{item.id}</span>}<button type="button" className={'fig-eject' + (allLocked ? ' act' : '')} data-tip={allLocked ? 'layFrameUnlock' : 'layFrameLock'} onClick={e => {
      e.stopPropagation();
      onToggleGroupLock(item, allLocked);
    }}><Vi s={14} d={allLocked ? 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4' : 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.8-1.2'} /></button><button type="button" className={'fig-eject' + (allHidden ? ' act' : '')} data-tip={allHidden ? 'layFrameShow' : 'layFrameHide'} onClick={e => {
      e.stopPropagation();
      onToggleGroupHide(item, allHidden);
    }}><Ico n={allHidden ? 'eyeOff' : 'eye'} size={14} /></button><button type="button" className="fig-eject" data-tip="veCtxUngroup" aria-label="Ungroup" onClick={e => {
      e.stopPropagation();
      onUngroup(item);
    }}><Ico n="objects" size={14} /></button></div>);

const LayerBucketRow = React.memo(({
  bucket,
  label,
  selected,
  onPickBucket,
  onEjectBucket,
  onDragStart,
  onDragEnd
}) => <div key={bucket.key || bucket.ids[0]} data-layer-id={bucket.ids[0]} draggable={true} onDragStart={e => onDragStart(e, bucket.ids)} onDragEnd={onDragEnd} style={{
    marginLeft: 14,
    paddingLeft: 10
  }} className={'fig-row child' + (selected ? ' on' : '')} onClick={e => onPickBucket(bucket, e, selected)}><span className="ved-swatch" style={{
      width: 15,
      height: 15,
      background: bucket.fill === 'none' ? 'transparent' : bucket.fill
    }} /><span className="truncate" style={{ flex: "0 1 auto", minWidth: 0, maxWidth: 150 }}>{label}</span><button type="button" className="fig-eject" data-tip="layEjectBucket" onClick={e => {
      e.stopPropagation();
      onEjectBucket(bucket);
    }}><Vi s={14} d="M7 17L17 7M9 7h8v8" /></button><span className="fig-badge">{bucket.ids.length}</span></div>);

const LayerEmptyRow = React.memo(({
  label
}) => <div className="fig-row child text-[10.5px] mut italic" style={{
    marginLeft: 14,
    paddingLeft: 10
  }}>{label}</div>);

export { LayerObjRow, LayerGroupRow, LayerBucketRow, LayerEmptyRow };
export default LayerObjRow;
