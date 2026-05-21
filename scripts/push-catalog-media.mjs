/**
 * Publie images/vidéos (data:) depuis un export JSON vers les produits déjà sur Vercel.
 *
 * Usage :
 *   $env:ADMIN_SECRET="votre-cle"
 *   node scripts/push-catalog-media.mjs "C:\chemin\thebarber-catalogue.json"
 */
import fs from "node:fs";
import path from "node:path";
import { uploadInlinePhotosInProducts, dataUrlToBlob } from "../lib/catalog-media.mjs";

const file = process.argv[2];
const secretArg = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "";
const base = (process.env.VERCEL_URL || "https://thebarber-three.vercel.app").replace(
  /\/$/,
  "",
);

function loadAdminSecret() {
  if (secretArg) return secretArg.trim();
  if (process.env.ADMIN_SECRET?.trim()) return process.env.ADMIN_SECRET.trim();
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*ADMIN_SECRET\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

const secret = loadAdminSecret();
if (!file || !secret) {
  console.error(
    "Usage: node scripts/push-catalog-media.mjs <export.json> [ADMIN_SECRET]",
  );
  process.exit(1);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${secret}`,
    "X-Admin-Key": secret,
    "Content-Type": "application/json",
  };
}

async function uploadMedia(buffer, filename, contentType) {
  const res = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      filename,
      contentType,
      dataBase64: buffer.toString("base64"),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Upload ${res.status}`);
  return String(out.url || "");
}

async function putMerge(product) {
  const res = await fetch(`${base}/api/store`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ merge: true, products: [product] }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Store ${res.status}`);
  return out.productCount ?? 0;
}

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const source = Array.isArray(raw) ? raw : raw.products ?? raw.catalogue ?? [];
if (!Array.isArray(source) || !source.length) {
  console.error("Aucun produit dans le JSON.");
  process.exit(1);
}

const storeRes = await fetch(`${base}/api/store`, { cache: "no-store" });
const remote = await storeRes.json();
const serverList = Array.isArray(remote.products) ? remote.products : [];
if (!serverList.length) {
  console.error("Catalogue serveur vide — importez d’abord le JSON (sans --skip-images ou import admin).");
  process.exit(1);
}

const byId = new Map(source.filter((p) => p?.id).map((p) => [String(p.id), p]));
const byName = new Map(
  source.filter((p) => p?.name).map((p) => [String(p.name).trim().toLowerCase(), p]),
);

let updated = 0;
let skipped = 0;

for (let i = 0; i < serverList.length; i++) {
  const remoteP = serverList[i];
  const src =
    byId.get(String(remoteP.id || "")) ||
    byName.get(String(remoteP.name || "").trim().toLowerCase());
  if (!src) {
    skipped++;
    continue;
  }
  const photos = Array.isArray(src.photos) ? src.photos : [];
  const hasData = photos.some((u) => String(u).startsWith("data:"));
  const hasVid = String(src.videoUrl || "").startsWith("data:");
  if (!hasData && !hasVid) {
    skipped++;
    continue;
  }

  console.log(`[${i + 1}/${serverList.length}] ${remoteP.name}…`);
  let work = { ...remoteP, photos: hasData ? photos : remoteP.photos, videoUrl: src.videoUrl || remoteP.videoUrl };

  if (hasData) {
    const uploaded = await uploadInlinePhotosInProducts(
      [work],
      async (blob, name) => {
        const buf = Buffer.from(await blob.arrayBuffer());
        return uploadMedia(buf, name, blob.type || "image/jpeg");
      },
      (msg) => console.log(" ", msg),
    );
    work = uploaded[0] || work;
  }

  const vid = String(work.videoUrl || "");
  if (vid.startsWith("data:")) {
    const buf = Buffer.from(await dataUrlToBlob(vid).arrayBuffer());
    work.videoUrl = await uploadMedia(buf, `${work.id}.mp4`, "video/mp4");
  }

  work.photos = (work.photos || [])
    .map((u) => String(u || "").trim())
    .filter((u) => u && !u.startsWith("data:"));
  if (!work.photos.length) work.photos = remoteP.photos;

  await putMerge(work);
  updated++;
}

console.log(`OK — ${updated} produit(s) avec médias, ${skipped} ignoré(s).`);
console.log("Vérifiez :", `${base}/api/health`);
