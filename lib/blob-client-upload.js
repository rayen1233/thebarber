/**
 * Charge upload() depuis @vercel/blob/client (navigateur, sans bundler).
 * @returns {Promise<import("@vercel/blob/client").upload>}
 */
export async function loadBlobClientUpload() {
  const sources = [
    "https://cdn.jsdelivr.net/npm/@vercel/blob@2.4.0/client/+esm",
    "https://esm.sh/@vercel/blob@2.4.0/client",
  ];
  for (const href of sources) {
    try {
      const mod = await import(/* @vite-ignore */ href);
      const fn = mod.upload;
      if (typeof fn === "function") return fn;
    } catch (err) {
      console.warn("[thebarber] blob client import failed:", href, err);
    }
  }
  throw new Error(
    "Module upload vidéo indisponible (@vercel/blob/client). Vérifiez la connexion ou redeploy le site.",
  );
}
