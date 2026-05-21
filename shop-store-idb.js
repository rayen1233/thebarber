/**
 * Backup catalogue in IndexedDB (survives refresh when server store is empty or huge).
 */
const DB_NAME = "thebarber_store_cache_v1";
const STORE = "snapshots";
const KEY = "main";

/**
 * @param {{ products?: unknown[], users?: unknown[], orders?: unknown[] }} data
 */
export async function saveStoreSnapshotIdb(data) {
  if (typeof indexedDB === "undefined") return;
  const products = Array.isArray(data.products) ? data.products : [];
  if (!products.length) return;

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(
      {
        products: data.products,
        users: Array.isArray(data.users) ? data.users : [],
        orders: Array.isArray(data.orders) ? data.orders : [],
        savedAt: new Date().toISOString(),
      },
      KEY,
    );
  });
  db.close();
}

/** @returns {Promise<{ products: unknown[], users: unknown[], orders: unknown[], savedAt?: string } | null>} */
export async function loadStoreSnapshotIdb() {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!row || !Array.isArray(row.products) || !row.products.length) return null;
    return row;
  } catch {
    return null;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB indisponible."));
  });
}
