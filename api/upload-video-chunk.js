/**
 * Upload vidéo par morceaux (≤ ~3 Mo / requête) puis assemblage serveur → Blob.
 * Permet ~6 Mo sans appel navigateur vers vercel.com/api/blob.
 */
import { del, list, get } from "@vercel/blob";
import { applyApiCors } from "../lib/api-cors.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";
import { requireAdmin } from "../lib/store-server.js";
import { getMediaBlobAccess } from "../lib/blob-access.mjs";
import { blobSdkAuthOptions } from "../lib/blob-sdk-auth.mjs";
import { putMediaBlob } from "../lib/blob-put-media.mjs";
import { catalogUrlFromBlobUpload } from "../lib/blob-media-url.mjs";
import {
  MAX_BLOB_UPLOAD_VIDEO_BYTES,
  MAX_VIDEO_BYTES,
} from "../lib/media-limits.mjs";

/** Marge sous la limite corps Vercel (~4,5 Mo). */
const MAX_CHUNK_BYTES = 3_400_000;

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

function tmpPrefix(sessionId) {
  return `thebarber/tmp-upload/${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "")}/`;
}

function partPath(sessionId, index) {
  return `${tmpPrefix(sessionId)}part-${index}`;
}

/** @param {string} pathname @param {ReturnType<typeof blobSdkAuthOptions>} auth */
async function readPartBuffer(pathname, auth) {
  const access = getMediaBlobAccess();
  const tries = access === "public" ? ["public", "private"] : ["private"];
  for (const access of tries) {
    try {
      const hit = await get(pathname, { ...auth, access });
      if (hit?.stream) {
        return Buffer.from(await new Response(hit.stream).arrayBuffer());
      }
    } catch {
      /* next */
    }
  }
  throw new Error(`Morceau introuvable : ${pathname}`);
}

/** @param {import("@vercel/node").VercelRequest} req @param {import("@vercel/node").VercelResponse} res */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (applyApiCors(req, res)) return;

  const gate = requireAdmin(req);
  if (!gate.ok) {
    return res.status(gate.status).json({ error: gate.error });
  }

  const q = req.query && typeof req.query === "object" ? req.query : {};
  const action = String(q.action || "").trim().toLowerCase();

  if (req.method === "POST" && action === "start") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      body = {};
    }
    const totalSize = Number(body.totalSize) || 0;
    if (totalSize < 1 || totalSize > MAX_BLOB_UPLOAD_VIDEO_BYTES) {
      return res.status(400).json({
        error: `Taille invalide (max ${(MAX_BLOB_UPLOAD_VIDEO_BYTES / (1024 * 1024)).toFixed(0)} Mo).`,
      });
    }
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    return res.status(200).json({ ok: true, sessionId, maxChunkBytes: MAX_CHUNK_BYTES });
  }

  if (req.method === "POST" && action === "chunk") {
    const sessionId = String(q.sessionId || "").trim();
    const index = Number(q.index);
    const totalSize = Number(q.totalSize) || 0;
    if (!sessionId || !Number.isFinite(index) || index < 0) {
      return res.status(400).json({ error: "sessionId et index requis" });
    }
    if (totalSize > MAX_BLOB_UPLOAD_VIDEO_BYTES) {
      return res.status(413).json({ error: "Fichier trop lourd pour cet upload." });
    }

    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buf.length;
        if (size > MAX_CHUNK_BYTES) {
          return res.status(413).json({ error: "Morceau trop grand (> ~3 Mo)." });
        }
        chunks.push(buf);
      }
      if (!size) return res.status(400).json({ error: "Morceau vide" });

      await putMediaBlob(
        partPath(sessionId, index),
        Buffer.concat(chunks),
        "application/octet-stream",
      );

      return res.status(200).json({ ok: true, index, size });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chunk upload failed";
      console.error("[upload-video-chunk]", msg);
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "POST" && action === "commit") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid body";
      return res.status(400).json({ error: msg });
    }
    const row = body && typeof body === "object" ? body : {};
    const sessionId = String(row.sessionId || q.sessionId || "").trim();
    const pathname = String(row.pathname || "")
      .trim()
      .replace(/^\//, "");
    const partCount = Number(row.partCount) || 0;
    const totalSize = Number(row.totalSize) || 0;
    const contentType = String(row.contentType || "video/mp4").trim();

    if (!sessionId || !pathname.startsWith("thebarber/media/")) {
      return res.status(400).json({ error: "sessionId ou pathname invalide" });
    }
    if (!partCount || partCount > 8) {
      return res.status(400).json({ error: "partCount invalide" });
    }
    if (totalSize > MAX_BLOB_UPLOAD_VIDEO_BYTES || totalSize > MAX_VIDEO_BYTES) {
      return res.status(413).json({ error: "Fichier trop lourd (max 6 Mo)." });
    }

    try {
      const auth = blobSdkAuthOptions();
      const buffers = [];
      let sum = 0;

      for (let i = 0; i < partCount; i++) {
        const prefix = partPath(sessionId, i);
        const listed = await list({ prefix, ...auth });
        const blob = listed.blobs.find((b) => b.pathname === prefix);
        if (!blob) {
          return res.status(400).json({ error: `Morceau ${i} manquant` });
        }
        const buf = await readPartBuffer(blob.pathname, auth);
        sum += buf.length;
        buffers.push(buf);
      }

      if (Math.abs(sum - totalSize) > 64) {
        return res.status(400).json({
          error: `Taille incohérente (attendu ${totalSize}, reçu ${sum})`,
        });
      }

      const buffer = Buffer.concat(buffers);
      const { result, access } = await putMediaBlob(pathname, buffer, contentType);

      const url = catalogUrlFromBlobUpload(result, pathname, access);
      const tmpListed = await list({ prefix: tmpPrefix(sessionId), ...auth });
      await Promise.all(
        tmpListed.blobs.map((b) => del(b.url, auth).catch(() => {})),
      );

      return res.status(200).json({
        ok: true,
        url,
        pathname,
        access,
        size: sum,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Commit failed";
      console.error("[upload-video-chunk commit]", msg);
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader("Allow", "POST");
  return res.status(405).json({
    error: "Utiliser ?action=start|chunk|commit",
  });
}
