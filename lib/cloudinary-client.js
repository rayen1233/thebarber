/**
 * Helpers Cloudinary côté navigateur (sans secret).
 */

/** @param {string} url */
export function isCloudinaryVideoUrl(url) {
  const v = String(url || "");
  return /res\.cloudinary\.com/i.test(v) && /\/video\/upload\//i.test(v);
}

/**
 * Miniature JPG à partir d’une URL vidéo Cloudinary.
 * @param {string} videoUrl
 */
export function posterUrlFromCloudinaryVideo(videoUrl) {
  const v = String(videoUrl || "").trim();
  if (!isCloudinaryVideoUrl(v)) return "";
  const marker = "/video/upload/";
  const i = v.indexOf(marker);
  if (i < 0) return "";
  const head = v.slice(0, i + marker.length);
  const tail = v.slice(i + marker.length);
  const transform = "so_0,w_640,h_360,c_fill,g_auto,f_jpg,q_auto";
  if (tail.startsWith("v") && /^\d/.test(tail.slice(1))) {
    return `${head}${transform}/${tail}`;
  }
  return `${head}${transform}/${tail}`;
}

/**
 * @param {{ videoUrl?: string, videoPosterUrl?: string, photos?: string[] }} product
 */
export function resolveProductVideoPoster(product) {
  const explicit = String(product?.videoPosterUrl || "").trim();
  if (explicit) return explicit;
  const vid = String(product?.videoUrl || "").trim();
  const fromCloud = posterUrlFromCloudinaryVideo(vid);
  if (fromCloud) return fromCloud;
  const photos = Array.isArray(product?.photos) ? product.photos : [];
  return String(photos[0] || "").trim();
}

/**
 * Inspecte un fichier vidéo avant upload (taille / résolution).
 * @param {File | Blob} file
 */
export function inspectVideoFile(file) {
  return new Promise((resolve) => {
    const size = file.size || 0;
    const type = String(file.type || "");
    if (typeof document === "undefined") {
      resolve({ size, type, width: 0, height: 0, duration: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (row) => {
      URL.revokeObjectURL(url);
      resolve(row);
    };
    v.onloadedmetadata = () => {
      done({
        size,
        type,
        width: v.videoWidth || 0,
        height: v.videoHeight || 0,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
      });
    };
    v.onerror = () => done({ size, type, width: 0, height: 0, duration: 0 });
    v.src = url;
  });
}
