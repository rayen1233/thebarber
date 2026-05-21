/**
 * Cloudinary — upload + URLs de lecture optimisées (MP4 + poster JPG).
 */
import { v2 as cloudinary } from "cloudinary";

/** @returns {boolean} */
export function isCloudinaryConfigured() {
  return Boolean(
    String(process.env.CLOUDINARY_CLOUD_NAME || "").trim() &&
      String(process.env.CLOUDINARY_API_KEY || "").trim() &&
      String(process.env.CLOUDINARY_API_SECRET || "").trim(),
  );
}

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary non configuré. Ajoutez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET sur Vercel.",
    );
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** @param {string} url */
export function isCloudinaryUrl(url) {
  return /res\.cloudinary\.com/i.test(String(url || ""));
}

/** @param {string} url */
export function isCloudinaryVideoUrl(url) {
  const v = String(url || "");
  return isCloudinaryUrl(v) && /\/video\/upload\//i.test(v);
}

/**
 * Poster JPG (frame 0) dérivé d’une URL vidéo Cloudinary.
 * @param {string} videoUrl
 */
export function posterUrlFromCloudinaryVideo(videoUrl) {
  const v = String(videoUrl || "").trim();
  if (!isCloudinaryVideoUrl(v)) return "";
  if (/\/video\/upload\/[^/]+\/[^/]+\.(jpg|jpeg|webp)/i.test(v)) return v;
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
 * @param {string} publicId
 */
export function deliveryVideoUrl(publicId) {
  ensureConfigured();
  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    transformation: [
      { quality: "auto", fetch_format: "mp4", width: 1920, height: 1080, crop: "limit" },
    ],
  });
}

/**
 * @param {string} publicId
 */
export function deliveryPosterUrl(publicId) {
  ensureConfigured();
  return cloudinary.url(publicId, {
    resource_type: "video",
    format: "jpg",
    secure: true,
    transformation: [
      { start_offset: "0", width: 640, height: 360, crop: "fill", gravity: "auto", quality: "auto" },
    ],
  });
}

/**
 * Upload vidéo → Cloudinary (720p/1080p max, MP4 + miniature).
 * @param {Buffer} buffer
 * @param {{ filename?: string, productId?: string }} [opts]
 * @returns {Promise<{ videoUrl: string, posterUrl: string, publicId: string }>}
 */
export async function uploadProductVideoToCloudinary(buffer, opts = {}) {
  ensureConfigured();
  if (!buffer?.length) throw new Error("Fichier vidéo vide.");

  const base =
    String(opts.productId || "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 40) ||
    `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "thebarber/products",
        public_id: base,
        overwrite: true,
        eager: [
          {
            width: 1920,
            height: 1080,
            crop: "limit",
            video_codec: "h264",
            quality: "auto",
            format: "mp4",
          },
          {
            width: 640,
            height: 360,
            crop: "fill",
            gravity: "auto",
            format: "jpg",
            delay: "0",
          },
        ],
        eager_async: false,
      },
      (err, res) => {
        if (err) reject(err);
        else resolve(res);
      },
    );
    stream.end(buffer);
  });

  const publicIdOut = String(result?.public_id || `thebarber/products/${base}`).trim();
  const eager = Array.isArray(result?.eager) ? result.eager : [];
  const mp4Eager = eager.find((e) => /mp4|video/i.test(String(e.format || "")));
  const jpgEager = eager.find((e) => /jpe?g|jpg|webp/i.test(String(e.format || "")));

  const videoUrl =
    String(mp4Eager?.secure_url || result?.secure_url || "").trim() ||
    deliveryVideoUrl(publicIdOut);
  const posterUrl =
    String(jpgEager?.secure_url || "").trim() || deliveryPosterUrl(publicIdOut);

  return { videoUrl, posterUrl, publicId: publicIdOut };
}

/** Index showroom ORDER → public_id Cloudinary (dossier thebarber/showroom). */
export const SHOWROOM_CLOUDINARY_PUBLIC_ID = {
  0: "thebarber/showroom/backgroundtondeuse",
  1: "thebarber/showroom/backgroundscisso",
  2: "thebarber/showroom/backgroundaccesoire",
  3: "thebarber/showroom/backgroundmarchandise",
};

/**
 * URLs de lecture showroom (MP4 + poster) sans upload.
 * @param {number} index 0–3
 */
export function getShowroomCloudinaryDelivery(index) {
  const publicId = SHOWROOM_CLOUDINARY_PUBLIC_ID[index];
  if (!publicId || !isCloudinaryConfigured()) return null;
  return {
    index,
    videoUrl: deliveryVideoUrl(publicId),
    posterUrl: deliveryPosterUrl(publicId),
    publicId,
  };
}

/** @returns {Array<{ index: number, videoUrl: string, posterUrl: string, publicId: string }>} */
export function getAllShowroomCloudinaryDelivery() {
  return [0, 1, 2, 3]
    .map((i) => getShowroomCloudinaryDelivery(i))
    .filter(Boolean);
}

/**
 * Upload / remplace une vidéo showroom (public_id fixe).
 * @param {Buffer} buffer
 * @param {number} index 0–3
 */
export async function uploadShowroomVideoToCloudinary(buffer, index) {
  ensureConfigured();
  const publicId = SHOWROOM_CLOUDINARY_PUBLIC_ID[index];
  if (!publicId || !buffer?.length) {
    throw new Error("Index showroom ou fichier invalide.");
  }
  const base = publicId.split("/").pop() || `panel-${index}`;

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder: "thebarber/showroom",
        public_id: base,
        overwrite: true,
        eager: [
          {
            width: 1920,
            height: 1080,
            crop: "limit",
            video_codec: "h264",
            quality: "auto",
            format: "mp4",
          },
          {
            width: 640,
            height: 360,
            crop: "fill",
            gravity: "auto",
            format: "jpg",
            delay: "0",
          },
        ],
        eager_async: false,
      },
      (err, res) => {
        if (err) reject(err);
        else resolve(res);
      },
    );
    stream.end(buffer);
  });

  const publicIdOut = String(result?.public_id || publicId).trim();
  const eager = Array.isArray(result?.eager) ? result.eager : [];
  const mp4Eager = eager.find((e) => /mp4|video/i.test(String(e.format || "")));
  const jpgEager = eager.find((e) => /jpe?g|jpg|webp/i.test(String(e.format || "")));

  const videoUrl =
    String(mp4Eager?.secure_url || result?.secure_url || "").trim() ||
    deliveryVideoUrl(publicIdOut);
  const posterUrl =
    String(jpgEager?.secure_url || "").trim() || deliveryPosterUrl(publicIdOut);

  return { videoUrl, posterUrl, publicId: publicIdOut, index };
}
