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
  leanProductsForRemotePush,
} from "./shop-remote.js?v=20260521-adminfix";
import { dataUrlToBlob } from "./shop-media-store.js";

/** @type {import("./shop-core.js").Product[]} */
let adminCatalog = [];

const UPDATED_EVENT = "thebarber:admin-catalog-updated";

const API_PATHS = ["/api/admin-catalog", "/api/admin/catalog"];
const MAX_BODY_BYTES = 3_200_000;
const DELETE_CHUNK = 40;
const MERGE_PAUSE_MS = 280;

/** @param {number} ms */
function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<string>}
 */
async function encodeStoreBody(payload) {
  const json = JSON.stringify(payload);
  if (json.length < MAX_BODY_BYTES || typeof CompressionStream === "undefined") {
    return json;
  }
  const compressed = await new Response(
    new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const wrapped = { storeGzipBase64: btoa(binary) };
  if (payload.merge || payload.deletedProductIds?.length) wrapped.merge = true;
  return JSON.stringify(wrapped);
}

/** @param {Record<string, unknown>} payload */
async function storeMergePut(payload) {
  const key = getAdminKey();
  const url = isRemoteMode() ? "/api/store" : `${getRemoteApiBase()}/api/store`;
  const res = await fetch(url, {
    method: "PUT",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      "X-Admin-Key": key,
      "Content-Type": "application/json",
    },
    body: await encodeStoreBody(payload),
  });
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Réponse store non-JSON (${res.status})`);
    }
  }
  if (!res.ok) throw new Error(data.error || `Sync store (${res.status})`);
  return data;
}

/** DELETE via /api/store (route la plus fiable en production). */
async function deleteViaStoreApi(id) {
  const key = getAdminKey();
  const url = isRemoteMode()
    ? `/api/store?id=${encodeURIComponent(id)}`
    : `${getRemoteApiBase()}/api/store?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      "X-Admin-Key": key,
    },
  });
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Réponse suppression non-JSON (${res.status})`);
    }
  }
  if (!res.ok) throw new Error(data.error || `Suppression refusée (${res.status})`);
  if (Array.isArray(data.products)) {
    applyCatalogToAdmin(data.products);
  } else {
    await refreshAdminCatalog();
  }
  return {
    productCount: data.productCount ?? adminCatalog.length,
    deletedId: id,
    deleted: data.deleted !== false,
  };
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
    return { productCount: adminCatalog.length, deletedId: id, deleted: true };
  }

  let lastErr = null;
  try {
    const out = await deleteViaStoreApi(id);
    if (adminCatalog.some((p) => p.id === id)) {
      await refreshAdminCatalog();
    }
    if (!adminCatalog.some((p) => p.id === id)) {
      return { ...out, productCount: adminCatalog.length };
    }
    lastErr = new Error("Le produit est encore présent après suppression.");
  } catch (err) {
    lastErr = err instanceof Error ? err : new Error(String(err));
  }

  try {
    const data = await adminCatalogFetch(`id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (Array.isArray(data.products)) {
      applyCatalogToAdmin(data.products);
    } else {
      await refreshAdminCatalog();
    }
    if (!adminCatalog.some((p) => p.id === id)) {
      return {
        productCount: data.productCount ?? adminCatalog.length,
        deletedId: id,
        deleted: true,
      };
    }
  } catch (err) {
    if (!lastErr) lastErr = err instanceof Error ? err : new Error(String(err));
  }

  await refreshAdminCatalog().catch(() => {});
  if (!adminCatalog.some((p) => p.id === id)) {
    return { productCount: adminCatalog.length, deletedId: id, deleted: true };
  }
  throw lastErr || new Error("Suppression impossible — vérifiez la clé admin et redeploy Vercel.");
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
  const { normalizeVideoUrlForCatalog } = await import("./lib/blob-media-url.mjs");
  if (vid.startsWith("data:")) {
    opts.onProgress?.("Envoi vidéo…");
    const uploaded = await uploadMediaBlob(
      dataUrlToBlob(vid),
      `${prepared.id}.mp4`,
      { contentType: "video/mp4" },
    );
    prepared.videoUrl = normalizeVideoUrlForCatalog(uploaded);
  } else {
    const { isIdbVideoRef, idbVideoProductId, getProductVideoBlob } = await import(
      "./shop-media-store.js",
    );
    if (isIdbVideoRef(vid)) {
      opts.onProgress?.("Publication vidéo locale vers Blob…");
      const blob = await getProductVideoBlob(idbVideoProductId(vid));
      if (blob) {
        const uploaded = await uploadMediaBlob(blob, `${prepared.id}.mp4`, {
          contentType: blob.type || "video/mp4",
        });
        prepared.videoUrl = normalizeVideoUrlForCatalog(uploaded);
      } else {
        prepared.videoUrl = "";
      }
    } else {
      prepared.videoUrl = normalizeVideoUrlForCatalog(vid);
    }
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
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function adminReplaceCatalog(products, extra = {}, opts = {}) {
  if (!usesAdminDatabase()) {
    const { saveProducts } = await import("./shop-core.js");
    saveProducts(products);
    adminCatalog = products;
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
    return { productCount: products.length };
  }

  if (!products.length) {
    const data = await adminCatalogFetch("", {
      method: "PUT",
      body: JSON.stringify({
        products: [],
        users: extra.users || [],
        orders: extra.orders || [],
        clear: true,
      }),
    });
    applyCatalogToAdmin(Array.isArray(data.products) ? data.products : []);
    return { productCount: data.productCount ?? 0 };
  }

  const hasInline = products.some((p) => {
    const photos = Array.isArray(p.photos) ? p.photos : [];
    return photos.some((u) => String(u).startsWith("data:")) || String(p.videoUrl || "").startsWith("data:");
  });

  /** @type {import("./shop-core.js").Product[]} */
  let prepared = leanProductsForRemotePush(products);

  const current = await fetchStorePublic();
  const remoteList = Array.isArray(current.products) ? current.products : [];
  const newIds = new Set(prepared.map((p) => String(p.id || "")).filter(Boolean));
  const toDelete = remoteList
    .map((p) => (p && typeof p === "object" ? String(/** @type {{ id?: string }} */ (p).id || "") : ""))
    .filter((id) => id && !newIds.has(id));

  /** @type {{ name: string, error: string }[]} */
  const failures = [];
  /** @type {{ name: string, error: string }[]} */
  const photoFailures = [];
  let imported = 0;
  let lastCount = 0;

  opts.onProgress?.(`Enregistrement ${prepared.length} produit(s) (étape 1/2)…`);
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    const label = String(p.name || `produit ${i + 1}`).slice(0, 40);
    opts.onProgress?.(`Produit ${i + 1}/${prepared.length} — ${label}…`);
    try {
      const data = await storeMergePut({
        merge: true,
        products: [p],
        users: i === 0 && extra.users?.length ? extra.users : [],
        orders: i === 0 && extra.orders?.length ? extra.orders : [],
      });
      imported++;
      lastCount = data.productCount ?? lastCount;
      if (Array.isArray(data.products)) {
        applyCatalogToAdmin(data.products);
      }
      await pause(MERGE_PAUSE_MS);
    } catch (mergeErr) {
      const mergeMsg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      try {
        const data = await adminCatalogFetch("", {
          method: "POST",
          body: JSON.stringify({ product: p }),
        });
        imported++;
        lastCount = data.productCount ?? lastCount;
        if (Array.isArray(data.products)) {
          applyCatalogToAdmin(data.products);
        }
        await pause(MERGE_PAUSE_MS);
      } catch (postErr) {
        const postMsg = postErr instanceof Error ? postErr.message : String(postErr);
        failures.push({ name: label, error: mergeMsg || postMsg || "échec" });
        opts.onProgress?.(`  → échec : ${label}`);
      }
    }
  }

  if (hasInline && imported > 0) {
    opts.onProgress?.("Envoi des images vers Blob (étape 2/2)…");
    try {
      const uploaded = /** @type {import("./shop-core.js").Product[]} */ (
        await uploadInlinePhotosInProducts(
          products,
          (blob, name) => uploadMediaBlob(blob, name),
          opts.onProgress,
        )
      );
      for (let i = 0; i < uploaded.length; i++) {
        const row = uploaded[i];
        if (!row || typeof row !== "object") continue;
        const label = String(row.name || `produit ${i + 1}`).slice(0, 40);
        const lean = leanProductsForRemotePush([row])[0];
        if (!lean) continue;
        const hadBlob = (Array.isArray(lean.photos) ? lean.photos : []).some((u) =>
          /^https?:\/\//i.test(String(u)),
        );
        if (!hadBlob) continue;
        opts.onProgress?.(`Photos enregistrées ${i + 1}/${uploaded.length} — ${label}…`);
        try {
          const data = await storeMergePut({
            merge: true,
            products: [lean],
            users: [],
            orders: [],
          });
          lastCount = data.productCount ?? lastCount;
          if (Array.isArray(data.products)) {
            applyCatalogToAdmin(data.products);
          }
          await pause(MERGE_PAUSE_MS);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          photoFailures.push({ name: label, error: msg });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unauthorized|401/i.test(msg)) throw err;
      photoFailures.push({ name: "(upload images)", error: msg });
      opts.onProgress?.("Images partiellement envoyées — produits déjà en base.");
    }
  }

  if (toDelete.length) {
    for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
      const chunk = toDelete.slice(i, i + DELETE_CHUNK);
      opts.onProgress?.(
        `Retrait anciens produits (${Math.min(i + DELETE_CHUNK, toDelete.length)}/${toDelete.length})…`,
      );
      try {
        await storeMergePut({
          merge: true,
          deletedProductIds: chunk,
          products: [],
          users: [],
          orders: [],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ name: "(nettoyage catalogue)", error: msg });
      }
    }
  }

  if (extra.users?.length || extra.orders?.length) {
    await storeMergePut({
      merge: true,
      products: [],
      users: extra.users || [],
      orders: extra.orders || [],
    });
  }

  await refreshAdminCatalog();
  const productCount = adminCatalog.length || lastCount;
  const allErrors = [...failures, ...photoFailures];
  if (failures.length) {
    const summary = failures
      .slice(0, 5)
      .map((f) => `${f.name}: ${f.error}`)
      .join("\n");
    const more = failures.length > 5 ? `\n… et ${failures.length - 5} autre(s).` : "";
    throw new Error(
      `Import partiel : ${imported}/${prepared.length} produit(s) en base.\n\n${summary}${more}`,
    );
  }
  if (photoFailures.length) {
    const summary = photoFailures
      .slice(0, 3)
      .map((f) => `${f.name}: ${f.error}`)
      .join("\n");
    return {
      productCount,
      imported,
      failed: photoFailures.length,
      errors: allErrors,
      warning: `${imported} produit(s) importé(s). Certaines photos n’ont pas été envoyées :\n${summary}`,
    };
  }
  return { productCount, imported, failed: 0, errors: [] };
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
