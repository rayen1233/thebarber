/**
 * Load remote store before shop / admin modules run on Vercel.
 */
import {
  hydrateRemoteStore,
  isRemoteMode,
  maybeMigrateLocalCatalogToServer,
} from "./shop-remote.js";

const boot = (async () => {
  if (!isRemoteMode()) return;
  await hydrateRemoteStore();
})();

export function whenStoreReady() {
  return boot;
}
