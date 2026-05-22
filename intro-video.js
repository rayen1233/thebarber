/**
 * Fullscreen intro.mp4 — play once; CSS logo fallback if video fails (phones / slow load).
 */

const MAX_INTRO_MS = 120000;
const VIDEO_READY_MS = 5000;
const CSS_INTRO_MS = 3600;
const MOBILE_PLAY_TIMEOUT_MS = 8000;

/** @type {string[]} */
const VIDEO_PATHS = ["intro.mp4", "public/intro.mp4", "/intro.mp4"];

const LOGO_PATHS = ["logo.png", "./logo.png", "/logo.png"];

/**
 * @param {number} i
 * @param {number} salt
 */
function introDustRnd(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233 + 19.19) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {HTMLElement | null} dust
 */
function seedIntroDust(dust) {
  if (!dust) return;
  dust.innerHTML = "";
  const count = 38;
  for (let d = 0; d < count; d++) {
    const s = document.createElement("span");
    s.style.left = `${2 + introDustRnd(d, 1) * 96}%`;
    s.style.top = `${2 + introDustRnd(d, 2) * 94}%`;
    const sz = 1.2 + introDustRnd(d, 3) * 2.4;
    s.style.width = `${sz}px`;
    s.style.height = `${sz}px`;
    s.style.setProperty("--dust-del", `${introDustRnd(d, 4) * 5}s`);
    s.style.setProperty("--dust-dur", `${4 + introDustRnd(d, 5) * 9}s`);
    s.style.setProperty(
      "--dust-blur",
      `${(0.55 + introDustRnd(d, 6) * 1.05).toFixed(2)}px`,
    );
    s.style.setProperty("--dust-op", `${(0.14 + introDustRnd(d, 7) * 0.2).toFixed(2)}`);
    dust.appendChild(s);
  }
}

/**
 * @param {() => void} onReveal
 */
export function initVideoIntro(onReveal) {
  const intro = document.getElementById("intro");
  const video = /** @type {HTMLVideoElement | null} */ (
    document.getElementById("introVideo")
  );
  const fallback = document.getElementById("introFallback");
  const dust = document.getElementById("introDust");
  const logoBase = /** @type {HTMLImageElement | null} */ (
    document.getElementById("logoBase")
  );
  const logoLit = /** @type {HTMLImageElement | null} */ (
    document.getElementById("logoLit")
  );
  const logoStack = document.getElementById("logoStack");
  const base = document.baseURI || window.location.href;

  let finished = false;
  let playbackStarted = false;
  let videoVisible = false;
  let cssFallbackStarted = false;
  let pathIndex = 0;
  let logoPathIndex = 0;
  let maxId = 0;
  let loadTimeoutId = 0;
  let cssIntroTimerId = 0;
  let durationTimerId = 0;
  let endedBound = false;

  const isCoarse =
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches;

  const dissolve =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--dissolve-ms"),
      10,
    ) || 900;

  function clearTimers() {
    if (maxId) window.clearTimeout(maxId);
    if (loadTimeoutId) window.clearTimeout(loadTimeoutId);
    if (cssIntroTimerId) window.clearTimeout(cssIntroTimerId);
    if (durationTimerId) window.clearTimeout(durationTimerId);
    maxId = 0;
    loadTimeoutId = 0;
    cssIntroTimerId = 0;
    durationTimerId = 0;
  }

  function finishIntro() {
    if (finished) return;
    finished = true;
    clearTimers();

    if (video) {
      video.pause();
      video.loop = false;
      video.removeAttribute("loop");
    }

    document.body.classList.add("intro-reveal");
    if (intro) intro.classList.add("is-done");
    if (typeof onReveal === "function") onReveal();

    window.setTimeout(() => {
      intro?.remove();
      document.getElementById("file-proto-warn")?.remove();
    }, dissolve + 80);
  }

  function markVideoVisible() {
    if (videoVisible || cssFallbackStarted || finished) return;
    videoVisible = true;
    if (loadTimeoutId) {
      window.clearTimeout(loadTimeoutId);
      loadTimeoutId = 0;
    }
  }

  /** @param {string} p */
  function urlForPath(p) {
    if (p.startsWith("/") && (location.protocol === "http:" || location.protocol === "https:")) {
      return `${location.origin}${p}`;
    }
    return new URL(p, base).href;
  }

  function sameSource(a, b) {
    if (!a || !b) return false;
    try {
      return new URL(a).href === new URL(b).href;
    } catch {
      return a === b || a.endsWith(b) || b.endsWith(a);
    }
  }

  function bindEndedOnce() {
    if (!video || endedBound) return;
    endedBound = true;
    video.addEventListener(
      "ended",
      () => {
        if (durationTimerId) window.clearTimeout(durationTimerId);
        durationTimerId = 0;
        finishIntro();
      },
      { once: true },
    );
  }

  /** iOS: autoplay blocked — still respect clip length then show homepage. */
  function scheduleDurationFallback() {
    if (!video || durationTimerId || cssFallbackStarted) return;
    const sec = video.duration;
    const ms =
      Number.isFinite(sec) && sec > 0
        ? Math.ceil(sec * 1000) + 200
        : MOBILE_PLAY_TIMEOUT_MS;
    durationTimerId = window.setTimeout(() => {
      if (!videoVisible && !cssFallbackStarted) startCssFallback();
      else if (videoVisible) finishIntro();
    }, ms);
  }

  function applyLogoUrl(url) {
    if (logoBase) logoBase.src = url;
    if (logoLit) logoLit.src = url;
    if (logoStack) {
      const u = `url("${url}")`;
      logoStack.style.webkitMaskImage = u;
      logoStack.style.maskImage = u;
    }
    if (typeof window.barberCursorSetSrc === "function") {
      window.barberCursorSetSrc(url);
    }
  }

  function tryNextLogo() {
    if (logoPathIndex >= LOGO_PATHS.length) return;
    const url = urlForPath(LOGO_PATHS[logoPathIndex++]);
    if (!logoBase || !logoLit) return;

    const onOk = () => {
      logoBase.removeEventListener("error", onErr);
      logoLit.removeEventListener("error", onErr);
      applyLogoUrl(url);
    };
    const onErr = () => {
      logoBase.removeEventListener("load", onOk);
      logoLit.removeEventListener("load", onOk);
      tryNextLogo();
    };

    logoBase.addEventListener("load", onOk, { once: true });
    logoLit.addEventListener("load", onOk, { once: true });
    logoBase.addEventListener("error", onErr, { once: true });
    logoLit.addEventListener("error", onErr, { once: true });
    logoBase.src = url;
    logoLit.src = url;
  }

  function startCssFallback() {
    if (finished || cssFallbackStarted) return;
    cssFallbackStarted = true;
    videoVisible = true;

    if (loadTimeoutId) {
      window.clearTimeout(loadTimeoutId);
      loadTimeoutId = 0;
    }
    if (durationTimerId) {
      window.clearTimeout(durationTimerId);
      durationTimerId = 0;
    }

    if (video) {
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
    }

    intro?.classList.add("intro--css-fallback");
    seedIntroDust(dust);
    tryNextLogo();

    const cssMs =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--intro-css-ms"),
        10,
      ) || CSS_INTRO_MS;

    cssIntroTimerId = window.setTimeout(finishIntro, cssMs);
  }

  function onVideoLoadTimeout() {
    if (finished || videoVisible || cssFallbackStarted) return;
    startCssFallback();
  }

  async function startPlaybackOnce() {
    if (!video || finished || playbackStarted || cssFallbackStarted) return;
    playbackStarted = true;
    bindEndedOnce();

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");

    try {
      await video.play();
      markVideoVisible();
    } catch {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          video.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      scheduleDurationFallback();
    }
  }

  function wireReadyPlayback() {
    if (!video || finished || cssFallbackStarted) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      void startPlaybackOnce();
      return;
    }

    video.addEventListener(
      "loadeddata",
      () => {
        void startPlaybackOnce();
      },
      { once: true },
    );
    video.addEventListener(
      "canplay",
      () => {
        void startPlaybackOnce();
      },
      { once: true },
    );
  }

  function tryNextSource() {
    if (!video || finished || cssFallbackStarted) {
      if (!cssFallbackStarted && !finished) startCssFallback();
      return;
    }

    if (pathIndex >= VIDEO_PATHS.length) {
      startCssFallback();
      return;
    }

    const path = VIDEO_PATHS[pathIndex++];
    const url = urlForPath(path);
    const existing = video.currentSrc || video.src || "";

    video.loop = false;
    video.removeAttribute("loop");
    video.removeAttribute("hidden");
    video.style.visibility = "visible";
    video.style.opacity = "1";

    if (sameSource(existing, url)) {
      bindEndedOnce();
      wireReadyPlayback();
      return;
    }

    const onReady = () => {
      video.removeEventListener("error", onError);
      bindEndedOnce();
      void startPlaybackOnce();
    };

    const onError = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onReady);
      playbackStarted = false;
      tryNextSource();
    };

    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });

    video.src = url;
    video.load();
  }

  function wireVideoVisibility() {
    if (!video) return;

    video.addEventListener(
      "playing",
      () => {
        markVideoVisible();
      },
      { once: true },
    );

    video.addEventListener("timeupdate", () => {
      if (video && video.currentTime > 0.05) markVideoVisible();
    });

    video.addEventListener("stalled", () => {
      if (!videoVisible && !cssFallbackStarted) {
        window.setTimeout(() => {
          if (!videoVisible && !cssFallbackStarted && !finished) startCssFallback();
        }, 1500);
      }
    });
  }

  function wireMobileUnlock() {
    if (!video || !isCoarse) return;

    const unlock = () => {
      if (finished || cssFallbackStarted || videoVisible) return;
      video.muted = true;
      void video.play().then(() => markVideoVisible()).catch(() => {});
    };

    document.addEventListener("touchstart", unlock, { once: true, passive: true });
    document.addEventListener("click", unlock, { once: true });
  }

  maxId = window.setTimeout(finishIntro, MAX_INTRO_MS);
  loadTimeoutId = window.setTimeout(onVideoLoadTimeout, VIDEO_READY_MS);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishIntro();
    return;
  }

  if (!intro || !video) {
    startCssFallback();
    return;
  }

  video.muted = true;
  video.defaultMuted = true;
  video.loop = false;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = isCoarse ? "auto" : "metadata";
  video.setAttribute("preload", isCoarse ? "auto" : "metadata");

  if (isCoarse && !video.getAttribute("poster")) {
    try {
      video.poster = urlForPath("logo.png");
    } catch {
      /* ignore */
    }
  }

  wireVideoVisibility();
  wireMobileUnlock();
  tryNextSource();
}
