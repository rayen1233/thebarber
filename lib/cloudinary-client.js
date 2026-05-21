/**
 * Helpers Cloudinary côté navigateur (sans secret).
 */

/** @param {string} url */
export function isCloudinaryVideoUrl(url) {
  const v = String(url || "");
  return /res\.cloudinary\.com/i.test(v) && /\/video\/upload\//i.test(v);
}

/**
 * Corrige cloud name cassé (ex. DS\\ndswnmoq8d) et allège le flux pour la lecture.
 * @param {string} url
 * @param {{ profile?: "card" | "detail" | "showroom" }} [opts]
 */
const CANONICAL_CLOUD = "dswnmoq8d";

export function optimizeCloudinaryVideoUrl(url, opts = {}) {
  let v = String(url || "").trim();
  if (!isCloudinaryVideoUrl(v)) return v;
  v = v.replace(
    /res\.cloudinary\.com\/[a-z0-9]+/i,
    `res.cloudinary.com/${CANONICAL_CLOUD}`,
  );
  // Fichier déjà uploadé (v123/…/file.mp4) — ne pas re-transformer (évite re-buffer / saccades).
  if (/\/video\/upload\/[^/]*\/v\d+\//i.test(v) || /\.mp4(\?|$)/i.test(v)) {
    return v;
  }
  const marker = "/video/upload/";
  const i = v.indexOf(marker);
  if (i < 0) return v;
  const head = v.slice(0, i + marker.length);
  let tail = v.slice(i + marker.length);
  if (/^(c_|q_|w_|f_|vc_)/i.test(tail)) {
    tail = tail.replace(/^[^/]+\//, "");
  }
  const profile = opts.profile || "card";
  const transform =
    profile === "detail"
      ? "c_limit,f_mp4,h_720,q_auto:good,w_1280"
      : profile === "showroom"
        ? "c_limit,f_mp4,h_1080,q_auto,vc_h264,w_1920"
        : "c_limit,f_mp4,h_480,q_auto:eco,w_854";
  return `${head}${transform}/${tail}`;
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
