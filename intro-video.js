/**
 * Fullscreen intro.mp4 — autoplay, skip, failsafe, fade to homepage.
 */

const FAILSAFE_MS = 1000;
const MAX_INTRO_MS = 120000;

/** @type {string[]} */
const VIDEO_PATHS = ["intro.mp4", "public/intro.mp4", "/intro.mp4"];

/**
 * @param {() => void} onReveal — homepage handoff (hero particles, etc.)
 */
export function initVideoIntro(onReveal) {
  const intro = document.getElementById("intro");
  const video = /** @type {HTMLVideoElement | null} */ (
    document.getElementById("introVideo")
  );
  const skip = document.getElementById("introSkip");
  const base = document.baseURI || window.location.href;

  let finished = false;
  let failsafeId = 0;
  let maxId = 0;

  const dissolve =
    parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--dissolve-ms"),
      10,
    ) || 900;

  function clearTimers() {
    if (failsafeId) window.clearTimeout(failsafeId);
    if (maxId) window.clearTimeout(maxId);
    failsafeId = 0;
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
      const warn = document.getElementById("file-proto-warn");
      warn?.remove();
    }, dissolve + 80);
  }

  function scheduleFailsafe() {
    if (failsafeId) return;
    failsafeId = window.setTimeout(finishIntro, FAILSAFE_MS);
  }

  function resolveVideoUrl() {
    for (const p of VIDEO_PATHS) {
      try {
        if (p.startsWith("/") && (location.protocol === "http:" || location.protocol === "https:")) {
          return `${location.origin}${p}`;
        }
        return new URL(p, base).href;
      } catch {
        /* try next */
      }
    }
    return "";
  }

  function armPlayback() {
    if (!video) {
      scheduleFailsafe();
      return;
    }

    const url = resolveVideoUrl();
    if (!url) {
      scheduleFailsafe();
      return;
    }

    video.src = url;
    video.load();

    const onPlaying = () => {
      if (failsafeId) {
        window.clearTimeout(failsafeId);
        failsafeId = 0;
      }
    };

    video.addEventListener("playing", onPlaying, { once: true });
    video.addEventListener("ended", finishIntro, { once: true });
    video.addEventListener(
      "error",
      () => {
        scheduleFailsafe();
      },
      { once: true },
    );

    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => scheduleFailsafe());
    }

    scheduleFailsafe();
  }

  skip?.addEventListener("click", finishIntro);

  maxId = window.setTimeout(finishIntro, MAX_INTRO_MS);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishIntro();
    return;
  }

  if (!intro || !video) {
    finishIntro();
    return;
  }

  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    armPlayback();
  } else {
    video.addEventListener("loadedmetadata", armPlayback, { once: true });
    video.addEventListener("error", () => scheduleFailsafe(), { once: true });
    scheduleFailsafe();
  }
}
