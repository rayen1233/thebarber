/**
 * intro.html — ORDER showroom UI (photo backplates + grid morph via --split-vx / --split-hy).
 * Vidéos showroom : préférence Blob + /api/media (comme les fiches produit), chargement paresseux.
 */
import { resolveShopMediaUrl } from "./shop-core.js";

const MODULE_DIR = new URL("./", import.meta.url);

function assetFromModule(rel) {
  const path = String(rel).replace(/^\/+/, "");
  return new URL(path, MODULE_DIR).href;
}

function pathnameDir() {
  if (typeof window === "undefined") return "/";
  const p = window.location.pathname || "/";
  return p.replace(/\/[^/]+$/, "/");
}

const SHOWROOM_ROUTE_MS = 920;

const SPLIT_IDLE = { vx: "50%", hy: "50%" };
const SPLIT_HOVER = {
  0: { vx: "60%", hy: "60%" },
  1: { vx: "40%", hy: "60%" },
  2: { vx: "60%", hy: "40%" },
  3: { vx: "40%", hy: "40%" },
};

const SHOWROOM_BG_EXT = ["jpg", "jpeg", "png"];
const SHOWROOM_VIDEO_EXT = ["mp4", "webm"];

/** Panel index → Blob pathname (servi par /api/media, Range MP4). */
const SHOWROOM_BLOB_PATH_BY_INDEX = {
  0: "thebarber/showroom/backgroundtondeuse.mp4",
  1: "thebarber/showroom/backgroundscisso.mp4",
  2: "thebarber/showroom/backgroundaccesoire.mp4",
  3: "thebarber/showroom/backgroundmarchandise.mp4",
};

/** Panel index → video basename(s) at project root / public/ (repli local) */
const SHOWROOM_VIDEO_BY_INDEX = {
  0: ["backgroundtondeuse"],
  1: ["backgroundscisso", "backgroundscissors", "backgroundscissos"],
  2: [
    "backgroundaccesoire",
    "backgroundaccessoire",
    "backgroundaccesoires",
    "backgroundaccessoires",
  ],
  3: ["backgroundmarchandise", "backgroundmerchandise", "backgroundmarchandises"],
};

/** @type {Map<number, string>} */
const pendingShowroomVideoUrl = new Map();
/** @type {Set<number>} */
const loadedShowroomVideoIndex = new Set();
const SHOWROOM_BG_FALLBACK = [
  "linear-gradient(180deg, rgba(201,162,39,0.09) 0%, transparent 52%), linear-gradient(155deg, #120e0a 0%, #2a2116 42%, #18120e 100%)",
  "linear-gradient(180deg, rgba(201,162,39,0.08) 0%, transparent 50%), linear-gradient(148deg, #0c0a07 0%, #252016 44%, #14100c 100%)",
  "linear-gradient(180deg, rgba(201,162,39,0.07) 0%, transparent 48%), linear-gradient(160deg, #100d09 0%, #221c14 48%, #16120e 100%)",
  "linear-gradient(180deg, rgba(201,162,39,0.09) 0%, transparent 54%), linear-gradient(152deg, #0e0b08 0%, #261f16 46%, #15110d 100%)",
];

function bgCandidatesForIndex(i) {
  const n = i + 1;
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  for (const ext of SHOWROOM_BG_EXT) {
    for (const rel of [`public/background${n}.${ext}`, `background${n}.${ext}`]) {
      push(assetFromModule(rel));
    }
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const prefix = pathnameDir();
  if (origin) {
    for (const ext of SHOWROOM_BG_EXT) {
      push(`${origin}${prefix}public/background${n}.${ext}`);
      push(`${origin}/public/background${n}.${ext}`);
      push(`${origin}/background${n}.${ext}`);
      push(`/public/background${n}.${ext}`);
      push(`/background${n}.${ext}`);
      push(`public/background${n}.${ext}`);
    }
  }
  return out;
}

function blobVideoUrlForIndex(i) {
  const pathname = SHOWROOM_BLOB_PATH_BY_INDEX[i];
  if (!pathname) return "";
  return resolveShopMediaUrl(`/api/media?pathname=${encodeURIComponent(pathname)}`);
}

function videoCandidatesForIndex(i) {
  const bases = SHOWROOM_VIDEO_BY_INDEX[i];
  if (!bases?.length) return [];
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  const blob = blobVideoUrlForIndex(i);
  if (blob) push(blob);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const prefix = pathnameDir();
  for (const base of bases) {
    for (const ext of SHOWROOM_VIDEO_EXT) {
      for (const rel of [`public/${base}.${ext}`, `${base}.${ext}`]) {
        push(assetFromModule(rel));
      }
      if (origin) {
        push(`${origin}${prefix}public/${base}.${ext}`);
        push(`${origin}${prefix}${base}.${ext}`);
        push(`${origin}/public/${base}.${ext}`);
        push(`${origin}/${base}.${ext}`);
        push(`/public/${base}.${ext}`);
        push(`/${base}.${ext}`);
      }
    }
  }
  return out;
}

/**
 * @param {HTMLVideoElement} v
 */
function configureShowroomVideo(v, opts = {}) {
  const preload = opts.preload === "auto" ? "auto" : "metadata";
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
  v.setAttribute("preload", preload);
}

function isShowroomOpen() {
  const el = document.getElementById("order-showroom");
  return Boolean(el?.classList.contains("is-open") && !el.classList.contains("is-closing"));
}

function isProductionSite() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

/** Scroll container for stacked mobile layout (IntersectionObserver root). */
function showroomObserverRoot() {
  return (
    document.querySelector("#order-showroom .showroom-split") ||
    document.getElementById("order-showroom")
  );
}

/** @type {IntersectionObserver | null} */
let showroomVideoObserver = null;
/** @type {IntersectionObserver | null} */
let showroomPanelLazyObserver = null;

function bindShowroomPanelLazyVideo() {
  if (showroomPanelLazyObserver) {
    showroomPanelLazyObserver.disconnect();
    showroomPanelLazyObserver = null;
  }
  const root = showroomObserverRoot();
  showroomPanelLazyObserver = new IntersectionObserver(
    (entries) => {
      if (!isShowroomOpen()) return;
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.32) continue;
        const panel = entry.target;
        if (!(panel instanceof HTMLElement)) continue;
        const raw = panel.getAttribute("data-split-index");
        const idx = raw == null || raw === "" ? NaN : Number(raw);
        if (!Number.isInteger(idx) || idx < 0 || idx > 3) continue;
        if (!pendingShowroomVideoUrl.has(idx)) continue;
        void loadShowroomVideoForPanel(idx);
      }
    },
    {
      root: root instanceof Element ? root : null,
      threshold: [0, 0.2, 0.32, 0.5],
      rootMargin: "0px",
    },
  );
  document.querySelectorAll("#order-showroom [data-split-panel]").forEach((panel) => {
    showroomPanelLazyObserver?.observe(panel);
  });
}

function observeShowroomPanelVideo(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  if (!showroomVideoObserver) bindShowroomVideoVisibility();
  showroomVideoObserver?.observe(video);
}

function bindShowroomVideoVisibility() {
  if (showroomVideoObserver) {
    showroomVideoObserver.disconnect();
    showroomVideoObserver = null;
  }
  const root = showroomObserverRoot();
  showroomVideoObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target;
        if (!(video instanceof HTMLVideoElement) || !video.classList.contains("is-loaded")) continue;
        if (!isShowroomOpen()) {
          video.pause();
          continue;
        }
        if (entry.isIntersecting && entry.intersectionRatio >= 0.42) {
          const panel = video.closest("[data-split-panel]");
          const raw = panel?.getAttribute("data-split-index");
          const idx = raw == null || raw === "" ? NaN : Number(raw);
          if (Number.isInteger(idx) && idx >= 0 && idx <= 3) {
            void loadShowroomVideoForPanel(idx);
          }
          if (video.classList.contains("is-loaded")) {
            video.setAttribute("preload", "auto");
            const p = video.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
          }
        } else {
          video.pause();
        }
      }
    },
    {
      root: root instanceof Element ? root : null,
      threshold: [0, 0.25, 0.42, 0.6],
      rootMargin: "0px",
    },
  );
}

function syncShowroomVideoPlayback() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!isShowroomOpen() || reduce) {
    pauseShowroomPanelVideos();
    return;
  }
  document.querySelectorAll(".showroom-panel__video.is-loaded").forEach((el) => {
    if (!(el instanceof HTMLVideoElement)) return;
    observeShowroomPanelVideo(el);
  });
}

async function resolveFirstAssetUrl(urls) {
  for (const u of urls) {
    try {
      const abs = /^https?:\/\//i.test(u)
        ? u
        : new URL(u, document.baseURI || window.location.href).href;
      if (abs.includes("/api/media?")) {
        let res = await fetch(abs, {
          method: "GET",
          headers: { Range: "bytes=0-1" },
          cache: "no-store",
        });
        if (res.ok || res.status === 206) return abs;
        continue;
      }
      let res = await fetch(abs, { method: "HEAD", cache: "no-store" });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(abs, { method: "GET", cache: "no-store" });
      }
      if (res.ok) return abs;
    } catch {
      /* next */
    }
  }
  return null;
}

/** @param {number} i */
async function resolveShowroomVideoUrl(i) {
  const blob = blobVideoUrlForIndex(i);
  if (blob) {
    const abs = new URL(blob, document.baseURI || window.location.href).href;
    if (isProductionSite()) return abs;
    try {
      const res = await fetch(abs, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
        cache: "no-store",
      });
      if (res.ok || res.status === 206) return abs;
    } catch {
      /* fall through to static files */
    }
  }
  const rest = videoCandidatesForIndex(i).filter((u) => u !== blob);
  return resolveFirstAssetUrl(rest);
}

/** Charge les vidéos Blob déjà résolues (évite lazy-load qui ne se déclenche pas). */
async function primeShowroomVideos() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !isShowroomOpen()) return;
  const order = isShowroomStackLayout() ? [0, 1, 2, 3] : [0, 1, 2, 3];
  for (const i of order) {
    if (!pendingShowroomVideoUrl.has(i)) continue;
    await loadShowroomVideoForPanel(i);
  }
  syncShowroomVideoPlayback();
}

async function ensureShowroomVideoUrls() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  for (let i = 0; i < 4; i++) {
    if (pendingShowroomVideoUrl.has(i)) continue;
    const hit = await resolveShowroomVideoUrl(i);
    if (hit) pendingShowroomVideoUrl.set(i, hit);
  }
}

/** @param {number} i */
async function loadShowroomVideoForPanel(i) {
  if (loadedShowroomVideoIndex.has(i)) {
    syncShowroomVideoPlayback();
    return;
  }
  const url = pendingShowroomVideoUrl.get(i);
  if (!url) return;

  const imgs = document.querySelectorAll(".showroom-panel__img");
  const img = imgs[i];
  if (!(img instanceof HTMLImageElement)) return;
  const media = img.closest(".showroom-panel__media");
  if (!(media instanceof HTMLElement)) return;

  const video = ensureShowroomPanelVideo(media);
  if (!video) return;

  const ok = await loadShowroomPanelVideo(video, url);
  if (!ok) return;

  loadedShowroomVideoIndex.add(i);
  img.classList.remove("is-loaded");
  img.removeAttribute("data-showroom-src");
  img.removeAttribute("src");
  img.setAttribute("hidden", "");
  media.style.backgroundImage = "";
  syncShowroomVideoPlayback();
}

function ensureShowroomPanelVideo(media) {
  if (!(media instanceof HTMLElement)) return null;
  let video = media.querySelector(".showroom-panel__video");
  if (video instanceof HTMLVideoElement) return video;
  video = document.createElement("video");
  video.className = "showroom-panel__video";
  video.setAttribute("aria-hidden", "true");
  video.hidden = true;
  const img = media.querySelector(".showroom-panel__img");
  if (img) media.insertBefore(video, img);
  else media.prepend(video);
  return video;
}

function loadShowroomPanelVideo(video, url) {
  return new Promise((resolve) => {
    if (!(video instanceof HTMLVideoElement)) {
      resolve(false);
      return;
    }
    if (video.dataset.showroomSrc === url && video.classList.contains("is-loaded")) {
      configureShowroomVideo(video);
      observeShowroomPanelVideo(video);
      syncShowroomVideoPlayback();
      resolve(true);
      return;
    }
    configureShowroomVideo(video);
    let settled = false;
    const onReady = () => {
      if (settled) return;
      settled = true;
      video.dataset.showroomSrc = url;
      video.removeAttribute("hidden");
      video.classList.add("is-loaded");
      observeShowroomPanelVideo(video);
      syncShowroomVideoPlayback();
      resolve(true);
    };
    const onErr = () => {
      if (settled) return;
      settled = true;
      resolve(false);
    };
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onErr, { once: true });
    video.src = url;
    video.load();
  });
}

function loadShowroomPanelImage(img, url) {
  return new Promise((resolve) => {
    if (!(img instanceof HTMLImageElement)) {
      resolve(false);
      return;
    }
    if (img.dataset.showroomSrc === url && img.classList.contains("is-loaded")) {
      resolve(true);
      return;
    }
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      img.dataset.showroomSrc = url;
      img.src = url;
      img.removeAttribute("hidden");
      img.classList.add("is-loaded");
      resolve(true);
    };
    probe.onerror = () => resolve(false);
    probe.src = url;
  });
}

async function applyShowroomBackgrounds() {
  const imgs = document.querySelectorAll(".showroom-panel__img");
  let anyHit = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  pendingShowroomVideoUrl.clear();
  loadedShowroomVideoIndex.clear();

  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    if (!(img instanceof HTMLImageElement)) continue;
    const media = img.closest(".showroom-panel__media");

    if (media instanceof HTMLElement) {
      const stale = media.querySelector(".showroom-panel__video");
      if (stale instanceof HTMLVideoElement) {
        stale.pause();
        stale.removeAttribute("src");
        stale.classList.remove("is-loaded");
        stale.setAttribute("hidden", "");
      }
      delete media.dataset.showroomVideoUrl;
    }

    if (!reduceMotion && videoCandidatesForIndex(i).length) {
      const videoHit = await resolveShowroomVideoUrl(i);
      if (videoHit && media instanceof HTMLElement) {
        pendingShowroomVideoUrl.set(i, videoHit);
        media.dataset.showroomVideoUrl = videoHit;
      }
    }

    const hit = await resolveFirstAssetUrl(bgCandidatesForIndex(i));
    if (hit) {
      const ok = await loadShowroomPanelImage(img, hit);
      if (ok) {
        anyHit = true;
        if (media instanceof HTMLElement) media.style.backgroundImage = "";
      }
    } else {
      img.classList.remove("is-loaded");
      img.removeAttribute("data-showroom-src");
      img.removeAttribute("src");
      img.setAttribute("hidden", "");
      if (media instanceof HTMLElement) {
        media.style.backgroundImage =
          SHOWROOM_BG_FALLBACK[i] ?? SHOWROOM_BG_FALLBACK[0];
      }
    }
  }
  if (!anyHit && imgs.length) {
    console.warn(
      "[showroom] no background image found — using gradients. Add public/background1.jpg … background4.jpg next to intro.html.",
    );
  }

  bindShowroomPanelLazyVideo();
  if (isShowroomOpen()) void primeShowroomVideos();
}

function pauseShowroomPanelVideos() {
  document.querySelectorAll(".showroom-panel__video").forEach((el) => {
    if (el instanceof HTMLVideoElement && !el.paused) el.pause();
  });
}

function resumeShowroomPanelVideos() {
  syncShowroomVideoPlayback();
}

function isShowroomStackLayout() {
  return window.matchMedia("(max-width: 991px)").matches;
}

function syncShowroomLayoutClass() {
  const root = document.getElementById("order-showroom");
  if (!root) return;
  root.classList.toggle("showroom-layout--stack", isShowroomStackLayout());
}

function applySplitLines(idx) {
  const root = document.getElementById("order-showroom");
  if (!root) return;
  if (isShowroomStackLayout()) return;
  const s =
    idx === null || idx === undefined || Number.isNaN(idx)
      ? SPLIT_IDLE
      : SPLIT_HOVER[idx] ?? SPLIT_IDLE;
  root.style.setProperty("--split-vx", s.vx);
  root.style.setProperty("--split-hy", s.hy);
}

function bindSplitLineHover() {
  const split = document.querySelector("#order-showroom .showroom-split");
  if (!(split instanceof HTMLElement)) return;

  const settleIdleSplit = () => {
    requestAnimationFrame(() => {
      if (!split.querySelector(".showroom-panel:hover")) applySplitLines(null);
    });
  };

  for (const panel of split.querySelectorAll("[data-split-panel]")) {
    const raw = panel.getAttribute("data-split-index");
    const idx = raw == null || raw === "" ? NaN : Number(raw);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) continue;

    panel.addEventListener("pointerenter", () => {
      applySplitLines(idx);
    });
    panel.addEventListener("pointerleave", settleIdleSplit);
  }

  split.addEventListener("pointerleave", settleIdleSplit);
}

let inited = false;
const SHOWROOM_DUST_SEED_VER = "5";
let showroomDustSeeded = false;

function showroomDustRnd(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Soft warm-gold dust per panel — lighter density, extra blur. */
function seedShowroomPanelDust() {
  const hosts = document.querySelectorAll("#order-showroom .showroom-panel__dust");
  if (!hosts.length) return;
  if (showroomDustSeeded && hosts[0]?.dataset.dustSeed === SHOWROOM_DUST_SEED_VER) return;
  showroomDustSeeded = true;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const perPanel = reduce ? 14 : 34;

  hosts.forEach((host, panelIdx) => {
    host.dataset.dustSeed = SHOWROOM_DUST_SEED_VER;
    host.innerHTML = "";
    for (let i = 0; i < perPanel; i++) {
      const salt = panelIdx * 200 + i + 17;
      const sp = document.createElement("span");
      sp.className = "showroom-panel__mote";
      sp.style.left = 2 + showroomDustRnd(salt, 1) * 96 + "%";
      sp.style.top = 2 + showroomDustRnd(salt, 2) * 96 + "%";
      const sz = 1.2 + showroomDustRnd(salt, 3) * 2.2;
      sp.style.width = sz + "px";
      sp.style.height = sz + "px";
      const blur = 0.5 + showroomDustRnd(salt, 8) * 1.1;
      sp.style.filter = "blur(" + blur.toFixed(2) + "px)";
      const dur = 9 + showroomDustRnd(salt, 4) * 16;
      sp.style.animationDuration = dur + "s";
      sp.style.animationDelay = -showroomDustRnd(salt, 5) * dur + "s";
      if (reduce) {
        sp.style.opacity = 0.22 + showroomDustRnd(salt, 6) * 0.18 + "";
        sp.style.animation = "none";
      } else {
        sp.style.opacity = 0.2 + showroomDustRnd(salt, 6) * 0.26 + "";
      }
      host.appendChild(sp);
    }
  });
}

function waitForLayoutFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function waitForPanelEntranceDone() {
  return new Promise((resolve) => {
    setTimeout(resolve, 1180);
  });
}

function waitShowroomOpacitySettled() {
  return new Promise((resolve) => {
    const root = document.getElementById("order-showroom");
    if (!root) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.removeEventListener("transitionend", onEnd);
      clearTimeout(tid);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target === root && e.propertyName === "opacity") finish();
    };
    root.addEventListener("transitionend", onEnd);
    const tid = setTimeout(finish, 820);
  });
}

/** @param {"opening" | "open" | "closing" | null} state */
function setShowroomRouteState(state) {
  const body = document.body;
  body.classList.remove(
    "showroom-route-opening",
    "showroom-route-open",
    "showroom-route-closing",
  );
  if (state === "opening") body.classList.add("showroom-route-opening");
  else if (state === "open") body.classList.add("showroom-route-open");
  else if (state === "closing") body.classList.add("showroom-route-closing");
}

function openShowroom() {
  const el = document.getElementById("order-showroom");
  if (!el) return;
  if (el.classList.contains("is-open") && !el.classList.contains("is-closing")) return;

  el.classList.remove("is-closing");
  document.getElementById("page-scroll-root")?.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  setShowroomRouteState("opening");
  applySplitLines(null);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("is-open");
      el.setAttribute("aria-hidden", "false");
      setShowroomRouteState("open");
      seedShowroomPanelDust();
      resumeShowroomPanelVideos();
    });
  });

  window.setTimeout(() => {
    document.body.classList.remove("showroom-route-opening");
  }, SHOWROOM_ROUTE_MS);

  void (async () => {
    try {
      if (!inited) {
        inited = true;
        await applyShowroomBackgrounds();
      } else {
        await ensureShowroomVideoUrls();
        await primeShowroomVideos();
      }
    } catch (err) {
      console.error("[showroom] media init failed", err);
    }
  })();
}

function closeShowroom() {
  const el = document.getElementById("order-showroom");
  if (!el || !el.classList.contains("is-open") || el.classList.contains("is-closing")) return;

  setShowroomRouteState("closing");
  pauseShowroomPanelVideos();
  loadedShowroomVideoIndex.clear();
  applySplitLines(null);
  el.classList.add("is-closing");

  window.setTimeout(() => {
    el.classList.remove("is-open", "is-closing");
    el.setAttribute("aria-hidden", "true");
    setShowroomRouteState(null);
  }, SHOWROOM_ROUTE_MS);
}

window.barberCloseShowroom = closeShowroom;
window.barberOpenShowroom = openShowroom;

function bindShowroomParallax() {
  /* No pointer parallax on showroom cards — backgrounds are <img>, not CSS background-position. */
}

const MCH_TEASER_VIDEO_BASES = [
  "backgroundmarchandise",
  "backgroundmerchandise",
  "backgroundmarchandises",
];

function mchTeaserVideoCandidates() {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const prefix = pathnameDir();
  for (const base of MCH_TEASER_VIDEO_BASES) {
    for (const ext of SHOWROOM_VIDEO_EXT) {
      for (const rel of [`public/${base}.${ext}`, `${base}.${ext}`]) {
        push(assetFromModule(rel));
      }
      if (origin) {
        push(`${origin}${prefix}public/${base}.${ext}`);
        push(`${origin}${prefix}${base}.${ext}`);
        push(`${origin}/public/${base}.${ext}`);
        push(`${origin}/${base}.${ext}`);
        push(`/public/${base}.${ext}`);
        push(`/${base}.${ext}`);
      }
    }
  }
  return out;
}

/**
 * @param {HTMLVideoElement} video
 * @param {string} url
 */
function loadMchTeaserVideo(video, url) {
  return new Promise((resolve) => {
    if (!(video instanceof HTMLVideoElement)) {
      resolve(false);
      return;
    }
    if (video.dataset.mchSrc === url && video.classList.contains("is-loaded")) {
      configureShowroomVideo(video);
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      resolve(true);
      return;
    }
    configureShowroomVideo(video);
    let settled = false;
    const onReady = () => {
      if (settled) return;
      settled = true;
      video.dataset.mchSrc = url;
      video.removeAttribute("hidden");
      video.classList.add("is-loaded");
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      resolve(true);
    };
    const onErr = () => {
      if (settled) return;
      settled = true;
      resolve(false);
    };
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onErr, { once: true });
    video.src = url;
    video.load();
  });
}

function tryMchTeaserPhoto(imgEl) {
  if (!(imgEl instanceof HTMLElement)) return;
  const roots = ["", "./"];
  const names = [
    "public/background4.jpg",
    "public/background4.png",
    "background4.jpg",
  ];
  const urls = [];
  for (const r of roots) {
    for (const n of names) {
      urls.push(r + n);
    }
  }
  let idx = 0;
  const attempt = () => {
    if (idx >= urls.length) return;
    const url = urls[idx++];
    const probe = new Image();
    probe.onload = () => {
      imgEl.style.setProperty("--mch-hero-img", `url("${url}")`);
      imgEl.classList.add("has-src");
    };
    probe.onerror = attempt;
    probe.src = url;
  };
  attempt();
}

async function tryMchTeaserMedia() {
  const photoEl = document.getElementById("mch-atmo-photo");
  const videoEl = document.getElementById("mch-atmo-video");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduce && videoEl instanceof HTMLVideoElement) {
    const hit = await resolveFirstAssetUrl(mchTeaserVideoCandidates());
    if (hit) {
      const ok = await loadMchTeaserVideo(videoEl, hit);
      if (ok) {
        photoEl?.classList.remove("has-src");
        return;
      }
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.classList.remove("is-loaded");
      videoEl.setAttribute("hidden", "");
    }
  }

  if (photoEl instanceof HTMLElement) tryMchTeaserPhoto(photoEl);
}

function openMerchTeaser() {
  const el = document.getElementById("marchandise-teaser");
  if (!el) return;
  el.removeAttribute("inert");
  el.setAttribute("aria-hidden", "false");
  el.classList.remove("is-revealed-inner");
  void el.offsetWidth;
  el.classList.add("is-open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.classList.add("is-revealed-inner");
    });
  });
  if (!el.dataset.mchPhotoTried) {
    el.dataset.mchPhotoTried = "1";
    void tryMchTeaserMedia();
  } else {
    const videoEl = document.getElementById("mch-atmo-video");
    if (videoEl instanceof HTMLVideoElement && videoEl.classList.contains("is-loaded")) {
      const p = videoEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }
}

function closeMerchTeaser() {
  const el = document.getElementById("marchandise-teaser");
  if (!el || !el.classList.contains("is-open")) return false;
  const videoEl = document.getElementById("mch-atmo-video");
  if (videoEl instanceof HTMLVideoElement && !videoEl.paused) videoEl.pause();
  el.classList.remove("is-revealed-inner");
  window.setTimeout(() => {
    el.classList.remove("is-open");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("inert", "");
  }, 400);
  return true;
}

window.barberCloseMerchTeaser = () => {
  closeMerchTeaser();
};

function bindMerchTeaserParallax() {
  let raf = 0;
  /** @type {{ x: number; y: number } | null} */
  let pending = null;
  const flush = () => {
    raf = 0;
    const t = document.getElementById("marchandise-teaser");
    if (!t?.classList.contains("is-open") || !pending) {
      pending = null;
      return;
    }
    const { x, y } = pending;
    pending = null;
    t.style.setProperty("--mch-px", x.toFixed(4));
    t.style.setProperty("--mch-py", y.toFixed(4));
  };
  window.addEventListener(
    "pointermove",
    (e) => {
      const t = document.getElementById("marchandise-teaser");
      if (!t?.classList.contains("is-open")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      pending = { x, y };
      if (raf === 0) raf = window.requestAnimationFrame(flush);
    },
    { passive: true },
  );
}

function bindMerchTeaser() {
  document.querySelectorAll("[data-open-merch-teaser]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openMerchTeaser();
    });
  });
  document.getElementById("mch-btn-retour")?.addEventListener("click", () => {
    closeMerchTeaser();
  });
}

function clearOrderShowroomHash() {
  if (location.hash !== "#order-showroom") return;
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  } catch {
    location.hash = "";
  }
}

function bindShowroomShopCtas() {
  const root = document.getElementById("order-showroom");
  if (!root) return;

  root.addEventListener("click", (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    const link = target?.closest("a.showroom-panel__cta[href^='#shop']");
    if (!link) return;

    e.preventDefault();
    e.stopPropagation();

    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#shop")) return;

    closeShowroom();

    requestAnimationFrame(() => {
      if (location.hash === href) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        location.hash = href;
      }
    });
  });
}

function bindShowroomUi() {
  const cta = document.querySelector(".order-hero__cta");
  if (cta) {
    cta.addEventListener("click", (e) => {
      e.preventDefault();
      if (location.hash !== "#order-showroom") {
        location.hash = "#order-showroom";
      }
      openShowroom();
    });
  }
  document.querySelector(".showroom-close")?.addEventListener("click", () => {
    closeShowroom();
    clearOrderShowroomHash();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (closeMerchTeaser()) return;
    const showroom = document.getElementById("order-showroom");
    if (showroom?.classList.contains("is-open")) {
      e.preventDefault();
      closeShowroom();
      clearOrderShowroomHash();
      return;
    }
    closeShowroom();
  });
}

bindShowroomUi();
bindShowroomShopCtas();
bindSplitLineHover();
bindShowroomParallax();
bindMerchTeaser();
bindMerchTeaserParallax();
bindShowroomVideoVisibility();
bindShowroomPanelLazyVideo();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") pauseShowroomPanelVideos();
  else if (isShowroomOpen()) syncShowroomVideoPlayback();
});

syncShowroomLayoutClass();
window.addEventListener("resize", syncShowroomLayoutClass);
if (typeof window.matchMedia === "function") {
  const stackMq = window.matchMedia("(max-width: 991px)");
  if (typeof stackMq.addEventListener === "function") {
    stackMq.addEventListener("change", syncShowroomLayoutClass);
  } else if (typeof stackMq.addListener === "function") {
    stackMq.addListener(syncShowroomLayoutClass);
  }
}

function syncShowroomFromHash() {
  const h = location.hash.replace(/^#/, "");

  if (h.startsWith("shop")) {
    closeShowroom();
    return;
  }

  if (h === "order-showroom") openShowroom();
  else closeShowroom();
}
window.addEventListener("hashchange", syncShowroomFromHash);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncShowroomFromHash);
} else {
  syncShowroomFromHash();
}
