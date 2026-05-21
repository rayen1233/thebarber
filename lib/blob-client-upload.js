/**
 * put() depuis @vercel/blob/client (navigateur).
 * @returns {Promise<typeof import("@vercel/blob/client").put>}
 */
export async function loadBlobClientPut() {
  const sources = [
    "https://cdn.jsdelivr.net/npm/@vercel/blob@2.4.0/dist/client.js",
    "https://cdn.jsdelivr.net/npm/@vercel/blob@2.4.0/client/+esm",
    "https://esm.sh/@vercel/blob@2.4.0/client",
    "https://unpkg.com/@vercel/blob@2.4.0/dist/client.js",
  ];
  for (const href of sources) {
    try {
      const mod = await import(/* @vite-ignore */ href);
      const fn = mod.put;
      if (typeof fn === "function") return fn;
    } catch (err) {
      console.warn("[thebarber] blob client put import failed:", href, err);
    }
  }
  throw new Error(
    "Module put vidéo indisponible (@vercel/blob/client). Vérifiez la connexion ou redeploy.",
  );
}
