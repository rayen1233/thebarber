/** Taille max vidéo produit (10 Mo). */
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

/** Images envoyées via POST /api/upload (JSON base64). */
export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Au-delà : upload direct navigateur → Blob (client upload). */
export const CLIENT_UPLOAD_THRESHOLD_BYTES = 2_800_000;
