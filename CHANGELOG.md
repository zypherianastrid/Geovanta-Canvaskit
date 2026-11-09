# Changelog

All notable changes to Geovanta Vector Studio are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — 2026-11-08

### Added
- Complete English translation of the whole application: every user-visible
  Indonesian string now has an English counterpart (157 new i18n keys,
  44 new toast entries, 77 new toast patterns). With language set to English
  the UI shows zero Indonesian strings; Indonesian mode is unchanged.
- Layer object names (`Persegi-N`, `path-26`, `Text-N`, `Frame-N`,
  `Boolean-N`) intentionally stay Indonesian — they are user-created names,
  not UI text.

### Fixed
- Layer tab empty space (desktop Windows): layer row names used to stretch
  across the full panel width (`flex-1`), so on a wide desktop panel the gap
  between the name and the node-count badge was far wider than on the web.
  Row names are now content-width (max 150 px) and the badge follows the
  name, so the gap is identical on desktop (320 px panel) and web
  (250 px panel).
- Save indicator jumping position: the header row wrapped (`flex-wrap`),
  so when the status label grew from "Tersimpan" to "Menyimpan..." the pill
  dropped to a second line and back. The row no longer wraps and the pill
  has a fixed width covering the whole autosave cycle, so its position never
  moves while saving.

## [1.0.0] — 2026-11-08

### Added
- Boolean / Pathfinder operations: Union, Subtract, Intersect, Exclude
  (Greiner-Hormann clipping, refit to Bézier), plus Outline Stroke and
  Offset Path, with context menu, floating-bar dropdown and shortcuts
  (Ctrl+Alt+U/S/I/X/O).
- Figcraft-style snapping: guide lines, equal spacing, threshold 5 px.
- Full English UI: Settings tab, tooltips and all app strings in English
  and Indonesian.
- Auto Layout (Flow/Row/Column/Grid), gradients, Bézier node editing,
  SVG/PNG/AI/EPS export, 100% offline (IndexedDB).
- MIT license.

### Fixed
- Performance: layer list virtualization, memoized rows, GPU overlay memo,
  tooltip delay after scroll, smooth-scroll lag removed.
- Layer scroll skeletons during fast scroll; previews return after scrolling
  stops.
