import { loadStore, saveStore, requireAdmin, defaultStore } from "../lib/store-server.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const store = await loadStore();
    return res.status(200).json(store);
  }

  if (req.method === "PUT") {
    const gate = requireAdmin(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error });
    }
    const body = req.body && typeof req.body === "object" ? req.body : defaultStore();
    const saved = await saveStore(body);
    return res.status(200).json({ ok: true, store: saved });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
