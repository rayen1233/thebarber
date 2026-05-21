/**
 * Admin ↔ base serveur : une seule source de vérité (/api/admin-catalog).
 */
import {
  setProductsMemoryCache,
  normalizeProductsForStorage,
  STORAGE_PRODUCTS,
} from "./shop-core.js";
import {
  isRemoteMode,
  getAdminKey,
  setAdminKey,
  getRemoteApiBase,
  setRemoteApiBase,
  DEFAULT_REMOTE_API_BASE,
  uploadMediaBlob,
  uploadInlinePhotosInProducts,
} from "./shop-remote.js";
import { dataUrlToBlob } from "./shop-media-store.js";

/** @type {import("./shop-core.js").Product[]} */
let adminCatalog = [];

const UPDATED_EVENT = "thebarber:admin-catalog-updated";

const API_PATHS = ["/api/admin-catalog", "/api/admin/catalog"];

export function getAdminCatalogProducts() {
  return adminCatalog;
}

export function usesAdminDatabase() {
  return isRemoteMode() || Boolean(getAdminKey());
}

function catalogApiUrl(path = "/api/admin-catalog") {
  if (isRemoteMode()) return path;
  return `${getRemoteApiBase()}${path}`;
}

function authHeaders() {
  const key = getAdminKey();
  return {
    Authorization: `Bearer ${key}`,
    "X-Admin-Key": key,
    Accept: "application/json",
  };
}

/** @param {import("./shop-core.js").Product[]} products */
function applyCatalogToAdmin(products) {
  adminCatalog = normalizeProductsForStorage(products);
  setProductsMemoryCache(adminCatalog);
  try {
    localStorage.removeItem(STORAGE_PRODUCTS);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
}

/**
 * @param {string} url
 * @param {RequestInit} init
 */
async function adminCatalogFetchOne(url, init) {
  const headers = { ...authHeaders(), ...(init.headers || {}) };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...init, cache: "no-store", headers });
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.slice(0, 120).replace(/\s+/g, " ");
      throw new Error(
        `Réponse non-JSON (${res.status}). ${preview || "Route API absente — redeploy Vercel."}`,
      );
    }
  }
  if (!res.ok) {
    throw new Error(data.error || `Erreur serveur (${res.status})`);
  }
  return data;
}

/**
 * @param {string} [query] ex. ?id=uuid pour DELETE
 * @param {RequestInit} [init]
 */
async function adminCatalogFetch(query = "", init = {}) {
  const key = getAdminKey();
  if (!key) throw new Error("Clé admin requise (ADMIN_SECRET Vercel).");

  const q = query.startsWith("?") ? query : query ? `?${query}` : "";
  let lastErr = null;
  for (const apiPath of API_PATHS) {
    const url = `${catalogApiUrl(apiPath)}${q}`;
    try {
      return await adminCatalogFetchOne(url, init);
    } catch (err) {
      lastErr = err;
      if (err instanceof TypeError) {
        throw new Error(
          `Connexion impossible (${url}). Vérifiez l’URL Vercel et le redeploy.`,
        );
      }
    }
  }
  throw lastErr || new Error("API admin catalogue indisponible.");
}

/** Lecture catalogue public (GET /api/store, sans clé). */
async function fetchStorePublic() {
  const url = isRemoteMode() ? "/api/store" : `${getRemoteApiBase()}/api/store`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Réponse /api/store illisible (non-JSON).");
    }
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** DELETE via /api/store (secours si /api/admin-catalog absent). */
async function deleteViaStoreApi(id) {
  const key = getAdminKey();
  const url = isRemoteMode()
    ? `/api/store?id=${encodeURIComponent(id)}`
    : `${getRemoteApiBase()}/api/store?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${key}`,
      "X-Admin-Key": key,
    },
  });
  const text = await res.text();
  const data = text.trim() ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `Suppression refusée (${res.status})`);
  applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
  return { productCount: data.productCount ?? adminCatalog.length, deletedId: id };
}

/** Charge le catalogue depuis la base. */
export async function refreshAdminCatalog() {
  if (!usesAdminDatabase()) {
    const { getProducts } = await import("./shop-core.js");
    adminCatalog = getProducts();
    return { ok: true, productCount: adminCatalog.length, source: "local" };
  }
  if (!getAdminKey()) {
    const data = await fetchStorePublic();
    applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
    return {
      ok: true,
      productCount: data.productCount ?? adminCatalog.length,
      source: "store-readonly",
    };
  }
  try {
    const data = await adminCatalogFetch("", { method: "GET" });
    applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
    return {
      ok: true,
      productCount: data.productCount ?? adminCatalog.length,
      source: "database",
    };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (!/404|non-JSON|indisponible|NOT_FOUND/i.test(msg)) throw err;
    const data = await fetchStorePublic();
    applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
    return {
      ok: true,
      productCount: data.productCount ?? adminCatalog.length,
      source: "store-fallback",
    };
  }
}

/** @param {string} productId */
export async function adminDeleteProduct(productId) {
  const id = String(productId || "").trim();
  if (!id) throw new Error("Identifiant produit invalide.");
  if (!usesAdminDatabase()) {
    const { deleteProduct, getProducts } = await import("./shop-core.js");
    deleteProduct(id);
    adminCatalog = getProducts();
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
    return { productCount: adminCatalog.length };
  }
  try {
    const data = await adminCatalogFetch(`id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
    if (!data.deleted) {
      throw new Error("Produit introuvable sur le serveur.");
    }
    return { productCount: data.productCount ?? adminCatalog.length, deletedId: id };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (/404|non-JSON|indisponible|NOT_FOUND/i.test(msg)) {
      return deleteViaStoreApi(id);
    }
    throw err;
  }
}

/**
 * @param {import("./shop-core.js").Product} product
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function adminSaveProduct(product, opts = {}) {
  let prepared = { ...product };
  const photos = Array.isArray(product.photos) ? product.photos : [];
  if (photos.some((u) => String(u).startsWith("data:"))) {
    opts.onProgress?.("Envoi des images vers Blob…");
    const uploaded = await uploadInlinePhotosInProducts(
      [prepared],
      (blob, name) => uploadMediaBlob(blob, name),
      opts.onProgress,
    );
    prepared = uploaded[0] || prepared;
  }
  const vid = String(prepared.videoUrl || "").trim();
  if (vid.startsWith("data:")) {
    opts.onProgress?.("Envoi vidéo…");
    prepared.videoUrl = await uploadMediaBlob(
      dataUrlToBlob(vid),
      `${prepared.id}.mp4`,
      { contentType: "video/mp4" },
    );
  }

  if (!usesAdminDatabase()) {
    const { upsertProduct, getProducts } = await import("./shop-core.js");
    upsertProduct(prepared, { skipRemoteSync: true });
    adminCatalog = getProducts();
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
    return { productCount: adminCatalog.length };
  }

  const data = await adminCatalogFetch("", {
    method: "POST",
    body: JSON.stringify({ product: prepared }),
  });
  applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
  return { productCount: data.productCount ?? adminCatalog.length };
}

/**
 * @param {import("./shop-core.js").Product[]} products
 * @param {{ users?: unknown[], orders?: unknown[] }} [extra]
 */
export async function adminReplaceCatalog(products, extra = {}) {
  if (!usesAdminDatabase()) {
    const { saveProducts } = await import("./shop-core.js");
    saveProducts(products);
    adminCatalog = products;
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
    return { productCount: products.length };
  }
  const data = await adminCatalogFetch("", {
    method: "PUT",
    body: JSON.stringify({
      products,
      users: extra.users || [],
      orders: extra.orders || [],
      clear: products.length === 0,
    }),
  });
  applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
  return { productCount: data.productCount ?? adminCatalog.length };
}

export function onAdminCatalogUpdated(fn) {
  window.addEventListener(UPDATED_EVENT, fn);
  return () => window.removeEventListener(UPDATED_EVENT, fn);
}

export async function initAdminCatalogConnection() {
  if (!isRemoteMode()) {
    setRemoteApiBase(getRemoteApiBase() || DEFAULT_REMOTE_API_BASE);
  }
  if (!getAdminKey()) return { ok: false, reason: "no-key" };
  return refreshAdminCatalog();
}

export { getRemoteApiBase, setRemoteApiBase, DEFAULT_REMOTE_API_BASE, getAdminKey, setAdminKey, isRemoteMode };
