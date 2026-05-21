/**
 * Vidéos produit : IndexedDB en local, Vercel Blob + /api/media en ligne.
 */

import { getProducts, saveProducts, resolveShopMediaUrl } from "./shop-core.js";
import { normalizeVideoUrlForCatalog } from "./lib/blob-media-url.mjs";

const DB_NAME = "thebarber_media_v1";
const DB_VERSION = 1;
const STORE = "product_videos";

/** @type {Map<string, string>} */
const blobUrlCache = new Map();

export function isIdbVideoRef(url) {
  return String(url || "").trim().startsWith("idb://");
}

export function idbVideoProductId(url) {
  return String(url || "").trim().slice(6);
}

export function productHasVideo(product) {
  return Boolean(String(product?.videoUrl || "").trim());
}

/**
 * @param {string} dataUrl
 * @returns {Blob}
 */
export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const head = parts[0] || "";
  const b64 = parts.slice(1).join(",");
  const mime = head.match(/data:([^;]+)/i)?.[1] || "video/mp4";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB indisponible."));
  });
}

/**
 * @param {string} productId
 * @param {string | Blob} source
 */
export async function putProductVideo(productId, source) {
  const id = String(productId || "").trim();
  if (!id) throw new Error("Identifiant produit requis.");
  let blob;
  if (typeof source === "string") {
    if (source.startsWith("data:")) blob = dataUrlToBlob(source);
    else throw new Error("Source vidéo invalide.");
  } else if (source instanceof Blob) {
    blob = source;
  } else {
    throw new Error("Source vidéo invalide.");
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(blob, id);
  });
  db.close();
  revokeProductVideoObjectUrl(id);
}

/** @param {string} productId @returns {Promise<Blob | null>} */
export async function getProductVideoBlob(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  const db = await openDb();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob instanceof Blob ? blob : null;
}

export async function deleteProductVideo(productId) {
  const id = String(productId || "").trim();
  if (!id) return;
  revokeProductVideoObjectUrl(id);
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(id);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} productId
 * @returns {Promise<string | null>}
 */
export async function getProductVideoObjectUrl(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  if (blobUrlCache.has(id)) return blobUrlCache.get(id) || null;

  const blob = await getProductVideoBlob(id);
  if (!(blob instanceof Blob)) return null;
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(id, url);
  return url;
}

export function revokeProductVideoObjectUrl(productId) {
  const id = String(productId || "").trim();
  const url = blobUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(id);
  }
}

export function revokeAllProductVideoObjectUrls() {
  for (const url of blobUrlCache.values()) URL.revokeObjectURL(url);
  blobUrlCache.clear();
}

/**
 * @param {{ videoUrl?: string, videoPosterUrl?: string, photos?: string[] }} product
 */
export function resolveProductVideoPoster(product) {
  const explicit = String(product?.videoPosterUrl || "").trim();
  if (explicit) return resolveShopMediaUrl(explicit) || explicit;
  const photos = Array.isArray(product?.photos) ? product.photos : [];
  const first = String(photos[0] || "").trim();
  return first ? resolveShopMediaUrl(first) || first : "";
}

/**
 * @param {string} productId
 * @param {string} videoUrl
 * @returns {Promise<{ videoUrl: string, videoPosterUrl: string }>}
 */
export async function persistProductVideoRef(productId, videoUrl) {
  const trimmed = String(videoUrl || "").trim();
  const empty = { videoUrl: "", videoPosterUrl: "" };
  if (!trimmed) {
    await deleteProductVideo(productId);
    return empty;
  }
  if (isIdbVideoRef(trimmed)) {
    return {
      videoUrl: trimmed,
      videoPosterUrl: "",
    };
  }
  if (trimmed.startsWith("data:") && /video|octet-stream/i.test(trimmed.slice(0, 40))) {
    try {
      const { usesRemoteCatalog, uploadMediaBlob, getAdminKey } = await import("./shop-remote.js");
      if (usesRemoteCatalog() && getAdminKey()) {
        const url = await uploadMediaBlob(dataUrlToBlob(trimmed), `${productId}.mp4`, {
          contentType: "video/mp4",
          productId,
        });
        if (url) {
          return {
            videoUrl: normalizeVideoUrlForCatalog(url),
            videoPosterUrl: "",
          };
        }
      }
    } catch (err) {
      console.warn("[thebarber] video upload failed, fallback IDB", err);
    }
    await putProductVideo(productId, trimmed);
    return { videoUrl: `idb://${productId}`, videoPosterUrl: "" };
  }
  const normalized = normalizeVideoUrlForCatalog(resolveShopMediaUrl(trimmed) || trimmed);
  const poster = String(
    getProducts().find((p) => p.id === productId)?.videoPosterUrl || "",
  ).trim();
  return {
    videoUrl: normalized,
    videoPosterUrl: poster ? normalizeVideoUrlForCatalog(poster) : "",
  };
}

/**
 * @param {{ id: string, videoUrl?: string }} product
 * @returns {Promise<string>}
 */
export async function resolveProductVideoUrl(product) {
  const raw = String(product?.videoUrl || "").trim();
  if (!raw) return "";
  if (isIdbVideoRef(raw)) {
    const id = idbVideoProductId(raw);
    return (await getProductVideoObjectUrl(id)) || "";
  }
  return resolveShopMediaUrl(raw);
}

/** Déplace les data:video du catalogue vers IndexedDB. */
export async function migrateCatalogVideosToIdb() {
  const list = getProducts();
  let changed = false;
  for (const p of list) {
    const v = String(p.videoUrl || "").trim();
    if (!v.startsWith("data:") || !/video|octet-stream/i.test(v.slice(0, 48))) continue;
    try {
      await putProductVideo(p.id, v);
      p.videoUrl = `idb://${p.id}`;
      changed = true;
    } catch {
      /* garde data: si IDB indisponible */
    }
  }
  if (changed) saveProducts(list);
}
