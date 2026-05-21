import { put } from "@vercel/blob";
import { requireAdmin } from "../lib/store-server.mjs";

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

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const gate = requireAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: "BLOB_READ_WRITE_TOKEN missing. Add Vercel Blob storage to the project.",
    });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const dataBase64 = String(body.dataBase64 || "").trim();
  const contentType = String(body.contentType || "application/octet-stream").trim();
  const filename = String(body.filename || "upload.bin").trim();

  if (!dataBase64) {
    return res.status(400).json({ error: "dataBase64 required" });
  }

  const buffer = Buffer.from(dataBase64, "base64");
  if (!buffer.length) {
    return res.status(400).json({ error: "Empty file" });
  }

  const ext = filename.includes(".")
    ? filename.split(".").pop()
    : contentType.includes("video")
      ? "mp4"
      : "jpg";
  const safeExt = String(ext).replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const pathname = `thebarber/media/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType,
    token,
  });

  return res.status(200).json({
    ok: true,
    url: blob.url,
    pathname: blob.pathname,
  });
}
