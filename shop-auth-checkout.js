/**
 * Auth, checkout, compte et confirmation — UI pour intro.html / #shop/…
 */

import {
  getCart,
  saveCart,
  cartLinesWithProducts,
  getProductById,
  setCartLineQty,
} from "./shop-core.js";
import { navigateLuxury } from "./shop-luxury-nav.js";
import {
  getCurrentUser,
  logoutUser,
  registerUser,
  loginUser,
  getUsers,
  updateUser,
  getOrdersForUser,
  createOrder,
  getOrders,
  userOrderStats,
} from "./shop-account-store.js";

const POST_AUTH_KEY = "thebarber_post_auth_target";

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatPrice(n) {
  return Number(n).toLocaleString("fr-TN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function newId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}`;
}

export function consumePostAuthTarget() {
  const v = sessionStorage.getItem(POST_AUTH_KEY);
  sessionStorage.removeItem(POST_AUTH_KEY);
  return v && v.startsWith("#") ? v : "#shop/checkout";
}

export function setPostAuthTarget(hash) {
  sessionStorage.setItem(POST_AUTH_KEY, hash);
}

export function syncShopAccountChrome() {
  const cu = getCurrentUser();
  const acc = document.getElementById("shop-chrome-account");
  const auth = document.getElementById("shop-chrome-auth");
  if (acc) {
    acc.hidden = !cu;
    const lab = acc.querySelector(".shop-chrome-account__label");
    if (lab && cu) lab.textContent = cu.fullName.split(" ")[0] || "Compte";
  }
  if (auth) {
    auth.hidden = Boolean(cu);
  }
}

function cartTotals() {
  const lines = cartLinesWithProducts();
  let sub = 0;
  let qty = 0;
  for (const { line, product } of lines) {
    sub += product.priceTnd * line.qty;
    qty += line.qty;
  }
  const user = getCurrentUser();
  const d = user ? Math.max(0, Math.min(100, Number(user.specialDiscount) || 0)) : 0;
  const discountTnd = sub * (d / 100);
  const total = Math.max(0, sub - discountTnd);
  return { sub, qty, discountPct: d, discountTnd, total, lines };
}

export function renderShopAuthLogin() {
  const err = document.getElementById("auth-login-error");
  const form = document.getElementById("auth-login-form");
  if (err) {
    err.textContent = "";
    err.hidden = true;
  }
  if (!(form instanceof HTMLFormElement)) return;
  const clone = form.cloneNode(true);
  form.replaceWith(clone);
  clone.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(clone);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const res = loginUser(email, password);
    if (!res.ok) {
      if (err) {
        err.textContent = res.error || "Erreur";
        err.hidden = false;
      }
      return;
    }
    syncShopAccountChrome();
    navigateLuxury(consumePostAuthTarget());
  });
}

export function renderShopAuthRegister() {
  const err = document.getElementById("auth-register-error");
  const form = document.getElementById("auth-register-form");
  if (err) {
    err.textContent = "";
    err.hidden = true;
  }
  if (!(form instanceof HTMLFormElement)) return;
  const clone = form.cloneNode(true);
  form.replaceWith(clone);
  clone.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(clone);
    const fullName = String(fd.get("fullName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    if (password !== confirm) {
      if (err) {
        err.textContent = "Les mots de passe ne correspondent pas.";
        err.hidden = false;
      }
      return;
    }
    const res = registerUser({ fullName, email, phone, password });
    if (!res.ok) {
      if (err) {
        err.textContent = res.error || "Erreur";
        err.hidden = false;
      }
      return;
    }
    syncShopAccountChrome();
    navigateLuxury(consumePostAuthTarget());
  });
}

export function renderShopCheckout() {
  const root = document.getElementById("checkout-root");
  const err = document.getElementById("checkout-error");
  if (!root) return;
  if (err) {
    err.textContent = "";
    err.hidden = true;
  }

  const user = getCurrentUser();
  if (!user) {
    setPostAuthTarget("#shop/checkout");
    navigateLuxury("#shop/auth/login");
    return;
  }

  const { sub, discountPct, discountTnd, total, lines } = cartTotals();
  if (!lines.length) {
    root.innerHTML = `
      <div class="shop-checkout-empty">
        <div class="shop-checkout-empty__card glass-card shop-anim-fade-up">
          <p class="shop-auth__eyebrow">Panier</p>
          <h2 class="shop-checkout-empty__title">Votre panier est vide</h2>
          <p class="shop-checkout-empty__text">Composez une sélection dans la boutique avant de finaliser votre commande.</p>
          <a class="shop-btn-primary shop-btn-primary--luxe shop-checkout-empty__cta" href="#shop/tondeuse">Continuer la boutique</a>
        </div>
      </div>`;
    return;
  }

  const addrOpts =
    (user.savedAddresses || []).length === 0
      ? `<option value="">— Nouvelle adresse —</option>`
      : `<option value="">— Nouvelle adresse —</option>${user.savedAddresses
          .map(
            (a) =>
              `<option value="${escapeHtml(a.id)}">${escapeHtml(a.city)} — ${escapeHtml(a.street).slice(0, 42)}${String(a.street).length > 42 ? "…" : ""}</option>`,
          )
          .join("")}`;

  root.innerHTML = `
    <nav class="shop-co-progress" aria-label="Étapes de commande">
      <div class="shop-co-progress__track">
        <span class="shop-co-progress__node is-active"><span class="shop-co-progress__num">1</span><span class="shop-co-progress__lab">Adresse</span></span>
        <span class="shop-co-progress__line" aria-hidden="true"></span>
        <span class="shop-co-progress__node"><span class="shop-co-progress__num">2</span><span class="shop-co-progress__lab">Paiement</span></span>
        <span class="shop-co-progress__line" aria-hidden="true"></span>
        <span class="shop-co-progress__node"><span class="shop-co-progress__num">3</span><span class="shop-co-progress__lab">Confirmation</span></span>
      </div>
    </nav>
    <div class="shop-checkout-layout">
      <div class="shop-checkout-main">
        <section class="shop-co-card glass-card shop-anim-fade-up shop-co-step" data-co-step="1">
          <header class="shop-co-step__head">
            <span class="shop-co-step__badge" aria-hidden="true">1</span>
            <div>
              <p class="shop-auth__eyebrow">Étape 1</p>
              <h2 class="shop-co-card__title">Adresse de livraison</h2>
            </div>
          </header>
          <label class="shop-auth__label" for="co-addr-sel">Adresse enregistrée</label>
          <select id="co-addr-sel" class="shop-auth__input">${addrOpts}</select>
          <div id="co-addr-fields" class="shop-checkout__addr">
            <label class="shop-auth__label" for="co-a-name">Nom complet</label>
            <input class="shop-auth__input" id="co-a-name" type="text" value="${escapeHtml(user.fullName)}" autocomplete="name" />
            <label class="shop-auth__label" for="co-a-phone">Téléphone</label>
            <input class="shop-auth__input" id="co-a-phone" type="tel" value="${escapeHtml(user.phone)}" autocomplete="tel" />
            <label class="shop-auth__label" for="co-a-city">Ville</label>
            <input class="shop-auth__input" id="co-a-city" type="text" autocomplete="address-level2" />
            <label class="shop-auth__label" for="co-a-region">Région / Gouvernorat</label>
            <input class="shop-auth__input" id="co-a-region" type="text" autocomplete="address-level1" />
            <label class="shop-auth__label" for="co-a-street">Adresse (rue)</label>
            <input class="shop-auth__input" id="co-a-street" type="text" autocomplete="street-address" />
            <label class="shop-auth__label" for="co-a-postal">Code postal <span class="shop-auth__opt">(optionnel)</span></label>
            <input class="shop-auth__input" id="co-a-postal" type="text" autocomplete="postal-code" />
            <label class="shop-auth__check"><input type="checkbox" id="co-save-addr" /> Enregistrer cette adresse</label>
          </div>
          <label class="shop-auth__label" for="co-phone2">Téléphone de commande</label>
          <input class="shop-auth__input" id="co-phone2" type="tel" value="${escapeHtml(user.phone)}" />
        </section>
        <section class="shop-co-card glass-card shop-anim-fade-up shop-co-step" data-co-step="2">
          <header class="shop-co-step__head">
            <span class="shop-co-step__badge" aria-hidden="true">2</span>
            <div>
              <p class="shop-auth__eyebrow">Étape 2</p>
              <h2 class="shop-co-card__title">Méthode de paiement</h2>
            </div>
          </header>
          <label class="shop-auth__radio"><input type="radio" name="pay" value="card" checked /> Carte bancaire</label>
          <label class="shop-auth__radio"><input type="radio" name="pay" value="cash" /> Espèces à la livraison / paiement sur place</label>
          <div id="co-card-hint" class="shop-checkout__hint">
            <p>Le paiement par carte sera confirmé via notre partenaire (Flouci / monétique) — prototype : statut « non payé » jusqu’à validation.</p>
            <button type="button" class="shop-btn-ghost" id="co-pay-placeholder" disabled>Procéder au paiement</button>
          </div>
        </section>
        <section class="shop-co-card glass-card shop-anim-fade-up shop-co-step shop-co-step--note">
          <header class="shop-co-step__head shop-co-step__head--compact">
            <div>
              <p class="shop-auth__eyebrow">Atelier</p>
              <h2 class="shop-co-card__title">Note de commande</h2>
            </div>
          </header>
          <label class="shop-auth__label" for="co-note">Message <span class="shop-auth__opt">(optionnel)</span></label>
          <textarea class="shop-auth__input shop-auth__textarea" id="co-note" rows="4" placeholder="Instructions pour l’atelier…"></textarea>
        </section>
      </div>
      <aside class="shop-checkout-aside">
        <div class="shop-co-summary glass-card shop-anim-fade-up shop-co-step shop-co-step--summary" data-co-step="3">
          <header class="shop-co-step__head shop-co-step__head--compact">
            <span class="shop-co-step__badge" aria-hidden="true">3</span>
            <div>
              <p class="shop-auth__eyebrow">Étape 3</p>
              <h2 class="shop-co-card__title">Confirmation</h2>
            </div>
          </header>
          <p class="shop-co-summary__hint">Vérifiez vos informations puis validez une seule fois — la commande est créée au clic sur « Confirmer ».</p>
          <ul class="shop-checkout__items">
            ${lines
              .map(
                ({ line, product }) => `
              <li><span class="shop-checkout__item-name">${escapeHtml(product.name)} <em>× ${line.qty}</em></span><span>${formatPrice(product.priceTnd * line.qty)} TND</span></li>`,
              )
              .join("")}
          </ul>
          <div class="shop-checkout__sum-row"><span>Sous-total</span><span>${formatPrice(sub)} TND</span></div>
          ${
            discountPct > 0
              ? `<div class="shop-checkout__sum-row shop-checkout__sum-row--gold"><span>Remise spéciale compte (${discountPct}%)</span><span>−${formatPrice(discountTnd)} TND</span></div>`
              : ""
          }
          <div class="shop-checkout__sum-row shop-checkout__sum-total"><span>Total</span><span>${formatPrice(total)} TND</span></div>
          <button type="button" class="shop-btn-primary shop-btn-primary--luxe shop-checkout__submit" id="co-submit">Confirmer la commande</button>
        </div>
      </aside>
    </div>`;

  const sel = document.getElementById("co-addr-sel");
  const fillFromSaved = (id) => {
    const a = (user.savedAddresses || []).find((x) => x.id === id);
    const set = (k, v) => {
      const el = document.getElementById(k);
      if (el instanceof HTMLInputElement) el.value = v ?? "";
    };
    if (!a) {
      set("co-a-name", user.fullName);
      set("co-a-phone", user.phone);
      set("co-a-city", "");
      set("co-a-region", "");
      set("co-a-street", "");
      set("co-a-postal", "");
      return;
    }
    set("co-a-name", a.fullName);
    set("co-a-phone", a.phone);
    set("co-a-city", a.city);
    set("co-a-region", a.region);
    set("co-a-street", a.street);
    set("co-a-postal", a.postalCode || "");
  };

  sel?.addEventListener("change", () => {
    fillFromSaved(String(sel.value || ""));
  });

  const payInputs = root.querySelectorAll('input[name="pay"]');
  const cardHint = document.getElementById("co-card-hint");
  const syncPay = () => {
    const v = root.querySelector('input[name="pay"]:checked')?.getAttribute("value");
    if (cardHint) cardHint.style.display = v === "card" ? "block" : "none";
  };
  payInputs.forEach((i) => i.addEventListener("change", syncPay));
  syncPay();

  document.getElementById("co-submit")?.addEventListener("click", () => {
    const fullName = String(document.getElementById("co-a-name")?.value || "").trim();
    const phoneA = String(document.getElementById("co-a-phone")?.value || "").trim();
    const city = String(document.getElementById("co-a-city")?.value || "").trim();
    const region = String(document.getElementById("co-a-region")?.value || "").trim();
    const street = String(document.getElementById("co-a-street")?.value || "").trim();
    const postal = String(document.getElementById("co-a-postal")?.value || "").trim();
    const phoneOrder = String(document.getElementById("co-phone2")?.value || "").trim();
    const note = String(document.getElementById("co-note")?.value || "").trim();
    const pay =
      root.querySelector('input[name="pay"]:checked')?.getAttribute("value") || "card";

    if (!fullName || !phoneA || !city || !region || !street) {
      if (err) {
        err.textContent = "Veuillez compléter l’adresse de livraison.";
        err.hidden = false;
      }
      return;
    }
    if (!phoneOrder) {
      if (err) {
        err.textContent = "Téléphone de commande requis.";
        err.hidden = false;
      }
      return;
    }

    const addr = {
      id: newId("addr"),
      fullName,
      phone: phoneA,
      city,
      region,
      street,
      postalCode: postal || undefined,
    };

    const saveCb = document.getElementById("co-save-addr");
    if (saveCb instanceof HTMLInputElement && saveCb.checked) {
      const fresh = getUsers().find((u) => u.id === user.id);
      if (fresh) {
        const addrs = [...(fresh.savedAddresses || [])];
        if (!addrs.some((x) => x.street === addr.street && x.city === addr.city)) {
          addrs.push(addr);
          updateUser(user.id, { savedAddresses: addrs });
        }
      }
    }

    const { sub: s2, discountPct: dp, discountTnd: dt, total: tot, lines: ln } = cartTotals();
    const items = ln.map(({ line, product }) => ({
      productId: product.id,
      name: product.name,
      qty: line.qty,
      unitPriceTnd: product.priceTnd,
      lineTotalTnd: product.priceTnd * line.qty,
    }));

    const paymentMethod =
      pay === "card" ? "Carte bancaire" : "Espèces à la livraison / sur place";
    const paymentStatus =
      pay === "card" ? "non payé" : "à payer à la livraison / au salon";
    const orderStatus =
      pay === "card" ? "en attente de paiement" : "nouvelle commande";

    const order = {
      id: newId("ord"),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPhone: phoneOrder,
      items,
      subtotalTnd: s2,
      discountPct: dp,
      discountTnd: dt,
      totalTnd: tot,
      paymentMethod,
      paymentStatus,
      orderStatus,
      address: addr,
      note,
      createdAt: new Date().toISOString(),
    };
    createOrder(order);
    saveCart([]);
    window.dispatchEvent(new Event("thebarber-cart-updated"));
    navigateLuxury(`#shop/order-done/${encodeURIComponent(order.id)}`);
  });
}

function payBadgeClass(status) {
  const t = String(status || "").toLowerCase();
  if (t.includes("non payé") || t.includes("non paye")) return "shop-badge shop-badge--warn";
  if (t.includes("payé") || t.includes("paye") || t.includes("valid")) return "shop-badge shop-badge--ok";
  return "shop-badge shop-badge--neutral";
}

function orderBadgeClass(status) {
  const t = String(status || "").toLowerCase();
  if (t.includes("annul")) return "shop-badge shop-badge--danger";
  if (t.includes("livré") || t.includes("livre") || t.includes("expédi") || t.includes("expedi"))
    return "shop-badge shop-badge--ok";
  if (t.includes("attente") || t.includes("nouvelle") || t.includes("paiement"))
    return "shop-badge shop-badge--info";
  return "shop-badge shop-badge--neutral";
}

export function renderShopOrderDone(orderId) {
  const root = document.getElementById("order-done-root");
  if (!root) return;
  const id = decodeURIComponent(orderId || "");
  const order = getOrders().find((o) => o.id === id);
  if (!order) {
    root.innerHTML = `
      <div class="shop-order-done glass-card shop-anim-fade-up">
        <p class="shop-auth__eyebrow">Commande</p>
        <h2 class="shop-auth__h1">Introuvable</h2>
        <p class="shop-auth__lede">Cette référence ne correspond à aucune commande enregistrée sur cet appareil.</p>
        <div class="shop-order-done__actions">
          <a class="shop-btn-primary shop-btn-primary--luxe" href="#shop/account">Mon compte</a>
          <a class="shop-btn-ghost" href="#shop/tondeuse">Boutique</a>
        </div>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="shop-order-done glass-card shop-anim-fade-up">
      <p class="shop-auth__eyebrow">Merci</p>
      <h2 class="shop-auth__h1">Commande confirmée</h2>
      <p class="shop-order-done__num">N° <strong>${escapeHtml(order.id)}</strong></p>
      <p class="shop-auth__lede">Total <strong>${formatPrice(order.totalTnd)} TND</strong> — ${escapeHtml(order.paymentMethod)}</p>
      <div class="shop-order-done__badges">
        <span class="${orderBadgeClass(order.orderStatus)}">${escapeHtml(order.orderStatus)}</span>
        <span class="${payBadgeClass(order.paymentStatus)}">${escapeHtml(order.paymentStatus)}</span>
      </div>
      <div class="shop-order-done__actions">
        <a class="shop-btn-primary shop-btn-primary--luxe" href="#shop/account">Mon compte</a>
        <a class="shop-btn-ghost" href="#shop/tondeuse">Continuer la boutique</a>
      </div>
    </div>`;
}

export function renderShopAccount() {
  const root = document.getElementById("account-root");
  if (!root) return;
  const user = getCurrentUser();
  if (!user) {
    setPostAuthTarget("#shop/account");
    navigateLuxury("#shop/auth/login");
    return;
  }

  const full = getUsers().find((u) => u.id === user.id);
  const orders = getOrdersForUser(user.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const stats = userOrderStats(user.id);

  const initials = String(user.fullName || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
  const discPct = Math.max(0, Math.min(100, Number(user.specialDiscount) || 0));

  root.innerHTML = `
    <div class="shop-account-luxe">
      <section class="glass-card shop-acc-hero shop-acc-hero--lux shop-anim-fade-up">
        <div class="shop-acc-hero__lux-row">
          <div class="shop-acc-hero__avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <div class="shop-acc-hero__lux-body">
            <p class="shop-auth__eyebrow">Profil</p>
            <h2 class="shop-acc-hero__name">${escapeHtml(user.fullName)}</h2>
            <p class="shop-acc-hero__line">${escapeHtml(user.email)}</p>
            <p class="shop-acc-hero__line">${escapeHtml(user.phone)}</p>
            ${
              discPct > 0
                ? `<span class="shop-acc-hero__disc-badge">Remise membre ${discPct}%</span>`
                : `<span class="shop-acc-hero__disc-badge shop-acc-hero__disc-badge--muted">Remise membre 0%</span>`
            }
          </div>
          <div class="shop-acc-hero__actions">
            <button type="button" class="shop-btn-ghost" id="acc-logout">Déconnexion</button>
            <button type="button" class="shop-btn-ghost" id="acc-edit-profile" aria-disabled="true" title="Bientôt disponible">
              Modifier profil
            </button>
          </div>
        </div>
      </section>
      <div class="shop-acc-stat-grid">
        <div class="glass-card shop-acc-stat-card shop-anim-fade-up shop-anim-fade-up--delay">
          <p class="shop-acc-stat-card__label">Commandes</p>
          <p class="shop-acc-stat-card__value">${stats.count}</p>
        </div>
        <div class="glass-card shop-acc-stat-card shop-anim-fade-up shop-anim-fade-up--delay">
          <p class="shop-acc-stat-card__label">Total dépensé</p>
          <p class="shop-acc-stat-card__value">${formatPrice(stats.totalSpent)} <span class="shop-acc-stat-card__unit">TND</span></p>
        </div>
        <div class="glass-card shop-acc-stat-card shop-anim-fade-up shop-anim-fade-up--delay">
          <p class="shop-acc-stat-card__label">Remise compte</p>
          <p class="shop-acc-stat-card__value">${discPct}<span class="shop-acc-stat-card__pct">%</span></p>
        </div>
      </div>
      <div class="shop-account-cols shop-account-cols--lux">
        <section class="glass-card shop-anim-fade-up shop-anim-fade-up--delay">
          <p class="shop-auth__eyebrow">Livraison</p>
          <h3 class="shop-acc-section-title">Adresses</h3>
          <div class="shop-acc-addr-cards" id="acc-addr-list">
            ${(full?.savedAddresses || []).length
              ? (full?.savedAddresses || [])
                  .map(
                    (a) => `
              <article class="shop-acc-addr-card">
                <p class="shop-acc-addr-card__city">${escapeHtml(a.city)}</p>
                <p class="shop-acc-addr-card__street">${escapeHtml(a.street)}</p>
                <p class="shop-acc-addr-card__meta">${escapeHtml(a.fullName)} · ${escapeHtml(a.phone)}</p>
              </article>`,
                  )
                  .join("")
              : '<p class="shop-account__meta">Aucune adresse enregistrée.</p>'}
          </div>
        </section>
        <section class="glass-card shop-acc-orders-block shop-anim-fade-up">
          <p class="shop-auth__eyebrow">Historique</p>
          <h3 class="shop-acc-section-title">Vos commandes</h3>
          <div class="shop-acc-timeline" id="acc-orders-wrap">
          ${
            orders.length
              ? orders
                  .map(
                    (o) => `
            <article class="shop-acc-tl-node" data-oid="${escapeHtml(o.id)}">
              <div class="shop-acc-tl-node__dot" aria-hidden="true"></div>
              <div class="shop-acc-tl-node__card">
                <div class="shop-acc-order__head">
                  <div>
                    <p class="shop-auth__eyebrow shop-acc-order__num-label">Commande</p>
                    <p class="shop-acc-order__id">${escapeHtml(o.id)}</p>
                  </div>
                  <time datetime="${escapeHtml(o.createdAt)}">${escapeHtml(new Date(o.createdAt).toLocaleString("fr-FR"))}</time>
                </div>
                <div class="shop-acc-order__badges">
                  <span class="${payBadgeClass(o.paymentStatus)}">${escapeHtml(o.paymentStatus)}</span>
                  <span class="${orderBadgeClass(o.orderStatus)}">${escapeHtml(o.orderStatus)}</span>
                </div>
                <div class="shop-acc-order__total">
                  <span>Total</span>
                  <strong>${formatPrice(o.totalTnd)} TND</strong>
                </div>
                <p class="shop-acc-order__paymeth">${escapeHtml(o.paymentMethod)}</p>
                <ul class="shop-acc-order__items shop-acc-order__items--lux">${o.items.map((i) => `<li><span class="shop-acc-order__dot-li" aria-hidden="true"></span><span>${escapeHtml(i.name)} × ${i.qty}</span></li>`).join("")}</ul>
                <button type="button" class="shop-btn-primary shop-btn-primary--luxe shop-acc-order__reorder" data-reorder="${escapeHtml(o.id)}">Commander à nouveau</button>
              </div>
            </article>`,
                  )
                  .join("")
              : '<p class="shop-account__meta shop-acc-tl-empty">Aucune commande pour le moment.</p>'
          }
          </div>
        </section>
      </div>
    </div>`;

  document.getElementById("acc-logout")?.addEventListener("click", () => {
    logoutUser();
    syncShopAccountChrome();
    navigateLuxury("#shop/auth/login");
  });

  root.querySelectorAll("[data-reorder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const oid = btn.getAttribute("data-reorder");
      const o = orders.find((x) => x.id === oid);
      if (!o) return;
      for (const it of o.items) {
        if (!getProductById(it.productId)) continue;
        const cur = getCart().find((l) => l.productId === it.productId);
        const q = (cur ? cur.qty : 0) + it.qty;
        setCartLineQty(it.productId, q);
      }
      window.dispatchEvent(new Event("thebarber-cart-updated"));
      navigateLuxury("#shop/cart");
    });
  });
}
