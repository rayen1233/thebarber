/** Taille max vidéo (fichier admin ou URL externe). */
export const MAX_VIDEO_BYTES = 6 * 1024 * 1024;

/**
 * Upload fichier → Vercel Blob via notre API (morceaux si > ~3,4 Mo / requête).
 */
export const MAX_BLOB_UPLOAD_VIDEO_BYTES = 6 * 1024 * 1024;

/** En dessous : un seul POST /api/upload-video. */
export const VIDEO_SINGLE_POST_MAX_BYTES = 3_400_000;

/** Images envoyées via POST /api/upload (JSON base64). */
export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Au-delà : traité comme média « gros fichier » (vidéo → /api/upload-video). */
export const CLIENT_UPLOAD_THRESHOLD_BYTES = 2_800_000;
