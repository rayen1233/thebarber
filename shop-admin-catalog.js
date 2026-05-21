/**
 * Admin ↔ base serveur : une seule source de vérité (/api/admin/catalog).
 * Pas de sync localStorage / hydrate parallèle pour le catalogue admin.
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
} from "./shop-remote.js";
import { dataUrlToBlob } from "./shop-media-store.js";
import { uploadInlinePhotosInProducts } from "./lib/catalog-media.mjs";

/** @type {import("./shop-core.js").Product[]} */
let adminCatalog = [];

const UPDATED_EVENT = "thebarber:admin-catalog-updated";

export function getAdminCatalogProducts() {
  return adminCatalog;
}

export function usesAdminDatabase() {
  return isRemoteMode() || Boolean(getAdminKey());
}

function catalogApiUrl(path = "/api/admin/catalog") {
  if (isRemoteMode()) return path;
  return `${getRemoteApiBase()}${path}`;
}

function authHeaders() {
  const key = getAdminKey();
  return {
    Authorization: `Bearer ${key}`,
    "X-Admin-Key": key,
    "Content-Type": "application/json",
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
 * @param {RequestInit} [init]
 */
async function adminCatalogFetch(url, init = {}) {
  const key = getAdminKey();
  if (!key) throw new Error("Clé admin requise (ADMIN_SECRET Vercel).");
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erreur serveur (${res.status})`);
  }
  return data;
}

/** Charge le catalogue depuis la base (obligatoire au démarrage admin). */
export async function refreshAdminCatalog() {
  if (!usesAdminDatabase()) {
    const { getProducts } = await import("./shop-core.js");
    adminCatalog = getProducts();
    return { ok: true, productCount: adminCatalog.length, source: "local" };
  }
  const data = await adminCatalogFetch(catalogApiUrl());
  applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
  return {
    ok: true,
    productCount: data.productCount ?? adminCatalog.length,
    source: "database",
  };
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
  const data = await adminCatalogFetch(
    `${catalogApiUrl()}?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
  if (!data.deleted) {
    throw new Error("Produit introuvable sur le serveur.");
  }
  return { productCount: data.productCount ?? adminCatalog.length, deletedId: id };
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

  const data = await adminCatalogFetch(catalogApiUrl(), {
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
  const data = await adminCatalogFetch(catalogApiUrl(), {
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
