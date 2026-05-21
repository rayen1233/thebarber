/**
 * Normalise le corps PUT /api/store (sans clé merge) et allège les produits pour Blob.
 */

const PLACEHOLDER_PHOTO = "public/vite.svg";

/** @param {unknown} raw */
export function extractStorePayload(raw) {
  if (!raw || typeof raw !== "object") {
    return { products: [], users: [], orders: [], deletedProductIds: [] };
  }
  const row = /** @type {Record<string, unknown>} */ (raw);
  const deletedProductIds = Array.isArray(row.deletedProductIds)
    ? row.deletedProductIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  return {
    products: Array.isArray(row.products) ? row.products : [],
    users: Array.isArray(row.users) ? row.users : [],
    orders: Array.isArray(row.orders) ? row.orders : [],
    deletedProductIds,
  };
}

/** @param {unknown[]} products */
export function leanProductsForServer(products) {
  const out = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p || typeof p !== "object") continue;
    const row = { .../** @type {Record<string, unknown>} */ (p) };
    let photos = (Array.isArray(row.photos) ? row.photos : [])
      .map((u) => String(u || "").trim())
      .filter((u) => u && !u.startsWith("data:") && !u.startsWith("idb://"));
    if (!photos.length) photos = [PLACEHOLDER_PHOTO];
    while (photos.length < 3) photos.push(photos[0]);
    row.photos = photos.slice(0, 6);
    const vid = String(row.videoUrl || "").trim();
    if (vid.startsWith("data:") || vid.startsWith("idb://")) row.videoUrl = "";
    const poster = String(row.videoPosterUrl || "").trim();
    if (poster.startsWith("data:") || poster.startsWith("idb://")) row.videoPosterUrl = "";
    else row.videoPosterUrl = poster;
    let id = String(row.id || "").trim();
    if (!id) id = `p-${Date.now()}-${i}`;
    row.id = id;
    if (!row.createdAt) row.createdAt = new Date().toISOString();
    const name = String(row.name || "").trim();
    const category = String(row.category || "").trim();
    const description = String(row.description || "").trim();
    const priceTnd = Number(row.priceTnd);
    if (!name || !description || !Number.isFinite(priceTnd)) continue;
    row.name = name;
    row.category = category;
    row.description = description;
    row.priceTnd = priceTnd;
    row.videoUrl = String(row.videoUrl || "").trim();
    out.push(row);
  }
  return out;
}
