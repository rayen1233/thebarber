/**
 * Administration — commandes & comptes (localStorage).
 * Monté depuis admin.mjs après le formulaire produits.
 */

import {
  getOrders,
  updateOrder,
  deleteOrder,
  getUsers,
  updateUser,
  deleteUser,
  userOrderStats,
  getOrdersForUser,
} from "./shop-account-store.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(n) {
  return Number(n).toLocaleString("fr-TN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

const PAY_STATUSES = ["non payé", "payé", "remboursé"];
const ORD_STATUSES = [
  "nouvelle commande",
  "en préparation",
  "expédiée",
  "terminée",
  "annulée",
];

function renderOrders() {
  const host = document.getElementById("admin-orders-root");
  if (!host) return;
  const list = getOrders().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (!list.length) {
    host.innerHTML =
      '<p style="color:var(--shop-muted);padding:1rem 0;">Aucune commande.</p>';
    return;
  }
  host.innerHTML = list
    .map((o) => {
      const itemsStr = o.items
        .map((i) => `${escapeHtml(i.name)} × ${i.qty}`)
        .join(", ");
      const addr = o.address || {};
      const addrStr = [addr.street, addr.city, addr.region, addr.postalCode]
        .filter(Boolean)
        .join(", ");
      return `
      <article class="admin-order-card" data-order-id="${escapeHtml(o.id)}">
        <div class="admin-order-card__head">
          <span class="admin-order-card__id">${escapeHtml(o.id)}</span>
          <time datetime="${escapeHtml(o.createdAt)}">${escapeHtml(new Date(o.createdAt).toLocaleString("fr-FR"))}</time>
        </div>
        <div class="admin-order-card__grid">
          <div><strong>Client</strong><br/>${escapeHtml(o.userName)}</div>
          <div><strong>E-mail</strong><br/>${escapeHtml(o.userEmail)}</div>
          <div><strong>Téléphone</strong><br/>${escapeHtml(o.userPhone)}</div>
          <div><strong>Total</strong><br/>${formatPrice(o.totalTnd)} TND</div>
          <div><strong>Paiement</strong><br/>${escapeHtml(o.paymentMethod)}</div>
        </div>
        <p class="admin-order-card__items"><strong>Articles :</strong> ${escapeHtml(itemsStr)}</p>
        <p class="admin-order-card__items"><strong>Adresse :</strong> ${escapeHtml(addrStr)}</p>
        <div class="admin-order-card__actions">
          <label style="font-size:0.62rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--shop-muted);">Statut paiement
            <select class="admin-inp admin-order-pay" data-oid="${escapeHtml(o.id)}" style="margin-top:0.35rem;">
              ${PAY_STATUSES.map(
                (s) =>
                  `<option value="${escapeHtml(s)}" ${o.paymentStatus === s ? "selected" : ""}>${escapeHtml(s)}</option>`,
              ).join("")}
            </select>
          </label>
          <label style="font-size:0.62rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--shop-muted);">Statut commande
            <select class="admin-inp admin-order-st" data-oid="${escapeHtml(o.id)}" style="margin-top:0.35rem;">
              ${ORD_STATUSES.map(
                (s) =>
                  `<option value="${escapeHtml(s)}" ${o.orderStatus === s ? "selected" : ""}>${escapeHtml(s)}</option>`,
              ).join("")}
            </select>
          </label>
          <button type="button" class="shop-btn-ghost admin-order-del" data-oid="${escapeHtml(o.id)}" style="margin-left:auto;border-color:rgba(200,100,80,0.45);color:#d8a090;">Supprimer</button>
        </div>
      </article>`;
    })
    .join("");

  host.querySelectorAll(".admin-order-pay").forEach((sel) => {
    sel.addEventListener("change", () => {
      const id = sel.getAttribute("data-oid");
      if (!id) return;
      updateOrder(id, { paymentStatus: String(sel.value) });
    });
  });
  host.querySelectorAll(".admin-order-st").forEach((sel) => {
    sel.addEventListener("change", () => {
      const id = sel.getAttribute("data-oid");
      if (!id) return;
      updateOrder(id, { orderStatus: String(sel.value) });
    });
  });
  host.querySelectorAll(".admin-order-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-oid");
      if (!id || !confirm("Supprimer cette commande ?")) return;
      deleteOrder(id);
      renderOrders();
      renderAccounts();
    });
  });
}

function renderAccounts() {
  const host = document.getElementById("admin-accounts-root");
  if (!host) return;
  const users = getUsers().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (!users.length) {
    host.innerHTML =
      '<p style="color:var(--shop-muted);padding:1rem 0;">Aucun compte.</p>';
    return;
  }
  host.innerHTML = users
    .map((u) => {
      const st = userOrderStats(u.id);
      const nAddr = (u.savedAddresses || []).length;
      const ordersPreview = getOrdersForUser(u.id)
        .slice(0, 3)
        .map((o) => `${escapeHtml(o.id)} (${formatPrice(o.totalTnd)} TND)`)
        .join(" · ");
      const userOrders = getOrdersForUser(u.id).sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      );
      const ordersListHtml =
        userOrders.length === 0
          ? "<p class=\"admin-order-card__items\">Aucune commande.</p>"
          : `<ul class="admin-user-orders-list">
            ${userOrders
              .map(
                (o) => `<li>
              <strong>${escapeHtml(o.id)}</strong> — ${escapeHtml(new Date(o.createdAt).toLocaleString("fr-FR"))}<br/>
              ${formatPrice(o.totalTnd)} TND · ${escapeHtml(o.paymentMethod)} · ${escapeHtml(o.paymentStatus)} · ${escapeHtml(o.orderStatus)}
            </li>`,
              )
              .join("")}
            </ul>`;
      return `
      <article class="admin-user-card" data-user-id="${escapeHtml(u.id)}">
        <div class="admin-order-card__head">
          <span class="admin-order-card__id">${escapeHtml(u.fullName)}</span>
          <span>${escapeHtml(u.email)}</span>
        </div>
        <div class="admin-order-card__grid">
          <div><strong>Téléphone</strong><br/>${escapeHtml(u.phone)}</div>
          <div><strong>Adresses</strong><br/>${nAddr}</div>
          <div><strong>Commandes</strong><br/>${st.count}</div>
          <div><strong>Total dépensé</strong><br/>${formatPrice(st.totalSpent)} TND</div>
          <div><strong>Remise spéciale</strong><br/>${u.specialDiscount ?? 0}%</div>
        </div>
        <p class="admin-order-card__items"><strong>Aperçu :</strong> ${ordersPreview || "—"}</p>
        <details class="admin-user-orders-details">
          <summary>Commandes du client (${userOrders.length})</summary>
          ${ordersListHtml}
        </details>
        <details>
          <summary>Modifier le compte</summary>
          <div class="admin-mini-form">
            <label>Nouveau mot de passe
              <input type="password" class="admin-inp admin-user-pw" placeholder="Laisser vide pour ne pas changer" autocomplete="new-password" />
            </label>
            <label>Téléphone
              <input type="tel" class="admin-inp admin-user-phone" value="${escapeHtml(u.phone)}" />
            </label>
            <label>Remise % (0–100)
              <input type="number" class="admin-inp admin-user-disc" min="0" max="100" step="0.1" value="${escapeHtml(String(u.specialDiscount ?? 0))}" />
            </label>
          </div>
          <div class="admin-user-card__actions">
            <button type="button" class="shop-btn-primary admin-user-save">Enregistrer</button>
            <button type="button" class="shop-btn-ghost admin-user-del" style="border-color:rgba(200,100,80,0.45);color:#d8a090;">Supprimer le compte</button>
          </div>
        </details>
      </article>`;
    })
    .join("");

  host.querySelectorAll(".admin-user-save").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-user-id]");
      const id = card?.getAttribute("data-user-id");
      if (!id || !card) return;
      const pw = card.querySelector(".admin-user-pw");
      const ph = card.querySelector(".admin-user-phone");
      const di = card.querySelector(".admin-user-disc");
      const patch = {};
      if (pw instanceof HTMLInputElement && pw.value.trim()) {
        patch.password = pw.value.trim();
      }
      if (ph instanceof HTMLInputElement) patch.phone = ph.value.trim();
      if (di instanceof HTMLInputElement) {
        patch.specialDiscount = Math.max(0, Math.min(100, Number(di.value) || 0));
      }
      updateUser(id, patch);
      renderAccounts();
    });
  });

  host.querySelectorAll(".admin-user-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-user-id]");
      const id = card?.getAttribute("data-user-id");
      if (!id || !confirm("Supprimer définitivement ce compte ?")) return;
      deleteUser(id);
      renderAccounts();
    });
  });
}

export function refreshAdminDashboard() {
  renderOrders();
  renderAccounts();
}

export function initAdminDashboard() {
  const navBtns = document.querySelectorAll("[data-admin-nav]");
  const sections = document.querySelectorAll("[data-admin-section]");

  function go(section) {
    navBtns.forEach((b) => {
      const active = b.getAttribute("data-admin-nav") === section;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    sections.forEach((s) => {
      s.classList.toggle("is-active", s.getAttribute("data-admin-section") === section);
    });
    if (section === "orders") renderOrders();
    if (section === "accounts") renderAccounts();
  }

  navBtns.forEach((b) => {
    b.addEventListener("click", () => {
      const sec = b.getAttribute("data-admin-nav");
      if (sec) go(sec);
    });
  });

  refreshAdminDashboard();
}
