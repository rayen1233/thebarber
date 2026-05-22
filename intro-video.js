/**
 * Fullscreen intro.mp4 — play once, no loop, fade to homepage when ended.
 */

const MAX_INTRO_MS = 120000;

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

  const dissolve =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--dissolve-ms"),
      10,
    ) || 900;

  function clearTimers() {
    if (maxId) window.clearTimeout(maxId);
    maxId = 0;
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
    video.addEventListener("ended", finishIntro, { once: true });
  }

  function startPlaybackOnce() {
    if (!video || finished || playbackStarted) return;
    playbackStarted = true;
    bindEndedOnce();

    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
  }

  function wireReadyPlayback() {
    if (!video || finished) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      startPlaybackOnce();
      return;
    }

    video.addEventListener("canplay", () => startPlaybackOnce(), { once: true });
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
      startPlaybackOnce();
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
  video.removeAttribute("loop");
  video.setAttribute("muted", "");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  video.setAttribute("preload", "auto");
  video.removeAttribute("autoplay");

  tryNextSource();
}
