/**
 * Sync catalogue / comptes / commandes with Vercel API (Blob-backed store).
 */
import {
  STORAGE_PRODUCTS,
  setProductsMemoryCache,
  getProductsMemoryCache,
  saveProducts,
  normalizeProductsForStorage,
} from "./shop-core.js";
import { dataUrlToBlob } from "./shop-media-store.js";
import {
  STORAGE_USERS,
  STORAGE_ORDERS,
  STORAGE_CURRENT_USER,
} from "./shop-account-store.js";
import {
  saveStoreSnapshotIdb,
  loadStoreSnapshotIdb,
  clearStoreSnapshotIdb,
} from "./shop-store-idb.js";
import {
  MAX_VIDEO_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  CLIENT_UPLOAD_THRESHOLD_BYTES,
} from "./lib/media-limits.js";
import { catalogUrlFromBlobUpload } from "./lib/blob-media-url.mjs";

const ADMIN_KEY_SESSION = "thebarber_admin_key_v1";
const REMOTE_API_BASE_SESSION = "thebarber_remote_api_base_v1";
export const DEFAULT_REMOTE_API_BASE = "https://thebarber-three.vercel.app";
let hydratePromise = null;

/** @returns {string} */
export function getRemoteApiBase() {
  if (typeof window === "undefined") return "";
  if (isRemoteMode()) return window.location.origin.replace(/\/$/, "");
  try {
    const v = sessionStorage.getItem(REMOTE_API_BASE_SESSION);
    return (v || DEFAULT_REMOTE_API_BASE).replace(/\/$/, "");
  } catch {
    return DEFAULT_REMOTE_API_BASE;
  }
}

/** @param {string} url */
export function setRemoteApiBase(url) {
  const trimmed = String(url || "").trim().replace(/\/$/, "");
  try {
    if (trimmed) sessionStorage.setItem(REMOTE_API_BASE_SESSION, trimmed);
    else sessionStorage.removeItem(REMOTE_API_BASE_SESSION);
  } catch {
    /* ignore */
  }
}

/** Catalogue admin synchronisé avec Vercel Blob (site en ligne ou localhost + clé). */
export function usesRemoteCatalog() {
  if (isRemoteMode()) return true;
  return Boolean(getAdminKey() && getRemoteApiBase());
}

/** @param {string} [path] */
function storeApiUrl(path = "/api/store") {
  if (isRemoteMode()) return path;
  return `${getRemoteApiBase()}${path}`;
}

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
  const list = normalizeProductsForStorage(products);
  const json = JSON.stringify(list);
  if (json.length > LARGE_CATALOG_BYTES) {
    setProductsMemoryCache(/** @type {import("./shop-core.js").Product[]} */ (list));
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
    setProductsMemoryCache(/** @type {import("./shop-core.js").Product[]} */ (list));
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
 * @param {{ forceEmpty?: boolean, serverWins?: boolean }} [opts]
 */
function applyStoreToLocal(data, opts = {}) {
  const local = readLocalStorePayload();
  const force = Boolean(opts.forceEmpty || opts.serverWins);
  const serverWins = Boolean(opts.serverWins);

  if (serverWins || shouldApplyRemoteList(data.products, local.products, force)) {
    persistProductsLocally(/** @type {import("./shop-core.js").Product[]} */ (data.products));
    void saveStoreSnapshotIdb({
      products: Array.isArray(data.products) ? data.products : [],
      users: data.users ?? local.users,
      orders: data.orders ?? local.orders,
    });
  } else if (Array.isArray(data.products) && data.products.length === 0 && local.products.length > 0) {
    console.warn("[thebarber] serveur vide — produits locaux conservés (mode hors-ligne)");
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

/**
 * Pull server store into localStorage (all visitors).
 * @param {{ serverWins?: boolean, allowIdbFallback?: boolean }} [opts]
 *   serverWins — successful GET always replaces local catalogue (default true on Vercel).
 *   allowIdbFallback — use IDB only when the network request fails (not when server is empty).
 */
export async function hydrateRemoteStore(opts = {}) {
  if (!isRemoteMode() && !usesRemoteCatalog()) return { ok: true, source: "local" };
  const serverWins = opts.serverWins !== false;
  const allowIdbFallback = opts.allowIdbFallback !== false;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const res = await fetch(storeApiUrl("/api/store"), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const meta = data._meta && typeof data._meta === "object" ? data._meta : {};
      const remoteCount = Array.isArray(data.products) ? data.products.length : 0;

      applyStoreToLocal(data, { serverWins, forceEmpty: serverWins });
      return {
        ok: true,
        source: "remote",
        meta,
        productCount: remoteCount,
      };
    } catch (err) {
      console.warn("[thebarber] hydrate failed", err);
      if (allowIdbFallback) {
        const cached = await loadStoreSnapshotIdb();
        if (cached?.products?.length) {
          applyStoreToLocal(cached, { serverWins: false });
          return { ok: true, source: "idb-fallback", productCount: cached.products.length };
        }
      }
      return { ok: false, source: "local", error: err };
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

/** Admin: reload catalogue from server (never restore stale IDB over server). */
export async function hydrateAdminFromServer() {
  return hydrateRemoteStore({ serverWins: true, allowIdbFallback: false });
}

const MAX_PUT_BYTES = 3_200_000;
const PLACEHOLDER_PHOTO = "public/vite.svg";

/**
 * Retire data: / idb: trop lourds pour PUT Vercel — garde http(s) et chemins public/.
 * @param {unknown[]} products
 */
export function leanProductsForRemotePush(products) {
  return products.map((p, i) => {
    if (!p || typeof p !== "object") return p;
    const row = { .../** @type {Record<string, unknown>} */ (p) };
    let photos = (Array.isArray(row.photos) ? row.photos : [])
      .map((u) => String(u || "").trim())
      .filter((u) => u && !u.startsWith("data:") && !u.startsWith("idb://"));
    if (!photos.length) photos = [PLACEHOLDER_PHOTO];
    while (photos.length < 3) photos.push(photos[0]);
    row.photos = photos.slice(0, 6);
    const vid = String(row.videoUrl || "").trim();
    if (vid.startsWith("data:") || vid.startsWith("idb://")) row.videoUrl = "";
    if (!row.id) row.id = `p-import-${i}-${Date.now()}`;
    return row;
  });
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<string>}
 */
async function encodeStorePutBody(payload) {
  const json = JSON.stringify(payload);
  if (json.length < MAX_PUT_BYTES || typeof CompressionStream === "undefined") {
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

/**
 * @param {unknown[]} products
 * @param {(blob: Blob, filename: string) => Promise<string>} upload
 * @param {(msg: string) => void} [onProgress]
 */
export async function uploadInlinePhotosInProducts(products, upload, onProgress) {
  const out = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p || typeof p !== "object") continue;
    const row = { .../** @type {Record<string, unknown>} */ (p) };
    const photos = Array.isArray(row.photos) ? row.photos : [];
    const nextPhotos = [];
    onProgress?.(`Photos ${i + 1}/${products.length}…`);
    for (let j = 0; j < photos.length; j++) {
      const raw = String(photos[j] || "");
      if (raw.startsWith("data:image")) {
        let url = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            url = await upload(dataUrlToBlob(raw), `p-${row.id || i}-${j}.jpg`);
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/unauthorized|401/i.test(msg)) throw err;
            if (attempt === 2) console.warn("[thebarber] photo upload failed", row.id, j, msg);
            else await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
        if (url) nextPhotos.push(url);
      } else {
        nextPhotos.push(raw);
      }
    }
    row.photos = nextPhotos;
    out.push(row);
  }
  return out;
}

/**
 * @param {string} key
 * @param {string} body
 */
async function putStoreBody(key, body) {
  const res = await fetch(storeApiUrl("/api/store"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-Admin-Key": key,
    },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Sync failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Push full store (admin) — uploads inline images, then sends 1 product per request.
 * @param {{ products?: unknown[], users?: unknown[], orders?: unknown[] }} [override]
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function pushRemoteStore(override, opts = {}) {
  if (!usesRemoteCatalog()) {
    return { ok: false, error: "Clé admin requise pour enregistrer sur le serveur Vercel." };
  }
  const key = getAdminKey();
  if (!key) {
    return { ok: false, error: "Clé admin requise pour enregistrer sur le serveur." };
  }
  let payload = override || readLocalStorePayload();
  if (!override?.products?.length && !payload.products?.length) {
    opts.onProgress?.("Catalogue local vide — lecture du serveur…");
    const res = await fetch(storeApiUrl("/api/store"), { cache: "no-store" });
    if (res.ok) {
      const remote = await res.json();
      if (Array.isArray(remote.products) && remote.products.length) {
        payload = {
          products: remote.products,
          users: remote.users || [],
          orders: remote.orders || [],
        };
        persistProductsLocally(payload.products);
      }
    }
  }
  const products = Array.isArray(payload.products) ? payload.products : [];

  if (!products.length) {
    throw new Error(
      "Aucun produit à publier. Cliquez d’abord sur « Charger depuis la base » ou importez le JSON, puis réessayez.",
    );
  }

  const hasInline = products.some((p) => {
    const photos = p && typeof p === "object" && Array.isArray(p.photos) ? p.photos : [];
    return photos.some((u) => String(u).startsWith("data:"));
  });

  if (hasInline) {
    opts.onProgress?.("Envoi des images vers Vercel Blob…");
    try {
      const uploaded = await uploadInlinePhotosInProducts(
        products,
        (blob, name) => uploadMediaBlob(blob, name),
        opts.onProgress,
      );
      payload = { ...payload, products: uploaded };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unauthorized|401/i.test(msg)) throw err;
      console.warn("[thebarber] upload photos partiel, envoi allégé", err);
      opts.onProgress?.("Photos non envoyées — catalogue allégé pour le serveur…");
    }
  }

  payload = {
    ...payload,
    products: leanProductsForRemotePush(
      Array.isArray(payload.products) ? payload.products : [],
    ),
  };
  saveProducts(/** @type {import("./shop-core.js").Product[]} */ (payload.products));

  let lastCount = 0;
  const list = Array.isArray(payload.products) ? payload.products : [];

  const fullReplaceBody = await encodeStorePutBody({
    merge: false,
    products: list,
    users: payload.users || [],
    orders: payload.orders || [],
  });
  if (list.length && fullReplaceBody.length <= MAX_PUT_BYTES) {
    opts.onProgress?.("Publication du catalogue complet sur le serveur…");
    const out = await putStoreBody(key, fullReplaceBody);
    lastCount = out.productCount ?? list.length;
    await saveStoreSnapshotIdb(payload);
    return { ok: true, productCount: lastCount };
  }

  for (let i = 0; i < list.length; i++) {
    opts.onProgress?.(`Catalogue ${i + 1}/${list.length}…`);
    const chunk = {
      merge: true,
      products: [list[i]],
      users: i === 0 ? payload.users || [] : [],
      orders: i === 0 ? payload.orders || [] : [],
    };
    const body = await encodeStorePutBody(chunk);
    if (body.length > MAX_PUT_BYTES) {
      throw new Error(
        `Produit « ${list[i]?.name || i + 1} » trop lourd même seul — compressez les images.`,
      );
    }
    const out = await putStoreBody(key, body);
    lastCount = out.productCount ?? lastCount;
  }

  if (!list.length) {
    const body = await encodeStorePutBody({ merge: false, ...payload });
    const out = await putStoreBody(key, body);
    lastCount = out.productCount ?? 0;
    await clearStoreSnapshotIdb();
  } else {
    await saveStoreSnapshotIdb(payload);
  }

  return { ok: true, productCount: lastCount };
}

/**
 * Import catalogue : supprime les produits absents du JSON puis publie les nouveaux.
 * @param {{ products: unknown[], users?: unknown[], orders?: unknown[] }} payload
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function replaceRemoteCatalog(payload, opts = {}) {
  if (!usesRemoteCatalog()) {
    throw new Error("Clé admin requise pour importer sur la base Vercel.");
  }
  const key = getAdminKey();
  const products = Array.isArray(payload.products) ? payload.products : [];
  const newIds = new Set(
    products
      .map((p) => (p && typeof p === "object" ? String(/** @type {{ id?: string }} */ (p).id || "") : ""))
      .filter(Boolean),
  );

  opts.onProgress?.("Lecture du catalogue serveur…");
  const res = await fetch(storeApiUrl("/api/store"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Lecture serveur impossible (${res.status})`);
  const remote = await res.json();
  const remoteList = Array.isArray(remote.products) ? remote.products : [];
  const toDelete = remoteList
    .map((p) => (p && typeof p === "object" ? String(/** @type {{ id?: string }} */ (p).id || "") : ""))
    .filter((id) => id && !newIds.has(id));

  const CHUNK = 40;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    opts.onProgress?.(`Retrait anciens produits (${i + chunk.length}/${toDelete.length})…`);
    const body = await encodeStorePutBody({
      merge: true,
      deletedProductIds: chunk,
      products: [],
      users: [],
      orders: [],
    });
    await putStoreBody(key, body);
  }

  const lean = leanProductsForRemotePush(products);
  opts.onProgress?.("Publication du catalogue sur le serveur…");
  const body = await encodeStorePutBody({
    merge: false,
    products: lean,
    users: payload.users || [],
    orders: payload.orders || [],
  });
  const out = await putStoreBody(key, body);
  const savedCount = out.productCount ?? 0;
  const verified =
    typeof out.verifiedCount === "number" ? out.verifiedCount : savedCount;

  saveProducts(/** @type {import("./shop-core.js").Product[]} */ (lean));
  await saveStoreSnapshotIdb({
    products: lean,
    users: payload.users || [],
    orders: payload.orders || [],
  });

  let serverCount = Math.max(savedCount, verified);
  for (let i = 0; i < 5 && serverCount === 0; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const healthRes = await fetch(storeApiUrl("/api/health"), { cache: "no-store" });
    const health = healthRes.ok ? await healthRes.json().catch(() => ({})) : {};
    serverCount = typeof health.productCount === "number" ? health.productCount : 0;
  }

  if (!serverCount) {
    throw new Error(
      "Le serveur n’a pas enregistré le catalogue (0 produit). Vérifiez ADMIN_SECRET, redeploy Vercel, ou lancez : node scripts/push-catalog.mjs votre-fichier.json VOTRE_CLE --skip-images",
    );
  }
  return { ok: true, productCount: serverCount };
}

/**
 * Envoie images/vidéos (data:, idb://) depuis un export JSON vers Blob et met à jour chaque produit sur le serveur.
 * @param {unknown[]} sourceProducts — produits du fichier export (avec data: ou idb://)
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function restoreCatalogMediaFromSource(sourceProducts, opts = {}) {
  if (!usesRemoteCatalog()) {
    throw new Error("Clé admin requise pour publier les médias sur Vercel.");
  }
  const key = getAdminKey();
  if (!key) throw new Error("Clé admin requise.");

  const { dataUrlToBlob, isIdbVideoRef, getProductVideoBlob, idbVideoProductId } =
    await import("./shop-media-store.js");

  const res = await fetch(storeApiUrl("/api/store"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Lecture serveur impossible (${res.status})`);
  const remote = await res.json();
  const serverList = Array.isArray(remote.products) ? remote.products : [];

  const byId = new Map();
  const byName = new Map();
  for (const s of sourceProducts) {
    if (!s || typeof s !== "object") continue;
    const row = /** @type {{ id?: string, name?: string }} */ (s);
    if (row.id) byId.set(String(row.id), s);
    if (row.name) byName.set(String(row.name).trim().toLowerCase(), s);
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < serverList.length; i++) {
    const remoteP = serverList[i];
    if (!remoteP || typeof remoteP !== "object") continue;
    const rid = String(/** @type {{ id?: string, name?: string }} */ (remoteP).id || "");
    const rname = String(/** @type {{ name?: string }} */ (remoteP).name || "")
      .trim()
      .toLowerCase();
    const src =
      byId.get(rid) || (rname ? byName.get(rname) : null);
    if (!src || typeof src !== "object") {
      skipped++;
      continue;
    }

    const srcPhotos = Array.isArray(/** @type {{ photos?: unknown[] }} */ (src).photos)
      ? /** @type {{ photos: unknown[] }} */ (src).photos
      : [];
    const srcVideo = String(/** @type {{ videoUrl?: string }} */ (src).videoUrl || "").trim();
    const hasDataPhotos = srcPhotos.some((u) => String(u).startsWith("data:"));
    const hasDataVideo = srcVideo.startsWith("data:");
    const hasIdbVideo = isIdbVideoRef(srcVideo);

    if (!hasDataPhotos && !hasDataVideo && !hasIdbVideo) {
      skipped++;
      continue;
    }

    let work = {
      .../** @type {Record<string, unknown>} */ (remoteP),
      photos: hasDataPhotos ? srcPhotos : remoteP.photos,
      videoUrl: srcVideo || remoteP.videoUrl,
    };

    const label = String(/** @type {{ name?: string }} */ (remoteP).name || rid || i + 1);
    opts.onProgress?.(`[${i + 1}/${serverList.length}] ${label}…`);

    try {
      if (hasDataPhotos) {
        const uploaded = await uploadInlinePhotosInProducts(
          [work],
          (blob, name) => uploadMediaBlob(blob, name),
          opts.onProgress,
        );
        work = uploaded[0] || work;
      }

      const vid = String(work.videoUrl || "").trim();
      if (isIdbVideoRef(vid)) {
        const blob = await getProductVideoBlob(idbVideoProductId(vid));
        if (blob && blob.size <= MAX_REMOTE_VIDEO_BYTES) {
          work.videoUrl = await uploadMediaBlob(blob, `${rid || i}.mp4`, {
            contentType: blob.type || "video/mp4",
          });
        }
      } else if (vid.startsWith("data:")) {
        work.videoUrl = await uploadMediaBlob(
          dataUrlToBlob(vid),
          `${rid || i}.mp4`,
          { contentType: "video/mp4" },
        );
      }

      work.photos = (Array.isArray(work.photos) ? work.photos : [])
        .map((u) => String(u || "").trim())
        .filter((u) => u && !u.startsWith("data:") && !u.startsWith("idb://"));
      if (!work.photos.length) {
        work.photos = Array.isArray(remoteP.photos) ? remoteP.photos : ["public/vite.svg"];
      }

      const body = await encodeStorePutBody({
        merge: true,
        products: [work],
        users: [],
        orders: [],
      });
      await putStoreBody(key, body);
      updated++;
    } catch (err) {
      failed++;
      console.warn("[thebarber] restore media failed", label, err);
      opts.onProgress?.(
        `  → erreur : ${err instanceof Error ? err.message : "échec"}`,
      );
    }
  }

  return { updated, skipped, failed, total: serverList.length };
}

/** @returns {Promise<{ productCount: number, blobConfigured?: boolean, adminConfigured?: boolean }>} */
export async function fetchRemoteStoreMeta() {
  if (!usesRemoteCatalog()) {
    const local = readLocalStorePayload();
    return { productCount: local.products.length };
  }
  const res = await fetch(storeApiUrl("/api/store"), { cache: "no-store" });
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
/**
 * Réduit les JPEG/PNG avant POST /api/upload (limite corps ~4.5 Mo sur Vercel).
 * @param {Blob} blob
 */
async function compressImageBlobForUpload(blob) {
  const type = String(blob.type || "");
  if (!type.startsWith("image/") || blob.size <= MAX_IMAGE_UPLOAD_BYTES) return blob;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return blob;
  }
  let bmp;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    try {
      bmp = await createImageBitmap(blob);
    } catch {
      return blob;
    }
  }
  try {
    let maxSide = 1400;
    let quality = 0.78;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    for (let pass = 0; pass < 18; pass++) {
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const bytes = (dataUrl.length * 3) / 4;
      if (bytes <= MAX_IMAGE_UPLOAD_BYTES) {
        const res = await fetch(dataUrl);
        return await res.blob();
      }
      quality = Math.max(0.35, quality - 0.06);
      maxSide = Math.max(480, Math.round(maxSide * 0.88));
    }
    const res = await fetch(canvas.toDataURL("image/jpeg", 0.4));
    return await res.blob();
  } finally {
    bmp.close?.();
  }
}

function mediaPathnameForUpload(filename, blob, fallbackId = "") {
  const name = String(filename || "").trim();
  const extFromName = name.includes(".") ? name.split(".").pop() : "";
  const type = String(blob.type || "");
  const extFromType = type.includes("video")
    ? "mp4"
    : type.includes("png")
      ? "png"
      : type.includes("webp")
        ? "webp"
        : "jpg";
  const ext = String(extFromName || extFromType)
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8) || "bin";
  return `thebarber/media/${Date.now()}-${fallbackId || Math.random().toString(36).slice(2, 9)}.${ext}`;
}

/**
 * Vidéos / gros fichiers : upload direct navigateur → Blob (max 10 Mo).
 * @param {Blob | File} blob
 * @param {string} filename
 * @param {{ baseUrl?: string, adminKey?: string, contentType?: string, onProgress?: (p: { percentage: number }) => void }} [opts]
 */
async function uploadMediaBlobViaClient(blob, filename, opts = {}) {
  const baseUrl = remoteApiBaseForUpload(opts);
  const key = opts.adminKey || getAdminKey();
  if (!baseUrl) throw new Error("URL du site Vercel requise.");
  if (!key) throw new Error("Clé admin requise.");

  if (blob.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `Fichier trop lourd (${(blob.size / (1024 * 1024)).toFixed(1)} Mo). Maximum 10 Mo pour les vidéos.`,
    );
  }

  let upload;
  try {
    ({ upload } = await import("https://cdn.jsdelivr.net/npm/@vercel/blob@2.4.0/+esm"));
  } catch {
    ({ upload } = await import("https://esm.sh/@vercel/blob@2.4.0/client"));
  }
  const pathname = mediaPathnameForUpload(filename, blob);
  const headers = {
    Authorization: `Bearer ${key}`,
    "X-Admin-Key": key,
  };
  const baseOpts = {
    handleUploadUrl: `${baseUrl}/api/upload-client`,
    headers,
    contentType: opts.contentType || blob.type || "application/octet-stream",
    multipart: blob.size > 4_500_000,
    onUploadProgress: opts.onProgress,
  };

  let result;
  let access = "public";
  try {
    result = await upload(pathname, blob, { ...baseOpts, access: "public" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/access|forbidden|private|BlobAccess/i.test(msg)) throw err;
    result = await upload(pathname, blob, { ...baseOpts, access: "private" });
    access = "private";
  }

  const catalogUrl = catalogUrlFromBlobUpload(
    result,
    String(result.pathname || pathname),
    access,
  );
  if (!catalogUrl) {
    throw new Error("Upload vidéo terminé mais URL catalogue vide — vérifiez BLOB_READ_WRITE_TOKEN sur Vercel.");
  }
  return catalogUrl;
}

function remoteApiBaseForUpload(opts = {}) {
  if (opts.baseUrl) return String(opts.baseUrl).replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  if (isRemoteMode()) return window.location.origin.replace(/\/$/, "");
  if (getAdminKey() && getRemoteApiBase()) return getRemoteApiBase();
  return "";
}

export async function uploadMediaBlob(blob, filename = "upload.bin", opts = {}) {
  const baseUrl = remoteApiBaseForUpload(opts);
  const key = opts.adminKey || getAdminKey();
  if (!baseUrl) {
    throw new Error("URL du site Vercel requise pour envoyer une vidéo depuis localhost.");
  }
  if (!key) throw new Error("Clé admin requise pour téléverser des médias.");

  const isVideo =
    /^video\//i.test(String(blob.type || "")) ||
    /\.(mp4|webm|mov|m4v|mkv)$/i.test(String(filename || ""));
  if (isVideo || blob.size > CLIENT_UPLOAD_THRESHOLD_BYTES) {
    return uploadMediaBlobViaClient(blob, filename, opts);
  }

  let payload = blob;
  if (String(blob.type || "").startsWith("image/")) {
    payload = await compressImageBlobForUpload(blob);
  }
  const dataBase64 = await blobToBase64(payload);
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
  if (!res.ok) {
    const hint =
      res.status === 413
        ? " Image trop lourde : réduisez la taille ou la qualité."
        : "";
    throw new Error((data.error || `Upload failed (${res.status})`) + hint);
  }
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

/** @deprecated use MAX_VIDEO_BYTES */
const MAX_REMOTE_VIDEO_BYTES = MAX_VIDEO_BYTES;

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

/** Fire-and-forget sync after local mutations on Vercel (users/orders only — never auto-push catalogue). */
export function scheduleRemoteSync() {
  if (!isRemoteMode()) return;
  void patchRemoteUsersOrders().catch((err) => {
    console.warn("[thebarber] remote sync failed", err);
  });
}

/**
 * Publie un seul produit sur le serveur (évite 413).
 * @param {import("./shop-core.js").Product} product
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function pushProductToRemote(product, opts = {}) {
  if (!usesRemoteCatalog()) {
    return {
      ok: false,
      error: "Clé admin requise (et URL Vercel sur localhost) pour enregistrer dans la base.",
    };
  }
  const key = getAdminKey();
  if (!key) {
    return { ok: false, error: "Clé admin requise." };
  }

  const { saveProducts, getProducts } = await import("./shop-core.js");
  const { dataUrlToBlob, isIdbVideoRef } = await import("./shop-media-store.js");

  let prepared = { ...product };
  const photos = Array.isArray(product.photos) ? product.photos : [];
  if (photos.some((u) => String(u).startsWith("data:"))) {
    opts.onProgress?.("Envoi des images vers Blob…");
    const uploaded = await uploadInlinePhotosInProducts(
      [product],
      (blob, name) => uploadMediaBlob(blob, name),
      opts.onProgress,
    );
    prepared = uploaded[0] || product;
  }

  const vid = String(prepared.videoUrl || "").trim();
  if (vid.startsWith("data:") && /video|octet-stream/i.test(vid.slice(0, 40))) {
    opts.onProgress?.("Envoi de la vidéo vers Blob…");
    prepared.videoUrl = await uploadMediaBlob(
      dataUrlToBlob(vid),
      `${prepared.id || "video"}.mp4`,
    );
  } else if (isIdbVideoRef(vid)) {
    throw new Error(
      "Vidéo encore locale (idb://). Choisissez un fichier vidéo dans le formulaire pour la publier en ligne.",
    );
  }

  opts.onProgress?.("Publication sur le serveur…");
  const body = await encodeStorePutBody({
    merge: true,
    products: [prepared],
    users: [],
    orders: [],
  });
  await putStoreBody(key, body);

  const list = getProducts();
  const i = list.findIndex((p) => p.id === prepared.id);
  const next = [...list];
  if (i >= 0) next[i] = /** @type {import("./shop-core.js").Product} */ (prepared);
  else next.push(/** @type {import("./shop-core.js").Product} */ (prepared));
  saveProducts(next, { skipRemoteSync: true });
  await saveStoreSnapshotIdb(readLocalStorePayload());
  return { ok: true, product: prepared };
}

/**
 * Remove one product from the server store (merge cannot delete by omission).
 * @param {string} id
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function deleteProductFromRemote(id, opts = {}) {
  if (!usesRemoteCatalog()) {
    return { ok: false, error: "Clé admin requise pour supprimer sur le serveur." };
  }
  const productId = String(id || "").trim();
  if (!productId) return { ok: false, error: "Identifiant produit invalide." };

  const key = getAdminKey();
  if (!key) {
    return { ok: false, error: "Clé admin requise pour supprimer sur le serveur." };
  }

  opts.onProgress?.("Suppression sur le serveur…");
  const url = `${storeApiUrl("/api/store")}?id=${encodeURIComponent(productId)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${key}`,
      "X-Admin-Key": key,
    },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(out.error || `Suppression refusée (${res.status})`);
  }
  const count = out.productCount ?? 0;
  if (out.deleted === false) {
    throw new Error("Produit introuvable sur le serveur (id incorrect ou déjà supprimé).");
  }

  const { getProducts, saveProducts } = await import("./shop-core.js");
  const list = getProducts().filter((p) => p.id !== productId);
  saveProducts(list, { skipRemoteSync: true });
  await saveStoreSnapshotIdb({
    products: list,
    users: readLocalStorePayload().users,
    orders: readLocalStorePayload().orders,
  });

  return { ok: true, productCount: count };
}
