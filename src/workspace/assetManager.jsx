/**
 * @file src/workspace/assetManager.jsx
 * @description Manajer deduplikasi aset gambar berbasis hash SHA-256 & siklus hidup Blob URL (AssetManager)
 */
import { ALLOWED_ASSET_MIMES } from '../constants/workspaceConstants.jsx';
import { wsUid } from '../utils/zoomAndFormatHelpers.jsx';
import { WorkspaceDB } from './workspaceDb.jsx';

/* ----------------------------------------------------------------------------
   2. AssetManager — Permanent Blob Storage, Hydration & Object URL Lifecycle
   ---------------------------------------------------------------------------- */
const AssetManager = (() => {
  // Cache active Object URLs: assetId -> { url, projectId, size, mimeType }
  const _urlCache = new Map();
  const normalizeMime = (mime, filename = '') => {
    const m = String(mime || '').toLowerCase().trim();
    if (m === 'image/jpg') return 'image/jpeg';
    if (ALLOWED_ASSET_MIMES.has(m)) return m;
    const ext = String(filename || '').split('.').pop().toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'image/png';
  };
  const extFromMime = mime => {
    const m = normalizeMime(mime);
    if (m === 'image/jpeg') return 'jpg';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/gif') return 'gif';
    return 'png';
  };
  const dataUrlToBlob = dataUrl => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) return null;
    const header = dataUrl.slice(5, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    const isBase64 = /;base64/i.test(header);
    const mimeRaw = header.split(';')[0] || 'image/png';
    const mimeType = normalizeMime(mimeRaw);
    try {
      if (isBase64) {
        const binStr = atob(body);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
        return new Blob([bytes], {
          type: mimeType
        });
      } else {
        const decoded = decodeURIComponent(body);
        return new Blob([decoded], {
          type: mimeType
        });
      }
    } catch (e) {
      return null;
    }
  };
  const blobToDataUrl = blob => new Promise((resolve, reject) => {
    if (!blob) return resolve('');
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Gagal membaca Blob'));
      reader.readAsDataURL(blob);
    } else {
      blob.arrayBuffer().then(buf => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(buf).toString('base64');
        resolve(`data:${blob.type || 'image/png'};base64,${b64}`);
      }).catch(reject);
    }
  });
  const getOrCreateObjectUrl = (assetId, blob, projectId) => {
    if (!assetId || !blob) return '';
    const cached = _urlCache.get(assetId);
    if (cached && cached.url) return cached.url;
    const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : `blob:geovanta-${assetId}`;
    _urlCache.set(assetId, {
      url,
      projectId: projectId || null,
      size: blob.size || 0,
      mimeType: blob.type || 'image/png'
    });
    return url;
  };
  const ingestBlob = async (projectId, fileOrBlob, customName) => {
    if (!projectId) throw new Error('projectId diperlukan untuk menyimpan aset');
    if (!fileOrBlob) throw new Error('Blob aset tidak valid');
    const name = customName || fileOrBlob.name || 'image.png';
    const mimeType = normalizeMime(fileOrBlob.type, name);
    const blob = fileOrBlob instanceof Blob ? fileOrBlob.type === mimeType ? fileOrBlob : new Blob([fileOrBlob], {
      type: mimeType
    }) : new Blob([fileOrBlob], {
      type: mimeType
    });
    const assetId = wsUid('ast');
    const record = {
      id: assetId,
      projectId,
      name,
      mimeType,
      size: blob.size || 0,
      blob,
      createdAt: Date.now()
    };
    await WorkspaceDB.put('assets', record);
    const href = getOrCreateObjectUrl(assetId, blob, projectId);
    return {
      assetId,
      href,
      name,
      mimeType,
      size: record.size,
      record
    };
  };
  const getAsset = async (assetId, expectedProjectId) => {
    if (!assetId) return null;
    const rec = await WorkspaceDB.get('assets', assetId);
    if (!rec) return null;
    if (expectedProjectId && rec.projectId !== expectedProjectId) return null;
    return rec;
  };
  const getProjectAssets = async projectId => {
    if (!projectId) return [];
    return await WorkspaceDB.getAllByIndex('assets', 'projectId', projectId);
  };

  // GV-A17: Prepares document for storage IMMUTABLY (never mutates the live editor doc or o.img in place).
  const _migratedDataUrlCache = new Map(); // projectId + ':' + objId -> { assetId, runtimeUrl }
  const prepareDocumentForStorage = async (projectId, doc) => {
    if (!doc || !Array.isArray(doc.objects)) {
      return {
        cleanDoc: {
          viewBox: [0, 0, 800, 600],
          objects: []
        },
        newAssets: [],
        externalWarnings: [],
        migratedMap: new Map()
      };
    }
    const newAssets = [];
    const externalWarnings = [];
    const cleanObjects = [];
    const migratedMap = new Map();
    for (let i = 0; i < doc.objects.length; i++) {
      const rawO = doc.objects[i];
      if (!rawO) continue;
      const {
        _glTextCv,
        _glTextTex,
        _glTextSig,
        _glTextPad,
        _glTextMb,
        _lastTextTexScale,
        ...o
      } = rawO;
      if (!o.img) {
        cleanObjects.push(o);
        continue;
      }
      const cacheKey = (projectId || '') + ':' + (o.id || i);
      const prevMig = _migratedDataUrlCache.get(cacheKey);
      let assetId = o.img.assetId || prevMig && prevMig.assetId || null;
      const href = String(o.img.href || '');

      // Section 5.5: Migrate legacy Data URL to IndexedDB Blob Asset without mutating o.img in-place
      if (!assetId && href.startsWith('data:image/')) {
        const blob = dataUrlToBlob(href);
        if (blob) {
          const ext = extFromMime(blob.type);
          const assetRec = {
            id: wsUid('ast'),
            projectId,
            name: (o.name || 'image') + '.' + ext,
            mimeType: normalizeMime(blob.type),
            size: blob.size || 0,
            blob,
            createdAt: Date.now()
          };
          newAssets.push(assetRec);
          assetId = assetRec.id;
          const runtimeUrl = getOrCreateObjectUrl(assetId, blob, projectId);
          _migratedDataUrlCache.set(cacheKey, {
            assetId,
            runtimeUrl
          });
          migratedMap.set(o.id, {
            assetId,
            href: runtimeUrl
          });
        }
      }
      if (assetId) {
        // Section 5.2: Strip runtime href when persisting to IndexedDB
        cleanObjects.push({
          ...o,
          img: {
            assetId,
            w: o.img.w,
            h: o.img.h,
            par: o.img.par || 'none'
          }
        });
      } else if (/^https?:\/\//i.test(href)) {
        // Section 5.5: External URL — keep reference & warn that it's not stored locally
        externalWarnings.push({
          objId: o.id,
          name: o.name,
          url: href
        });
        cleanObjects.push({
          ...o,
          img: {
            href,
            externalUrl: href,
            w: o.img.w,
            h: o.img.h,
            par: o.img.par || 'none'
          }
        });
      } else {
        cleanObjects.push({
          ...o,
          img: {
            ...(o.img.assetId ? {
              assetId: o.img.assetId
            } : {}),
            w: o.img.w,
            h: o.img.h,
            par: o.img.par || 'none'
          }
        });
      }
    }
    return {
      cleanDoc: {
        ...doc,
        viewBox: Array.isArray(doc.viewBox) && doc.viewBox.length === 4 ? [...doc.viewBox] : [0, 0, 800, 600],
        objects: cleanObjects
      },
      newAssets,
      externalWarnings,
      migratedMap
    };
  };

  // Section 5.4: Hydrate document when opening a project
  const hydrateDocument = async (projectId, doc, preloadedAssets = null) => {
    if (!doc || !Array.isArray(doc.objects)) {
      return {
        doc: {
          viewBox: [0, 0, 800, 600],
          objects: []
        },
        missingAssets: [],
        externalAssets: [],
        migratedAssets: []
      };
    }
    const assetsList = preloadedAssets || (await getProjectAssets(projectId));
    const assetMap = new Map(assetsList.map(a => [a.id, a]));
    const missingAssets = [];
    const externalAssets = [];
    const migratedAssets = [];
    const hydratedObjects = [];
    for (let i = 0; i < doc.objects.length; i++) {
      const o = doc.objects[i];
      if (!o || !o.img) {
        hydratedObjects.push(o);
        continue;
      }
      let assetId = o.img.assetId || null;
      let href = o.img.href || o.img.externalUrl || '';

      // Migrate Data URL on open if present
      if (!assetId && typeof href === 'string' && href.startsWith('data:image/')) {
        const blob = dataUrlToBlob(href);
        if (blob) {
          const saved = await ingestBlob(projectId, blob, (o.name || 'image') + '.' + extFromMime(blob.type));
          assetId = saved.assetId;
          href = saved.href;
          assetMap.set(assetId, saved.record);
          migratedAssets.push(assetId);
        }
      }
      if (assetId) {
        let rec = assetMap.get(assetId);
        if (!rec) {
          rec = await getAsset(assetId, projectId);
          if (rec) assetMap.set(assetId, rec);
        }
        if (rec && rec.blob) {
          const objUrl = getOrCreateObjectUrl(assetId, rec.blob, projectId);
          hydratedObjects.push({
            ...o,
            img: {
              href: objUrl,
              assetId,
              w: o.img.w,
              h: o.img.h,
              par: o.img.par || 'none'
            }
          });
        } else {
          // WS-020: Missing asset must report error gracefully, never crash editor
          missingAssets.push({
            objId: o.id,
            name: o.name || 'image',
            assetId
          });
          const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${o.img.w || 200}" height="${o.img.h || 150}" viewBox="0 0 200 150"><rect width="200" height="150" fill="#1f2937" rx="8"/><path d="M70 55l60 40M130 55l-60 40" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/></svg>`;
          const fallbackUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(placeholderSvg);
          hydratedObjects.push({
            ...o,
            img: {
              href: fallbackUrl,
              assetId,
              missing: true,
              w: o.img.w || 200,
              h: o.img.h || 150,
              par: o.img.par || 'none'
            }
          });
        }
      } else if (/^https?:\/\//i.test(href)) {
        externalAssets.push({
          objId: o.id,
          name: o.name || 'image',
          url: href
        });
        hydratedObjects.push({
          ...o,
          img: {
            href,
            externalUrl: href,
            w: o.img.w,
            h: o.img.h,
            par: o.img.par || 'none'
          }
        });
      } else {
        hydratedObjects.push(o);
      }
    }
    return {
      doc: {
        ...doc,
        viewBox: Array.isArray(doc.viewBox) && doc.viewBox.length === 4 ? [...doc.viewBox] : [0, 0, 800, 600],
        objects: hydratedObjects
      },
      missingAssets,
      externalAssets,
      migratedAssets
    };
  };

  // Converts runtime blob: hrefs to temporary inline Data URLs on a cloned doc
  // ONLY for standalone SVG/PNG/JPG/WEBP/AI/EPS file export outside the browser.
  const resolveDocForStandaloneExport = async (projectId, doc) => {
    if (!doc || !Array.isArray(doc.objects) || !doc.objects.some(o => o && o.img)) return doc;
    const nextObjects = await Promise.all(doc.objects.map(async o => {
      if (!o || !o.img) return o;
      if (o.img.assetId) {
        const rec = await getAsset(o.img.assetId, projectId);
        if (rec && rec.blob) {
          const dataUrl = await blobToDataUrl(rec.blob);
          return {
            ...o,
            img: {
              ...o.img,
              href: dataUrl
            }
          };
        }
      }
      return o;
    }));
    return {
      ...doc,
      objects: nextObjects
    };
  };

  // Section 5.6: Revoke Object URLs when a project is closed or deleted
  const releaseProjectUrls = projectId => {
    if (!projectId) return;
    for (const [assetId, entry] of _urlCache.entries()) {
      if (entry.projectId === projectId) {
        try {
          if (typeof URL !== 'undefined' && URL.revokeObjectURL && entry.url.startsWith('blob:')) {
            URL.revokeObjectURL(entry.url);
          }
        } catch (e) {}
        _urlCache.delete(assetId);
      }
    }
  };
  const releaseAssetUrl = assetId => {
    const entry = _urlCache.get(assetId);
    if (!entry) return;
    try {
      if (typeof URL !== 'undefined' && URL.revokeObjectURL && entry.url.startsWith('blob:')) {
        URL.revokeObjectURL(entry.url);
      }
    } catch (e) {}
    _urlCache.delete(assetId);
  };
  const getActiveUrlCount = () => _urlCache.size;
  return {
    normalizeMime,
    extFromMime,
    dataUrlToBlob,
    blobToDataUrl,
    getOrCreateObjectUrl,
    ingestBlob,
    getAsset,
    getProjectAssets,
    prepareDocumentForStorage,
    hydrateDocument,
    resolveDocForStandaloneExport,
    releaseProjectUrls,
    releaseAssetUrl,
    getActiveUrlCount
  };
})();

/* ----------------------------------------------------------------------------
   3. ThumbnailGenerator — Section 10 (Max 320 x 240 WebP Blob Preview)
   ---------------------------------------------------------------------------- */

export { AssetManager };
export default AssetManager;
