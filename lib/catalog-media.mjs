/**
 * Replace data: URLs with Blob URLs before saving catalogue (keeps JSON small).
 */

/** @param {string} dataUrl @returns {Blob} */
export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const head = parts[0] || "";
  const b64 = parts.slice(1).join(",");
  const mime = head.match(/data:([^;]+)/i)?.[1] || "application/octet-stream";
  const binary = Buffer.from(b64, "base64");
  return new Blob([binary], { type: mime });
}

/**
 * @param {unknown[]} products
 * @param {(blob: Blob, filename: string) => Promise<string>} upload
 * @param {(msg: string) => void} [onProgress]
 */
export async function uploadInlinePhotosInProducts(products, upload, onProgress) {
  const out = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p || typeof p !== "object") continue;
    const row = { .../** @type {Record<string, unknown>} */ (p) };
    const photos = Array.isArray(row.photos) ? row.photos : [];
    const nextPhotos = [];
    onProgress?.(`Produit ${i + 1}/${products.length} — photos…`);
    for (let j = 0; j < photos.length; j++) {
      const raw = String(photos[j] || "");
      if (raw.startsWith("data:image")) {
        try {
          const blob = dataUrlToBlob(raw);
          const ext = raw.includes("png") ? "png" : raw.includes("webp") ? "webp" : "jpg";
          const url = await upload(blob, `p-${row.id || i}-${j}.${ext}`);
          nextPhotos.push(url);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/unauthorized|401/i.test(msg)) throw err;
          console.warn("[catalog-media] photo upload failed", msg);
          nextPhotos.push(raw);
        }
      } else {
        nextPhotos.push(raw);
      }
    }
    row.photos = nextPhotos;
    const vid = String(row.videoUrl || "").trim();
    if (vid.startsWith("data:") && /video|octet-stream|quicktime|mp4/i.test(vid.slice(0, 80))) {
      try {
        const blob = dataUrlToBlob(vid);
        row.videoUrl = await upload(blob, `v-${row.id || i}.mp4`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unauthorized|401/i.test(msg)) throw err;
        console.warn("[catalog-media] video upload failed", msg);
        row.videoUrl = "";
      }
    }
    out.push(row);
  }
  return out;
}
