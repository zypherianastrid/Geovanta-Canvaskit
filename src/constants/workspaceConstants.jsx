/**
 * @file src/constants/workspaceConstants.jsx
 * @description Konstanta konfigurasi database Workspace & status simpan
 */
/* ============================================================================
   GEOVANTA WORKSPACE — CORE STORAGE & DATA LAYER (PHASE 1, 2, 3, 7, 9, 10, 11)
   Modules:
   1. WorkspaceDB        — IndexedDB Engine (projects, documents, assets, snapshots, metadata)
   2. AssetManager       — Blob Storage, Object URL Cache, DataURL Migration & Hydration
   3. ThumbnailGenerator — Offscreen Canvas 2D / SVG WebP Preview Generator (max 320x240)
   4. ZipEngine          — Standalone CRC32 + ZIP Archive Reader/Writer for .geovanta
   5. ProjectRepository  — Transactional CRUD, Duplicate, Trash, Snapshots & Backup/Restore
   ============================================================================ */

const WORKSPACE_DB_NAME = 'geovanta_workspace';
const WORKSPACE_DB_VERSION = 1;
const WORKSPACE_SCHEMA_VERSION = 1;
const MAX_SNAPSHOTS_PER_PROJECT = 5;
const ALLOWED_ASSET_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
/* ============================================================================
   GEOVANTA WORKSPACE — CONTROLLER, UI & ROUTER LAYER (PHASE 4, 5, 6, 8, 9, 11, 14)
   Modules:
   1. WorkspaceController — Autosave Scheduler (700ms debounce), Save Queue,
                            Flush on Navigation/VisibilityChange/PageHide,
                            Import as Project (.geovanta, SVG, AI/EPS/PS/PDF, Raster)
   2. WorkspaceUI         — Workspace Home, Header, Navigation Tabs, Search/Sort,
                            Project Grid & Cards, Create/Rename/Delete/Import/Storage/
                            Recovery/Quota Modals
   ============================================================================ */

const WS_LAST_PROJECT_KEY = 'geovanta_last_project_id';
const SAVE_STATUS_LABELS = {
  clean: 'Tersimpan',
  dirty: 'Belum tersimpan',
  saving: 'Menyimpan...',
  saved: 'Tersimpan',
  error: 'Gagal menyimpan',
  recovery: 'Pemulihan tersedia',
  'session-ram': 'Session-only (RAM)'
};

/* ----------------------------------------------------------------------------
   1. WorkspaceController — Lifecycle, Save Queue & Autosave Scheduler
   ---------------------------------------------------------------------------- */

export { WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION, WORKSPACE_SCHEMA_VERSION, MAX_SNAPSHOTS_PER_PROJECT, ALLOWED_ASSET_MIMES, WS_LAST_PROJECT_KEY, SAVE_STATUS_LABELS };
