/**
 * Hero right rail — portrait drops, manifeste, Instagram.
 */
import { whenStoreReady } from "./shop-bootstrap.js";
import { getProducts, slugFromLabel } from "./shop-core.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(n) {
  return Number(n).toLocaleString("fr-TN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/** @returns {import("./shop-core.js").Product[]} */
function latestProducts(limit = 3) {
  return getProducts()
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt || "") || 0;
      const tb = Date.parse(b.createdAt || "") || 0;
      return tb - ta;
    })
    .slice(0, limit);
}

function discoverHref(products) {
  const first = products[0];
  if (!first) return "#shop/tondeuse";
  const slug = slugFromLabel(first.category);
  return slug ? `#shop/${slug}` : "#shop/tondeuse";
}

function mountManifesteDust(container, count = 10) {
  if (!container || container.querySelector(".order-hero__manifeste-dust")) return;
  const dust = document.createElement("div");
  dust.className = "order-hero__manifeste-dust";
  dust.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.style.left = `${6 + Math.random() * 88}%`;
    s.style.top = `${6 + Math.random() * 88}%`;
    s.style.setProperty("--dx", `${(Math.random() - 0.5) * 22}px`);
    s.style.setProperty("--dy", `${-10 - Math.random() * 28}px`);
    s.style.animationDelay = `${Math.random() * 7}s`;
    s.style.animationDuration = `${12 + Math.random() * 7}s`;
    dust.appendChild(s);
  }
  container.prepend(dust);
}

function renderLatestProducts() {
  const grid = document.getElementById("hero-latest-grid");
  const discover = document.getElementById("hero-latest-discover");
  if (!grid) return;

  const products = latestProducts(3);
  if (discover) discover.href = discoverHref(products);

  if (!products.length) {
    grid.innerHTML = `<p class="order-hero__latest-empty">Collection à venir</p>`;
    return;
  }

  grid.innerHTML = products
    .map((p) => {
      const href = `#shop/p/${encodeURIComponent(p.id)}`;
      const thumb = p.photos?.[0] || "";
      return `
      <a class="order-hero__drop-card" href="${href}" role="listitem">
        <span class="order-hero__drop-media" aria-hidden="true">
          <img src="${escapeHtml(thumb)}" alt="" loading="lazy" decoding="async" />
        </span>
        <span class="order-hero__drop-cap">
          <span class="order-hero__drop-name">${escapeHtml(p.name)}</span>
          <span class="order-hero__drop-price">${formatPrice(p.priceTnd)}&nbsp;TND</span>
        </span>
      </a>`;
    })
    .join("");
}

function initHeroAmbient() {
  renderLatestProducts();
  const manifeste = document.getElementById("hero-manifeste-card");
  if (manifeste) mountManifesteDust(manifeste, 10);
}

function boot() {
  whenStoreReady().then(() => initHeroAmbient());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

window.addEventListener("storage", (e) => {
  if (e.key === "thebarber_products_v1") renderLatestProducts();
});

window.addEventListener("thebarber:products-updated", () => {
  renderLatestProducts();
});
