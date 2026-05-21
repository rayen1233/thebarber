/**
 * Boutique intégrée à intro.html — routage par hash (#shop/…).
 * admin.html reste séparé.
 */

import {
  labelFromSlug,
  getProductsByCategorySlug,
  getProducts,
  cartItemCount,
  setCartLineQty,
  cartLinesWithProducts,
  getCart,
  addToCart,
  getProductById,
  slugFromLabel,
} from "./shop-core.js";
import { getCurrentUser } from "./shop-account-store.js";
import {
  syncShopAccountChrome,
  setPostAuthTarget,
  renderShopAuthLogin,
  renderShopAuthRegister,
  renderShopCheckout,
  renderShopAccount,
  renderShopOrderDone,
} from "./shop-auth-checkout.js";
import {
  mountAmbientDust,
  bindCartDrawer,
  bindInternalPageTransitions,
  notifyCartUpdated,
} from "./shop-ui.js";
import { ensureLuxuryRouteOverlay, navigateLuxury } from "./shop-luxury-nav.js";
import { whenStoreReady } from "./shop-bootstrap.js";
import { initTheme, mountThemeDevToggle } from "./barber-theme.js";
import {
  productHasVideo,
  resolveProductVideoUrl,
  resolveProductVideoPoster,
  migrateCatalogVideosToIdb,
} from "./shop-media-store.js";

const SHELL_ID = "shop-atelier";

const LIST_SUBTITLE = "Une sélection d’articles premium pour votre atelier.";
const CATEGORY_LIST_TITLES = {
  tondeuse: "TONDEUSES",
  "ciseaux-et-peignes": "CISEAUX & PEIGNES",
  accessoires: "ACCESSOIRES",
};

const ARROW_SVG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M17 7H9v8"/></svg>`;

function listTitleForSlug(slug, label) {
  if (!label) return "BOUTIQUE";
  return CATEGORY_LIST_TITLES[slug] ?? String(label).toUpperCase();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const SHOWROOM_PANEL_IMG_INDEX = {
  tondeuse: 1,
  "ciseaux-et-peignes": 2,
  accessoires: 3,
};

function emptyCollectionHtml() {
  return `
    <div class="shop-cat-empty shop-lux-enter" role="status">
      <div class="shop-cat-empty__bg" aria-hidden="true"></div>
      <div class="shop-cat-empty__veil" aria-hidden="true"></div>
      <div class="shop-cat-empty__grain" aria-hidden="true"></div>
      <div class="shop-cat-empty__inner shop-lux-enter__body">
        <p class="shop-eyebrow shop-cat-empty__eyebrow">Collection</p>
        <h2 class="shop-cat-empty__title">Collection bientôt disponible</h2>
        <p class="shop-cat-empty__sub">Une sélection exclusive arrive prochainement.</p>
        <a class="shop-btn-ghost shop-cat-empty__cta" href="#order-showroom">Retour au showroom</a>
      </div>
    </div>`;
}

function wireEmptyCollectionBackdrop(slug) {
  const bg = document.querySelector(".shop-cat-empty__bg");
  if (!bg) return;
  const panelN = SHOWROOM_PANEL_IMG_INDEX[slug];
  if (!panelN) return;
  const panelImg = document.querySelector(
    `#order-showroom .showroom-split__panels > .showroom-panel:nth-child(${panelN}) .showroom-panel__img`
  );
  const src = panelImg?.getAttribute("src") || panelImg?.currentSrc;
  if (src) bg.style.backgroundImage = `url("${String(src).replace(/"/g, "%22")}")`;
}

/** @param {HTMLElement} host @param {string} className @param {number} count */
function seedAmbientDustHost(host, className, count) {
  if (!host || host.dataset.dustMounted) return;
  host.dataset.dustMounted = "1";
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = className;
    s.style.left = `${6 + Math.random() * 88}%`;
    s.style.top = `${4 + Math.random() * 88}%`;
    s.style.setProperty("--dm-dur", `${12 + Math.random() * 14}s`);
    s.style.setProperty("--dm-del", `${Math.random() * 8}s`);
    s.style.setProperty("--dm-x", `${(Math.random() - 0.5) * 36}px`);
    s.style.setProperty("--dm-y", `${-10 - Math.random() * 32}px`);
    host.appendChild(s);
  }
}

function mountMonoAmbientLayers() {
  seedAmbientDustHost(document.getElementById("shop-cat-dust-host"), "shop-cat-dust-mote", 36);
  document.querySelectorAll(".shop-auth-brand-panel__dust").forEach((h) => {
    seedAmbientDustHost(/** @type {HTMLElement} */ (h), "shop-cat-dust-mote", 22);
  });
  document.querySelectorAll(".shop-auth-page__ambient, .shop-checkout-page__ambient").forEach((h) => {
    seedAmbientDustHost(/** @type {HTMLElement} */ (h), "shop-cat-dust-mote", 26);
  });
  const cartAmb = document.querySelector(".shop-cart-page__ambient");
  if (cartAmb) seedAmbientDustHost(/** @type {HTMLElement} */ (cartAmb), "shop-cat-dust-mote", 28);
}

const PDP_DESC_MAX = 420;
const PROMPT_MARKERS = [
  /\byou are\b/i,
  /\buser:\s*/i,
  /\bassistant:\s*/i,
  /\bsystem:\s*/i,
  /\bdebug\b/i,
  /\btodo\b/i,
  /\bmarkdown\b/i,
  /```/,
  /\bjson\b\s*[\[{]/i,
  /\bheuristic\b/i,
  /\bprompt\b/i,
  /\bllm\b/i,
  /\boutput\s+only\b/i,
];

/**
 * @param {unknown} raw
 * @returns {{ text: string, suspicious: boolean }}
 */
function sanitizePdpDescription(raw) {
  let t = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!t) return { text: "", suspicious: false };

  const veryLong = t.length > 2200;
  let suspicious = veryLong;
  for (const re of PROMPT_MARKERS) {
    if (re.test(t)) {
      suspicious = true;
      break;
    }
  }
  if (suspicious) {
    return {
      text: "Description produit en cours de rédaction. Pour toute précision, contactez l’atelier.",
      suspicious: true,
    };
  }

  t = t.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  return { text: t, suspicious: false };
}

/**
 * @param {string} text
 * @param {HTMLElement | null} descEl
 * @param {HTMLButtonElement | null} moreBtn
 */
function applyPdpDescriptionDom(text, descEl, moreBtn) {
  if (!descEl) return;
  const full = String(text || "").trim();
  if (!full) {
    descEl.textContent = "";
    if (moreBtn) moreBtn.hidden = true;
    return;
  }
  if (full.length <= PDP_DESC_MAX) {
    descEl.textContent = full;
    if (moreBtn) moreBtn.hidden = true;
    return;
  }
  descEl.textContent = `${full.slice(0, PDP_DESC_MAX).trim()}…`;
  if (moreBtn) {
    moreBtn.hidden = false;
    const clone = moreBtn.cloneNode(true);
    moreBtn.replaceWith(clone);
    clone.addEventListener("click", () => {
      descEl.textContent = full;
      clone.hidden = true;
    });
  }
}

/**
 * @param {boolean} loggedIn
 */
function syncCartProgressNav(loggedIn) {
  const nav = document.getElementById("shop-cart-progress");
  if (!nav) return;
  const steps = nav.querySelectorAll(".shop-cart-progress__step");
  if (steps.length < 4) return;
  steps.forEach((el) => {
    el.classList.remove("is-active", "is-done", "is-pending");
  });
  steps[0].classList.add("is-active");
  if (loggedIn) {
    steps[1].classList.add("is-done");
    steps[2].classList.add("is-pending");
    steps[3].classList.add("is-pending");
  } else {
    steps[1].classList.add("is-pending");
    steps[2].classList.add("is-pending");
    steps[3].classList.add("is-pending");
  }
}

function formatPrice(n) {
  return Number(n).toLocaleString("fr-TN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/** @returns {object | null} */
function parseShopHash() {
  const raw = location.hash.replace(/^#/, "").trim();
  const m = /^shop(?:\/|$)/i.exec(raw);
  if (!m) return null;
  const rest = raw.slice(m[0].length).replace(/^\//, "");
  if (!rest) return { view: "list", slug: "tondeuse" };
  if (rest === "cart") return { view: "cart" };
  if (rest === "checkout") return { view: "checkout" };
  if (rest === "account") return { view: "account" };
  if (rest === "auth/login") return { view: "auth-login" };
  if (rest === "auth/register") return { view: "auth-register" };
  if (rest.startsWith("order-done/")) {
    return { view: "order-done", orderId: rest.slice("order-done/".length) };
  }
  if (rest.startsWith("p/")) return { view: "detail", id: rest.slice(2) };
  return { view: "list", slug: rest };
}

function isShopOpen() {
  return document.getElementById(SHELL_ID)?.classList.contains("is-open") ?? false;
}

function openShopDom() {
  const shell = document.getElementById(SHELL_ID);
  if (!shell) return;
  window.barberCloseMerchTeaser?.();
  shell.classList.add("is-open");
  shell.setAttribute("aria-hidden", "false");
  document.body.classList.add("shop-body");
}

function closeShopDom() {
  const shell = document.getElementById(SHELL_ID);
  if (!shell) return;
  shell.classList.remove("shop-atelier--pdp");
  shell.classList.remove("shop-page--product");
  shell.classList.remove("is-open");
  document.getElementById("shop-inner-wrap")?.classList.remove("shop-page--product");
  shell.setAttribute("aria-hidden", "true");
  document.body.classList.remove("shop-body");
  document.getElementById("page-scroll-root")?.removeAttribute("aria-hidden");
  const drawer = document.getElementById("shop-drawer");
  const overlay = document.getElementById("shop-drawer-overlay");
  drawer?.classList.remove("is-open");
  overlay?.classList.remove("is-open");
}

const SHOP_VIEW_IDS = {
  list: "shop-view-list",
  detail: "shop-view-detail",
  cart: "shop-view-cart",
  "auth-login": "shop-view-auth-login",
  "auth-register": "shop-view-auth-register",
  checkout: "shop-view-checkout",
  account: "shop-view-account",
  "order-done": "shop-view-order-done",
};

function setShopView(which) {
  document.getElementById("shop-view-detail")?.classList.remove("shop-detail-enter");
  const targetId = SHOP_VIEW_IDS[which] || SHOP_VIEW_IDS.list;
  const atelier = document.getElementById(SHELL_ID);
  const innerWrap = document.getElementById("shop-inner-wrap");
  const isProduct = which === "detail";
  if (atelier) {
    atelier.classList.toggle("shop-atelier--pdp", isProduct);
    atelier.classList.toggle("shop-page--product", isProduct);
  }
  if (innerWrap) {
    innerWrap.classList.toggle("shop-page--product", isProduct);
  }
  Object.values(SHOP_VIEW_IDS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = el.id !== targetId;
  });
  if (atelier?.classList.contains("is-open")) {
    atelier.scrollTop = 0;
    atelier.scrollLeft = 0;
    const activeView = document.getElementById(targetId);
    requestAnimationFrame(() => {
      atelier.scrollTop = 0;
      atelier.scrollLeft = 0;
      activeView?.scrollIntoView({ block: "start", behavior: "instant" in window ? "instant" : "auto" });
    });
  }
}

function mediaPreview(product) {
  if (productHasVideo(product)) {
    return `<video class="shop-bc-card__video" data-product-id="${escapeHtml(product.id)}" muted loop playsinline disablepictureinpicture preload="metadata"></video>`;
  }
  const src = product.photos[0] || "";
  return `<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" />`;
}

/**
 * @param {import("./shop-core.js").Product[]} products
 */
async function hydrateListCardMedia(products) {
  const cards = [...document.querySelectorAll("#shop-grid .shop-bc-card")];
  await Promise.all(
    products.map(async (p, i) => {
      const card = cards[i];
      const video = card?.querySelector(".shop-bc-card__media video.shop-bc-card__video");
      if (!(video instanceof HTMLVideoElement)) return;
      configureListCardVideoEl(video);
      const poster = resolveProductVideoPoster(p);
      if (poster) video.setAttribute("poster", poster);
      else video.removeAttribute("poster");
      const src = await resolveProductVideoUrl(p);
      if (src) {
        video.dataset.src = src;
        if (video.src !== src) {
          video.src = src;
          video.load();
        }
      } else {
        delete video.dataset.src;
        video.removeAttribute("src");
      }
    }),
  );
}

/** @type {IntersectionObserver | null} */
let listCardVideoObserver = null;

function listCardVideoScrollRoot() {
  return document.getElementById("shop-atelier") ?? document.getElementById("shop-grid");
}

function teardownListCardVideoObserver() {
  listCardVideoObserver?.disconnect();
  listCardVideoObserver = null;
}

/**
 * @param {HTMLVideoElement} v
 */
function configureListCardVideoEl(v) {
  v.muted = true;
  v.loop = true;
  v.autoplay = false;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.controls = false;
  v.removeAttribute("controls");
  v.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
  try {
    v.disablePictureInPicture = true;
  } catch {
    /* ignore */
  }
  v.setAttribute("preload", "metadata");
}

/**
 * @param {HTMLVideoElement} video
 */
function playListCardVideo(video) {
  configureListCardVideoEl(video);
  video.setAttribute("preload", "auto");
  const pending = video.dataset.src;
  if (pending && !video.src) {
    video.src = pending;
    video.load();
  }
  if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
  const run = () => {
    if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) run();
  else video.addEventListener("canplaythrough", run, { once: true });
}

function wireListVideos() {
  teardownListCardVideoObserver();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cards = [...document.querySelectorAll("#shop-grid .shop-bc-card")];
  const scrollRoot = listCardVideoScrollRoot();

  const schedulePlay = (card, video) => {
    if (reduce) return;
    const kick = () => playListCardVideo(video);
    card.addEventListener("animationend", kick, { once: true });
    const delayRaw = getComputedStyle(card).animationDelay;
    const delayMs = delayRaw ? parseFloat(delayRaw) * 1000 : 0;
    if (Number.isFinite(delayMs) && delayMs > 0) {
      window.setTimeout(kick, delayMs + 1000);
    }
    video.addEventListener(
      "error",
      () => {
        if (video.dataset.listRetry === "1") return;
        video.dataset.listRetry = "1";
        video.load();
        kick();
      },
      { once: true },
    );
  };

  const videoCards = cards.filter((card) => {
    const video = card.querySelector(".shop-bc-card__media video.shop-bc-card__video");
    if (!(video instanceof HTMLVideoElement)) return false;
    configureListCardVideoEl(video);
    schedulePlay(card, video);
    return !reduce;
  });

  if (!videoCards.length || reduce) return;

  if (!("IntersectionObserver" in window)) {
    videoCards.forEach((card) => {
      const video = card.querySelector(".shop-bc-card__media video.shop-bc-card__video");
      if (video instanceof HTMLVideoElement) playListCardVideo(video);
    });
    return;
  }

  listCardVideoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((ent) => {
        const card = /** @type {HTMLElement} */ (ent.target);
        const video = card.querySelector(".shop-bc-card__media video.shop-bc-card__video");
        if (!(video instanceof HTMLVideoElement)) return;
        if (ent.isIntersecting) playListCardVideo(video);
      });
    },
    {
      root: scrollRoot instanceof Element ? scrollRoot : null,
      rootMargin: "120px 0px",
      threshold: [0, 0.12],
    },
  );

  videoCards.forEach((card) => listCardVideoObserver?.observe(card));
}

async function renderList(slug) {
  shopBackHash = "#order-showroom";
  setShopView("list");
  const label = labelFromSlug(slug);
  const titleEl = document.getElementById("shop-page-title");
  const ledeEl = document.getElementById("shop-page-lede");
  const grid = document.getElementById("shop-grid");

  let products;
  if (label) {
    products = getProductsByCategorySlug(slug);
  } else {
    products = getProducts();
  }

  if (titleEl) titleEl.textContent = listTitleForSlug(slug, label);
  if (ledeEl) ledeEl.textContent = LIST_SUBTITLE;

  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = emptyCollectionHtml();
    grid.classList.add("shop-cat__grid--empty");
    wireEmptyCollectionBackdrop(slug);
    return;
  }

  grid.classList.remove("shop-cat__grid--empty");

  grid.innerHTML = products
    .map((p, i) => {
      const delay = 0.1 + i * 0.09;
      return `
      <a class="shop-bc-card" href="#shop/p/${encodeURIComponent(p.id)}" style="--st:${delay}s">
        <div class="shop-bc-card__media">
          ${mediaPreview(p)}
          <div class="shop-bc-card__shine" aria-hidden="true"></div>
        </div>
        <div class="shop-bc-card__shade" aria-hidden="true"></div>
        <div class="shop-bc-card__bottom">
          <div class="shop-bc-card__text">
            <h2 class="shop-bc-card__name">${escapeHtml(p.name)}</h2>
            <p class="shop-bc-card__price">${formatPrice(p.priceTnd)}&nbsp;TND</p>
          </div>
          <span class="shop-bc-card__arrow" aria-hidden="true">${ARROW_SVG}</span>
        </div>
      </a>`;
    })
    .join("");
  await hydrateListCardMedia(products);
  wireListVideos();
}

let pdDetailMotionAbort = /** @type {AbortController | null} */ (null);

function resetPdDetailMotion() {
  pdDetailMotionAbort?.abort();
  pdDetailMotionAbort = new AbortController();
  return pdDetailMotionAbort.signal;
}

function mountPdAmbientOnce() {
  const host = document.getElementById("shop-pd-ambient");
  if (!host || host.dataset.mounted) return;
  host.dataset.mounted = "1";
  for (let i = 0; i < 26; i++) {
    const s = document.createElement("span");
    s.className = "shop-pd-mote";
    s.style.left = `${4 + Math.random() * 92}%`;
    s.style.top = `${6 + Math.random() * 88}%`;
    s.style.setProperty("--pd-m-dur", `${18 + Math.random() * 14}s`);
    s.style.setProperty("--pd-m-del", `${Math.random() * 5}s`);
    s.style.setProperty("--pd-m-x", `${(Math.random() - 0.5) * 28}px`);
    s.style.setProperty("--pd-m-y", `${-10 - Math.random() * 24}px`);
    host.appendChild(s);
  }
}

/**
 * @param {AbortSignal} signal
 */
function wirePdParallax(signal) {
  const wrap = document.getElementById("pd-visual-wrap");
  const inner = document.getElementById("pd-visual-parallax");
  if (!wrap || !inner) return;
  const maxPx = 10;
  const smooth = (targetX, targetY) => {
    inner.style.setProperty("--pd-tx", `${targetX}px`);
    inner.style.setProperty("--pd-ty", `${targetY}px`);
  };
  wrap.addEventListener(
    "mousemove",
    (e) => {
      const r = wrap.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      smooth(-nx * maxPx * 2, -ny * maxPx * 2);
    },
    { signal },
  );
  wrap.addEventListener("mouseleave", () => smooth(0, 0), { signal });
}

/**
 * @param {HTMLElement | null} wrap
 */
function resetPdMediaReady(wrap) {
  if (!wrap) return;
  wrap.classList.remove("is-media-ready");
}

/**
 * @param {HTMLElement | null} wrap
 * @param {HTMLElement} el
 */
/**
 * @param {HTMLImageElement | HTMLVideoElement | null} el
 */
function applyPdMediaOrientation(el) {
  if (!el) return;
  const classify = () => {
    const w = el.videoWidth || el.naturalWidth || 0;
    const h = el.videoHeight || el.naturalHeight || 0;
    el.classList.remove("shop-pd__media--portrait", "shop-pd__media--landscape");
    if (!w || !h) return;
    el.classList.add(h >= w ? "shop-pd__media--portrait" : "shop-pd__media--landscape");
  };
  if (el instanceof HTMLVideoElement) {
    if (el.readyState >= 1) classify();
    else el.addEventListener("loadedmetadata", classify, { once: true });
  } else if (el.complete && el.naturalWidth > 0) classify();
  else el.addEventListener("load", classify, { once: true });
}

function bindPdMediaReady(wrap, el) {
  if (!wrap || !el) return;
  resetPdMediaReady(wrap);
  const mark = () => wrap.classList.add("is-media-ready");
  if (el instanceof HTMLVideoElement) {
    if (el.readyState >= 2) mark();
    else {
      el.addEventListener("loadeddata", mark, { once: true });
      el.addEventListener("canplay", mark, { once: true });
    }
    el.addEventListener("error", mark, { once: true });
    window.setTimeout(() => {
      if (!wrap.classList.contains("is-media-ready")) mark();
    }, 1400);
  } else if (el instanceof HTMLImageElement) {
    if (el.complete && el.naturalWidth > 0) mark();
    else {
      el.addEventListener("load", mark, { once: true });
      el.addEventListener("error", mark, { once: true });
    }
  }
}

/**
 * @param {HTMLVideoElement} v
 */
function configurePdVideoEl(v) {
  v.muted = true;
  v.loop = true;
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.controls = false;
  v.removeAttribute("controls");
  v.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
  try {
    v.disablePictureInPicture = true;
  } catch {
    /* ignore */
  }
  v.setAttribute("preload", "auto");
}

/**
 * @param {HTMLElement | null} wrap
 * @param {string} url
 * @param {string} [poster]
 * @param {boolean} [withReveal]
 */
function setPdMainVisualVideo(wrap, url, poster, withReveal = true) {
  if (!wrap || !url) return;
  wrap.innerHTML = "";
  const stack = document.createElement("div");
  stack.className = "shop-pd__media-stack";

  const vBg = document.createElement("video");
  vBg.className = "shop-pd__media-el shop-pd__media-el--bg-blur";
  vBg.setAttribute("aria-hidden", "true");
  configurePdVideoEl(vBg);
  vBg.src = url;
  if (poster) vBg.setAttribute("poster", poster);
  vBg.muted = true;
  vBg.volume = 0;

  const v = document.createElement("video");
  v.className = "shop-pd__media-el shop-pd__media-el--video shop-pd__media-el--primary";
  configurePdVideoEl(v);
  v.src = url;
  if (poster) v.setAttribute("poster", poster);

  stack.appendChild(vBg);
  stack.appendChild(v);
  wrap.appendChild(stack);
  bindPdMediaReady(wrap, v);
  applyPdMediaOrientation(v);
  vBg.load();
  v.load();
  vBg.play().catch(() => {});
  v.play().catch(() => {});
  if (withReveal) attachPdMediaReveal(v);
}

/**
 * @param {HTMLElement | null} wrap
 * @param {string} src
 * @param {string} [alt]
 * @param {boolean} [withReveal]
 */
function setPdMainVisualImage(wrap, src, alt, withReveal = true) {
  if (!wrap || !src) return;
  wrap.innerHTML = "";
  const img = document.createElement("img");
  img.className = "shop-pd__media-el shop-pd__media-el--primary";
  img.src = src;
  img.alt = alt || "";
  img.decoding = "async";
  img.loading = "eager";
  wrap.appendChild(img);
  bindPdMediaReady(wrap, img);
  applyPdMediaOrientation(img);
  if (withReveal) attachPdMediaReveal(img);
}

/**
 * @param {HTMLElement | null} wrap
 * @param {string} url
 * @param {string} [poster]
 */
function setPdHeroBackdropVideo(wrap, url, poster) {
  if (!wrap || !url) return;
  wrap.innerHTML = "";
  const v = document.createElement("video");
  v.className = "shop-pd__hero-media shop-pd__hero-media--video";
  configurePdVideoEl(v);
  v.src = url;
  if (poster) v.setAttribute("poster", poster);
  wrap.appendChild(v);
  v.play().catch(() => {});
}

/**
 * @param {HTMLElement | null} wrap
 * @param {string} src
 */
function setPdHeroBackdropImage(wrap, src) {
  if (!wrap || !src) return;
  wrap.innerHTML = "";
  const img = document.createElement("img");
  img.className = "shop-pd__hero-media";
  img.src = src;
  img.alt = "";
  img.decoding = "async";
  img.loading = "eager";
  wrap.appendChild(img);
}

/**
 * @param {HTMLElement | null} wrap
 */
function clearPdHeroBackdrop(wrap) {
  if (!wrap) return;
  wrap.innerHTML = "";
}

function attachPdMediaReveal(el) {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.add("shop-pd__media-el--reveal");
  el.addEventListener(
    "animationend",
    () => {
      el.classList.remove("shop-pd__media-el--reveal");
    },
    { once: true },
  );
}

/**
 * @param {HTMLElement | null} mainVisual
 * @param {() => void} apply
 */
function transitionPdMainVisual(mainVisual, apply) {
  if (!mainVisual) return Promise.resolve();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return Promise.resolve();
  }
  mainVisual.classList.add("shop-pd__visual--fading");
  return new Promise((resolve) => {
    window.setTimeout(() => {
      apply();
      requestAnimationFrame(() => {
        mainVisual.classList.remove("shop-pd__visual--fading");
        const m = mainVisual.querySelector(".shop-pd__media-el--primary") || mainVisual.querySelector(".shop-pd__media-el");
        attachPdMediaReveal(/** @type {HTMLElement} */ (m));
        resolve();
      });
    }, 300);
  });
}

function playShopDetailEnter() {
  const view = document.getElementById("shop-view-detail");
  if (!view || view.hidden) return;
  view.classList.remove("shop-detail-enter");
  void view.offsetWidth;
  requestAnimationFrame(() => {
    view.classList.add("shop-detail-enter");
  });
}

function renderDetail(id) {
  setShopView("detail");
  const product = getProductById(id);
  const missing = document.getElementById("pd-missing");
  const root = document.getElementById("pd-root");

  if (!product) {
    pdDetailMotionAbort?.abort();
    shopBackHash = "#shop/tondeuse";
    if (missing) missing.hidden = false;
    if (root) root.hidden = true;
    return;
  }
  if (missing) missing.hidden = true;
  if (root) root.hidden = false;

  const motionSig = resetPdDetailMotion();
  mountPdAmbientOnce();
  wirePdParallax(motionSig);

  const slug = slugFromLabel(product.category) || "tondeuse";
  shopBackHash = `#shop/${slug}`;

  const nameEl = document.getElementById("pd-name");
  const descEl = document.getElementById("pd-desc");
  const descMore = /** @type {HTMLButtonElement | null} */ (document.getElementById("pd-desc-more"));
  const priceEl = document.getElementById("pd-price");
  const eyebrow = document.getElementById("pd-category-eyebrow");
  const stockEl = document.getElementById("pd-stock-badge");
  const mainVisual = document.getElementById("pd-main-visual");
  const heroBackdrop = document.getElementById("pd-hero-backdrop");
  const stripEl = document.getElementById("pd-galerie-strip");
  const galerie = root?.querySelector(".shop-pd__galerie");

  if (eyebrow) eyebrow.textContent = String(product.category || "").toUpperCase();
  if (nameEl) nameEl.textContent = String(product.name || "").trim();
  const descSafe = sanitizePdpDescription(product.description);
  applyPdpDescriptionDom(descSafe.text, descEl, descMore);
  if (priceEl) priceEl.textContent = `${formatPrice(product.priceTnd)} TND`;
  if (stockEl) stockEl.textContent = "Disponible à l’atelier";

  const photos = (product.photos || []).filter(Boolean);
  const poster0 = resolveProductVideoPoster(product) || photos[0] || "";
  const hasVid = productHasVideo(product);

  if (hasVid) {
    if (mainVisual && poster0) {
      setPdMainVisualImage(mainVisual, poster0, product.name, false);
    }
    if (heroBackdrop && poster0) {
      setPdHeroBackdropImage(heroBackdrop, poster0);
    }
    void (async () => {
      const url = await resolveProductVideoUrl(product, { profile: "detail" });
      if (url) {
        if (heroBackdrop) setPdHeroBackdropVideo(heroBackdrop, url, poster0);
        if (mainVisual) setPdMainVisualVideo(mainVisual, url, poster0, true);
        return;
      }
      if (heroBackdrop && poster0) setPdHeroBackdropImage(heroBackdrop, poster0);
      else if (heroBackdrop) clearPdHeroBackdrop(heroBackdrop);
      if (mainVisual && poster0) setPdMainVisualImage(mainVisual, poster0, product.name);
      else if (mainVisual) {
        mainVisual.innerHTML = "";
        resetPdMediaReady(mainVisual);
      }
    })();
  } else if (heroBackdrop) {
    if (poster0) setPdHeroBackdropImage(heroBackdrop, poster0);
    else clearPdHeroBackdrop(heroBackdrop);
  }

  if (!hasVid && mainVisual) {
    if (poster0) setPdMainVisualImage(mainVisual, poster0, product.name);
    else {
      mainVisual.innerHTML = "";
      resetPdMediaReady(mainVisual);
    }
  }

  function mosaicCellClass(i) {
    if (i === 0) return "shop-pd-mosaic__cell--hero";
    if (i === 1) return "shop-pd-mosaic__cell--stack-a";
    if (i === 2) return "shop-pd-mosaic__cell--stack-b";
    return "shop-pd-mosaic__cell--extra";
  }

  function mosaicCountClass(count) {
    if (count <= 1) return "shop-pd__galerie-mosaic--count-1";
    if (count === 2) return "shop-pd__galerie-mosaic--count-2";
    return "shop-pd__galerie-mosaic--count-3plus";
  }

  function stripThumbHtml(url, i, active) {
    const cellClass = mosaicCellClass(i);
    return `
      <button type="button" class="shop-pd-strip__btn shop-pd-mosaic__cell ${cellClass} ${active ? "is-active" : ""}" data-photo-src="${escapeHtml(url)}" aria-label="Voir la photo ${i + 1}" role="listitem">
        <img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" />
      </button>`;
  }

  if (stripEl) {
    if (!photos.length) {
      stripEl.innerHTML = "";
      stripEl.className = "shop-pd__galerie-mosaic";
      if (galerie) galerie.hidden = true;
    } else {
      if (galerie) galerie.hidden = false;
      stripEl.className = `shop-pd__galerie-mosaic ${mosaicCountClass(photos.length)}`;
      stripEl.innerHTML = photos
        .map((url, globalIdx) => {
          const active = Boolean(!hasVid && globalIdx === 0);
          return stripThumbHtml(url, globalIdx, active);
        })
        .join("");

      stripEl.querySelectorAll("[data-photo-src]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const src = btn.getAttribute("data-photo-src");
          if (!src || !mainVisual) return;
          if (btn.classList.contains("is-active")) return;
          await transitionPdMainVisual(mainVisual, () =>
            setPdMainVisualImage(mainVisual, src, product.name, false),
          );
          stripEl.querySelectorAll(".shop-pd-strip__btn").forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
        });
      });
    }
  }

  const addBtn = document.getElementById("pd-add-cart");
  if (addBtn) {
    const clone = addBtn.cloneNode(true);
    addBtn.replaceWith(clone);
    clone.addEventListener("click", () => {
      const qtyEl = document.getElementById("pd-qty");
      let q = Number(qtyEl && qtyEl.value);
      if (!Number.isFinite(q)) q = 1;
      q = Math.max(1, Math.min(99, Math.floor(q)));
      if (qtyEl) qtyEl.value = String(q);
      addToCart(product.id, q);
      notifyCartUpdated();
      if (syncBadgeGlobal) syncBadgeGlobal();
      if (renderDrawerGlobal) renderDrawerGlobal();
      navigateLuxury("#shop/cart");
    });
  }

  const qtyInputEl = /** @type {HTMLInputElement | null} */ (document.getElementById("pd-qty"));
  const qtyMinus = document.getElementById("pd-qty-minus");
  const qtyPlus = document.getElementById("pd-qty-plus");
  if (qtyInputEl) {
    qtyInputEl.value = "1";
    const clamp = () => {
      const el = /** @type {HTMLInputElement | null} */ (document.getElementById("pd-qty"));
      if (!el) return;
      let q = Number(el.value);
      if (!Number.isFinite(q)) q = 1;
      q = Math.max(1, Math.min(99, Math.floor(q)));
      el.value = String(q);
    };
    const bindQty = (el, fn) => {
      if (!el) return;
      const c = el.cloneNode(true);
      el.replaceWith(c);
      c.addEventListener("click", fn);
    };
    bindQty(qtyMinus, () => {
      const el = /** @type {HTMLInputElement | null} */ (document.getElementById("pd-qty"));
      if (!el) return;
      let q = Number(el.value);
      if (!Number.isFinite(q)) q = 1;
      el.value = String(Math.max(1, Math.floor(q) - 1));
    });
    bindQty(qtyPlus, () => {
      const el = /** @type {HTMLInputElement | null} */ (document.getElementById("pd-qty"));
      if (!el) return;
      let q = Number(el.value);
      if (!Number.isFinite(q)) q = 1;
      el.value = String(Math.min(99, Math.floor(q) + 1));
    });
    const inpClone = qtyInputEl.cloneNode(true);
    qtyInputEl.replaceWith(inpClone);
    inpClone.addEventListener("change", clamp);
    inpClone.addEventListener("blur", clamp);
  }

  const favBtn = document.getElementById("pd-favorite");
  if (favBtn) {
    const fc = favBtn.cloneNode(true);
    favBtn.replaceWith(fc);
    fc.addEventListener("click", () => {
      const pressed = fc.getAttribute("aria-pressed") === "true";
      fc.setAttribute("aria-pressed", pressed ? "false" : "true");
      fc.classList.toggle("is-active", !pressed);
    });
  }

  playShopDetailEnter();
}

let syncBadgeGlobal = null;
let renderDrawerGlobal = null;
/** @type {string} */
let shopBackHash = "#order-showroom";

/** Fermer la boutique : fragment fiable + cas où le hash est déjà la cible. */
function goShopBack() {
  const raw = (shopBackHash && String(shopBackHash).trim()) || "#order-showroom";
  const target = raw.startsWith("#") ? raw : `#${raw}`;
  const tgt = target.replace(/^#/, "");
  const cur = (location.hash || "").replace(/^#/, "");
  if (cur !== tgt) {
    location.hash = target;
    return;
  }
  closeShopDom();
  if (tgt === "order-showroom") {
    window.barberOpenShowroom?.();
  } else if (/^shop(\/|$)/i.test(tgt)) {
    location.hash = "#order-showroom";
  }
}

function renderDrawerLines(syncBadge) {
  const body = document.getElementById("shop-drawer-lines");
  if (!body) return;
  const lines = cartLinesWithProducts();
  if (!lines.length) {
    body.innerHTML =
      '<p style="color:var(--shop-muted);font-size:0.9rem;">Panier vide.</p>';
    syncBadge();
    return;
  }
  body.innerHTML = lines
    .map(({ line, product }) => {
      const img = product.photos[0] || "";
      return `
      <div class="shop-cart-line" data-pid="${escapeHtml(product.id)}">
        <img src="${escapeHtml(img)}" alt="" width="72" height="72" loading="lazy" />
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          <div style="font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--shop-muted);">${formatPrice(product.priceTnd)} TND</div>
          <div class="shop-cart-line__controls">
            <button type="button" data-act="minus" aria-label="Diminuer">−</button>
            <span style="min-width:2ch;text-align:center;">${line.qty}</span>
            <button type="button" data-act="plus" aria-label="Augmenter">+</button>
            <button type="button" class="shop-btn-ghost" data-act="remove" style="margin-left:0.5rem;min-height:32px;padding:0 0.75rem;font-size:0.6rem;">Retirer</button>
          </div>
        </div>
      </div>`;
    })
    .join("");

  body.querySelectorAll(".shop-cart-line").forEach((row) => {
    row.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const btn = t.closest("button");
      if (!btn) return;
      const pid = row.getAttribute("data-pid");
      if (!pid) return;
      const act = btn.getAttribute("data-act");
      const cur = getCart().find((l) => l.productId === pid);
      const q = cur ? cur.qty : 0;
      if (act === "plus") setCartLineQty(pid, q + 1);
      else if (act === "minus") setCartLineQty(pid, q - 1);
      else if (act === "remove") setCartLineQty(pid, 0);
      notifyCartUpdated();
      renderDrawerLines(syncBadge);
    });
  });
  syncBadge();
}

function renderCartPage(syncBadge) {
  shopBackHash = "#shop/tondeuse";
  setShopView("cart");
  syncCartProgressNav(Boolean(getCurrentUser()));
  const host = document.getElementById("cart-lines");
  const totalEl = document.getElementById("cart-total");
  const subEl = document.getElementById("cart-subtotal");
  const countEl = document.getElementById("cart-item-count");
  const discountRow = document.getElementById("cart-discount-row");
  const discountEl = document.getElementById("cart-discount");
  const finalizeBtn = document.getElementById("cart-finalize-cta");
  if (!host) return;
  const lines = cartLinesWithProducts();

  const syncSummary = (subTnd, itemQty, discPct, discTnd, grandTnd) => {
    const subStr = `${formatPrice(subTnd)} TND`;

    if (totalEl) totalEl.textContent = `${formatPrice(grandTnd)} TND`;
    if (subEl) subEl.textContent = subStr;
    if (countEl) countEl.textContent = String(itemQty);

    if (finalizeBtn) {
      finalizeBtn.disabled = itemQty <= 0;
      finalizeBtn.setAttribute("aria-disabled", itemQty <= 0 ? "true" : "false");
    }

    if (discountRow && discountEl) {
      if (discPct > 0) {
        discountRow.hidden = false;
        discountEl.textContent = `−${formatPrice(discTnd)} TND (${discPct}%)`;
      } else {
        discountRow.hidden = true;
        discountEl.textContent = "—";
      }
    }
  };

  if (!lines.length) {
    host.innerHTML = `
      <div class="shop-cart-page__empty">
        <div class="shop-empty">
          <strong>Panier vide</strong>
          <span>Découvrez la boutique pour composer votre sélection.</span>
        </div>
        <a class="shop-cart-page__cta-continue shop-cart-page__cta-continue--wide" href="#shop/tondeuse">Découvrir la boutique</a>
      </div>`;
    syncSummary(0, 0, 0, 0, 0);
    syncBadge();
    return;
  }

  let sub = 0;
  let itemQty = 0;
  const user = getCurrentUser();
  const discPct = user ? Math.max(0, Math.min(100, Number(user.specialDiscount) || 0)) : 0;
  host.innerHTML = lines
    .map(({ line, product }) => {
      sub += product.priceTnd * line.qty;
      itemQty += line.qty;
      const img = product.photos[0] || "";
      const lineTotal = product.priceTnd * line.qty;
      const href = `#shop/p/${encodeURIComponent(product.id)}`;
      return `
      <div class="shop-cart-row" data-pid="${escapeHtml(product.id)}">
        <a class="shop-cart-row__media" href="${href}">
          <img src="${escapeHtml(img)}" alt="" width="132" height="132" loading="lazy" decoding="async" />
        </a>
        <div class="shop-cart-row__body">
          <a class="shop-cart-row__name" href="${href}">${escapeHtml(product.name)}</a>
          <p class="shop-cart-row__unit">${formatPrice(product.priceTnd)} TND <span class="shop-cart-row__unit-label">/ unité</span></p>
        </div>
        <div class="shop-cart-row__qty" role="group" aria-label="Quantité">
          <button type="button" class="shop-cart-qty__btn" data-act="minus" aria-label="Diminuer">−</button>
          <span class="shop-cart-qty__value">${line.qty}</span>
          <button type="button" class="shop-cart-qty__btn" data-act="plus" aria-label="Augmenter">+</button>
        </div>
        <div class="shop-cart-row__price">
          <span class="shop-cart-row__price-label">Ligne</span>
          <span class="shop-cart-row__price-val">${formatPrice(lineTotal)} TND</span>
        </div>
      </div>`;
    })
    .join("");

  const discTnd = sub * (discPct / 100);
  const grand = Math.max(0, sub - discTnd);
  syncSummary(sub, itemQty, discPct, discTnd, grand);

  host.querySelectorAll(".shop-cart-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const btn = t.closest("button");
      if (!btn) return;
      const pid = row.getAttribute("data-pid");
      if (!pid) return;
      const act = btn.getAttribute("data-act");
      const cur = getCart().find((l) => l.productId === pid);
      const q = cur ? cur.qty : 0;
      if (act === "plus") setCartLineQty(pid, q + 1);
      else if (act === "minus") setCartLineQty(pid, q - 1);
      notifyCartUpdated();
      renderCartPage(syncBadge);
      renderDrawerLines(syncBadge);
    });
  });
  syncBadge();
}

function applyRoute() {
  const route = parseShopHash();
  if (!route) {
    closeShopDom();
    return;
  }

  openShopDom();
  document.getElementById("page-scroll-root")?.setAttribute("aria-hidden", "true");
  window.barberCloseShowroom?.();

  if (route.view === "list") {
    const slug = labelFromSlug(route.slug) ? route.slug : "tondeuse";
    void renderList(slug);
  } else if (route.view === "detail") {
    renderDetail(route.id);
  } else if (route.view === "cart") {
    setShopView("cart");
    if (syncBadgeGlobal) renderCartPage(syncBadgeGlobal);
  } else if (route.view === "auth-login") {
    shopBackHash = "#shop/tondeuse";
    setShopView("auth-login");
    renderShopAuthLogin();
  } else if (route.view === "auth-register") {
    shopBackHash = "#shop/auth/login";
    setShopView("auth-register");
    renderShopAuthRegister();
  } else if (route.view === "checkout") {
    shopBackHash = "#shop/cart";
    setShopView("checkout");
    renderShopCheckout();
  } else if (route.view === "account") {
    shopBackHash = "#shop/tondeuse";
    setShopView("account");
    renderShopAccount();
  } else if (route.view === "order-done") {
    shopBackHash = "#shop/account";
    setShopView("order-done");
    renderShopOrderDone(route.orderId || "");
  }

  if (syncBadgeGlobal && route.view !== "cart") {
    renderDrawerLines(syncBadgeGlobal);
  }
  syncShopAccountChrome();
}

function init() {
  if (window.__thebarberShopInited) return;
  window.__thebarberShopInited = true;

  initTheme();
  mountThemeDevToggle();

  const wrap = document.getElementById("shop-inner-wrap");
  if (wrap && !wrap.dataset.dustMounted) {
    mountAmbientDust(wrap, 28);
    wrap.dataset.dustMounted = "1";
  }

  ensureLuxuryRouteOverlay();

  mountMonoAmbientLayers();

  const { syncBadge } = bindCartDrawer(cartItemCount, {
    onOpen: () => renderDrawerLines(syncBadge),
  });
  syncBadgeGlobal = syncBadge;
  renderDrawerGlobal = () => renderDrawerLines(syncBadge);

  bindInternalPageTransitions();

  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && /** @type {HTMLElement} */ (e.target).closest("a.shop-bc-card");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("#shop/p/")) return;
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      const shell = document.getElementById("shop-atelier");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        location.hash = href.slice(1);
        return;
      }
      shell?.classList.add("shop-route-to-detail");
      window.setTimeout(() => {
        location.hash = href.slice(1);
        window.requestAnimationFrame(() => {
          window.setTimeout(() => shell?.classList.remove("shop-route-to-detail"), 60);
        });
      }, 400);
    },
    true,
  );

  document.getElementById("shop-atelier-close")?.addEventListener("click", () => {
    goShopBack();
  });

  window.addEventListener("hashchange", applyRoute);
  window.addEventListener("storage", () => applyRoute());
  void migrateCatalogVideosToIdb();
  window.addEventListener("load", () => {
    void migrateCatalogVideosToIdb().then(() => {
      if (parseShopHash()) applyRoute();
    });
    syncShopAccountChrome();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && parseShopHash()) applyRoute();
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (!isShopOpen()) return;
      e.preventDefault();
      goShopBack();
    },
    true,
  );

  document.getElementById("cart-finalize-cta")?.addEventListener("click", () => {
    const btn = document.getElementById("cart-finalize-cta");
    if (!btn || btn.disabled) return;
    if (!getCurrentUser()) {
      setPostAuthTarget("#shop/checkout");
      navigateLuxury("#shop/auth/login");
      return;
    }
    navigateLuxury("#shop/checkout");
  });

  applyRoute();
  requestAnimationFrame(() => {
    if (parseShopHash()) applyRoute();
  });
}

whenStoreReady().then(() => init());
