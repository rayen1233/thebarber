/**
 * Copy public/ assets to site root so Vercel serves them at /file.ext
 * (same paths as local dev with public/ prefix fallbacks).
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const publicDir = path.join(root, "public");

async function copyEntry(name) {
  const src = path.join(publicDir, name);
  const dest = path.join(root, name);
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.cp(src, dest, { recursive: true, force: true });
  } else {
    await fs.copyFile(src, dest);
  }
}

try {
  const entries = await fs.readdir(publicDir);
  for (const name of entries) {
    await copyEntry(name);
  }
  console.log("[prepare-vercel] public/ copied to root");
} catch (err) {
  console.error("[prepare-vercel] failed", err);
  process.exit(1);
}
