/**
 * Migre les vidéos produit Cloudinary → Vercel Blob dans le catalogue serveur.
 */
import { applyApiCors } from "../lib/api-cors.mjs";
import { requireAdmin, loadStore, saveStore } from "../lib/store-server.mjs";
import { putMediaBlob } from "../lib/blob-put-media.mjs";
import { catalogUrlFromBlobUpload } from "../lib/blob-media-url.mjs";
import {
  isCloudinaryProductVideoUrl,
  cloudinaryProductVideoFetchUrl,
} from "../lib/product-video-url.mjs";
import { MAX_BLOB_UPLOAD_VIDEO_BYTES } from "../lib/media-limits.mjs";

export const config = {
  maxDuration: 120,
};

/**
 * @param {string} sourceUrl
 * @returns {Promise<Buffer>}
 */
async function downloadCloudinaryVideo(sourceUrl) {
  const candidates = [
    cloudinaryProductVideoFetchUrl(sourceUrl),
    sourceUrl,
  ];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        lastErr = new Error(`Téléchargement refusé (${res.status})`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) {
        lastErr = new Error("Fichier vide");
        continue;
      }
      if (buf.length > MAX_BLOB_UPLOAD_VIDEO_BYTES) {
        throw new Error(
          `Vidéo trop lourde (${(buf.length / (1024 * 1024)).toFixed(1)} Mo, max ${MAX_BLOB_UPLOAD_VIDEO_BYTES / (1024 * 1024)} Mo)`,
        );
      }
      return buf;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr || new Error("Téléchargement impossible");
}

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

  try {
    const store = await loadStore();
    const products = Array.isArray(store.products) ? store.products : [];
    const targets = products.filter(
      (p) => p && typeof p === "object" && isCloudinaryProductVideoUrl(p.videoUrl),
    );

    if (!targets.length) {
      return res.status(200).json({
        ok: true,
        migrated: 0,
        skipped: 0,
        failed: 0,
        message: "Aucune vidéo produit Cloudinary dans le catalogue.",
        products: [],
      });
    }

    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    const details = [];

    for (const p of targets) {
      const id = String(p.id || "").trim() || `p-${Date.now()}`;
      const name = String(p.name || id);
      const sourceUrl = String(p.videoUrl || "").trim();
      try {
        const buffer = await downloadCloudinaryVideo(sourceUrl);
        const pathname = `thebarber/media/${id}-${Date.now()}.mp4`;
        const { result, access } = await putMediaBlob(pathname, buffer, "video/mp4", {
          multipart: buffer.length > 4_500_000,
        });
        const videoUrl = catalogUrlFromBlobUpload(result, pathname, access);
        if (!videoUrl) throw new Error("URL Blob vide après upload");

        p.videoUrl = videoUrl;
        if (isCloudinaryProductVideoUrl(p.videoPosterUrl)) {
          p.videoPosterUrl = "";
        }
        migrated++;
        details.push({ id, name, ok: true, videoUrl });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "échec";
        if (/trop lourde|too large/i.test(msg)) {
          skipped++;
          details.push({ id, name, ok: false, skipped: true, error: msg });
        } else {
          failed++;
          details.push({ id, name, ok: false, error: msg });
        }
        console.warn("[migrate-cloudinary-products]", id, msg);
      }
    }

    await saveStore(store);

    return res.status(200).json({
      ok: true,
      migrated,
      skipped,
      failed,
      total: targets.length,
      message: `${migrated} migrée(s), ${skipped} ignorée(s), ${failed} erreur(s).`,
      products: store.products,
      details,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Migration impossible";
    console.error("[migrate-cloudinary-products]", msg);
    return res.status(500).json({ error: msg });
  }
}
