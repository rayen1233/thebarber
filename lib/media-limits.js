/** Taille max vidéo produit (fichier admin ou URL externe). */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

/** Upload fichier → Cloudinary via /api/cloudinary-video. */
export const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * @deprecated Vidéos produit : Cloudinary uniquement. Conservé pour repli showroom / legacy Blob.
 */
export const MAX_BLOB_UPLOAD_VIDEO_BYTES = 6 * 1024 * 1024;

/** @deprecated */
export const VIDEO_SINGLE_POST_MAX_BYTES = 3_400_000;

/** Images envoyées via POST /api/upload (JSON base64). */
export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Au-delà : traité comme média « gros fichier » (vidéo → Cloudinary). */
export const CLIENT_UPLOAD_THRESHOLD_BYTES = 2_800_000;

/** Largeur/hauteur max recommandées avant upload (Cloudinary transcoding). */
export const MAX_VIDEO_WIDTH = 1920;
export const MAX_VIDEO_HEIGHT = 1080;
