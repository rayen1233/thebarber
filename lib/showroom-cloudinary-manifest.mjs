/**
 * Manifest showroom (URLs réelles après upload) — prioritaire sur delivery URLs générées.
 */
import fs from "node:fs";
import path from "node:path";
import { fixCloudinaryAssetUrl } from "./cloudinary-media.mjs";

/**
 * @returns {Array<{ index: number, videoUrl: string, posterUrl: string, publicId?: string }> | null}
 */
export function readShowroomCloudinaryManifest() {
  const candidates = [
    path.join(process.cwd(), "showroom-cloudinary.json"),
    path.join(process.cwd(), "public", "showroom-cloudinary.json"),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const videos = Array.isArray(data?.videos) ? data.videos : [];
      const out = [];
      for (const row of videos) {
        const index = Number(row?.index);
        const videoUrl = fixCloudinaryAssetUrl(String(row?.videoUrl || "").trim());
        const posterUrl = fixCloudinaryAssetUrl(String(row?.posterUrl || "").trim());
        if (!Number.isInteger(index) || index < 0 || index > 3 || !videoUrl) continue;
        out.push({
          index,
          videoUrl,
          posterUrl,
          publicId: String(row?.publicId || "").trim() || undefined,
        });
      }
      if (out.length >= 4) return out.sort((a, b) => a.index - b.index);
    } catch {
      /* next path */
    }
  }
  return null;
}
