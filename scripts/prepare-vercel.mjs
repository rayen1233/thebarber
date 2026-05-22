/**
 * Vercel build prep:
 * - copy public/ → root (backgrounds, videos, etc.)
 * - copy intro.html → index.html (Vercel serves index.html at / before rewrites)
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
  await fs.copyFile(path.join(root, "intro.html"), path.join(root, "index.html"));
  const introMp4 = path.join(root, "intro.mp4");
  try {
    await fs.access(introMp4);
    await fs.copyFile(introMp4, path.join(publicDir, "intro.mp4"));
    await fs.copyFile(introMp4, path.join(root, "intro.mp4"));
  } catch {
    /* intro.mp4 optional at repo root */
  }
  console.log("[prepare-vercel] public/ → root, intro.html → index.html");
} catch (err) {
  console.error("[prepare-vercel] failed", err);
  process.exit(1);
}
