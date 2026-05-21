/**
 * Vérifie les variables Cloudinary (.env.local ou env shell).
 * Usage: node scripts/verify-cloudinary.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { isCloudinaryConfigured, getAllShowroomCloudinaryDelivery } from "../lib/cloudinary-media.mjs";

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (val) process.env[key] = val;
    }
  }
}

/** cloudinary://API_KEY:API_SECRET@CLOUD_NAME */
function applyCloudinaryUrl() {
  const raw = String(process.env.CLOUDINARY_URL || "").trim();
  if (!raw) return;
  try {
    const u = new URL(raw);
    if (u.protocol !== "cloudinary:") return;
    const key = decodeURIComponent(u.username || "");
    const secret = decodeURIComponent(u.password || "");
    const cloud = decodeURIComponent(u.hostname || u.pathname.replace(/^\//, "") || "");
    if (key) process.env.CLOUDINARY_API_KEY = key;
    if (secret) process.env.CLOUDINARY_API_SECRET = secret;
    if (cloud) process.env.CLOUDINARY_CLOUD_NAME = cloud;
  } catch {
    const m = raw.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/i);
    if (m) {
      process.env.CLOUDINARY_API_KEY = decodeURIComponent(m[1]);
      process.env.CLOUDINARY_API_SECRET = decodeURIComponent(m[2]);
      process.env.CLOUDINARY_CLOUD_NAME = decodeURIComponent(m[3]);
    }
  }
}

function mask(v) {
  const s = String(v || "").trim();
  if (!s) return "(vide)";
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}…${s.slice(-3)} (${s.length} car.)`;
}

loadEnvLocal();
applyCloudinaryUrl();

const name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const key = process.env.CLOUDINARY_API_KEY?.trim();
const secret = process.env.CLOUDINARY_API_SECRET?.trim();

console.log("\n=== Cloudinary env check ===\n");
console.log("CLOUDINARY_CLOUD_NAME:", name || "(manquant)");
console.log("CLOUDINARY_API_KEY:   ", mask(key));
console.log("CLOUDINARY_API_SECRET:", mask(secret));
console.log("");

if (!isCloudinaryConfigured()) {
  console.log("❌ Il manque CLOUDINARY_CLOUD_NAME (clé + secret OK).\n");
  console.log("Option A — le plus simple :");
  console.log("  Cloudinary → Settings → API Keys");
  console.log("  Bouton « Copy API environment variable » (ou « Product environment credentials »)");
  console.log("  Collez UNE ligne dans .env.local :");
  console.log("    CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME\n");
  console.log("Option B — 3 lignes séparées :");
  console.log("  Sur la même page, au-dessus du tableau des clés : « Cloud name: xxx »");
  console.log("    CLOUDINARY_CLOUD_NAME=xxx\n");
  process.exit(1);
}

console.log("✓ Les 3 variables sont présentes.\n");

try {
  const pingUrl = `https://api.cloudinary.com/v1_1/${name}/resources/video?max_results=1`;
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(pingUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`❌ API Cloudinary a refusé (${res.status}).`);
    console.log(body.slice(0, 200) || "");
    process.exit(1);
  }
  console.log("✓ Connexion API Cloudinary OK (clés valides).\n");
} catch (err) {
  console.log("❌ Impossible de joindre l’API Cloudinary:", err instanceof Error ? err.message : err);
  process.exit(1);
}

const showroom = getAllShowroomCloudinaryDelivery();
console.log("URLs showroom (aperçu) :");
for (const row of showroom) {
  console.log(`  [${row.index}] ${row.videoUrl.slice(0, 72)}…`);
}
console.log("\nSur Vercel : GET https://VOTRE-SITE/api/showroom-videos → ok:true + 4 videos");
console.log("En local après upload : public/showroom-cloudinary.json doit lister 4 entrées.\n");
