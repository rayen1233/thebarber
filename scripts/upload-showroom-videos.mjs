/**
 * Publie les vidéos showroom sur Vercel Blob (même flux que les vidéos produits → /api/media).
 *
 * Usage (depuis la racine du projet, avec .env.local ou variables Vercel) :
 *   node scripts/upload-showroom-videos.mjs
 *
 * Fichiers lus dans public/ (ou racine) : backgroundtondeuse.mp4, backgroundscisso.mp4, …
 */
import fs from "node:fs";
import path from "node:path";
import { putMediaBlob } from "../lib/blob-put-media.mjs";
import { catalogUrlFromBlobUpload } from "../lib/blob-media-url.mjs";

const PAIRS = [
  ["backgroundtondeuse.mp4", "thebarber/showroom/backgroundtondeuse.mp4"],
  ["backgroundscisso.mp4", "thebarber/showroom/backgroundscisso.mp4"],
  ["backgroundaccesoire.mp4", "thebarber/showroom/backgroundaccesoire.mp4"],
  ["backgroundmarchandise.mp4", "thebarber/showroom/backgroundmarchandise.mp4"],
];

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key]?.trim()) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

function resolveLocalFile(name) {
  const candidates = [
    path.join(process.cwd(), "public", name),
    path.join(process.cwd(), name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  loadEnvLocal();
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    console.error(
      "BLOB_READ_WRITE_TOKEN manquant. Copiez .env.local depuis Vercel ou lancez avec vercel env pull.",
    );
    process.exit(1);
  }

  console.log("Upload showroom → Blob (private + /api/media)\n");

  for (const [localName, pathname] of PAIRS) {
    const filePath = resolveLocalFile(localName);
    if (!filePath) {
      console.warn(`  SKIP ${localName} (fichier introuvable)`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const mb = (buf.length / (1024 * 1024)).toFixed(2);
    process.stdout.write(`  ${localName} (${mb} Mo) → ${pathname} … `);
    const { result, access } = await putMediaBlob(pathname, buf, "video/mp4");
    const url = catalogUrlFromBlobUpload(result, pathname, access);
    console.log("OK");
    console.log(`    ${url}\n`);
  }

  console.log("Terminé. Redéployez si besoin, puis hard-refresh intro.html.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
