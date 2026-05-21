import { gunzipSync } from "node:zlib";
import { applyApiCors } from "../lib/api-cors.mjs";
import {
  loadStore,
  saveStore,
  mergeStore,
  removeProductsById,
  requireAdmin,
  defaultStore,
  storeEnvStatus,
} from "../lib/store-server.js";
import {
  extractStorePayload,
  leanProductsForServer,
} from "../lib/store-payload.mjs";

/**
 * @param {unknown} body
 * @returns {{ data: ReturnType<typeof defaultStore>, merge: boolean }}
 */
function parsePutBody(body) {
  if (!body || typeof body !== "object") {
    return { data: defaultStore(), merge: false };
  }
  const row = /** @type {Record<string, unknown>} */ (body);
  const merge = Boolean(row.merge);
  if (typeof row.storeGzipBase64 === "string" && row.storeGzipBase64.trim()) {
    const json = gunzipSync(Buffer.from(row.storeGzipBase64, "base64")).toString("utf8");
    const inner = JSON.parse(json);
    const innerMerge =
      inner && typeof inner === "object" && /** @type {{ merge?: boolean }} */ (inner).merge;
    return {
      data: extractStorePayload(inner),
      merge: merge || Boolean(innerMerge),
    };
  }
  return { data: extractStorePayload(row), merge };
}

/** @param {ReturnType<typeof defaultStore> & { deletedProductIds?: string[] }} data */
function prepareStoreForWrite(data) {
  const base = extractStorePayload(data);
  /** @type {ReturnType<typeof defaultStore> & { deletedProductIds?: string[] }} */
  const out = {
    products: leanProductsForServer(base.products),
    users: base.users,
    orders: base.orders,
  };
  if (base.deletedProductIds?.length) {
    out.deletedProductIds = base.deletedProductIds;
  }
  return out;
}

async function verifySavedCount(expected) {
  const waits = [0, 400, 900, 1600, 2800];
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt] > 0) {
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
    const loaded = await loadStore();
    const n = loaded.products.length;
    if (n >= expected) return n;
  }
  const loaded = await loadStore();
  return loaded.products.length;
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
    try {
      const store = await loadStore();
      const env = storeEnvStatus();
      return res.status(200).json({
        ...store,
        _meta: {
          productCount: store.products.length,
          blobConfigured: env.blob,
          adminConfigured: env.admin,
          blobAccess: env.blobAccess,
        },
      });
    } catch (err) {
      console.error("[store] GET failed", err);
      const env = storeEnvStatus();
      return res.status(200).json({
        ...defaultStore(),
        _meta: {
          productCount: 0,
          blobConfigured: env.blob,
          adminConfigured: env.admin,
          error: err instanceof Error ? err.message : "load failed",
        },
      });
    }
  }

  if (req.method === "DELETE") {
    const gate = requireAdmin(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error });
    }
    const q = req.query && typeof req.query === "object" ? req.query : {};
    const id = String(q.id || q.productId || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Paramètre id requis (?id=uuid-du-produit)" });
    }
    try {
      const before = await loadStore();
      const had = before.products.some(
        (p) => p && typeof p === "object" && String(/** @type {{ id?: string }} */ (p).id) === id,
      );
      const saved = await removeProductsById([id]);
      const verifiedCount = await verifySavedCount(saved.products.length);
      return res.status(200).json({
        ok: true,
        deleted: had,
        deletedId: id,
        productCount: saved.products.length,
        verifiedCount,
        products: saved.products,
      });
    } catch (err) {
      console.error("[store] DELETE failed", err);
      const msg = err instanceof Error ? err.message : "Delete failed";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "PUT") {
    const gate = requireAdmin(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error });
    }
    let parsed;
    try {
      parsed = parsePutBody(req.body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid body";
      return res.status(400).json({ error: `Catalogue illisible : ${msg}` });
    }
    try {
      const payload = prepareStoreForWrite(parsed.data);
      if (!parsed.merge && !payload.products.length) {
        const incoming = Array.isArray(parsed.data.products) ? parsed.data.products.length : 0;
        return res.status(400).json({
          error:
            incoming > 0
              ? "Aucun produit enregistrable : retirez les photos intégrées (data:) du formulaire, utilisez des fichiers ou des URL, puis réessayez."
              : "Catalogue vide — rechargez l’admin depuis le serveur (les 12 produits ne doivent pas être écrasés par un envoi vide).",
          rejectedIncoming: incoming,
        });
      }
      const saved = parsed.merge
        ? await mergeStore(payload)
        : await saveStore(payload);
      const verifiedCount = await verifySavedCount(saved.products.length);
      if (saved.products.length > 0 && verifiedCount === 0) {
        console.error(
          "[store] verify mismatch after save",
          saved.products.length,
          "expected, read 0",
        );
        return res.status(500).json({
          error:
            "Écriture Blob : sauvegarde OK mais relecture vide. Redeploy avec la dernière version, ou réessayez dans 10 s.",
          productCount: saved.products.length,
          verifiedCount: 0,
        });
      }
      return res.status(200).json({
        ok: true,
        productCount: saved.products.length,
        verifiedCount,
        products: saved.products,
      });
    } catch (err) {
      console.error("[store] save failed", err);
      const msg = err instanceof Error ? err.message : "Save failed";
      const status = /too large|413|payload/i.test(msg) ? 413 : 500;
      return res.status(status).json({ error: msg });
    }
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
