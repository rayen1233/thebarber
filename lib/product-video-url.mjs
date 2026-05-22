/** Détecte une URL vidéo produit hébergée sur Cloudinary (ancien système). */
export function isCloudinaryProductVideoUrl(url) {
  const v = String(url || "").trim();
  return /res\.cloudinary\.com/i.test(v) && /\/video\/upload\//i.test(v);
}

/**
 * Variante allégée pour limiter la taille au téléchargement (max ~6 Mo Blob).
 * @param {string} url
 */
export function cloudinaryProductVideoFetchUrl(url) {
  let v = String(url || "").trim();
  if (!isCloudinaryProductVideoUrl(v)) return v;
  const marker = "/video/upload/";
  const i = v.indexOf(marker);
  if (i < 0) return v;
  const head = v.slice(0, i + marker.length);
  let tail = v.slice(i + marker.length);
  if (/^(c_|q_|w_|f_|vc_|h_)/i.test(tail)) {
    tail = tail.replace(/^[^/]+\//, "");
  }
  return `${head}c_limit,f_mp4,h_720,q_auto:good,w_1280/${tail}`;
}
