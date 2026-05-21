/**
 * Full-screen luxury route transition overlay for #shop-atelier flows.
 * Does not replace native hash for deep links / first paint — use from CTAs only.
 */

const LUX_EASE = "cubic-bezier(.22,1,.36,1)";
const HASH_DELAY_MS = 350;
const HIDE_FALLBACK_MS = 1100;
const HIDE_AFTER_PAINT_MS = 70;

/** @returns {string} */
function normalizeShopHash(targetHash) {
  const raw = String(targetHash || "").trim();
  if (!raw) return "#shop/tondeuse";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

/** @returns {HTMLElement | null} */
function luxuryOverlayEl() {
  return document.getElementById("shop-luxury-route-overlay");
}

export function ensureLuxuryRouteOverlay() {
  const shell = document.getElementById("shop-atelier");
  if (!shell || luxuryOverlayEl()) return luxuryOverlayEl();

  const el = document.createElement("div");
  el.id = "shop-luxury-route-overlay";
  el.className = "shop-luxury-route-overlay";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<div class="shop-luxury-route-overlay__vignette" aria-hidden="true"></div><div class="shop-luxury-route-overlay__gold" aria-hidden="true"></div>';
  el.classList.add("is-idle");
  shell.appendChild(el);
  return el;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function currentHashPath() {
  return (location.hash || "").replace(/^#/, "").trim();
}

/**
 * @param {string} targetHash e.g. `#shop/cart` or `shop/cart`
 */
export function navigateLuxury(targetHash) {
  const next = normalizeShopHash(targetHash);
  const nextPath = next.replace(/^#/, "");
  if (currentHashPath() === nextPath) return;

  if (prefersReducedMotion()) {
    location.hash = next;
    return;
  }

  const overlay = ensureLuxuryRouteOverlay();
  if (!overlay) {
    location.hash = next;
    return;
  }

  document.body.classList.add("shop-route-changing");
  overlay.classList.remove("is-idle");
  overlay.setAttribute("aria-hidden", "false");
  void overlay.offsetWidth;
  overlay.classList.add("is-visible");

  const hide = () => {
    overlay.classList.remove("is-visible");
    overlay.classList.add("is-idle");
    document.body.classList.remove("shop-route-changing");
    window.setTimeout(() => {
      overlay.setAttribute("aria-hidden", "true");
    }, 780);
  };

  const finish = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(hide, HIDE_AFTER_PAINT_MS);
      });
    });
  };

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    finish();
  };

  const onHash = () => {
    window.removeEventListener("hashchange", onHash);
    settle();
  };
  window.addEventListener("hashchange", onHash);

  window.setTimeout(() => {
    location.hash = next;
  }, HASH_DELAY_MS);

  window.setTimeout(() => {
    window.removeEventListener("hashchange", onHash);
    settle();
  }, HIDE_FALLBACK_MS);
}

export const luxuryNavEase = LUX_EASE;
