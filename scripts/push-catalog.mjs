/**
 * Pousse un export catalogue vers Vercel (images → Blob, puis 1 produit / requête).
 *
 * Usage :
 *   $env:ADMIN_SECRET="exactement-la-valeur-Vercel"
 *   node scripts/push-catalog.mjs "C:\chemin\catalogue.json"
 *
 * Ou : node scripts/push-catalog.mjs "catalogue.json" "votre-cle-admin"
 *
 * Sans upload d'images (catalogue léger, photos data: retirées) :
 *   node scripts/push-catalog.mjs "catalogue.json" "cle" --skip-images
 */
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { uploadInlinePhotosInProducts } from "../lib/catalog-media.mjs";
import { leanProductsForServer } from "../lib/store-payload.mjs";

const file = process.argv[2];
const secretArg = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "";
const skipImages = process.argv.includes("--skip-images");
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

if (!file) {
  console.error(
    "Usage: node scripts/push-catalog.mjs <fichier.json> [ADMIN_SECRET] [--skip-images]",
  );
  process.exit(1);
}
if (!secret) {
  console.error(`
ADMIN_SECRET manquant.

1. Vercel → projet thebarber → Settings → Environment Variables
2. Créez ADMIN_SECRET (mot de passe de votre choix) pour Production
3. Redeploy le projet

Puis lancez :
  $env:ADMIN_SECRET="la-meme-valeur-exacte"
  node scripts/push-catalog.mjs "${file}"

Ou :
  node scripts/push-catalog.mjs "${file}" "la-meme-valeur-exacte"
`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const products = Array.isArray(raw)
  ? raw
  : raw.products ?? raw.catalogue ?? raw.catalog ?? raw.items;
if (!Array.isArray(products)) {
  console.error("Format invalide.");
  process.exit(1);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${secret}`,
    "X-Admin-Key": secret,
    "Content-Type": "application/json",
  };
}

async function verifyAdminSecret() {
  const res = await fetch(`${base}/api/store`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ merge: true, products: [], users: [], orders: [] }),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) {
    console.error(`
Échec : clé admin refusée (401 Unauthorized).

La valeur doit être IDENTIQUE à la variable ADMIN_SECRET sur Vercel (sans espace en trop).
Vérifiez aussi que ADMIN_SECRET existe pour l'environnement Production et que vous avez Redeploy.
`);
    process.exit(1);
  }
  if (res.status === 503 && /ADMIN_SECRET not configured/i.test(String(out.error))) {
    console.error(`
Échec : ADMIN_SECRET n'est pas configuré sur Vercel (503).

Ajoutez la variable sur Vercel puis Redeploy.
`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error("Test auth échoué:", res.status, out.error || out);
    process.exit(1);
  }
  console.log("Clé admin OK.");
}

async function uploadMedia(blob, filename) {
  const buf = Buffer.from(await blob.arrayBuffer());
  const res = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      filename,
      contentType: blob.type || "application/octet-stream",
      dataBase64: buf.toString("base64"),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error("Unauthorized — ADMIN_SECRET incorrect sur Vercel");
  }
  if (!res.ok) throw new Error(out.error || `Upload ${res.status}`);
  return String(out.url || "");
}

/** Retire les data: URL (trop lourdes) — garde http(s) et chemins relatifs. */
function stripInlineDataPhotos(product) {
  const row = { ...product };
  let photos = (Array.isArray(row.photos) ? row.photos : [])
    .map((u) => String(u || "").trim())
    .filter((u) => u && !u.startsWith("data:"));
  if (!photos.length) {
    photos = ["public/vite.svg", "public/vite.svg", "public/vite.svg"];
  }
  while (photos.length < 3) photos.push(photos[0]);
  row.photos = photos.slice(0, 3);
  if (String(row.videoUrl || "").startsWith("data:")) row.videoUrl = "";
  return row;
}

async function putMerge(chunk) {
  const json = JSON.stringify(chunk);
  const gz = gzipSync(Buffer.from(json, "utf8"));
  const body = JSON.stringify({ merge: true, storeGzipBase64: gz.toString("base64") });
  const res = await fetch(`${base}/api/store`, {
    method: "PUT",
    headers: authHeaders(),
    body,
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error("Unauthorized — ADMIN_SECRET incorrect");
  }
  if (!res.ok) throw new Error(out.error || `Store ${res.status}`);
  return out.productCount ?? 0;
}

await verifyAdminSecret();

let leanProducts;
if (skipImages) {
  console.log("Mode --skip-images : pas d'upload Blob pour les photos data:");
  leanProducts = products.map(stripInlineDataPhotos);
} else {
  const { dataUrlToBlob } = await import("../lib/catalog-media.mjs");
  console.log("Upload des images intégrées (data:) vers Blob…");
  leanProducts = await uploadInlinePhotosInProducts(
    products,
    (blob, name) => uploadMedia(blob, name),
    (msg) => console.log(msg),
  );
}

let count = 0;
let ok = 0;
const failed = [];
for (let i = 0; i < leanProducts.length; i++) {
  const name = leanProducts[i]?.name || `produit ${i + 1}`;
  console.log(`Catalogue ${i + 1}/${leanProducts.length} — ${String(name).slice(0, 50)}…`);
  const row = leanProducts[i];
  const normalized = leanProductsForServer([row]);
  if (!normalized.length) {
    failed.push({
      name,
      error: "Produit rejeté (nom, description, prix ou photos data: invalides)",
    });
    console.error(`  → échec : produit non enregistrable côté serveur`);
    continue;
  }
  try {
    count = await putMerge({
      merge: true,
      products: [normalized[0]],
      users: i === 0 && Array.isArray(raw.users) ? raw.users : [],
      orders: i === 0 && Array.isArray(raw.orders) ? raw.orders : [],
    });
    ok++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failed.push({ name, error: msg });
    console.error(`  → échec : ${msg}`);
  }
}

if (failed.length) {
  console.error(`\nImport partiel : ${ok}/${leanProducts.length} produit(s).`);
  for (const f of failed.slice(0, 8)) {
    console.error(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
}

console.log("OK —", count, "produit(s) sur le serveur.");
console.log("Vérifiez :", `${base}/api/health`);
