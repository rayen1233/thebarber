/**
 * API admin catalogue (route plate /api/admin-catalog pour Vercel).
 */
import { applyApiCors } from "../lib/api-cors.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import {
  loadStore,
  saveStore,
  removeProductsById,
  requireAdmin,
  storeEnvStatus,
} from "../lib/store-server.js";
import {
  extractStorePayload,
  leanProductsForServer,
} from "../lib/store-payload.mjs";

/** @param {unknown} product */
function normalizeOneProduct(product) {
  const list = leanProductsForServer([product]);
  return list[0] || null;
}

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (applyApiCors(req, res)) return;

  const gate = requireAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  if (req.method === "GET") {
    try {
      const store = await loadStore();
      const env = storeEnvStatus();
      return res.status(200).json({
        ok: true,
        products: store.products,
        users: store.users,
        orders: store.orders,
        productCount: store.products.length,
        env: { blob: env.blob, admin: env.admin },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "load failed";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "DELETE") {
    const q = req.query && typeof req.query === "object" ? req.query : {};
    const id = String(q.id || q.productId || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Paramètre id requis (?id=uuid)" });
    }
    try {
      const before = await loadStore();
      const had = before.products.some(
        (p) => p && typeof p === "object" && String(/** @type {{ id?: string }} */ (p).id) === id,
      );
      const saved = await removeProductsById([id]);
      return res.status(200).json({
        ok: true,
        deleted: had,
        deletedId: id,
        productCount: saved.products.length,
        products: saved.products,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "delete failed";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const product = body && typeof body === "object" ? body.product : null;
      const normalized = normalizeOneProduct(product);
      if (!normalized) {
        return res.status(400).json({ error: "Produit invalide." });
      }
      const current = await loadStore();
      const pid = String(/** @type {{ id?: string }} */ (normalized).id || "");
      const i = current.products.findIndex(
        (x) => x && typeof x === "object" && String(/** @type {{ id?: string }} */ (x).id) === pid,
      );
      if (i >= 0) current.products[i] = normalized;
      else current.products.push(normalized);
      const saved = await saveStore(current);
      return res.status(200).json({
        ok: true,
        product: normalized,
        productCount: saved.products.length,
        products: saved.products,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "save failed";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "PUT") {
    try {
      const body = await readJsonBody(req);
      const base = extractStorePayload(body);
      const row = body && typeof body === "object" ? /** @type {Record<string, unknown>} */ (body) : {};
      const allowEmpty = Boolean(row.clear);
      const store = {
        products: leanProductsForServer(base.products),
        users: base.users,
        orders: base.orders,
      };
      if (!store.products.length && !allowEmpty) {
        return res.status(400).json({ error: "Catalogue vide refusé." });
      }
      const saved = await saveStore(store);
      return res.status(200).json({
        ok: true,
        productCount: saved.products.length,
        products: saved.products,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "import failed";
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE, OPTIONS");
  return res.status(405).json({ error: "Method not allowed" });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};
