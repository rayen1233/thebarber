import { put } from "@vercel/blob";
import { applyApiCors } from "../lib/api-cors.mjs";
import { getMediaBlobAccess, hasBlobCredentials } from "../lib/blob-access.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import { requireAdmin } from "../lib/store-server.js";
import { blobSdkAuthOptions } from "../lib/blob-sdk-auth.mjs";
import { catalogUrlFromBlobUpload } from "../lib/blob-media-url.mjs";

/** Corps JSON max (~4.5 Mo limite Vercel) — base64 grossit ~33 %. */
const MAX_JSON_BODY_CHARS = 5_800_000;
const MAX_RAW_BYTES = 4_200_000;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

/**
 * @param {string} pathname
 * @param {Buffer} buffer
 * @param {string} contentType
 */
async function putMediaBlob(pathname, buffer, contentType) {
  const auth = blobSdkAuthOptions();
  const base = { ...auth, contentType, addRandomSuffix: false, allowOverwrite: true };
  const preferred = getMediaBlobAccess();
  try {
    return { result: await put(pathname, buffer, { ...base, access: preferred }), access: preferred };
  } catch (err) {
    const retryPrivate =
      preferred === "public" &&
      (err?.name === "BlobAccessError" ||
        /forbidden|access denied|not allowed|private store|public access/i.test(
          String(err?.message || ""),
        ));
    if (!retryPrivate) throw err;
    return {
      result: await put(pathname, buffer, { ...base, access: "private" }),
      access: "private",
    };
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

  const gate = requireAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  if (!hasBlobCredentials()) {
    return res.status(503).json({
      error:
        "Blob non configuré. Vercel → Storage → Blob → Connect to Project, puis Redeploy.",
    });
  }

  try {
    const parsed = await readJsonBody(req);
    if (!parsed || typeof parsed !== "object") {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const body = /** @type {Record<string, unknown>} */ (parsed);
    const dataBase64 = String(body.dataBase64 || "").trim();
    const contentType = String(
      body.contentType || "application/octet-stream",
    ).trim();
    const filename = String(body.filename || "upload.bin").trim();

    if (!dataBase64) {
      return res.status(400).json({ error: "dataBase64 required" });
    }

    if (dataBase64.length > MAX_JSON_BODY_CHARS) {
      return res.status(413).json({
        error:
          "Fichier trop lourd pour l’API (max ~3 Mo). Réduisez la résolution ou la qualité JPEG avant envoi.",
      });
    }

    const buffer = Buffer.from(dataBase64, "base64");
    if (!buffer.length) {
      return res.status(400).json({ error: "Empty file" });
    }
    if (buffer.length > MAX_RAW_BYTES) {
      return res.status(413).json({
        error: `Fichier trop lourd (${Math.round(buffer.length / 1e6)} Mo). Maximum ~3 Mo.`,
      });
    }

    const ext = filename.includes(".")
      ? filename.split(".").pop()
      : contentType.includes("video")
        ? "mp4"
        : "jpg";
    const safeExt =
      String(ext)
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 8) || "bin";
    const pathname = `thebarber/media/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;

    const { result, access } = await putMediaBlob(pathname, buffer, contentType);
    const url = catalogUrlFromBlobUpload(result, pathname, access);
    if (!url) {
      return res.status(502).json({ error: "Blob upload returned no URL" });
    }

    return res.status(200).json({
      ok: true,
      url,
      pathname,
      access,
    });
  } catch (err) {
    console.error("[upload] failed", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    const status = /too large|413|payload/i.test(msg) ? 413 : 502;
    return res.status(status).json({ error: msg });
  }
}
