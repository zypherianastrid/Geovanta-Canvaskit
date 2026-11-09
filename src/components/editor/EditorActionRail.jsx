/**
 * @file src/components/editor/EditorActionRail.jsx
 * @description Komponen rail navigasi aksi cepat di sisi kiri Vector Editor (EditorActionRail)
 */
import React from 'react';

const EditorActionRail = ({
  renderRailDropdowns,
  L
}) => <aside className="fig-nav-rail" aria-label={L ? L.edQuickActions : 'Aksi Cepat Vektor'}><div className="fig-nav-dock flex flex-col items-center gap-2">{renderRailDropdowns()}</div></aside>;

export { EditorActionRail };
export default EditorActionRail;
