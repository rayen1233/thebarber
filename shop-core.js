/**
 * The Barber — e-shop core (localStorage).
 * Keys and product shape are versioned for future backend migration.
 */

export const STORAGE_PRODUCTS = "thebarber_products_v1";
export const STORAGE_CART = "thebarber_cart_v1";

/** Fallback when catalogue JSON exceeds localStorage quota (large base64 photos). */
/** @type {Product[] | null} */
let productsMemoryCache = null;

/** @param {Product[] | null} list */
export function setProductsMemoryCache(list) {
  productsMemoryCache = list;
}

/** @returns {Product[] | null} */
export function getProductsMemoryCache() {
  return productsMemoryCache;
}

/** @typedef {{ slug: string, label: string }} CategoryDef */
/** @type {CategoryDef[]} */
export const CATEGORY_DEFS = [
  { slug: "tondeuse", label: "Tondeuse" },
  { slug: "ciseaux-et-peignes", label: "Ciseaux et peignes" },
  { slug: "accessoires", label: "Accessoires" },
];

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   category: string,
 *   description: string,
 *   priceTnd: number,
 *   videoUrl: string,
 *   photos: string[],
 *   createdAt: string
 * }} Product
 */

/**
 * @typedef {{ productId: string, qty: number }} CartLine
 */

export function slugFromLabel(label) {
  const d = CATEGORY_DEFS.find((c) => c.label === label);
  return d ? d.slug : null;
}

export function labelFromSlug(slug) {
  const d = CATEGORY_DEFS.find((c) => c.slug === slug);
  return d ? d.label : null;
}

export function isValidShopCategoryLabel(label) {
  return CATEGORY_DEFS.some((c) => c.label === label);
}

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolve relative paths (e.g. public/photo.jpg) against the current page URL so
 * they work from intro.html and admin.html alike. Leaves data:, http(s):, blob: unchanged.
 * @param {string} raw
 * @returns {string}
 */
export function resolveShopMediaUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (v.startsWith("idb://")) return v;
  if (/^(data:|https?:|blob:)/i.test(v)) return v;
  if (v.startsWith("//")) {
    if (typeof window !== "undefined" && window.location) {
      return `${window.location.protocol}${v}`;
    }
    return `https:${v}`;
  }
  if (typeof window === "undefined" || !window.location) return v;
  try {
    return new URL(v, window.location.href).href;
  } catch {
    return v;
  }
}

/** Ensure at least `min` gallery slots by repeating the first photo when needed. */
export function normalizePhotosForDisplay(photos, min = 3) {
  const arr = Array.isArray(photos)
    ? photos.map((s) => String(s || "").trim()).filter(Boolean)
    : [];
  if (!arr.length) return [];
  const out = [...arr];
  while (out.length < min) out.push(out[0]);
  return out.map((u) => resolveShopMediaUrl(u));
}

/** Catalog entries readable on the client (at least one photo URL). */
function isProductShapeLoose(p) {
  if (
    !p ||
    typeof p.id !== "string" ||
    typeof p.name !== "string" ||
    typeof p.category !== "string" ||
    typeof p.description !== "string" ||
    typeof p.priceTnd !== "number" ||
    typeof p.videoUrl !== "string" ||
    typeof p.createdAt !== "string"
  ) {
    return false;
  }
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const ok = photos.filter((x) => typeof x === "string" && x.trim().length > 0);
  return ok.length >= 1;
}

function mapProductsForDisplay(list) {
  return list.filter(isProductShapeLoose).map((p) => ({
    ...p,
    videoUrl: resolveShopMediaUrl(String(p.videoUrl || "").trim()),
    photos: (Array.isArray(p.photos) ? p.photos : [])
      .map((x) => resolveShopMediaUrl(String(x || "").trim()))
      .filter(Boolean),
  }));
}

/** @returns {Product[]} */
export function getProducts() {
  if (productsMemoryCache?.length) {
    return mapProductsForDisplay(productsMemoryCache);
  }
  const raw = localStorage.getItem(STORAGE_PRODUCTS);
  const list = safeParse(raw, []);
  if (!Array.isArray(list)) return [];
  return mapProductsForDisplay(list);
}

/**
 * @param {Product[]} list
 * @param {{ skipRemoteSync?: boolean }} [opts]
 */
export function saveProducts(list, opts = {}) {
  const json = JSON.stringify(list);
  const useMemoryOnly = json.length > 1_800_000;
  const sync = () => {
    if (!opts.skipRemoteSync) {
      import("./shop-remote.js")
        .then((m) => m.scheduleRemoteSync?.())
        .catch(() => {});
    }
  };
  try {
    if (useMemoryOnly) {
      productsMemoryCache = list;
      try {
        localStorage.removeItem(STORAGE_PRODUCTS);
      } catch {
        /* ignore */
      }
    } else {
      localStorage.setItem(STORAGE_PRODUCTS, json);
      productsMemoryCache = null;
    }
    window.dispatchEvent(new CustomEvent("thebarber:products-updated"));
    sync();
  } catch (e) {
    const name = e && /** @type {Error} */ (e).name;
    const code = e && /** @type {DOMException} */ (e).code;
    if (name === "QuotaExceededError" || code === 22) {
      productsMemoryCache = list;
      window.dispatchEvent(new CustomEvent("thebarber:products-updated"));
      sync();
      return;
    }
    throw e;
  }
}

export function newProductId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {Omit<Product, "id" | "createdAt"> & { id?: string, createdAt?: string }} partial
 * @returns {{ ok: true, product: Product } | { ok: false, error: string }}
 */
export function validateProductInput(partial) {
  const name = String(partial.name || "").trim();
  const category = String(partial.category || "").trim();
  const description = String(partial.description || "").trim();
  const priceTnd = Number(partial.priceTnd);
  const videoUrl = String(partial.videoUrl || "").trim();
  const photos = Array.isArray(partial.photos)
    ? partial.photos.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  if (!name) return { ok: false, error: "Nom requis." };
  if (!isValidShopCategoryLabel(category)) {
    return { ok: false, error: "Catégorie invalide." };
  }
  if (!description) return { ok: false, error: "Description requise." };
  if (!Number.isFinite(priceTnd) || priceTnd < 0) {
    return { ok: false, error: "Prix TND invalide." };
  }
  if (photos.length < 1) {
    return { ok: false, error: "Au moins 1 photo requise." };
  }
  const product = {
    id: partial.id && String(partial.id).trim() ? String(partial.id) : newProductId(),
    name,
    category,
    description,
    priceTnd,
    videoUrl,
    photos,
    createdAt:
      partial.createdAt && String(partial.createdAt).trim()
        ? String(partial.createdAt)
        : new Date().toISOString(),
  };
  return { ok: true, product };
}

/**
 * @param {Product} product
 * @param {{ skipRemoteSync?: boolean }} [opts]
 */
export function upsertProduct(product, opts = {}) {
  const list = getProducts();
  const i = list.findIndex((p) => p.id === product.id);
  if (i >= 0) list[i] = product;
  else list.push(product);
  saveProducts(list, opts);
  return product;
}

/** @param {string} id */
export function deleteProduct(id) {
  const list = getProducts().filter((p) => p.id !== id);
  saveProducts(list);
  removeCartLinesForProduct(id);
  import("./shop-media-store.js")
    .then((m) => m.deleteProductVideo(id))
    .catch(() => {});
}

/** @param {string} id */
export function getProductById(id) {
  return getProducts().find((p) => p.id === id) ?? null;
}

/** @param {string} categoryLabel */
export function getProductsByCategoryLabel(categoryLabel) {
  return getProducts().filter((p) => p.category === categoryLabel);
}

/** @param {string} slug */
export function getProductsByCategorySlug(slug) {
  const label = labelFromSlug(slug);
  if (!label) return [];
  return getProductsByCategoryLabel(label);
}

/** @returns {CartLine[]} */
export function getCart() {
  const raw = localStorage.getItem(STORAGE_CART);
  const list = safeParse(raw, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (l) =>
        l &&
        typeof l.productId === "string" &&
        typeof l.qty === "number" &&
        l.qty > 0,
    )
    .map((l) => ({ productId: l.productId, qty: Math.floor(l.qty) }));
}

/** @param {CartLine[]} lines */
export function saveCart(lines) {
  const cleaned = lines
    .filter((l) => l.qty > 0)
    .map((l) => ({ productId: l.productId, qty: Math.max(1, Math.floor(l.qty)) }));
  localStorage.setItem(STORAGE_CART, JSON.stringify(cleaned));
}

/** @param {string} productId */
export function removeCartLinesForProduct(productId) {
  saveCart(getCart().filter((l) => l.productId !== productId));
}

/**
 * @param {string} productId
 * @param {number} [delta]
 */
export function addToCart(productId, delta = 1) {
  const d = Math.max(1, Math.floor(delta));
  const lines = getCart();
  const i = lines.findIndex((l) => l.productId === productId);
  if (i >= 0) lines[i] = { ...lines[i], qty: lines[i].qty + d };
  else lines.push({ productId, qty: d });
  saveCart(lines);
}

/** @param {string} productId @param {number} qty */
export function setCartLineQty(productId, qty) {
  const q = Math.floor(qty);
  let lines = getCart();
  if (q <= 0) lines = lines.filter((l) => l.productId !== productId);
  else {
    const i = lines.findIndex((l) => l.productId === productId);
    if (i >= 0) lines[i] = { productId, qty: q };
    else lines.push({ productId, qty: q });
  }
  saveCart(lines);
}

export function cartItemCount() {
  return getCart().reduce((s, l) => s + l.qty, 0);
}

export function cartLinesWithProducts() {
  return getCart()
    .map((line) => {
      const product = getProductById(line.productId);
      return product ? { line, product } : null;
    })
    .filter(Boolean);
}
