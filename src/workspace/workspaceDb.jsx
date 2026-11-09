/**
 * @file src/workspace/workspaceDb.jsx
 * @description Lapisan basis data lokal IndexedDB dengan fallback memori RAM otomatis (WorkspaceDB)
 */
import { WORKSPACE_DB_VERSION, WORKSPACE_DB_NAME, WORKSPACE_SCHEMA_VERSION } from '../constants/workspaceConstants.jsx';
import { isQuotaExceededError } from '../utils/zoomAndFormatHelpers.jsx';
import { FontManager } from '../utils/fontManager.jsx';

/* ----------------------------------------------------------------------------
   1. WorkspaceDB — IndexedDB Engine with Schema Migration & Safe Fallback
   ---------------------------------------------------------------------------- */
const WorkspaceDB = (() => {
  let _dbPromise = null;
  let _memFallback = null;
  const _initMemFallback = () => {
    if (_memFallback) return _memFallback;
    _memFallback = {
      projects: new Map(),
      documents: new Map(),
      assets: new Map(),
      snapshots: new Map(),
      metadata: new Map([['database_version', {
        key: 'database_version',
        value: WORKSPACE_DB_VERSION
      }]])
    };
    return _memFallback;
  };
  const open = () => {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        _initMemFallback();
        resolve(null);
        return;
      }
      let req;
      try {
        req = indexedDB.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);
      } catch (err) {
        _initMemFallback();
        resolve(null);
        return;
      }
      req.onupgradeneeded = event => {
        const db = event.target.result;
        const tx = event.target.transaction;

        // 4.1 Object Store: projects
        let projectStore;
        if (!db.objectStoreNames.contains('projects')) {
          projectStore = db.createObjectStore('projects', {
            keyPath: 'id'
          });
        } else {
          projectStore = tx.objectStore('projects');
        }
        if (!projectStore.indexNames.contains('name')) projectStore.createIndex('name', 'name', {
          unique: false
        });
        if (!projectStore.indexNames.contains('updatedAt')) projectStore.createIndex('updatedAt', 'updatedAt', {
          unique: false
        });
        if (!projectStore.indexNames.contains('lastOpenedAt')) projectStore.createIndex('lastOpenedAt', 'lastOpenedAt', {
          unique: false
        });
        if (!projectStore.indexNames.contains('status')) projectStore.createIndex('status', 'status', {
          unique: false
        });

        // 4.2 Object Store: documents
        let docStore;
        if (!db.objectStoreNames.contains('documents')) {
          docStore = db.createObjectStore('documents', {
            keyPath: 'id'
          });
        } else {
          docStore = tx.objectStore('documents');
        }
        if (!docStore.indexNames.contains('projectId')) docStore.createIndex('projectId', 'projectId', {
          unique: false
        });
        if (!docStore.indexNames.contains('updatedAt')) docStore.createIndex('updatedAt', 'updatedAt', {
          unique: false
        });

        // 4.3 Object Store: assets
        let assetStore;
        if (!db.objectStoreNames.contains('assets')) {
          assetStore = db.createObjectStore('assets', {
            keyPath: 'id'
          });
        } else {
          assetStore = tx.objectStore('assets');
        }
        if (!assetStore.indexNames.contains('projectId')) assetStore.createIndex('projectId', 'projectId', {
          unique: false
        });
        if (!assetStore.indexNames.contains('createdAt')) assetStore.createIndex('createdAt', 'createdAt', {
          unique: false
        });

        // 4.4 Object Store: snapshots
        let snapStore;
        if (!db.objectStoreNames.contains('snapshots')) {
          snapStore = db.createObjectStore('snapshots', {
            keyPath: 'id'
          });
        } else {
          snapStore = tx.objectStore('snapshots');
        }
        if (!snapStore.indexNames.contains('projectId')) snapStore.createIndex('projectId', 'projectId', {
          unique: false
        });
        if (!snapStore.indexNames.contains('savedAt')) snapStore.createIndex('savedAt', 'savedAt', {
          unique: false
        });

        // 4.5 Object Store: metadata
        let metaStore;
        if (!db.objectStoreNames.contains('metadata')) {
          metaStore = db.createObjectStore('metadata', {
            keyPath: 'key'
          });
        } else {
          metaStore = tx.objectStore('metadata');
        }
        metaStore.put({
          key: 'database_version',
          value: WORKSPACE_DB_VERSION
        });
        metaStore.put({
          key: 'schema_version',
          value: WORKSPACE_SCHEMA_VERSION
        });
        metaStore.put({
          key: 'initialized_at',
          value: Date.now()
        });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          _dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        const err = req.error;
        if (err && (err.name === 'SecurityError' || err.name === 'InvalidStateError')) {
          _initMemFallback();
          resolve(null);
          return;
        }
        _dbPromise = null;
        reject(err || new Error('Gagal membuka database IndexedDB geovanta_workspace'));
      };
      req.onblocked = () => {
        _dbPromise = null;
        reject(new Error('Database geovanta_workspace sedang diblokir oleh tab lain'));
      };
    });
    return _dbPromise;
  };
  const reqToPromise = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const runTransaction = async (storeNames, mode, executor) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const db = await open();
    if (!db) {
      const mem = _initMemFallback();
      if (_simulatedQuotaExceeded) {
        const qErr = new Error('Simulated QuotaExceededError');
        qErr.name = 'QuotaExceededError';
        throw qErr;
      }
      const fakeStores = {};
      names.forEach(n => {
        const map = mem[n];
        fakeStores[n] = {
          get: k => Promise.resolve(map.get(k) || undefined),
          getAll: () => Promise.resolve(Array.from(map.values())),
          getAllByIndex: (idxName, val) => Promise.resolve(Array.from(map.values()).filter(item => item && item[idxName] === val)),
          put: val => {
            const kp = n === 'metadata' ? 'key' : 'id';
            map.set(val[kp], val);
            return Promise.resolve(val[kp]);
          },
          delete: k => {
            map.delete(k);
            return Promise.resolve();
          }
        };
      });
      return await executor(fakeStores);
    }
    if (_simulatedQuotaExceeded && mode === 'readwrite') {
      const qErr = new Error('Simulated QuotaExceededError');
      qErr.name = 'QuotaExceededError';
      throw qErr;
    }
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(names, mode);
      } catch (err) {
        reject(err);
        return;
      }
      const stores = {};
      names.forEach(n => {
        const rawStore = tx.objectStore(n);
        stores[n] = {
          raw: rawStore,
          get: k => reqToPromise(rawStore.get(k)),
          getAll: () => reqToPromise(rawStore.getAll()),
          getAllByIndex: (idxName, val) => reqToPromise(rawStore.index(idxName).getAll(val)),
          put: val => reqToPromise(rawStore.put(val)),
          delete: k => reqToPromise(rawStore.delete(k))
        };
      });
      let resultVal;
      let execFailed = false;
      Promise.resolve().then(() => executor(stores, tx)).then(res => {
        resultVal = res;
      }).catch(err => {
        execFailed = true;
        try {
          tx.abort();
        } catch (e) {}
        reject(err);
      });
      tx.oncomplete = () => {
        if (!execFailed) resolve(resultVal);
      };
      tx.onerror = () => {
        if (!execFailed) reject(tx.error || new Error('Transaksi IndexedDB gagal'));
      };
      tx.onabort = () => {
        if (!execFailed) reject(tx.error || new Error('Transaksi IndexedDB dibatalkan'));
      };
    });
  };
  let _simulatedQuotaExceeded = false;
  const setSimulatedQuotaError = flag => {
    _simulatedQuotaExceeded = !!flag;
  };
  let _storageModeListeners = new Set();
  const getStorageMode = () => {
    if (_memFallback) return 'session-memory';
    if (typeof indexedDB === 'undefined' || !indexedDB) return 'unavailable';
    return 'indexeddb';
  };
  const isMemoryFallback = () => !!_memFallback;
  const onStorageModeChange = fn => {
    _storageModeListeners.add(fn);
    return () => _storageModeListeners.delete(fn);
  };
  const get = (storeName, key) => runTransaction([storeName], 'readonly', s => s[storeName].get(key));
  const getAll = storeName => runTransaction([storeName], 'readonly', s => s[storeName].getAll());
  const getAllByIndex = (storeName, indexName, value) => runTransaction([storeName], 'readonly', s => s[storeName].getAllByIndex(indexName, value));
  const put = (storeName, record) => runTransaction([storeName], 'readwrite', s => s[storeName].put(record));
  const remove = (storeName, key) => runTransaction([storeName], 'readwrite', s => s[storeName].delete(key));
  const getMetadata = async key => {
    const rec = await get('metadata', key);
    return rec ? rec.value : undefined;
  };
  const setMetadata = (key, value) => put('metadata', {
    key,
    value,
    updatedAt: Date.now()
  });
  return {
    open,
    runTransaction,
    get,
    getAll,
    getAllByIndex,
    put,
    remove,
    getMetadata,
    setMetadata,
    isQuotaExceededError,
    setSimulatedQuotaError,
    getStorageMode,
    isMemoryFallback,
    onStorageModeChange
  };
})();
if (typeof FontManager !== 'undefined' && FontManager && typeof FontManager.hydrateFromWorkspaceDB === 'function') {
  FontManager.hydrateFromWorkspaceDB();
} else if (typeof queueMicrotask === 'function') {
  queueMicrotask(() => {
    try {
      if (typeof FontManager !== 'undefined' && FontManager && typeof FontManager.hydrateFromWorkspaceDB === 'function') {
        FontManager.hydrateFromWorkspaceDB();
      }
    } catch (e) {}
  });
}

/* ----------------------------------------------------------------------------
   2. AssetManager — Permanent Blob Storage, Hydration & Object URL Lifecycle
   ---------------------------------------------------------------------------- */

export { WorkspaceDB };
export default WorkspaceDB;
