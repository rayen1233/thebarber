/** Re-export — les routes /api importent .js ; la logique est dans store-server.mjs */
export {
  defaultStore,
  loadStore,
  saveStore,
  mergeStore,
  storeEnvStatus,
  requireAdmin,
} from "./store-server.mjs";
