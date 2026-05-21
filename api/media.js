/**
 * Sert les médias Blob privés (évite 403 sur *.private.blob.vercel-storage.com).
 */
import { get } from "@vercel/blob";
import { applyApiCors } from "../lib/api-cors.mjs";
import { blobSdkAuthOptions } from "../lib/blob-sdk-auth.mjs";
import { pathnameFromBlobUrl } from "../lib/blob-media-url.mjs";
import { getMediaBlobAccess } from "../lib/blob-access.mjs";

/** @param {ReadableStream<Uint8Array> | null} stream */
async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  if (applyApiCors(req, res)) return;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = req.query && typeof req.query === "object" ? req.query : {};
  let pathname = String(q.pathname || "").trim().replace(/^\//, "");
  const url = String(q.url || "").trim();
  if (!pathname && url) pathname = pathnameFromBlobUrl(url);
  if (!pathname || !pathname.startsWith("thebarber/")) {
    return res.status(400).json({ error: "pathname invalide (thebarber/…)" });
  }

  const auth = blobSdkAuthOptions();
  const accessAttempts =
    getMediaBlobAccess() === "public" ? ["public", "private"] : ["private", "public"];

  try {
    let hit = null;
    for (const access of accessAttempts) {
      try {
        const candidate = await get(pathname, {
          ...auth,
          access,
          useCache: true,
        });
        if (candidate?.stream && candidate.statusCode !== 304) {
          hit = candidate;
          break;
        }
      } catch {
        /* try next access */
      }
    }
    if (!hit?.stream) {
      return res.status(404).json({ error: "Média introuvable" });
    }

    const buf = await streamToBuffer(hit.stream);
    let type = hit.blob?.contentType || "application/octet-stream";
    if (/octet-stream/i.test(type) && /\.(mp4|webm|mov|m4v)$/i.test(pathname)) {
      type = "video/mp4";
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    if (req.method === "HEAD") {
      res.setHeader("Content-Length", String(buf.length));
      return res.status(200).end();
    }
    return res.status(200).send(buf);
  } catch (err) {
    console.error("[media] get failed", pathname, err);
    const msg = err instanceof Error ? err.message : "load failed";
    return res.status(502).json({ error: msg });
  }
}
