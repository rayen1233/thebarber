/**
 * Pousse un export catalogue vers Vercel (images → Blob, puis 1 produit / requête).
 */
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { dataUrlToBlob, uploadInlinePhotosInProducts } from "../lib/catalog-media.mjs";

const file = process.argv[2];
const secret = process.env.ADMIN_SECRET;
const base = (process.env.VERCEL_URL || "https://thebarber-three.vercel.app").replace(/\/$/, "");

if (!file) {
  console.error("Usage: node scripts/push-catalog.mjs <fichier.json>");
  process.exit(1);
}
if (!secret) {
  console.error("Définissez ADMIN_SECRET.");
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

async function uploadMedia(blob, filename) {
  const buf = Buffer.from(await blob.arrayBuffer());
  const res = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename,
      contentType: blob.type || "application/octet-stream",
      dataBase64: buf.toString("base64"),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Upload ${res.status}`);
  return String(out.url || "");
}

async function putMerge(chunk) {
  const json = JSON.stringify(chunk);
  const gz = gzipSync(Buffer.from(json, "utf8"));
  const body = JSON.stringify({ merge: true, storeGzipBase64: gz.toString("base64") });
  const res = await fetch(`${base}/api/store`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Store ${res.status}`);
  return out.productCount ?? 0;
}

console.log("Upload des images intégrées (data:) vers Blob…");
const leanProducts = await uploadInlinePhotosInProducts(products, uploadMedia, (msg) =>
  console.log(msg),
);

let count = 0;
for (let i = 0; i < leanProducts.length; i++) {
  console.log(`Produit ${i + 1}/${leanProducts.length}…`);
  count = await putMerge({
    merge: true,
    products: [leanProducts[i]],
    users: i === 0 && Array.isArray(raw.users) ? raw.users : [],
    orders: i === 0 && Array.isArray(raw.orders) ? raw.orders : [],
  });
}

console.log("OK —", count, "produit(s). Vérifiez:", `${base}/api/health`);
