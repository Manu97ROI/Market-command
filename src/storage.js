// storage.js
// IndexedDB Storage Layer fuer persistenten Cache
// Daten ueberleben App-Neustart, automatisches TTL

const DB_NAME = "market-command-cache";
const DB_VERSION = 1;
const STORE_NAME = "data";

let dbPromise = null;

const openDB = () => {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB nicht verfuegbar"));
      return;
    }
    
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });
  
  return dbPromise;
};

// Speichere Daten mit Timestamp
export const setCached = async (key, data, ttlMs = 24 * 60 * 60 * 1000) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry = {
        key,
        data,
        timestamp: Date.now(),
        ttl: ttlMs,
        expires: Date.now() + ttlMs
      };
      const req = store.put(entry);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error("Cache write failed:", err);
    return false;
  }
};

// Hole Daten - returnt null wenn nicht da oder abgelaufen
export const getCached = async (key, ignoreExpiry = false) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result;
        if (!entry) {
          resolve(null);
          return;
        }
        const isExpired = entry.expires < Date.now();
        if (isExpired && !ignoreExpiry) {
          resolve(null);
          return;
        }
        resolve({
          data: entry.data,
          timestamp: entry.timestamp,
          isStale: isExpired,
          ageMs: Date.now() - entry.timestamp
        });
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
};

// Lösche einzelne Einträge
export const removeCached = async (key) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
};

// Hole alle Keys mit Prefix
export const getAllCachedWithPrefix = async (prefix) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      const results = [];
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.key.startsWith(prefix)) {
            results.push({ key: cursor.key, ...cursor.value });
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
};

// Cache-Storage Stats
export const getCacheStats = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve({ entries: req.result });
      req.onerror = () => resolve({ entries: 0 });
    });
  } catch (err) {
    return { entries: 0 };
  }
};
