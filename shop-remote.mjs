/**
 * Sync catalogue / comptes / commandes with Vercel API (Blob-backed store).
 */
import { STORAGE_PRODUCTS } from "./shop-core.mjs";
import {
  STORAGE_USERS,
  STORAGE_ORDERS,
  STORAGE_CURRENT_USER,
} from "./shop-account-store.mjs";

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

/** @param {{ products?: unknown[], users?: unknown[], orders?: unknown[] }} data */
function applyStoreToLocal(data) {
  if (Array.isArray(data.products)) {
    localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(data.products));
  }
  if (Array.isArray(data.users)) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(data.users));
  }
  if (Array.isArray(data.orders)) {
    localStorage.setItem(STORAGE_ORDERS, JSON.stringify(data.orders));
  }
  window.dispatchEvent(new CustomEvent("thebarber:products-updated"));
  window.dispatchEvent(new CustomEvent("thebarber:store-hydrated"));
}

function readLocalStorePayload() {
  const parse = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  return {
    products: parse(STORAGE_PRODUCTS),
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
      applyStoreToLocal(data);
      return { ok: true, source: "remote" };
    } catch (err) {
      console.warn("[thebarber] hydrate failed", err);
      return { ok: false, source: "local", error: err };
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

/** Push full store (admin). */
export async function pushRemoteStore() {
  if (!isRemoteMode()) return { ok: true };
  const key = getAdminKey();
  if (!key) {
    return { ok: false, error: "Clé admin requise pour enregistrer sur le serveur." };
  }
  const payload = readLocalStorePayload();
  const res = await fetch("/api/store", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Sync failed (${res.status})`);
  }
  return { ok: true };
}

/**
 * @param {File | Blob} file
 * @param {string} [filename]
 */
export async function uploadMediaFile(file, filename = "upload.bin") {
  if (!isRemoteMode()) return null;
  const key = getAdminKey();
  if (!key) throw new Error("Clé admin requise pour téléverser des médias.");
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const dataBase64 = btoa(binary);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      contentType: file.type || "application/octet-stream",
      dataBase64,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return String(data.url || "");
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
