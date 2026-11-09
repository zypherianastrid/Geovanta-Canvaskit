/**
 * @file src/vendor/tauriDesktopBridge.jsx
 * @description Bridge integrasi native Tauri v2 / v1 untuk Windows 64-bit Desktop App (dialog file, sistem berkas, & jendela)
 */
import React from 'react';

const isTauriDesktop = () =>
  typeof window !== 'undefined' &&
  Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);

const invokeTauriCommand = async (cmd, args = {}) => {
  if (!isTauriDesktop()) return null;
  try {
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      return await window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
      return await window.__TAURI__.invoke(cmd, args);
    }
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
  } catch (err) {
    console.warn('[Geovanta Tauri Bridge] Invoke warning:', cmd, err);
  }
  return null;
};

const syncDesktopWindowTitle = async (projectName, saveStatus) => {
  const suffix = saveStatus === 'saving' ? ' • Menyimpan...' : '';
  const title = projectName ? `${projectName}${suffix} — Geovanta Vector Studio (Windows 64-Bit)` : 'Geovanta — Vector Editor (Windows 64-Bit)';
  if (typeof document !== 'undefined') {
    document.title = title;
  }
  await invokeTauriCommand('set_window_title', { title });
};

const TauriDesktopStatusBadge = () => {
  if (!isTauriDesktop()) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--sub)] text-[var(--acc)] border border-[var(--line)]">
      <span>Windows x64 Desktop</span>
    </span>
  );
};

export { isTauriDesktop, invokeTauriCommand, syncDesktopWindowTitle, TauriDesktopStatusBadge };
export default TauriDesktopStatusBadge;
