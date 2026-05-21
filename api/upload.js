import { put } from "@vercel/blob";
import { applyApiCors } from "../lib/api-cors.mjs";
import { getMediaBlobAccess, hasBlobCredentials } from "../lib/blob-access.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import { requireAdmin } from "../lib/store-server.js";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

/**
 * @param {string} pathname
 * @param {Buffer} buffer
 * @param {string} contentType
 */
async function putMediaBlob(pathname, buffer, contentType) {
  const base = { contentType, addRandomSuffix: false };
  const access = getMediaBlobAccess();
  try {
    return await put(pathname, buffer, { ...base, access });
  } catch (err) {
    const retryPrivate =
      access === "public" &&
      (err?.name === "BlobAccessError" ||
        /forbidden|access denied|not allowed/i.test(String(err?.message || "")));
    if (!retryPrivate) throw err;
    return await put(pathname, buffer, { ...base, access: "private" });
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

    const buffer = Buffer.from(dataBase64, "base64");
    if (!buffer.length) {
      return res.status(400).json({ error: "Empty file" });
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

    const result = await putMediaBlob(pathname, buffer, contentType);
    const url = String(result.downloadUrl || result.url || "");
    if (!url) {
      return res.status(502).json({ error: "Blob upload returned no URL" });
    }

    return res.status(200).json({
      ok: true,
      url,
    });
  } catch (err) {
    console.error("[upload] failed", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    const status = /too large|413|payload/i.test(msg) ? 413 : 502;
    return res.status(status).json({ error: msg });
  }
}
