/**
 * Merge users / orders by id (union). Remote entries win on same id.
 * @param {unknown[]} current
 * @param {unknown[]} incoming
 * @returns {unknown[]}
 */
export function mergeRecordsById(current, incoming) {
  const map = new Map();
  const add = (list) => {
    if (!Array.isArray(list)) return;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const id = String(/** @type {{ id?: string }} */ (row).id || "").trim();
      if (!id) continue;
      map.set(id, row);
    }
  };
  add(current);
  add(incoming);
  return [...map.values()];
}

/**
 * @param {{ users?: unknown[], orders?: unknown[] }} store
 * @param {{ users?: unknown[], orders?: unknown[] }} patch
 */
export function mergeUsersOrdersIntoStore(store, patch) {
  if (Array.isArray(patch.users) && patch.users.length) {
    store.users = mergeRecordsById(store.users, patch.users);
  }
  if (Array.isArray(patch.orders) && patch.orders.length) {
    store.orders = mergeRecordsById(store.orders, patch.orders);
  }
  return store;
}
