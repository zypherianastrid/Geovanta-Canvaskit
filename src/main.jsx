/**
 * @file src/main.jsx
 * @description Titik masuk utama (Entrypoint) aplikasi desktop Geovanta Tauri Windows 64-bit
 */
import './vendor/reactOfflineBundle.jsx';
import './vendor/tailwindOfflineBundle.jsx';
import React from 'react';
import ReactDOM from 'react-dom';
import { App } from './App.jsx';
import { VE } from './engine/vectorEngine.jsx';
import { RENDER_CONFIG, PERF_TELEMETRY } from './utils/renderConfigAndTelemetry.jsx';
import { DEVICE_PROFILES, ACTIVE_DEVICE_PROFILE, setDeviceProfileTier, computeSafeFramebufferSize, probeGpuCapabilities } from './utils/gpuCapabilities.jsx';
import { GEOMETRY_CACHE } from './renderer/geometryCache.jsx';
import { flattenCubicAdaptive } from './renderer/adaptiveCubicFlattener.jsx';
import { getObjectTessellationLOD, IMG_ELEMENT_CACHE } from './renderer/objectTessellationLod.jsx';
import { SceneRenderer } from './renderer/sceneRenderer.jsx';
import { WorkspaceDB } from './workspace/workspaceDb.jsx';
import { AssetManager } from './workspace/assetManager.jsx';
import { ThumbnailGenerator } from './workspace/thumbnailGenerator.jsx';
import { ZipEngine } from './workspace/zipEngine.jsx';
import { ProjectRepository } from './workspace/projectRepository.jsx';
import { WorkspaceController } from './workspace/workspaceController.jsx';
import { isTauriDesktop, syncDesktopWindowTitle } from './vendor/tauriDesktopBridge.jsx';

if (typeof window !== 'undefined') {
  window.__GEOVANTA_AUDIT__ = {
    VE,
    RENDER_CONFIG,
    DEVICE_PROFILES,
    ACTIVE_DEVICE_PROFILE: () => ACTIVE_DEVICE_PROFILE,
    setDeviceProfileTier,
    computeSafeFramebufferSize,
    probeGpuCapabilities,
    PERF_TELEMETRY,
    GEOMETRY_CACHE,
    IMG_ELEMENT_CACHE,
    flattenCubicAdaptive,
    getObjectTessellationLOD,
    SceneRenderer,
    WorkspaceDB,
    AssetManager,
    ThumbnailGenerator,
    ZipEngine,
    ProjectRepository,
    WorkspaceController,
    isTauriDesktop
  };
  syncDesktopWindowTitle(null, 'saved');
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
