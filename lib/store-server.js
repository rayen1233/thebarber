/**
 * Server-side store — Vercel Blob (production) or .data/store.json (local dev).
 */
import { put, list } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BLOB_PATH = "thebarber/store.json";

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

/** @returns {Promise<ReturnType<defaultStore>>} */
export async function loadStore() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const { blobs } = await list({ prefix: "thebarber/", token });
      const hit =
        blobs.find((b) => b.pathname === BLOB_PATH || b.pathname.endsWith("/store.json")) ||
        blobs[0];
      if (hit?.url) {
        const res = await fetch(hit.url, { cache: "no-store" });
        if (res.ok) return normalizeStore(await res.json());
      }
    } catch (err) {
      console.error("[store] blob read failed", err);
    }
    return defaultStore();
  }
  return readLocalFile();
}

/** @param {ReturnType<defaultStore>} store */
export async function saveStore(store) {
  const normalized = normalizeStore(store);
  const json = JSON.stringify(normalized, null, 2);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    await put(BLOB_PATH, json, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
    });
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
