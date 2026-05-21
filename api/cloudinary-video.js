/**
 * Upload vidéo produit → Cloudinary (admin). Corps binaire, max 20 Mo.
 * Ne stocke pas le fichier dans le catalogue — renvoie videoUrl + posterUrl.
 */
import { applyApiCors } from "../lib/api-cors.mjs";
import { requireAdmin } from "../lib/store-server.js";
import {
  isCloudinaryConfigured,
  uploadProductVideoToCloudinary,
} from "../lib/cloudinary-media.mjs";
import { MAX_VIDEO_UPLOAD_BYTES } from "../lib/media-limits.mjs";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 120,
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

  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      error:
        "Cloudinary non configuré. Ajoutez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET sur Vercel.",
    });
  }

  const q = req.query && typeof req.query === "object" ? req.query : {};
  const productId = String(q.productId || req.headers["x-product-id"] || "").trim();
  const filename = String(req.headers["x-filename"] || "video.mp4").trim();

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > MAX_VIDEO_UPLOAD_BYTES) {
        return res.status(413).json({
          error: `Vidéo trop lourde (${(size / (1024 * 1024)).toFixed(1)} Mo, max 20 Mo). Compressez avant envoi.`,
        });
      }
      chunks.push(buf);
    }
    if (!size) {
      return res.status(400).json({ error: "Corps vide" });
    }

    const buffer = Buffer.concat(chunks);
    const { videoUrl, posterUrl, publicId } = await uploadProductVideoToCloudinary(buffer, {
      filename,
      productId,
    });

    return res.status(200).json({
      ok: true,
      videoUrl,
      posterUrl,
      publicId,
      size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload Cloudinary échoué";
    console.error("[cloudinary-video]", msg);
    return res.status(502).json({ error: msg });
  }
}
