/**
 * Load remote catalogue in background (do not block intro video).
 */
import { hydrateRemoteStore } from "./shop-remote.js";

const boot = hydrateRemoteStore({
  serverWins: true,
  allowIdbFallback: false,
  publicCatalog: true,
}).catch((err) => {
  console.warn("[thebarber] catalogue hydrate failed", err);
  return { ok: false };
});

export function whenStoreReady() {
  return boot;
}
