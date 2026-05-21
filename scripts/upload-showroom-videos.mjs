/**
 * Publie les 4 vidéos ORDER showroom sur Cloudinary (public_id fixes).
 *
 * Usage (racine du projet, .env.local avec CLOUDINARY_* ) :
 *   node scripts/upload-showroom-videos.mjs
 *
 * Fichiers : public/backgroundtondeuse.mp4, backgroundscisso.mp4, …
 * Génère aussi public/showroom-cloudinary.json (URLs pour le site).
 */
import fs from "node:fs";
import path from "node:path";
import {
  isCloudinaryConfigured,
  uploadShowroomVideoToCloudinary,
} from "../lib/cloudinary-media.mjs";

const FILES_BY_INDEX = [
  ["backgroundtondeuse.mp4", 0],
  ["backgroundscisso.mp4", 1],
  ["backgroundaccesoire.mp4", 2],
  ["backgroundmarchandise.mp4", 3],
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
  for (const p of [path.join(process.cwd(), "public", name), path.join(process.cwd(), name)]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  loadEnvLocal();
  if (!isCloudinaryConfigured()) {
    console.error(
      "CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET manquants dans .env.local",
    );
    process.exit(1);
  }

  console.log("Upload showroom → Cloudinary (4 panneaux)\n");
  const videos = [];

  for (const [localName, index] of FILES_BY_INDEX) {
    const filePath = resolveLocalFile(localName);
    if (!filePath) {
      console.warn(`  SKIP ${localName}`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const mb = (buf.length / (1024 * 1024)).toFixed(2);
    process.stdout.write(`  [${index}] ${localName} (${mb} Mo) … `);
    const row = await uploadShowroomVideoToCloudinary(buf, index);
    videos.push({
      index: row.index,
      videoUrl: row.videoUrl,
      posterUrl: row.posterUrl,
      publicId: row.publicId,
    });
    console.log("OK");
    console.log(`      ${row.videoUrl}\n`);
  }

  const outPath = path.join(process.cwd(), "public", "showroom-cloudinary.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), videos }, null, 2),
    "utf8",
  );
  console.log(`Écrit ${outPath}`);
  console.log("Redéployez Vercel, puis hard-refresh intro.html.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
