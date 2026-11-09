# Geovanta Vector Studio — Windows 64-Bit Desktop App (Rust + Tauri)

Aplikasi desktop **Geovanta Vector Studio** untuk **Windows 64-bit (`x86_64-pc-windows-msvc`)** menggunakan **Rust + Tauri v2**, **React 18 (JSX)**, dan **Tailwind CSS v3.4.17** secara **100% Offline (Tanpa CDN & Tanpa Native CSS)**.

## Arsitektur Proyek

1. **1 File HTML Utama (`index.html`)**
   - Titik masuk DOM tunggal tanpa tag `<style>` native CSS dan tanpa link CDN eksternal.
2. **88 File Modular `.jsx` Berdasarkan Fungsinya (`src/`)**
   - `src/main.jsx` — Entrypoint aplikasi & registrasi bridge desktop Tauri.
   - `src/App.jsx` — Router aplikasi (`WorkspaceHome` & `VectorEditor`), manajemen preferensi, dialog pemulihan crash, & kuota penyimpanan.
   - `src/vendor/` (3 file `.jsx`)
     - `reactOfflineBundle.jsx` — Bundle lokal penuh React 18.3.1 & ReactDOM 18.3.1 (tanpa CDN).
     - `tailwindOfflineBundle.jsx` — Engine & runtime penuh Tailwind CSS v3.4.17 + plugin tema variabel desain Geovanta (tanpa CDN & tanpa file `.css` native).
     - `tauriDesktopBridge.jsx` — Bridge komunikasi IPC Rust Tauri (`set_window_title`, `get_system_info`, `save_vector_file`, `read_vector_file`).
   - `src/constants/` (7 file `.jsx`)
     - `brandAndIcons.jsx`, `tooltipsCatalog.jsx`, `keyboardShortcuts.jsx`, `themeAndPrefsConstants.jsx`, `fontCatalog.jsx`, `workspaceConstants.jsx`, `editorToolsAndShapes.jsx`.
   - `src/utils/` (10 file `.jsx`)
     - `colorMath.jsx`, `colorParserAndFormatter.jsx`, `screenPipette.jsx`, `presenceAndFilePicker.jsx`, `themeAndPrefsManager.jsx`, `gpuCapabilities.jsx`, `renderConfigAndTelemetry.jsx`, `zoomAndFormatHelpers.jsx`, `fontManager.jsx`, `shapeGenerators.jsx`.
   - `src/engine/` (22 file `.jsx`)
     - `vectorPrimitives.jsx`, `transformMatrixParser.jsx`, `arcToBezier.jsx`, `svgPathParser.jsx`, `svgPathSerializer.jsx`, `textAndImageEngine.jsx`, `gradientEngine.jsx`, `svgDocumentParser.jsx`, `svgDocumentSerializer.jsx`, `straightenAndAlignNodes.jsx`, `cornerFilletEngine.jsx`, `nodeEditingAndHandles.jsx`, `bezierSubdivisionAndMove.jsx`, `spatialIndexAndHitTest.jsx`, `multiSnapSolver.jsx`, `curveFittingAndAnomalies.jsx`, `topologicalCurveSimplifier.jsx`, `postscriptAiRasterIo.jsx`, `selectionTransformAndAlign.jsx`, `figmaAutoLayoutAndFrames.jsx`, `affineAndOrientedBox.jsx`, `autoRefineGeometry.jsx`, `vectorEngine.jsx`.
   - `src/renderer/` (8 file `.jsx`)
     - `subpathBBox.jsx`, `geometryCache.jsx`, `adaptiveCubicFlattener.jsx`, `objectTessellationLod.jsx`, `polygonTriangulatorAndStroke.jsx`, `sceneRenderer.jsx`, `pathWindingAndBatching.jsx`, `benchmarkSuite.jsx`.
   - `src/workspace/` (6 file `.jsx`)
     - `workspaceDb.jsx`, `assetManager.jsx`, `thumbnailGenerator.jsx`, `zipEngine.jsx`, `projectRepository.jsx`, `workspaceController.jsx`.
   - `src/components/ui/` (12 file `.jsx`)
     - `IconGlyphs.jsx`, `Slider.jsx`, `RangeField.jsx`, `FloatPopover.jsx`, `SelectDropdown.jsx`, `SegmentedControl.jsx`, `CustomTextBox.jsx`, `TransformField.jsx`, `PinGridSelector.jsx`, `ColorPickerField.jsx`, `ColorHexInput.jsx`, `ContextMenu.jsx`.
   - `src/components/modals/` (3 file `.jsx`)
     - `TooltipHost.jsx`, `HelpShortcutsModal.jsx`, `SettingsModal.jsx`.
   - `src/components/editor/` (13 file `.jsx`)
     - `GradientEditorPanel.jsx`, `GradientCanvasGizmo.jsx`, `SelectionRotationAndRedlines.jsx`, `CanvasVectorObjects.jsx`, `RenderDebugCanvasOverlay.jsx`, `LayerTreeViewport.jsx`, `EditorActionRail.jsx`, `EditorLeftSidebar.jsx`, `EditorSimplifyStrip.jsx`, `EditorFloatingToolbar.jsx`, `EditorRightInspector.jsx`, `VectorEditor.jsx`.
   - `src/components/workspace/` (2 file `.jsx`)
     - `WorkspaceProjectThumb.jsx`, `WorkspaceHome.jsx`.
3. **Paket Offline Lokal (`node_modules/` & `dist/assets/geovanta.bundle.js`)**
   - `node_modules/react`, `node_modules/react-dom`, dan `node_modules/tailwindcss` sudah terinstal di dalam folder proyek.
   - `dist/assets/geovanta.bundle.js` berisi hasil kompilasi seluruh 88 modul `.jsx` beserta React 18 dan Tailwind CSS sehingga langsung berjalan 100% offline.
4. **Backend Rust & Tauri Windows 64-Bit Installer (`src-tauri/`)**
   - `src-tauri/Cargo.toml` — Konfigurasi crate Rust dengan optimasi rilis (`lto = true`, `opt-level = 3`, `strip = true`).
   - `src-tauri/tauri.conf.json` — Target installer Windows 64-bit **NSIS (`_x64-setup.exe`)** dan **WiX MSI (`_x64_en-US.msi`)**.
   - `src-tauri/src/main.rs` & `src-tauri/src/lib.rs` — Subsystem Windows native (`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`) dan perintah IPC file/window.
   - `src-tauri/icons/` — Ikon aplikasi desktop Windows (`.ico` multi-resolusi & `.png`).

## Cara Build Installer Windows 64-Bit (`.exe` & `.msi`)

### Opsi 1: Klik Ganda Script Otomatis (Windows 64-Bit)
Jalankan file **`build-windows-64bit.bat`** pada PC Windows 64-bit yang memiliki Rust (`https://rustup.rs`). Script ini otomatis menjalankan:
```bat
rustup target add x86_64-pc-windows-msvc
node scripts/build-offline-bundle.js
cd src-tauri
cargo tauri build --target x86_64-pc-windows-msvc
```

Hasil installer 64-bit akan tersedia di:
- **NSIS Installer (`.exe`)**: `src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Geovanta Vector Studio_1.1.0_x64-setup.exe`
- **MSI Installer (`.msi`)**: `src-tauri\target\x86_64-pc-windows-msvc\release\bundle\msi\Geovanta Vector Studio_1.1.0_x64_en-US.msi`

### Opsi 2: Build Otomatis via GitHub Actions
Proyek ini juga dilengkapi workflow `.github/workflows/build-windows-x64.yml` yang siap mengompilasi installer `.exe` dan `.msi` 64-bit secara otomatis di runner `windows-latest`.

## Catatan Build (diperbarui)

- `index.html` TIDAK membaca file `src/*.jsx` secara langsung — ia memuat `dist/assets/geovanta.bundle.js`.
  Setiap selesai mengedit `src/`, bundle harus dikompilasi ulang:
  ```
  npm install --no-save esbuild   # sekali saja
  npm run build:web
  ```
- `scripts/build-offline-bundle.js` mengompilasi ulang bundle (jika `esbuild` terpasang) lalu menyalin
  `index.html` + bundle ke folder terisolasi `web/`, yang dipakai Tauri sebagai `frontendDist`
  (Tauri v2 menolak `frontendDist` yang mencakup `node_modules` / `src-tauri`).
- Tanpa `esbuild`, skrip memakai bundle yang sudah ada di `dist/` (sudah berisi 25 warna aksen).
