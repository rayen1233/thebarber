/**
 * Product videos — URLs Cloudinary / HTTPS uniquement (pas de data: ni idb://).
 */

import { getProducts, saveProducts, resolveShopMediaUrl } from "./shop-core.js";
import { normalizeVideoUrlForCatalog } from "./lib/blob-media-url.mjs";
import {
  optimizeCloudinaryVideoUrl,
  posterUrlFromCloudinaryVideo,
  resolveProductVideoPoster as resolvePosterClient,
} from "./lib/cloudinary-client.js";

export function isIdbVideoRef(url) {
  return String(url || "").trim().startsWith("idb://");
}

export function idbVideoProductId(url) {
  return String(url || "").trim().slice(6);
}

export function productHasVideo(product) {
  const v = String(product?.videoUrl || "").trim();
  return Boolean(v && !v.startsWith("data:") && !isIdbVideoRef(v));
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

const DB_NAME = "thebarber_media_v1";
const DB_VERSION = 1;
const STORE = "product_videos";

/** @deprecated — plus d’écriture IDB pour les nouvelles vidéos. */
export async function putProductVideo() {
  throw new Error("Stockage vidéo local désactivé. Utilisez Cloudinary (admin en ligne).");
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

/** Lecture seule — migration IDB → Cloudinary. */
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

/** @deprecated */
export async function getProductVideoObjectUrl() {
  return null;
}

export function revokeProductVideoObjectUrl() {}

export function revokeAllProductVideoObjectUrls() {}

/**
 * @param {{ videoUrl?: string, videoPosterUrl?: string, photos?: string[] }} product
 */
export function resolveProductVideoPoster(product) {
  const raw = resolvePosterClient(product);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) {
    return resolveShopMediaUrl(raw);
  }
  return raw;
}

/**
 * Persist video reference — upload inline vers Cloudinary, jamais localStorage/IDB.
 * @param {string} productId
 * @param {string} videoUrl
 * @returns {Promise<{ videoUrl: string, videoPosterUrl: string }>}
 */
export async function persistProductVideoRef(productId, videoUrl) {
  const trimmed = String(videoUrl || "").trim();
  const empty = { videoUrl: "", videoPosterUrl: "" };
  if (!trimmed) return empty;

  if (trimmed.startsWith("data:") && /video|octet-stream/i.test(trimmed.slice(0, 40))) {
    const { usesRemoteCatalog, uploadProductVideo, getAdminKey } = await import(
      "./shop-remote.js?v=20260522-cloudinary"
    );
    if (!usesRemoteCatalog() || !getAdminKey()) {
      throw new Error(
        "Vidéo locale refusée. Connectez la clé admin sur le site en ligne et ré-importez le fichier (Cloudinary, max 20 Mo).",
      );
    }
    const { videoUrl: url, videoPosterUrl } = await uploadProductVideo(
      dataUrlToBlob(trimmed),
      `${productId}.mp4`,
      { contentType: "video/mp4", productId },
    );
    return {
      videoUrl: normalizeVideoUrlForCatalog(url),
      videoPosterUrl: normalizeVideoUrlForCatalog(videoPosterUrl) || posterUrlFromCloudinaryVideo(url),
    };
  }

  if (isIdbVideoRef(trimmed)) {
    throw new Error(
      "Vidéo en stockage local (idb://) obsolète. Utilisez « Migrer vidéos IDB » ou ré-uploadez le fichier.",
    );
  }

  const normalized = normalizeVideoUrlForCatalog(trimmed);
  const poster =
    String(
      /** @type {{ videoPosterUrl?: string }} */ (
        getProducts().find((p) => p.id === productId) || {}
      ).videoPosterUrl || "",
    ).trim() || posterUrlFromCloudinaryVideo(normalized);

  return {
    videoUrl: normalized,
    videoPosterUrl: poster ? normalizeVideoUrlForCatalog(poster) : "",
  };
}

/**
 * @param {{ id: string, videoUrl?: string }} product
 * @param {{ profile?: "card" | "detail" }} [opts]
 * @returns {Promise<string>}
 */
export async function resolveProductVideoUrl(product, opts = {}) {
  const raw = String(product?.videoUrl || "").trim();
  if (!raw || raw.startsWith("data:") || isIdbVideoRef(raw)) return "";
  const resolved = resolveShopMediaUrl(raw);
  if (/res\.cloudinary\.com/i.test(resolved)) {
    return optimizeCloudinaryVideoUrl(resolved, {
      profile: opts.profile === "detail" ? "detail" : "card",
    });
  }
  return resolved;
}

/** Pousse les data:video restants vers Cloudinary (plus d’IDB). */
export async function migrateCatalogVideosToIdb() {
  const list = getProducts();
  let changed = false;
  const { usesRemoteCatalog, uploadProductVideo, getAdminKey } = await import(
    "./shop-remote.js?v=20260522-cloudinary"
  ).catch(() => ({}));

  for (const p of list) {
    const v = String(p.videoUrl || "").trim();
    if (v.startsWith("data:") && /video|octet-stream/i.test(v.slice(0, 48))) {
      if (!usesRemoteCatalog?.() || !getAdminKey?.()) continue;
      try {
        const { videoUrl, videoPosterUrl } = await uploadProductVideo(dataUrlToBlob(v), `${p.id}.mp4`, {
          contentType: "video/mp4",
          productId: p.id,
        });
        p.videoUrl = normalizeVideoUrlForCatalog(videoUrl);
        p.videoPosterUrl = normalizeVideoUrlForCatalog(videoPosterUrl);
        changed = true;
      } catch (err) {
        console.warn("[thebarber] migrate video failed", p.id, err);
      }
      continue;
    }
    if (isIdbVideoRef(v)) {
      p.videoUrl = "";
      changed = true;
    }
  }
  if (changed) saveProducts(list);
}
