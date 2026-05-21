/**
 * Vercel Blob access level — must match how the store was created in the dashboard.
 * @see https://vercel.com/docs/vercel-blob/using-blob-sdk#the-access-parameter
 */

/** Catalogue JSON (lu par l’API serveur uniquement). */
export function getStoreBlobAccess() {
  const v = String(process.env.BLOB_STORE_ACCESS || "private").toLowerCase();
  return v === "public" ? "public" : "private";
}

/** Images / vidéos produit — public si le store le permet, sinon private + downloadUrl. */
export function getMediaBlobAccess() {
  const store = String(process.env.BLOB_STORE_ACCESS || "private").toLowerCase();
  const media = String(process.env.BLOB_MEDIA_ACCESS || "").toLowerCase();
  if (media === "public" || media === "private") return media;
  return store === "public" ? "public" : "private";
}

/** @returns {boolean} */
export function hasBlobCredentials() {
  if (String(process.env.BLOB_READ_WRITE_TOKEN || "").trim()) return true;
  if (
    String(process.env.BLOB_STORE_ID || "").trim() &&
    String(process.env.VERCEL_OIDC_TOKEN || "").trim()
  ) {
    return true;
  }
  return false;
}
