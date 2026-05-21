/**
 * The Barber — gold (default) / monochrome theme switcher.
 */

export const THEME_STORAGE_KEY = "barberTheme";

function themeDevEnabled() {
  try {
    return (
      new URLSearchParams(window.location.search).get("themeDev") === "1" ||
      localStorage.getItem("barberThemeDev") === "1"
    );
  } catch {
    return false;
  }
}

/** @returns {"gold" | "mono"} */
export function resolveTheme() {
  if (themeDevEnabled()) {
    try {
      const q = new URLSearchParams(window.location.search).get("theme");
      if (q === "mono" || q === "gold") return q;
    } catch {
      /* ignore */
    }
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "mono" || stored === "gold") return stored;
    } catch {
      /* ignore */
    }
  } else {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, "gold");
    } catch {
      /* ignore */
    }
  }
  return "gold";
}

/** @returns {"gold" | "mono"} */
export function getTheme() {
  return resolveTheme();
}

/** @param {"gold" | "mono"} theme */
export function setTheme(theme) {
  const next = theme === "mono" ? "mono" : "gold";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  applyThemeClass(next);
  syncThemeDevToggle();
  window.dispatchEvent(
    new CustomEvent("barber-theme-change", { detail: { theme: next } }),
  );
}

/** @param {"gold" | "mono"} theme */
export function applyThemeClass(theme) {
  const mono = theme === "mono";
  const root = document.documentElement;
  root.classList.toggle("theme-mono", mono);
  root.classList.toggle("theme-gold", !mono);
  root.dataset.barberTheme = mono ? "mono" : "gold";
  if (document.body) {
    document.body.classList.toggle("theme-mono", mono);
    document.body.classList.toggle("theme-gold", !mono);
  }
}

/** Sync classes on html + body (gold default; mono only with themeDev). */
export function initTheme() {
  if (themeDevEnabled()) {
    try {
      const q = new URLSearchParams(window.location.search).get("theme");
      if (q === "mono" || q === "gold") {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, q);
        } catch {
          /* ignore */
        }
        applyThemeClass(q);
        return;
      }
    } catch {
      /* ignore */
    }
  }
  applyThemeClass(resolveTheme());
}

let devToggleEl = null;

function syncThemeDevToggle() {
  if (!devToggleEl) return;
  const t = getTheme();
  devToggleEl.textContent = t === "mono" ? "Theme: Mono" : "Theme: Gold";
  devToggleEl.setAttribute("aria-pressed", t === "mono" ? "true" : "false");
  devToggleEl.dataset.theme = t;
}

/** Small fixed dev control — enable with ?themeDev=1 or localStorage barberThemeDev=1 */
export function mountThemeDevToggle() {
  if (devToggleEl) return devToggleEl;
  let show = false;
  try {
    show =
      new URLSearchParams(window.location.search).get("themeDev") === "1" ||
      localStorage.getItem("barberThemeDev") === "1";
  } catch {
    /* ignore */
  }
  if (!show) return null;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "barber-theme-dev-toggle";
  btn.className = "barber-theme-dev-toggle";
  btn.title = "Switch gold / monochrome (dev)";
  btn.addEventListener("click", () => {
    setTheme(getTheme() === "mono" ? "gold" : "mono");
  });
  document.body.appendChild(btn);
  devToggleEl = btn;
  syncThemeDevToggle();
  return btn;
}

if (typeof window !== "undefined") {
  window.setTheme = setTheme;
  window.getTheme = getTheme;
  window.resolveTheme = resolveTheme;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initTheme();
      mountThemeDevToggle();
    });
  } else {
    initTheme();
    mountThemeDevToggle();
  }
}
