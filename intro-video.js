/**
 * Fullscreen intro.mp4 — load aggressively, play when ready, fade to homepage.
 */

const LOAD_TIMEOUT_MS = 20000;
const MAX_INTRO_MS = 120000;

/** @type {string[]} */
const VIDEO_PATHS = ["intro.mp4", "./intro.mp4", "public/intro.mp4", "/intro.mp4"];

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
  let loadTimeoutId = 0;
  let maxId = 0;
  let pathIndex = 0;
  let endedBound = false;

  const dissolve =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--dissolve-ms"),
      10,
    ) || 900;

  function clearTimers() {
    if (loadTimeoutId) window.clearTimeout(loadTimeoutId);
    if (maxId) window.clearTimeout(maxId);
    loadTimeoutId = 0;
    maxId = 0;
  }

  function finishIntro() {
    if (finished) return;
    finished = true;
    clearTimers();

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

  function armLoadTimeout() {
    if (loadTimeoutId) window.clearTimeout(loadTimeoutId);
    loadTimeoutId = window.setTimeout(() => {
      if (!finished) tryNextSource();
    }, LOAD_TIMEOUT_MS);
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

    video.removeAttribute("hidden");
    video.style.visibility = "visible";
    video.style.opacity = "1";

    const cleanup = () => {
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
    };

    const onCanPlay = () => {
      cleanup();
      if (loadTimeoutId) {
        window.clearTimeout(loadTimeoutId);
        loadTimeoutId = 0;
      }
      if (!endedBound) {
        endedBound = true;
        video.addEventListener("ended", finishIntro, { once: true });
      }
      const p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          window.setTimeout(() => {
            if (!finished) video.play().catch(() => {});
          }, 120);
        });
      }
    };

    const onError = () => {
      cleanup();
      tryNextSource();
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    video.src = url;
    video.load();
    armLoadTimeout();
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
  video.setAttribute("muted", "");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.preload = "auto";
  video.setAttribute("preload", "auto");

  tryNextSource();
}
