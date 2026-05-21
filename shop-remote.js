/**
 * Sync catalogue / comptes / commandes with Vercel API (Blob-backed store).
 */
import {
  STORAGE_PRODUCTS,
  setProductsMemoryCache,
  getProductsMemoryCache,
} from "./shop-core.js";
import {
  STORAGE_USERS,
  STORAGE_ORDERS,
  STORAGE_CURRENT_USER,
} from "./shop-account-store.js";
import {
  saveStoreSnapshotIdb,
  loadStoreSnapshotIdb,
} from "./shop-store-idb.js";

const ADMIN_KEY_SESSION = "thebarber_admin_key_v1";
let hydratePromise = null;

/** @returns {boolean} */
export function isRemoteMode() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

export function getAdminKey() {
  try {
    return sessionStorage.getItem(ADMIN_KEY_SESSION) || "";
  } catch {
    return "";
  }
}

/** @param {string} key */
export function setAdminKey(key) {
  try {
    if (key) sessionStorage.setItem(ADMIN_KEY_SESSION, key);
    else sessionStorage.removeItem(ADMIN_KEY_SESSION);
  } catch {
    /* ignore */
  }
}

const LARGE_CATALOG_BYTES = 1_800_000;

/** @param {unknown} data */
export function parseCatalogImportJson(data) {
  if (Array.isArray(data)) {
    return { products: data, users: [], orders: [] };
  }
  if (!data || typeof data !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (data);
  const products = row.products ?? row.catalogue ?? row.catalog ?? row.items;
  if (!Array.isArray(products)) return null;
  return {
    products,
    users: Array.isArray(row.users) ? row.users : [],
    orders: Array.isArray(row.orders) ? row.orders : [],
  };
}

function persistProductsLocally(products) {
  if (!Array.isArray(products)) return;
  const json = JSON.stringify(products);
  if (json.length > LARGE_CATALOG_BYTES) {
    setProductsMemoryCache(/** @type {import("./shop-core.js").Product[]} */ (products));
    try {
      localStorage.removeItem(STORAGE_PRODUCTS);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    localStorage.setItem(STORAGE_PRODUCTS, json);
    setProductsMemoryCache(null);
  } catch {
    setProductsMemoryCache(/** @type {import("./shop-core.js").Product[]} */ (products));
  }
}

/**
 * @param {unknown[]} remote
 * @param {unknown[]} local
 * @param {boolean} forceEmpty
 */
function shouldApplyRemoteList(remote, local, forceEmpty) {
  if (!Array.isArray(remote)) return false;
  if (remote.length > 0) return true;
  if (forceEmpty) return true;
  return local.length === 0;
}

/**
 * @param {{ products?: unknown[], users?: unknown[], orders?: unknown[] }} data
 * @param {{ forceEmpty?: boolean }} [opts]
 */
function applyStoreToLocal(data, opts = {}) {
  const local = readLocalStorePayload();
  const force = Boolean(opts.forceEmpty);

  if (shouldApplyRemoteList(data.products, local.products, force)) {
    persistProductsLocally(/** @type {import("./shop-core.js").Product[]} */ (data.products));
    if (data.products.length > 0) {
      void saveStoreSnapshotIdb({
        products: data.products,
        users: data.users ?? local.users,
        orders: data.orders ?? local.orders,
      });
    }
  } else if (Array.isArray(data.products) && data.products.length === 0 && local.products.length > 0) {
    console.warn("[thebarber] serveur vide — produits locaux conservés");
  }

  if (shouldApplyRemoteList(data.users, local.users, force)) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(data.users));
  }
  if (shouldApplyRemoteList(data.orders, local.orders, force)) {
    localStorage.setItem(STORAGE_ORDERS, JSON.stringify(data.orders));
  }

  window.dispatchEvent(new CustomEvent("thebarber:products-updated"));
  window.dispatchEvent(new CustomEvent("thebarber:store-hydrated"));
}

export function readLocalStorePayload() {
  const parse = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  const mem = getProductsMemoryCache();
  return {
    products: mem?.length ? mem : parse(STORAGE_PRODUCTS),
    users: parse(STORAGE_USERS),
    orders: parse(STORAGE_ORDERS),
  };
}

/** Pull server store into localStorage (all visitors). */
export async function hydrateRemoteStore() {
  if (!isRemoteMode()) return { ok: true, source: "local" };
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const res = await fetch("/api/store", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const meta = data._meta && typeof data._meta === "object" ? data._meta : {};
      const remoteCount = Array.isArray(data.products) ? data.products.length : 0;

      if (!remoteCount) {
        const cached = await loadStoreSnapshotIdb();
        if (cached?.products?.length) {
          applyStoreToLocal(cached);
          return {
            ok: true,
            source: "idb-cache",
            meta,
            productCount: cached.products.length,
          };
        }
        const local = readLocalStorePayload();
        if (local.products.length > 0) {
          console.warn(
            "[thebarber] serveur vide — catalogue local conservé (publiez sur le serveur).",
          );
          return {
            ok: true,
            source: "local-preserved",
            meta,
            productCount: local.products.length,
          };
        }
      }

      applyStoreToLocal(data);
      return {
        ok: true,
        source: "remote",
        meta,
        productCount: remoteCount,
      };
    } catch (err) {
      console.warn("[thebarber] hydrate failed", err);
      const cached = await loadStoreSnapshotIdb();
      if (cached?.products?.length) {
        applyStoreToLocal(cached);
        return { ok: true, source: "idb-fallback", productCount: cached.products.length };
      }
      return { ok: false, source: "local", error: err };
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

/**
 * @param {{ products?: unknown[], users?: unknown[], orders?: unknown[] }} payload
 * @returns {Promise<string>}
 */
async function encodeStorePutBody(payload) {
  const json = JSON.stringify(payload);
  if (json.length < 2_500_000 || typeof CompressionStream === "undefined") {
    return json;
  }
  const compressed = await new Response(
    new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return JSON.stringify({ storeGzipBase64: btoa(binary) });
}

/**
 * Push full store (admin).
 * @param {{ products?: unknown[], users?: unknown[], orders?: unknown[] }} [override]
 */
export async function pushRemoteStore(override) {
  if (!isRemoteMode()) return { ok: true };
  const key = getAdminKey();
  if (!key) {
    return { ok: false, error: "Clé admin requise pour enregistrer sur le serveur." };
  }
  const payload = override || readLocalStorePayload();
  const body = await encodeStorePutBody(payload);
  const res = await fetch("/api/store", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Sync failed (${res.status})`);
  }
  const out = await res.json().catch(() => ({}));
  await saveStoreSnapshotIdb(payload);
  return { ok: true, productCount: out.productCount ?? payload.products.length };
}

/** @returns {Promise<{ productCount: number, blobConfigured?: boolean, adminConfigured?: boolean }>} */
export async function fetchRemoteStoreMeta() {
  if (!isRemoteMode()) {
    const local = readLocalStorePayload();
    return { productCount: local.products.length };
  }
  const res = await fetch("/api/store", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const meta = data._meta && typeof data._meta === "object" ? data._meta : {};
  return {
    productCount: Array.isArray(data.products) ? data.products.length : 0,
    blobConfigured: Boolean(meta.blobConfigured),
    adminConfigured: Boolean(meta.adminConfigured),
  };
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * @param {Blob | File} blob
 * @param {string} [filename]
 * @param {{ baseUrl?: string, adminKey?: string, contentType?: string }} [opts]
 */
export async function uploadMediaBlob(blob, filename = "upload.bin", opts = {}) {
  const baseUrl = (
    opts.baseUrl ||
    (typeof window !== "undefined" && isRemoteMode() ? window.location.origin : "")
  ).replace(/\/$/, "");
  const key = opts.adminKey || getAdminKey();
  if (!baseUrl) {
    throw new Error("URL du site Vercel requise pour envoyer une vidéo depuis localhost.");
  }
  if (!key) throw new Error("Clé admin requise pour téléverser des médias.");
  const dataBase64 = await blobToBase64(blob);
  const res = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      contentType: opts.contentType || blob.type || "application/octet-stream",
      dataBase64,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return String(data.url || "");
}

/**
 * @param {File | Blob} file
 * @param {string} [filename]
 */
export async function uploadMediaFile(file, filename = "upload.bin") {
  if (!isRemoteMode()) return null;
  return uploadMediaBlob(file, filename);
}

/**
 * @param {string} baseUrl
 * @param {string} adminKey
 * @param {{ products?: unknown[], users?: unknown[], orders?: unknown[] }} payload
 */
export async function pushStoreToBase(baseUrl, adminKey, payload) {
  const root = baseUrl.replace(/\/$/, "");
  const body = await encodeStorePutBody(payload);
  const res = await fetch(`${root}/api/store`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminKey}`,
    },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Sync failed (${res.status})`);
  }
  await saveStoreSnapshotIdb(payload);
  return { ok: true };
}

const MAX_REMOTE_VIDEO_BYTES = 11_500_000;

/**
 * Upload IndexedDB videos to Vercel Blob and update catalog on server.
 * Run from localhost admin (same browser where videos were added).
 * @param {{ baseUrl: string, adminKey: string, onProgress?: (msg: string) => void }} opts
 */
export async function migrateIdbVideosToRemote(opts) {
  const { getProducts, saveProducts } = await import("./shop-core.js");
  const {
    getProductVideoBlob,
    isIdbVideoRef,
    idbVideoProductId,
  } = await import("./shop-media-store.js");

  const baseUrl = String(opts.baseUrl || "").replace(/\/$/, "");
  const adminKey = String(opts.adminKey || "").trim();
  if (!baseUrl || !adminKey) {
    throw new Error("URL Vercel et clé admin requises.");
  }

  const list = getProducts();
  const withIdb = list.filter((p) => isIdbVideoRef(p.videoUrl));
  if (!withIdb.length) {
    return { uploaded: 0, skipped: 0, failed: 0, message: "Aucune vidéo locale (idb://) à migrer." };
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const updated = list.map((p) => ({ ...p }));

  for (let i = 0; i < updated.length; i++) {
    const p = updated[i];
    if (!isIdbVideoRef(p.videoUrl)) continue;
    const pid = idbVideoProductId(p.videoUrl);
    opts.onProgress?.(`[${i + 1}/${withIdb.length}] ${p.name}…`);

    const blob = await getProductVideoBlob(pid);
    if (!blob) {
      skipped++;
      opts.onProgress?.(`  → ignoré (fichier introuvable dans ce navigateur)`);
      continue;
    }
    if (blob.size > MAX_REMOTE_VIDEO_BYTES) {
      skipped++;
      opts.onProgress?.(
        `  → ignoré (${(blob.size / 1024 / 1024).toFixed(1)} Mo, max ~11 Mo)`,
      );
      continue;
    }
    try {
      const url = await uploadMediaBlob(blob, `${pid}.mp4`, {
        baseUrl,
        adminKey,
        contentType: blob.type || "video/mp4",
      });
      p.videoUrl = url;
      uploaded++;
      opts.onProgress?.(`  → OK`);
    } catch (err) {
      failed++;
      opts.onProgress?.(
        `  → erreur : ${err instanceof Error ? err.message : "échec"}`,
      );
    }
  }

  if (uploaded > 0) {
    saveProducts(updated);
    const payload = readLocalStorePayload();
    await pushStoreToBase(baseUrl, adminKey, payload);
    await saveStoreSnapshotIdb(payload);
  }

  return { uploaded, skipped, failed };
}

/**
 * If server store is empty but this browser has catalog data, offer one-time push.
 * @returns {Promise<boolean>} true if pushed
 */
export async function maybeMigrateLocalCatalogToServer() {
  if (!isRemoteMode() || !getAdminKey()) return false;
  try {
    const res = await fetch("/api/store", { cache: "no-store" });
    if (!res.ok) return false;
    const remote = await res.json();
    const remoteCount = Array.isArray(remote.products) ? remote.products.length : 0;
    const local = readLocalStorePayload();
    const localCount = local.products.length;
    if (remoteCount > 0 || localCount === 0) return false;
    await pushRemoteStore();
    return true;
  } catch {
    return false;
  }
}

/** Sync users/orders without admin key (boutique clients). */
export async function patchRemoteUsersOrders() {
  if (!isRemoteMode()) return { ok: true };
  const payload = readLocalStorePayload();
  const res = await fetch("/api/patch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      users: payload.users,
      orders: payload.orders,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Patch failed (${res.status})`);
  }
  return { ok: true };
}

/** Fire-and-forget sync after local mutations on Vercel. */
export function scheduleRemoteSync() {
  if (!isRemoteMode()) return;
  const run = getAdminKey()
    ? () => pushRemoteStore()
    : () => patchRemoteUsersOrders();
  void run().catch((err) => {
    console.warn("[thebarber] remote sync failed", err);
  });
}
