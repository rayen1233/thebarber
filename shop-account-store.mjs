/**
 * The Barber — comptes & commandes (localStorage prototype).
 * Remplacez ce module par des appels API + base de données en production.
 * Les mots de passe sont stockés en clair : réservé au démo local uniquement.
 */

export const STORAGE_USERS = "thebarber_users_v1";
export const STORAGE_CURRENT_USER = "thebarber_current_user_v1";
export const STORAGE_ORDERS = "thebarber_orders_v1";

/** @typedef {{ id: string, fullName: string, phone: string, city: string, region: string, street: string, postalCode?: string }} SavedAddress */

/**
 * @typedef {{
 *   id: string,
 *   fullName: string,
 *   email: string,
 *   password: string,
 *   phone: string,
 *   savedAddresses: SavedAddress[],
 *   specialDiscount: number,
 *   createdAt: string
 * }} UserRecord
 */

/**
 * @typedef {{
 *   productId: string,
 *   name: string,
 *   qty: number,
 *   unitPriceTnd: number,
 *   lineTotalTnd: number
 * }} OrderItem
 */

/**
 * @typedef {{
 *   id: string,
 *   userId: string,
 *   userName: string,
 *   userEmail: string,
 *   userPhone: string,
 *   items: OrderItem[],
 *   subtotalTnd: number,
 *   discountPct: number,
 *   discountTnd: number,
 *   totalTnd: number,
 *   paymentMethod: string,
 *   paymentStatus: string,
 *   orderStatus: string,
 *   address: SavedAddress,
 *   note: string,
 *   createdAt: string
 * }} OrderRecord
 */

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function newId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {UserRecord[]} */
export function getUsers() {
  const raw = localStorage.getItem(STORAGE_USERS);
  const list = safeParse(raw, []);
  if (!Array.isArray(list)) return [];
  return list.filter(
    (u) =>
      u &&
      typeof u.id === "string" &&
      typeof u.email === "string" &&
      typeof u.password === "string",
  );
}

/** @param {UserRecord[]} list */
export function saveUsers(list) {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(list));
  import("./shop-remote.mjs")
    .then((m) => m.scheduleRemoteSync?.())
    .catch(() => {});
}

/** @returns {{ userId: string } | null} */
export function getCurrentUserSession() {
  const raw = localStorage.getItem(STORAGE_CURRENT_USER);
  const o = safeParse(raw, null);
  if (!o || typeof o.userId !== "string") return null;
  return { userId: o.userId };
}

/** @returns {Omit<UserRecord, "password"> | null} */
export function getCurrentUser() {
  const s = getCurrentUserSession();
  if (!s) return null;
  const u = getUsers().find((x) => x.id === s.userId);
  if (!u) return null;
  const { password: _p, ...rest } = u;
  return rest;
}

/** @param {string | null} userId */
export function setCurrentUser(userId) {
  if (!userId) {
    localStorage.removeItem(STORAGE_CURRENT_USER);
    return;
  }
  localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify({ userId }));
}

export function logoutUser() {
  setCurrentUser(null);
}

/** @param {string} email */
export function findUserByEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return getUsers().find((u) => String(u.email).trim().toLowerCase() === e) ?? null;
}

/**
 * @param {Omit<UserRecord, "id" | "createdAt" | "savedAddresses" | "specialDiscount"> & { savedAddresses?: SavedAddress[], specialDiscount?: number }} input
 */
export function registerUser(input) {
  const email = String(input.email || "").trim().toLowerCase();
  if (findUserByEmail(email)) {
    return { ok: false, error: "Un compte existe déjà avec cette adresse e-mail." };
  }
  const fullName = String(input.fullName || "").trim();
  const phone = String(input.phone || "").trim();
  const password = String(input.password || "");
  if (!fullName) return { ok: false, error: "Nom complet requis." };
  if (!email) return { ok: false, error: "E-mail requis." };
  if (!phone) return { ok: false, error: "Téléphone requis." };
  if (password.length < 4) return { ok: false, error: "Mot de passe trop court (min. 4 caractères)." };

  /** @type {UserRecord} */
  const user = {
    id: newId("u"),
    fullName,
    email,
    password,
    phone,
    savedAddresses: Array.isArray(input.savedAddresses) ? input.savedAddresses : [],
    specialDiscount: Math.max(0, Math.min(100, Number(input.specialDiscount) || 0)),
    createdAt: new Date().toISOString(),
  };
  const list = getUsers();
  list.push(user);
  saveUsers(list);
  setCurrentUser(user.id);
  return { ok: true, user };
}

/** @param {string} email @param {string} password */
export function loginUser(email, password) {
  const u = findUserByEmail(email);
  if (!u) return { ok: false, error: "Aucun compte avec cette adresse e-mail." };
  if (u.password !== String(password)) {
    return { ok: false, error: "Mot de passe incorrect." };
  }
  setCurrentUser(u.id);
  return { ok: true, user: u };
}

/** @param {string} id @param {Partial<UserRecord>} patch */
export function updateUser(id, patch) {
  const list = getUsers();
  const i = list.findIndex((u) => u.id === id);
  if (i < 0) return null;
  const next = { ...list[i], ...patch, id: list[i].id };
  if (typeof next.specialDiscount === "number") {
    next.specialDiscount = Math.max(0, Math.min(100, next.specialDiscount));
  }
  list[i] = next;
  saveUsers(list);
  return next;
}

/** @param {string} id */
export function deleteUser(id) {
  saveUsers(getUsers().filter((u) => u.id !== id));
  const s = getCurrentUserSession();
  if (s?.userId === id) setCurrentUser(null);
}

/** @returns {OrderRecord[]} */
export function getOrders() {
  const raw = localStorage.getItem(STORAGE_ORDERS);
  const list = safeParse(raw, []);
  if (!Array.isArray(list)) return [];
  return list.filter((o) => o && typeof o.id === "string" && typeof o.userId === "string");
}

/** @param {OrderRecord[]} list */
export function saveOrders(list) {
  localStorage.setItem(STORAGE_ORDERS, JSON.stringify(list));
  import("./shop-remote.mjs")
    .then((m) => m.scheduleRemoteSync?.())
    .catch(() => {});
}

/** @param {string} userId */
export function getOrdersForUser(userId) {
  return getOrders().filter((o) => o.userId === userId);
}

/** @param {OrderRecord} order */
export function createOrder(order) {
  const list = getOrders();
  list.unshift(order);
  saveOrders(list);
  return order;
}

/** @param {string} id @param {Partial<OrderRecord>} patch */
export function updateOrder(id, patch) {
  const list = getOrders();
  const i = list.findIndex((o) => o.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id: list[i].id };
  saveOrders(list);
  return list[i];
}

/** @param {string} id */
export function deleteOrder(id) {
  saveOrders(getOrders().filter((o) => o.id !== id));
}

/** @param {string} userId */
export function userOrderStats(userId) {
  const orders = getOrdersForUser(userId);
  let totalSpent = 0;
  for (const o of orders) {
    totalSpent += Number(o.totalTnd) || 0;
  }
  return { count: orders.length, totalSpent };
}
