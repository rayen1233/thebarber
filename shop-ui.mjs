/**
 * Shared shop UI: cart drawer, badge, page exit transition, dust layer.
 */

/** @param {HTMLElement} root */
export function injectPageTransition(root = document.body) {
  let el = document.querySelector(".shop-page-transition");
  if (!el) {
    el = document.createElement("div");
    el.className = "shop-page-transition";
    el.setAttribute("aria-hidden", "true");
    root.appendChild(el);
  }
}

/**
 * @param {{ durationMs?: number }} [opts]
 */
export function bindInternalPageTransitions(opts = {}) {
  const durationMs = opts.durationMs ?? 340;
  injectPageTransition();

  document.addEventListener("click", (e) => {
    const a = e.target && /** @type {HTMLElement} */ (e.target).closest("a");
    if (!a || !a.href) return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const rawHref = (a.getAttribute("href") || "").trim();
    // Same-document hash navigation must stay native (showroom → boutique, chrome Connexion/Compte, etc.).
    if (rawHref.startsWith("#") && !rawHref.startsWith("#//")) {
      return;
    }
    const url = new URL(a.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash && url.hash !== location.hash) return;
    }
    e.preventDefault();
    document.body.classList.add("is-page-exiting");
    setTimeout(() => {
      window.location.href = a.href;
    }, durationMs);
  });
}

/** @param {HTMLElement} container */
export function mountAmbientDust(container, count = 18) {
  const dust = document.createElement("div");
  dust.className = "shop-dust";
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.style.left = `${8 + Math.random() * 84}%`;
    s.style.top = `${8 + Math.random() * 84}%`;
    s.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}px`);
    s.style.setProperty("--dy", `${-15 - Math.random() * 35}px`);
    s.style.animationDelay = `${Math.random() * 8}s`;
    s.style.animationDuration = `${11 + Math.random() * 8}s`;
    dust.appendChild(s);
  }
  container.prepend(dust);
}

/**
 * @param {() => number} getCount
 * @param {{ badgeSelector?: string, onOpen?: () => void }} [opts]
 */
export function bindCartDrawer(getCount, opts = {}) {
  const badgeSelector = opts.badgeSelector ?? ".shop-cart-badge";
  const onOpen = opts.onOpen;
  const overlay = document.getElementById("shop-drawer-overlay");
  const drawer = document.getElementById("shop-drawer");
  const openBtns = document.querySelectorAll("[data-shop-cart-open], #shop-cart-open");
  const closeBtn = document.getElementById("shop-drawer-close");
  const badgeEls = () => document.querySelectorAll(badgeSelector);

  function syncBadge() {
    const n = getCount();
    badgeEls().forEach((el) => {
      el.textContent = String(n);
      const btn = el.closest(".shop-cart-btn");
      if (btn) btn.classList.toggle("has-items", n > 0);
    });
  }

  function open() {
    onOpen?.();
    overlay?.classList.add("is-open");
    drawer?.classList.add("is-open");
    overlay?.setAttribute("aria-hidden", "false");
    drawer?.setAttribute("aria-hidden", "false");
  }

  function close() {
    overlay?.classList.remove("is-open");
    drawer?.classList.remove("is-open");
    overlay?.setAttribute("aria-hidden", "true");
    drawer?.setAttribute("aria-hidden", "true");
  }

  openBtns.forEach((btn) => btn.addEventListener("click", () => open()));
  closeBtn?.addEventListener("click", () => close());
  overlay?.addEventListener("click", () => close());

  window.addEventListener("storage", syncBadge);
  window.addEventListener("thebarber-cart-updated", syncBadge);
  syncBadge();

  return { syncBadge, open, close };
}

export function notifyCartUpdated() {
  window.dispatchEvent(new Event("thebarber-cart-updated"));
}
