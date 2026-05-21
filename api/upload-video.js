/**
 * Upload vidéo via le serveur (même origine → pas de CORS vercel.com).
 * Un seul POST (≤ ~3,4 Mo). Vidéos plus lourdes : /api/upload-video-chunk.
 */
import { applyApiCors } from "../lib/api-cors.mjs";
import { requireAdmin } from "../lib/store-server.js";
import { putMediaBlob } from "../lib/blob-put-media.mjs";
import { catalogUrlFromBlobUpload } from "../lib/blob-media-url.mjs";
import { MAX_BLOB_UPLOAD_VIDEO_BYTES } from "../lib/media-limits.mjs";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (applyApiCors(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const gate = requireAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  const q = req.query && typeof req.query === "object" ? req.query : {};
  const pathname = String(q.pathname || "")
    .trim()
    .replace(/^\//, "");
  if (!pathname.startsWith("thebarber/media/")) {
    return res.status(400).json({ error: "pathname invalide (thebarber/media/…)" });
  }

  const contentType = String(req.headers["content-type"] || "video/mp4").trim();

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_BLOB_UPLOAD_VIDEO_BYTES) {
        return res.status(413).json({
          error: `Fichier trop lourd (${(size / (1024 * 1024)).toFixed(1)} Mo, max 6 Mo). Utilisez l’upload par morceaux ou une URL externe.`,
        });
      }
      chunks.push(buf);
    }
    if (!size) {
      return res.status(400).json({ error: "Corps vide" });
    }

    const buffer = Buffer.concat(chunks);
    const { result, access } = await putMediaBlob(pathname, buffer, contentType, {
      multipart: buffer.length > 4_500_000,
    });

    const url = catalogUrlFromBlobUpload(result, pathname, access);
    if (!url) {
      return res.status(502).json({ error: "Upload OK mais URL catalogue vide" });
    }

    return res.status(200).json({
      ok: true,
      url,
      pathname,
      access,
      size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    const status = /too large|413|payload|FUNCTION_PAYLOAD/i.test(msg) ? 413 : 500;
    console.error("[upload-video]", msg);
    return res.status(status).json({
      error:
        status === 413
          ? "Fichier trop lourd pour un seul envoi (~3,4 Mo). Réessayez (upload automatique par morceaux) ou compressez."
          : msg,
    });
  }
}
