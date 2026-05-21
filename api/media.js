/**
 * Sert les médias Blob privés (évite 403 sur *.private.blob.vercel-storage.com).
 * Supporte les requêtes Range (lecture vidéo dans le navigateur).
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

/**
 * @param {string | string[] | undefined} rangeHeader
 * @param {number} size
 */
function parseRangeHeader(rangeHeader, size) {
  const raw = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader;
  const m = String(raw || "").match(/bytes=(\d*)-(\d*)/i);
  if (!m) return null;
  let start = m[1] === "" ? 0 : parseInt(m[1], 10);
  let end = m[2] === "" ? size - 1 : parseInt(m[2], 10);
  if (!Number.isFinite(start) || start < 0) start = 0;
  if (!Number.isFinite(end) || end >= size) end = size - 1;
  if (start > end || start >= size) return null;
  return { start, end };
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
    const total = buf.length;
    if (!total) {
      return res.status(404).json({ error: "Fichier vide" });
    }

    let type = hit.blob?.contentType || "application/octet-stream";
    if (/octet-stream/i.test(type) && /\.(mp4|webm|mov|m4v)$/i.test(pathname)) {
      type = "video/mp4";
    }

    res.setHeader("Content-Type", type);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

    const range = parseRangeHeader(req.headers.range, total);

    if (req.method === "HEAD") {
      if (range) {
        const chunkLen = range.end - range.start + 1;
        res.setHeader("Content-Length", String(chunkLen));
        res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
        return res.status(206).end();
      }
      res.setHeader("Content-Length", String(total));
      return res.status(200).end();
    }

    if (range) {
      const chunk = buf.subarray(range.start, range.end + 1);
      res.setHeader("Content-Length", String(chunk.length));
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
      return res.status(206).send(chunk);
    }

    res.setHeader("Content-Length", String(total));
    return res.status(200).send(buf);
  } catch (err) {
    console.error("[media] get failed", pathname, err);
    const msg = err instanceof Error ? err.message : "load failed";
    return res.status(502).json({ error: msg });
  }
}
