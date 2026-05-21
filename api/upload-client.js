/**
 * Upload navigateur → Vercel Blob (vidéos jusqu’à 10 Mo, sans passer par le corps JSON /api/upload).
 * Nécessite BLOB_READ_WRITE_TOKEN sur Vercel (handleUpload ne supporte pas OIDC seul).
 */
import { handleUpload } from "@vercel/blob/client";
import { applyApiCors } from "../lib/api-cors.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import { requireAdmin } from "../lib/store-server.js";
import { getMediaBlobAccess } from "../lib/blob-access.mjs";
import { MAX_VIDEO_BYTES } from "../lib/media-limits.mjs";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "2mb",
    },
  },
};

/** @param {import("http").IncomingMessage} req */
function requireAdminUpload(req) {
  const gate = requireAdmin(req);
  if (!gate.ok) {
    const err = new Error(gate.error || "Unauthorized");
    /** @type {Error & { status?: number }} */ (err).status = gate.status || 401;
    throw err;
  }
}

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (applyApiCors(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rwToken = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (!rwToken) {
    return res.status(503).json({
      error:
        "BLOB_READ_WRITE_TOKEN manquant : requis pour les vidéos (Vercel → Storage → Blob → token du store). Redeploy.",
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid body";
    return res.status(400).json({ error: msg });
  }

  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: rwToken,
      onBeforeGenerateToken: async (pathname, _clientPayload, multipart) => {
        requireAdminUpload(req);
        const p = String(pathname || "").replace(/^\//, "");
        if (!p.startsWith("thebarber/media/")) {
          throw new Error("Chemin invalide (thebarber/media/… requis).");
        }
        const access = getMediaBlobAccess();
        return {
          allowedContentTypes: [
            "video/*",
            "image/*",
            "application/octet-stream",
            "audio/*",
          ],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ access, multipart }),
        };
      },
      onUploadCompleted: async () => {
        /* catalogue mis à jour via l’URL renvoyée au client */
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload client failed";
    const status =
      /** @type {Error & { status?: number }} */ (err).status ||
      (/unauthorized|401/i.test(msg) ? 401 : 500);
    console.error("[upload-client]", msg);
    return res.status(status).json({ error: msg });
  }
}
