/** Taille max vidéo produit (upload Vercel Blob). */
export const MAX_VIDEO_BYTES = 6 * 1024 * 1024;

/** @deprecated alias */
export const MAX_VIDEO_UPLOAD_BYTES = MAX_VIDEO_BYTES;

/** Upload direct ou proxy serveur → Vercel Blob. */
export const MAX_BLOB_UPLOAD_VIDEO_BYTES = 6 * 1024 * 1024;

/** @deprecated */
export const VIDEO_SINGLE_POST_MAX_BYTES = 3_400_000;

/** Images envoyées via POST /api/upload (JSON base64). */
export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Au-delà : upload client direct vers Blob. */
export const CLIENT_UPLOAD_THRESHOLD_BYTES = 2_800_000;
