/**
 * Server-side store — Vercel Blob (production) or .data/store.json (local dev).
 *
 * Same pattern as Vercel docs:
 *   import { put } from '@vercel/blob';
 *   await put('thebarber/store.json.gz', data, { access: 'private' });
 */
import { put, list, get, del } from "@vercel/blob";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStoreBlobAccess, hasBlobCredentials } from "./blob-access.mjs";
import { blobSdkAuthOptions } from "./blob-sdk-auth.mjs";
import { mergeRecordsById } from "./store-merge.mjs";

const BLOB_JSON = "thebarber/store.json";
const BLOB_GZ = "thebarber/store.json.gz";

/** @returns {{ products: unknown[], users: unknown[], orders: unknown[] }} */
export function defaultStore() {
  return { products: [], users: [], orders: [] };
}

function normalizeStore(raw) {
  const base = defaultStore();
  if (!raw || typeof raw !== "object") return base;
  return {
    products: Array.isArray(raw.products) ? raw.products : [],
    users: Array.isArray(raw.users) ? raw.users : [],
    orders: Array.isArray(raw.orders) ? raw.orders : [],
  };
}

async function readLocalFile() {
  const file = path.join(process.cwd(), ".data", "store.json");
  try {
    const text = await readFile(file, "utf8");
    return normalizeStore(JSON.parse(text));
  } catch {
    return defaultStore();
  }
}

async function writeLocalFile(store) {
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "store.json"),
    JSON.stringify(store, null, 2),
    "utf8",
  );
}

/** @param {Buffer} buf */
function parseStoreBuffer(buf) {
  if (!buf.length) return defaultStore();

  if (looksLikeGzip(buf)) {
    try {
      const text = gunzipSync(buf).toString("utf8");
      return normalizeStore(JSON.parse(text));
    } catch {
      /* fall through */
    }
  }

  try {
    return normalizeStore(JSON.parse(buf.toString("utf8")));
  } catch {
    return defaultStore();
  }
}

/** @param {Buffer} buf */
function looksLikeGzip(buf) {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** @param {ReadableStream | null} stream */
async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** @returns {Promise<ReturnType<defaultStore>>} */
async function loadFromBlobPathname(pathname) {
  const preferred = getStoreBlobAccess();
  const attempts = preferred === "private" ? ["private", "public"] : ["public", "private"];
  const auth = blobSdkAuthOptions();
  for (const access of attempts) {
    try {
      const hit = await get(pathname, {
        ...auth,
        access,
        /** Après un put, le CDN peut encore servir l’ancien catalogue vide. */
        useCache: false,
      });
      if (!hit?.stream) continue;
      const buf = await streamToBuffer(hit.stream);
      const store = parseStoreBuffer(buf);
      if (storeRichness(store) > 0) return store;
    } catch (err) {
      console.warn(`[store] get ${pathname} (${access}) failed`, err);
    }
  }
  return null;
}

function storeRichness(store) {
  if (!store) return 0;
  return (
    (Array.isArray(store.products) ? store.products.length : 0) * 1000 +
    (Array.isArray(store.users) ? store.users.length : 0) +
    (Array.isArray(store.orders) ? store.orders.length : 0)
  );
}

/** @returns {Promise<ReturnType<defaultStore>>} */
async function loadFromBlobList() {
  const { blobs } = await list({ prefix: "thebarber/", ...blobSdkAuthOptions() });
  const storeBlobs = blobs
    .filter(
      (b) =>
        b.pathname === BLOB_GZ ||
        b.pathname === BLOB_JSON ||
        b.pathname?.endsWith("/store.json.gz") ||
        b.pathname?.endsWith("/store.json"),
    )
    .sort(
      (a, b) =>
        new Date(b.uploadedAt || 0).getTime() -
        new Date(a.uploadedAt || 0).getTime(),
    );

  let best = null;
  let bestScore = -1;
  for (const blob of storeBlobs) {
    const pathname = blob.pathname;
    if (!pathname) continue;
    const store = await loadFromBlobPathname(pathname);
    if (!store) continue;
    const score = storeRichness(store);
    if (score > bestScore) {
      best = store;
      bestScore = score;
    }
  }
  return best;
}

/** @returns {Promise<ReturnType<defaultStore>>} */
export async function loadStore() {
  if (!hasBlobCredentials()) {
    return readLocalFile();
  }

  try {
    const json = await loadFromBlobPathname(BLOB_JSON);
    const gz = await loadFromBlobPathname(BLOB_GZ);
    let best = null;
    let bestScore = -1;
    for (const candidate of [json, gz]) {
      const score = storeRichness(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (bestScore > 0 && best) return best;

    const listed = await loadFromBlobList();
    if (listed && storeRichness(listed) > 0) return listed;

    return best || defaultStore();
  } catch (err) {
    console.error("[store] blob read failed", err);
    return defaultStore();
  }
}

/** @param {string[]} ids */
export async function removeProductsById(ids) {
  const drop = new Set(ids.map((x) => String(x || "").trim()).filter(Boolean));
  if (!drop.size) return loadStore();
  const current = await loadStore();
  current.products = current.products.filter(
    (x) =>
      x &&
      typeof x === "object" &&
      !drop.has(String(/** @type {{ id?: string }} */ (x).id || "")),
  );
  return saveStore(current);
}

/** @returns {{ blob: boolean, admin: boolean, blobAccess: string, storeId: boolean }} */
export function storeEnvStatus() {
  return {
    blob: hasBlobCredentials(),
    admin: Boolean(process.env.ADMIN_SECRET?.trim()),
    blobAccess: getStoreBlobAccess(),
    storeId: Boolean(process.env.BLOB_STORE_ID?.trim()),
  };
}

/** @param {Partial<ReturnType<defaultStore>> & { deletedProductIds?: unknown[] }} partial */
export async function mergeStore(partial) {
  const current = await loadStore();
  if (Array.isArray(partial.deletedProductIds) && partial.deletedProductIds.length) {
    const drop = new Set(
      partial.deletedProductIds.map((x) => String(x || "").trim()).filter(Boolean),
    );
    if (drop.size) {
      current.products = current.products.filter(
        (x) =>
          x &&
          typeof x === "object" &&
          !drop.has(String(/** @type {{ id?: string }} */ (x).id || "")),
      );
    }
  }
  if (Array.isArray(partial.products) && partial.products.length) {
    for (let pi = 0; pi < partial.products.length; pi++) {
      const p = partial.products[pi];
      if (!p || typeof p !== "object") continue;
      let id = String(/** @type {{ id?: string }} */ (p).id || "").trim();
      if (!id) id = `p-merge-${Date.now()}-${pi}`;
      /** @type {{ id?: string }} */ (p).id = id;
      const i = current.products.findIndex(
        (x) => x && typeof x === "object" && String(/** @type {{ id?: string }} */ (x).id) === id,
      );
      if (i >= 0) current.products[i] = p;
      else current.products.push(p);
    }
  }
  if (Array.isArray(partial.users) && partial.users.length) {
    current.users = mergeRecordsById(current.users, partial.users);
  }
  if (Array.isArray(partial.orders) && partial.orders.length) {
    current.orders = mergeRecordsById(current.orders, partial.orders);
  }
  return saveStore(current);
}

/** Supprime les anciennes copies du catalogue dans Blob (évite qu’une lecture ramène un vieux catalogue). */
async function pruneStaleStoreBlobs() {
  try {
    const { blobs } = await list({ prefix: "thebarber/", ...blobSdkAuthOptions() });
    for (const blob of blobs) {
      const p = blob.pathname;
      if (!p || p === BLOB_GZ || p === BLOB_JSON) continue;
      if (p.endsWith("/store.json") || p.endsWith("/store.json.gz")) {
        await del(p, blobSdkAuthOptions());
        console.log("[store] pruned stale blob", p);
      }
    }
  } catch (err) {
    console.warn("[store] prune failed", err);
  }
}

/** @param {ReturnType<defaultStore>} store */
export async function saveStore(store) {
  const normalized = normalizeStore(store);
  const json = JSON.stringify(normalized);
  const access = getStoreBlobAccess();

  if (hasBlobCredentials()) {
    const gz = gzipSync(Buffer.from(json, "utf8"));
    const auth = blobSdkAuthOptions();
    const putOpts = {
      ...auth,
      access,
      addRandomSuffix: false,
      allowOverwrite: true,
    };
    await put(BLOB_JSON, Buffer.from(json, "utf8"), {
      ...putOpts,
      contentType: "application/json",
    });
    const gzResult = await put(BLOB_GZ, gz, {
      ...putOpts,
      contentType: "application/gzip",
    });
    await pruneStaleStoreBlobs();
    console.log(
      "[store] saved",
      normalized.products.length,
      "products",
      BLOB_GZ,
      access,
      gzResult.url,
    );
    return normalized;
  }

  await writeLocalFile(normalized);
  return normalized;
}

/** @param {import("http").IncomingMessage} req */
export function requireAdmin(req) {
  const secret = String(process.env.ADMIN_SECRET || "").trim();
  if (!secret) {
    return { ok: false, status: 503, error: "ADMIN_SECRET not configured on server." };
  }
  const auth = String(req.headers.authorization || "");
  if (auth === `Bearer ${secret}`) return { ok: true };
  const key = req.headers["x-admin-key"];
  if (key === secret) return { ok: true };
  return { ok: false, status: 401, error: "Unauthorized" };
}
