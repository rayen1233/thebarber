/**
 * Génère un client token pour put() navigateur (@vercel/blob/client).
 * Évite CORS vers vercel.com/api/blob (upload + handleUploadUrl).
 */
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { applyApiCors } from "../lib/api-cors.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import { requireAdmin } from "../lib/store-server.js";
import { getMediaBlobAccess } from "../lib/blob-access.mjs";
import { MAX_VIDEO_BYTES } from "../lib/media-limits.mjs";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64kb",
    },
  },
};

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (applyApiCors(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const gate = requireAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  const rwToken = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (!rwToken) {
    return res.status(503).json({
      error:
        "BLOB_READ_WRITE_TOKEN manquant sur Vercel (Storage → Blob). Requis pour les vidéos.",
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid body";
    return res.status(400).json({ error: msg });
  }

  const row = body && typeof body === "object" ? body : {};
  const pathname = String(row.pathname || "").trim().replace(/^\//, "");
  if (!pathname.startsWith("thebarber/media/")) {
    return res.status(400).json({ error: "pathname invalide (thebarber/media/…)" });
  }

  const size = Number(row.size) || 0;
  if (size > MAX_VIDEO_BYTES) {
    return res.status(413).json({
      error: `Fichier trop lourd (${(size / (1024 * 1024)).toFixed(1)} Mo). Maximum 10 Mo.`,
    });
  }

  const access =
    String(row.access || "").toLowerCase() === "private"
      ? "private"
      : getMediaBlobAccess();
  const multipart = Boolean(row.multipart) || size > 4_500_000;

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: rwToken,
      pathname,
      access,
      maximumSizeInBytes: MAX_VIDEO_BYTES,
      allowedContentTypes: ["video/*", "image/*", "application/octet-stream", "audio/*"],
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return res.status(200).json({
      ok: true,
      clientToken,
      pathname,
      access,
      multipart,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token generation failed";
    console.error("[upload-token]", msg);
    return res.status(500).json({ error: msg });
  }
}
