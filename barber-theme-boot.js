/**
 * Early theme boot — reads ?theme= from search (not hash), then localStorage.
 * intro.html?theme=mono#shop/tondeuse → search is ?theme=mono
 */
(function () {
  var KEY = "barberTheme";

  function resolveTheme() {
    var dev = false;
    try {
      dev =
        new URLSearchParams(window.location.search).get("themeDev") === "1" ||
        localStorage.getItem("barberThemeDev") === "1";
    } catch (e0) {}
    if (dev) {
      try {
        var fromUrl = new URLSearchParams(window.location.search).get("theme");
        if (fromUrl === "mono" || fromUrl === "gold") {
          localStorage.setItem(KEY, fromUrl);
          return fromUrl;
        }
      } catch (e1) {}
      try {
        var stored = localStorage.getItem(KEY);
        if (stored === "mono" || stored === "gold") return stored;
      } catch (e2) {}
    } else {
      try {
        localStorage.setItem(KEY, "gold");
      } catch (e3) {}
    }
    return "gold";
  }

  function apply(theme) {
    var mono = theme === "mono";
    var root = document.documentElement;
    root.classList.toggle("theme-mono", mono);
    root.classList.toggle("theme-gold", !mono);
    root.dataset.barberTheme = mono ? "mono" : "gold";
    if (document.body) {
      document.body.classList.toggle("theme-mono", mono);
      document.body.classList.toggle("theme-gold", !mono);
    }
  }

  apply(resolveTheme());

  document.addEventListener("DOMContentLoaded", function () {
    apply(resolveTheme());
  });
})();
