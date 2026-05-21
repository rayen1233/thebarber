/**
 * Server-side store — Vercel Blob (production) or .data/store.json (local dev).
 *
 * Same pattern as Vercel docs:
 *   import { put } from '@vercel/blob';
 *   await put('thebarber/store.json.gz', data, { access: 'private' });
 */
import { put, list, get } from "@vercel/blob";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStoreBlobAccess, hasBlobCredentials } from "./blob-access.mjs";

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
  const access = getStoreBlobAccess();
  const hit = await get(pathname, { access });
  if (!hit?.stream) return null;
  const buf = await streamToBuffer(hit.stream);
  return parseStoreBuffer(buf);
}

/** @returns {Promise<ReturnType<defaultStore>>} */
async function loadFromBlobList() {
  const { blobs } = await list({ prefix: "thebarber/" });
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

  for (const blob of storeBlobs) {
    const pathname = blob.pathname;
    if (!pathname) continue;
    const store = await loadFromBlobPathname(pathname);
    if (store.products.length || store.users.length || store.orders.length) {
      return store;
    }
    if (pathname === BLOB_GZ || pathname === BLOB_JSON) {
      return store;
    }
  }

  return null;
}

/** @returns {Promise<ReturnType<defaultStore>>} */
export async function loadStore() {
  if (!hasBlobCredentials()) {
    return readLocalFile();
  }

  try {
    let store = await loadFromBlobPathname(BLOB_GZ);
    if (!store) store = await loadFromBlobPathname(BLOB_JSON);
    if (!store) store = await loadFromBlobList();
    if (store) return store;
    return defaultStore();
  } catch (err) {
    console.error("[store] blob read failed", err);
    return defaultStore();
  }
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

/** @param {ReturnType<defaultStore>} store */
export async function saveStore(store) {
  const normalized = normalizeStore(store);
  const json = JSON.stringify(normalized);
  const access = getStoreBlobAccess();

  if (hasBlobCredentials()) {
    const gz = gzipSync(Buffer.from(json, "utf8"));
    const { url } = await put(BLOB_GZ, gz, {
      access,
      contentType: "application/gzip",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    console.log("[store] saved", BLOB_GZ, access, url);
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
