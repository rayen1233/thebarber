/**
 * Convertit un export catalogue complet en tableau [produits] pour l’ancien admin Vercel.
 *
 * node scripts/products-only-json.mjs "C:\...\thebarber-catalogue-....json"
 */
import fs from "node:fs";
import path from "node:path";

const inFile = process.argv[2];
if (!inFile) {
  console.error("Usage: node scripts/products-only-json.mjs <fichier-catalogue.json>");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inFile, "utf8"));
const products = Array.isArray(raw)
  ? raw
  : raw.products ?? raw.catalogue ?? raw.catalog ?? raw.items;
if (!Array.isArray(products)) {
  console.error("Pas de liste products dans le fichier.");
  process.exit(1);
}

const out = path.join(
  path.dirname(inFile),
  `thebarber-products-only-${Date.now()}.json`,
);
fs.writeFileSync(out, JSON.stringify(products, null, 2), "utf8");
console.log("OK:", products.length, "produit(s) →", out);
console.log("Importez CE fichier sur Vercel (ancien admin) ou utilisez push-catalog.mjs.");
