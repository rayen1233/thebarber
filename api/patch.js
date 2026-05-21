import { loadStore, saveStore } from "../lib/store-server.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const store = await loadStore();

  if (Array.isArray(body.users)) {
    store.users = body.users;
  }
  if (Array.isArray(body.orders)) {
    store.orders = body.orders;
  }

  const saved = await saveStore(store);
  return res.status(200).json({
    ok: true,
    users: saved.users.length,
    orders: saved.orders.length,
  });
}
