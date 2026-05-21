import { applyApiCors } from "../lib/api-cors.mjs";
import { loadStore, storeEnvStatus } from "../lib/store-server.js";

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (applyApiCors(req, res)) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const env = storeEnvStatus();
  let store = { products: [], users: [], orders: [] };
  let loadError = null;
  try {
    store = await loadStore();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "load failed";
  }

  return res.status(200).json({
    ok: !loadError,
    env,
    productCount: store.products.length,
    userCount: store.users.length,
    orderCount: store.orders.length,
    loadError,
    hint: !env.blob
      ? "Connectez thebarber-blob au projet puis Redeploy."
      : store.products.length === 0
        ? "Blob OK mais catalogue vide — publiez depuis l’admin ou scripts/push-catalog.mjs"
        : "OK",
  });
}
