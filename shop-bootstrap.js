/**
 * Load remote store before shop / admin modules run on Vercel.
 */
import { hydrateRemoteStore } from "./shop-remote.js";

const boot = (async () => {
  await hydrateRemoteStore({
    serverWins: true,
    allowIdbFallback: false,
    publicCatalog: true,
  });
})();

export function whenStoreReady() {
  return boot;
}
