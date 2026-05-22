/**
 * Migre toutes les vidéos produit Cloudinary → Vercel Blob (catalogue serveur).
 *
 * Usage :
 *   $env:ADMIN_SECRET="votre-cle"
 *   node scripts/migrate-cloudinary-products-to-blob.mjs
 */
import fs from "node:fs";
import path from "node:path";

const base = (process.env.VERCEL_URL || "https://thebarber-three.vercel.app").replace(
  /\/$/,
  "",
);

function loadAdminSecret() {
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
if (!secret) {
  console.error("ADMIN_SECRET manquant (.env.local ou variable d’environnement).");
  process.exit(1);
}

const res = await fetch(`${base}/api/migrate-cloudinary-products`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "X-Admin-Key": secret,
    "Content-Type": "application/json",
  },
  body: "{}",
});

const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(data.error || `HTTP ${res.status}`);
  process.exit(1);
}

console.log(data.message || "OK");
console.log(
  `migrated=${data.migrated} skipped=${data.skipped} failed=${data.failed} total=${data.total ?? "?"}`,
);
if (Array.isArray(data.details)) {
  for (const row of data.details) {
    const tag = row.ok ? "OK" : row.skipped ? "SKIP" : "ERR";
    console.log(`  [${tag}] ${row.name || row.id}: ${row.error || row.videoUrl || ""}`);
  }
}
