/**
 * Pousse un export catalogue JSON vers Vercel (contourne CORS / quota navigateur).
 *
 * Usage (PowerShell) :
 *   $env:ADMIN_SECRET="votre-cle"
 *   $env:VERCEL_URL="https://thebarber-three.vercel.app"
 *   node scripts/push-catalog.mjs "C:\chemin\thebarber-catalogue-....json"
 */
import fs from "node:fs";
import { gzipSync } from "node:zlib";

const file = process.argv[2];
const secret = process.env.ADMIN_SECRET;
const base = (process.env.VERCEL_URL || "https://thebarber-three.vercel.app").replace(/\/$/, "");

if (!file) {
  console.error("Usage: node scripts/push-catalog.mjs <fichier.json>");
  process.exit(1);
}
if (!secret) {
  console.error("Définissez ADMIN_SECRET (même valeur que sur Vercel).");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const products = Array.isArray(raw)
  ? raw
  : raw.products ?? raw.catalogue ?? raw.catalog ?? raw.items;
if (!Array.isArray(products)) {
  console.error("Format invalide : pas de liste products.");
  process.exit(1);
}

const payload = {
  products,
  users: Array.isArray(raw.users) ? raw.users : [],
  orders: Array.isArray(raw.orders) ? raw.orders : [],
};

const json = JSON.stringify(payload);
const gz = gzipSync(Buffer.from(json, "utf8"));
const body = JSON.stringify({ storeGzipBase64: gz.toString("base64") });

console.log(
  `Envoi ${products.length} produit(s) — JSON ${(json.length / 1024 / 1024).toFixed(2)} Mo → compressé ${(body.length / 1024 / 1024).toFixed(2)} Mo…`,
);

const res = await fetch(`${base}/api/store`, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  },
  body,
});

const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Échec", res.status, out.error || out);
  process.exit(1);
}
console.log("OK — catalogue publié :", out.productCount ?? products.length, "produit(s)");
console.log("Vérifiez :", `${base}/api/health`);
