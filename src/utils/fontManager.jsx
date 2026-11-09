/**
 * @file src/utils/fontManager.jsx
 * @description Layanan manajemen pemuatan font Google Fonts & font lokal
 */
import { ALL_FONT_WEIGHTS, BUILTIN_FONTS } from '../constants/fontCatalog.jsx';
import { WorkspaceDB } from '../workspace/workspaceDb.jsx';

const FontManager = (() => {
  const STORAGE_KEY = 'geovanta_google_fonts_v1';
  const IDB_META_KEY = 'custom_google_fonts';
  let _fonts = [];
  const _listeners = new Set();
  const _linkEls = new Map();
  const _notify = () => {
    const snap = _fonts.slice();
    _listeners.forEach(fn => {
      try {
        fn(snap);
      } catch (e) {}
    });
  };
  const _saveToStorage = () => {
    const serializable = _fonts.map(f => ({
      id: f.id,
      name: f.name,
      url: f.url,
      family: f.family,
      status: f.status === 'error' ? 'error' : 'loaded',
      weights: Array.isArray(f.weights) && f.weights.length ? f.weights : ALL_FONT_WEIGHTS
    }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {}
    try {
      if (typeof WorkspaceDB !== 'undefined' && WorkspaceDB && typeof WorkspaceDB.setMetadata === 'function') {
        WorkspaceDB.setMetadata(IDB_META_KEY, serializable).catch(() => {});
      }
    } catch (e) {}
  };
  const validateGoogleFontUrl = rawUrl => {
    if (!rawUrl || typeof rawUrl !== 'string') return {
      valid: false,
      code: 'empty',
      error: 'Masukkan URL Google Fonts atau nama font terlebih dahulu'
    };
    let clean = rawUrl.trim().replace(/&amp;/gi, '&');
    /* Ekstrak URL css / css2 dari snippet <link> atau @import */
    const cssUrlMatch = clean.match(/https?:\/\/fonts\.googleapis\.com\/css2?\?[^"'\s<>)]+/i);
    if (cssUrlMatch) {
      clean = cssUrlMatch[0];
    } else if (/^[A-Za-z0-9][A-Za-z0-9\s\-+]{0,60}$/.test(clean) && !/^https?:/i.test(clean) && !clean.includes('.') && !clean.includes('/')) {
      /* Pengguna mengetik langsung nama font Google Fonts (mis. "Poppins" atau "Fira Sans") -> konversi otomatis ke URL Google Fonts */
      const famName = clean.replace(/\+/g, ' ').trim().replace(/\s+/g, '+');
      clean = `https://fonts.googleapis.com/css2?family=${famName}:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap`;
    }
    try {
      const u = new URL(clean);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        return {
          valid: false,
          code: 'protocol',
          error: 'Protokol URL harus https://'
        };
      }
      if (!/^(fonts\.googleapis\.com)$/i.test(u.hostname)) {
        return {
          valid: false,
          code: 'domain',
          error: 'Domain harus fonts.googleapis.com'
        };
      }
      if (!/^\/css2?$/i.test(u.pathname)) {
        return {
          valid: false,
          code: 'path',
          error: 'Path harus /css atau /css2'
        };
      }
      const famParams = u.searchParams.getAll('family');
      if (!famParams.length || !famParams[0].trim()) {
        return {
          valid: false,
          code: 'family',
          error: 'Parameter family=... tidak ditemukan pada URL'
        };
      }
      return {
        valid: true,
        url: u.toString(),
        urlObj: u
      };
    } catch (e) {
      return {
        valid: false,
        code: 'format',
        error: 'Format URL Google Fonts tidak valid'
      };
    }
  };
  const parseGoogleFontUrl = rawUrl => {
    const v = validateGoogleFontUrl(rawUrl);
    if (!v.valid) return v;
    const u = v.urlObj;
    const families = [];
    const famParams = u.searchParams.getAll('family');
    famParams.forEach(fp => {
      if (/^\/css$/i.test(u.pathname)) {
        fp.split('|').forEach(part => {
          const [rawName, rawWeights] = part.split(':');
          const name = decodeURIComponent((rawName || '').replace(/\+/g, ' ')).trim();
          if (!name) return;
          const wSet = new Set();
          if (rawWeights) {
            rawWeights.split(',').forEach(tok => {
              const m = tok.match(/(\d{3})/);
              if (m) {
                const w = parseInt(m[1], 10);
                if (w >= 100 && w <= 900) wSet.add(w);
              } else if (/^(bold|b)$/i.test(tok)) wSet.add(700);else if (/^(regular|normal|italic|i)$/i.test(tok)) wSet.add(400);
            });
          }
          if (!wSet.size) {
            ALL_FONT_WEIGHTS.forEach(w => wSet.add(w));
          }
          families.push({
            name,
            family: `"${name}", sans-serif`,
            weights: Array.from(wSet).sort((a, b) => a - b)
          });
        });
      } else {
        const [rawName, axisSpec] = fp.split(':');
        const name = decodeURIComponent((rawName || '').replace(/\+/g, ' ')).trim();
        if (!name) return;
        const wSet = new Set();
        if (axisSpec) {
          const atParts = axisSpec.split('@');
          const valsStr = atParts[1] || '';
          if (valsStr) {
            valsStr.split(';').forEach(tuple => {
              const nums = tuple.split(',');
              nums.forEach(nStr => {
                if (nStr.includes('..')) {
                  const [wMin, wMax] = nStr.split('..').map(x => parseInt(x, 10));
                  if (wMin >= 100 && wMax <= 900) {
                    for (let w = Math.ceil(wMin / 100) * 100; w <= wMax; w += 100) wSet.add(w);
                  }
                } else {
                  const n = parseInt(nStr, 10);
                  if (n >= 100 && n <= 900 && n % 100 === 0) wSet.add(n);
                }
              });
            });
          }
        }
        if (!wSet.size) {
          ALL_FONT_WEIGHTS.forEach(w => wSet.add(w));
        }
        families.push({
          name,
          family: `"${name}", sans-serif`,
          weights: Array.from(wSet).sort((a, b) => a - b)
        });
      }
    });
    if (!families.length) return {
      valid: false,
      error: 'Tidak dapat membaca nama font dari URL'
    };
    return {
      valid: true,
      url: v.url,
      families
    };
  };
  const _injectStylesheet = fontEntry => {
    if (typeof document === 'undefined' || !document.head) return;
    let link = _linkEls.get(fontEntry.url);
    if (!link) {
      const existingLinks = document.head.querySelectorAll('link[data-gv-font-url]');
      for (let i = 0; i < existingLinks.length; i++) {
        if (existingLinks[i].getAttribute('data-gv-font-url') === fontEntry.url) {
          link = existingLinks[i];
          break;
        }
      }
    }
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fontEntry.url;
      link.setAttribute('data-gv-font-url', fontEntry.url);
      link.onload = () => {
        _fonts = _fonts.map(f => f.url === fontEntry.url ? {
          ...f,
          status: 'loaded'
        } : f);
        if (document.fonts && typeof document.fonts.load === 'function') {
          const w0 = fontEntry.weights && fontEntry.weights[0] || 400;
          document.fonts.load(`${w0} 24px "${fontEntry.name}"`).then(() => _notify()).catch(() => _notify());
        } else {
          _notify();
        }
        _saveToStorage();
      };
      link.onerror = () => {
        /* Tetap simpan font di daftar (status loaded dengan fallback) agar tidak gagal menyimpan saat koneksi terbatas */
        _fonts = _fonts.map(f => f.url === fontEntry.url ? {
          ...f,
          status: 'loaded'
        } : f);
        _saveToStorage();
        _notify();
      };
      document.head.appendChild(link);
      _linkEls.set(fontEntry.url, link);
    } else {
      _fonts = _fonts.map(f => f.url === fontEntry.url ? {
        ...f,
        status: 'loaded'
      } : f);
    }
  };
  const addFontUrl = rawUrl => {
    const parsed = parseGoogleFontUrl(rawUrl);
    if (!parsed.valid) return {
      ok: false,
      error: parsed.error
    };
    const added = [];
    parsed.families.forEach(fam => {
      const existingIdx = _fonts.findIndex(f => f.name.toLowerCase() === fam.name.toLowerCase());
      const entry = {
        id: existingIdx >= 0 ? _fonts[existingIdx].id : 'gfont-' + fam.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
        name: fam.name,
        url: parsed.url,
        family: fam.family,
        status: 'loaded',
        weights: fam.weights && fam.weights.length ? fam.weights : ALL_FONT_WEIGHTS
      };
      if (existingIdx >= 0) {
        _fonts[existingIdx] = entry;
      } else {
        _fonts.push(entry);
      }
      added.push(entry);
      _injectStylesheet(entry);
    });
    _saveToStorage();
    _notify();
    return {
      ok: true,
      added
    };
  };
  const removeFont = id => {
    const target = _fonts.find(f => f.id === id);
    if (!target) return false;
    _fonts = _fonts.filter(f => f.id !== id);
    _saveToStorage();
    _notify();
    return true;
  };
  const getCustomFonts = () => _fonts.slice();
  const getAllFonts = () => [...BUILTIN_FONTS, ..._fonts];
  const SYSTEM_FONT_NAMES = new Set(['arial', 'georgia', 'times new roman', 'verdana', 'trebuchet ms', 'impact', 'courier new', 'system-ui', 'sans-serif', 'serif', 'monospace']);
  const _loadedBuiltinUrls = new Set();
  const ensureFontLoaded = val => {
    if (!val || typeof document === 'undefined' || !document.head) return;
    const clean = String(val).replace(/['"]/g, '').split(',')[0].trim();
    if (!clean || SYSTEM_FONT_NAMES.has(clean.toLowerCase())) return;
    const all = getAllFonts();
    const found = all.find(f => f.name.toLowerCase() === clean.toLowerCase() || f.family.toLowerCase() === String(val).toLowerCase());
    const famName = (found ? found.name : clean).trim().replace(/\s+/g, '+');
    const url = found && found.url ? found.url : `https://fonts.googleapis.com/css2?family=${famName}:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap`;
    if (_loadedBuiltinUrls.has(url)) return;
    _loadedBuiltinUrls.add(url);
    _injectStylesheet({
      name: found ? found.name : clean,
      url,
      weights: found && found.weights ? found.weights : ALL_FONT_WEIGHTS
    });
  };
  const findFontByNameOrFamily = val => {
    if (!val) return BUILTIN_FONTS[0];
    const clean = String(val).replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
    const all = getAllFonts();
    const match = all.find(f => f.name.toLowerCase() === clean || f.family.toLowerCase() === String(val).toLowerCase()) || {
      id: 'custom-' + clean,
      name: String(val).replace(/['"]/g, '').split(',')[0].trim() || 'Inter',
      family: String(val),
      weights: ALL_FONT_WEIGHTS
    };
    ensureFontLoaded(match.name);
    return match;
  };
  const subscribe = fn => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  };
  const _mergeHydratedList = arr => {
    if (!Array.isArray(arr) || !arr.length) return;
    let changed = false;
    arr.forEach(item => {
      if (!item || !item.name || !item.url) return;
      const exists = _fonts.some(f => f.name.toLowerCase() === String(item.name).toLowerCase());
      if (!exists) {
        const entry = {
          id: item.id || 'gfont-' + String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: item.name,
          url: item.url,
          family: item.family || `"${item.name}", sans-serif`,
          status: 'loaded',
          weights: Array.isArray(item.weights) && item.weights.length ? item.weights : ALL_FONT_WEIGHTS
        };
        _fonts.push(entry);
        _injectStylesheet(entry);
        changed = true;
      }
    });
    if (changed) {
      _saveToStorage();
      _notify();
    }
  };
  const init = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        _mergeHydratedList(arr);
      }
    } catch (e) {}
  };
  const hydrateFromWorkspaceDB = () => {
    try {
      if (typeof WorkspaceDB !== 'undefined' && WorkspaceDB && typeof WorkspaceDB.getMetadata === 'function') {
        WorkspaceDB.getMetadata(IDB_META_KEY).then(arr => {
          if (Array.isArray(arr) && arr.length) _mergeHydratedList(arr);
        }).catch(() => {});
      }
    } catch (e) {}
  };
  init();
  return {
    validateGoogleFontUrl,
    parseGoogleFontUrl,
    addFontUrl,
    removeFont,
    getCustomFonts,
    getAllFonts,
    findFontByNameOrFamily,
    ensureFontLoaded,
    subscribe,
    hydrateFromWorkspaceDB
  };
})();

export { FontManager };
export default FontManager;
