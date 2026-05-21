import { gunzipSync } from "node:zlib";
import { applyApiCors } from "../lib/api-cors.mjs";
import {
  loadStore,
  saveStore,
  requireAdmin,
  defaultStore,
  storeEnvStatus,
} from "../lib/store-server.js";

/** @param {unknown} body */
function parsePutBody(body) {
  if (!body || typeof body !== "object") return defaultStore();
  const row = /** @type {Record<string, unknown>} */ (body);
  if (typeof row.storeGzipBase64 === "string" && row.storeGzipBase64.trim()) {
    const json = gunzipSync(Buffer.from(row.storeGzipBase64, "base64")).toString("utf8");
    return JSON.parse(json);
  }
  return body;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (applyApiCors(req, res)) return;

  if (req.method === "GET") {
    const store = await loadStore();
    const env = storeEnvStatus();
    return res.status(200).json({
      ...store,
      _meta: {
        productCount: store.products.length,
        blobConfigured: env.blob,
        adminConfigured: env.admin,
      },
    });
  }

  if (req.method === "PUT") {
    const gate = requireAdmin(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error });
    }
    let body;
    try {
      body = parsePutBody(req.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid body";
      return res.status(400).json({ error: `Catalogue illisible : ${msg}` });
    }
    try {
      const saved = await saveStore(body);
      return res.status(200).json({
        ok: true,
        store: saved,
        productCount: saved.products.length,
      });
    } catch (err) {
      console.error("[store] save failed", err);
      const msg = err instanceof Error ? err.message : "Save failed";
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
