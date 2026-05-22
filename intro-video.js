/**
 * Fullscreen intro.mp4 — play once, mobile-safe, fade to homepage.
 */

const MAX_INTRO_MS = 120000;
const MOBILE_PLAY_TIMEOUT_MS = 8000;

/** @type {string[]} */
const VIDEO_PATHS = ["intro.mp4", "public/intro.mp4", "/intro.mp4"];

/**
 * @param {() => void} onReveal
 */
export function initVideoIntro(onReveal) {
  const intro = document.getElementById("intro");
  const video = /** @type {HTMLVideoElement | null} */ (
    document.getElementById("introVideo")
  );
  const base = document.baseURI || window.location.href;

  let finished = false;
  let playbackStarted = false;
  let pathIndex = 0;
  let maxId = 0;
  let endedBound = false;
  let durationTimerId = 0;

  const dissolve =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--dissolve-ms"),
      10,
    ) || 900;

  function clearTimers() {
    if (maxId) window.clearTimeout(maxId);
    if (durationTimerId) window.clearTimeout(durationTimerId);
    maxId = 0;
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
    if (!video || durationTimerId) return;
    const sec = video.duration;
    const ms =
      Number.isFinite(sec) && sec > 0
        ? Math.ceil(sec * 1000) + 200
        : MOBILE_PLAY_TIMEOUT_MS;
    durationTimerId = window.setTimeout(finishIntro, ms);
  }

  async function startPlaybackOnce() {
    if (!video || finished || playbackStarted) return;
    playbackStarted = true;
    bindEndedOnce();

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");

    try {
      await video.play();
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
    if (!video || finished) return;

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
    if (!video || finished) {
      finishIntro();
      return;
    }

    if (pathIndex >= VIDEO_PATHS.length) {
      finishIntro();
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

  maxId = window.setTimeout(finishIntro, MAX_INTRO_MS);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishIntro();
    return;
  }

  if (!intro || !video) {
    finishIntro();
    return;
  }

  video.muted = true;
  video.defaultMuted = true;
  video.loop = false;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "metadata";
  video.setAttribute("preload", "metadata");

  tryNextSource();
}
