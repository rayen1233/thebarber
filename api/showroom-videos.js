/**
 * URLs Cloudinary des 4 vidéos ORDER showroom (lecture publique).
 * Priorité : showroom-cloudinary.json (URLs réelles uploadées), puis URLs générées.
 */
import { applyApiCors } from "../lib/api-cors.mjs";
import {
  getAllShowroomCloudinaryDelivery,
  isCloudinaryConfigured,
} from "../lib/cloudinary-media.mjs";
import { readShowroomCloudinaryManifest } from "../lib/showroom-cloudinary-manifest.mjs";

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  if (applyApiCors(req, res)) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");

  const manifest = readShowroomCloudinaryManifest();
  if (manifest?.length) {
    return res.status(200).json({ ok: true, source: "manifest", videos: manifest });
  }

  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      error: "Cloudinary non configuré pour le showroom.",
      videos: [],
    });
  }

  try {
    const videos = getAllShowroomCloudinaryDelivery();
    return res.status(200).json({ ok: true, source: "generated", videos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Showroom URLs failed";
    console.error("[showroom-videos]", msg);
    return res.status(500).json({ error: msg, videos: [] });
  }
}
