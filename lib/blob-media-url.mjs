/**
 * URLs médias Vercel Blob — proxy pour blobs privés (403 en <img> direct).
 */

/** @param {string} url */
export function pathnameFromBlobUrl(url) {
  const v = String(url || "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (!/\.blob\.vercel-storage\.com$/i.test(u.hostname)) return "";
    return decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

/** @param {string} raw */
export function isPrivateBlobUrl(raw) {
  return /\.private\.blob\.vercel-storage\.com/i.test(String(raw || ""));
}

/**
 * Chemin servi par /api/media (relatif ou absolu selon base).
 * @param {string} pathname ex. thebarber/media/foo.jpg
 * @param {string} [apiBase] ex. https://thebarber-three.vercel.app
 */
export function mediaProxyUrl(pathname, apiBase = "") {
  const p = String(pathname || "").trim().replace(/^\//, "");
  if (!p) return "";
  const q = `/api/media?pathname=${encodeURIComponent(p)}`;
  const base = String(apiBase || "").trim().replace(/\/$/, "");
  return base ? `${base}${q}` : q;
}

/**
 * URL à enregistrer dans le catalogue après upload.
 * @param {{ url?: string, downloadUrl?: string, pathname?: string }} result
 * @param {string} pathname
 * @param {string} access
 */
export function catalogUrlFromBlobUpload(result, pathname, access) {
  if (access === "public") {
    return String(result.url || result.downloadUrl || "").trim();
  }
  return mediaProxyUrl(pathname);
}

/**
 * URL affichable côté navigateur (proxy si blob privé).
 * @param {string} raw
 * @param {string} [apiBase]
 */
export function resolveBlobMediaForClient(raw, apiBase = "") {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (v.startsWith("/api/media?")) {
    const base = String(apiBase || "").trim().replace(/\/$/, "");
    return base ? `${base}${v}` : v;
  }
  if (isPrivateBlobUrl(v)) {
    const pathname = pathnameFromBlobUrl(v);
    if (pathname) return mediaProxyUrl(pathname, apiBase);
  }
  return v;
}
