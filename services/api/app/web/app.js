const TELEGRAM_BOT_URL = "https://t.me/orderbookk_bot?start=order";
const ADDON_CATEGORY = "extras";
const MODIFIER_CATEGORY = "modifiers";
const HIDDEN_CATEGORIES = new Set([ADDON_CATEGORY, MODIFIER_CATEGORY]);
const DRINK_CATEGORIES = new Set(["coffee"]);
const UPSELL_IDS = ["cheesecake", "eclair", "choux", "americano", "latte"];
const MAX_MOD_QTY = 3;
const BONUS_RATE = 0.03;

const ICONS = {
  "mod-double-protein": '<path d="M4 13c3-6 11-8 16-3-3 1-4 3-4 5-4 2-9 2-12-2z" /><path d="M16 15c1.5 1 2.5 2.5 3 4" /><circle cx="8" cy="12" r=".8" />',
  "mod-avocado": '<path d="M12 3c-3 0-5 5-6 9a6 6 0 0 0 12 0c-1-4-3-9-6-9z" /><circle cx="12" cy="14" r="2.5" />',
  "mod-egg": '<path d="M12 3c-4 0-7 6-7 10a7 7 0 0 0 14 0c0-4-3-10-7-10z" /><circle cx="12" cy="14" r="2.6" />',
  "mod-sauce-spicy": '<path d="M17 4c-1 1-1 2 0 3" /><path d="M17 7c-2 0-3 1.5-4 4s-3.5 6-8 7c4 1.5 10 0 12-5 .9-2.4.6-4.6 0-6z" />',
  "mod-sauce-unagi": '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />',
  "mod-sesame": '<ellipse cx="8" cy="9" rx="1.6" ry="2.6" transform="rotate(-25 8 9)" /><ellipse cx="15" cy="8" rx="1.6" ry="2.6" transform="rotate(20 15 8)" /><ellipse cx="11" cy="15" rx="1.6" ry="2.6" transform="rotate(-10 11 15)" /><ellipse cx="17" cy="15" rx="1.6" ry="2.6" transform="rotate(35 17 15)" />',
  syrup: '<path d="M9 3h6" /><path d="M10 3v4l-3 4v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-8l-3-4V3" /><path d="M7 14h10" />',
  "oat-milk": '<path d="M8 3h8" /><path d="M9 3v3l-2 3v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9l-2-3V3" /><path d="M7 13h10" />',
  "espresso-shot": '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M4 21h14" />',
};
const CATEGORY_ICONS = {
  coffee: '<path d="M4 9h13v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3c-1 1 1 2 0 3M12 3c-1 1 1 2 0 3" />',
  poke: '<path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M7 11c0-2 1.5-3 3-3M12 11c.5-2.5 2.5-4 5-3.5" /><circle cx="15" cy="8" r="1" />',
  salads: '<path d="M3 12h18a9 9 0 0 1-18 0z" /><path d="M8 12c-1-3 1-6 4-7 0 3-1 5-4 7zM14 12c0-3 2-5 5-5-1 3-2 4-5 5z" />',
  sandwiches: '<path d="M3 10l9-6 9 6z" /><path d="M3 10h18v2H3zM4 15h16M3 18h18" />',
  rolls: '<rect x="5" y="5" width="14" height="14" rx="7" /><circle cx="12" cy="12" r="3.5" /><path d="M12 10.5v3" />',
  scramble: '<circle cx="10" cy="12" r="7" /><path d="M17 12h5" /><circle cx="10" cy="12" r="2.5" />',
  desserts: '<path d="M4 19h16l-2-9H6z" /><path d="M6 10c0-3 3-5 6-5s6 2 6 5" /><circle cx="12" cy="4" r="1" />',
};
const categoryIcon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${CATEGORY_ICONS[id] || CATEGORY_ICONS.poke}</svg>`;
const PLUS_ICON = '<path d="M12 5v14M5 12h14" />';
const CROSS_ICON = '<path d="M6 6l12 12M18 6L6 18" />';

const state = {
  menu: null,
  groups: [],
  addons: [],
  modifierSets: {},
  itemsById: new Map(),
  cart: new Map(), // key -> { id, mods: {modId: qty}, removes: [label], qty }
  product: null,
  bound: false,
};

const $ = (id) => document.getElementById(id);
const els = {
  brandName: $("brand-name"),
  brandAddress: $("brand-address"),
  topbarHours: $("topbar-hours"),
  heroHours: $("hero-hours"),
  mapLink: $("map-link"),
  features: $("features"),
  tabs: $("category-tabs"),
  sections: $("menu-sections"),
  contactAddress: $("contact-address"),
  contactHours: $("contact-hours"),
  contactPhone: $("contact-phone"),
  contactLinks: $("contact-links"),
  cartPill: $("cart-pill"),
  cartPillTotal: $("cart-pill-total"),
  cartCount: $("cart-count"),
  cartBar: $("cart-bar"),
  cartBarCount: $("cart-bar-count"),
  cartBarTotal: $("cart-bar-total"),
  openCart: $("open-cart"),
  scrim: $("scrim"),
  dialog: $("product-dialog"),
  productTitle: $("product-title"),
  productStats: $("product-stats"),
  productDesc: $("product-desc"),
  productMods: $("product-mods"),
  productSizes: $("product-sizes"),
  productQty: $("product-qty"),
  productPrice: $("product-price"),
  drawer: $("cart-drawer"),
  cartTitle: $("cart-title"),
  cartReview: $("cart-review"),
  cartItems: $("cart-items"),
  cartUpsell: $("cart-upsell"),
  cartTotal: $("cart-total"),
  checkoutNext: $("checkout-next"),
  checkoutForm: $("checkout-form"),
  checkoutTotal: $("checkout-total"),
  checkoutSubmit: $("checkout-submit"),
  checkoutStatus: $("checkout-status"),
  authStatus: $("auth-status"),
  orderDone: $("order-done"),
  donePhoto: $("done-photo"),
  doneNumber: $("done-number"),
};

document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = categoryIcon(el.dataset.icon)));
bootstrap();

async function bootstrap() {
  setupTelegram();
  bindEvents();
  try {
    const response = await fetch("/api/v1/store/menu", { cache: "no-store" });
    if (!response.ok) throw new Error(`Menu request failed: ${response.status}`);
    state.menu = await response.json();
  } catch (error) {
    console.error(error);
    renderMenuError();
    return;
  }
  indexMenu();
  renderBusiness();
  renderFeatures();
  renderTabs();
  renderMenu();
  renderCart();
  observeSections();
}

/* ---------- data ---------- */

function indexMenu() {
  const items = state.menu.items;
  state.itemsById = new Map(items.map((item) => [item.id, item]));
  state.addons = items.filter((item) => item.category_id === ADDON_CATEGORY);
  state.modifierSets = state.menu.modifier_sets || {};
  const byKey = new Map();
  for (const item of items) {
    if (HIDDEN_CATEGORIES.has(item.category_id)) continue;
    const key = `${item.category_id}:${item.title}`;
    if (!byKey.has(key)) byKey.set(key, { key, category_id: item.category_id, title: item.title, variants: [] });
    byKey.get(key).variants.push(item);
  }
  state.groups = [...byKey.values()];
  state.groups.forEach((group) => group.variants.sort((a, b) => a.price - b.price));
}

function menuCategories() {
  return state.menu.categories.filter((category) => !HIDDEN_CATEGORIES.has(category.id) && state.groups.some((group) => group.category_id === category.id));
}

function groupImage(group) {
  return group.variants.find((variant) => variant.image_url)?.image_url || null;
}

/* ---------- render: page ---------- */

function renderBusiness() {
  const business = state.menu.business || {};
  els.brandName.textContent = state.menu.brand_name || "Кунжут";
  els.brandAddress.textContent = business.address || "";
  els.contactAddress.textContent = [business.city, business.address].filter(Boolean).join(", ");
  els.contactHours.textContent = business.hours || "";
  els.contactPhone.textContent = business.phone || "";
  if (business.hours) {
    els.heroHours.textContent = business.hours;
    const until = business.hours.match(/до\s+\d{1,2}:\d{2}/);
    if (until) els.topbarHours.textContent = until[0];
  }
  if (business.map_url) els.mapLink.href = business.map_url;
  const links = [
    business.map_url && { href: business.map_url, label: "Яндекс Карты" },
    business.vk_url && { href: business.vk_url, label: "VK" },
    business.instagram_url && { href: business.instagram_url, label: "Instagram" },
  ].filter(Boolean);
  els.contactLinks.innerHTML = links.map((link) => `<a href="${escapeAttr(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join("");
}

function renderFeatures() {
  els.features.innerHTML = (state.menu.features || [])
    .map((feature) => `<article><strong>${escapeHtml(feature.title)}</strong><span>${escapeHtml(feature.text)}</span></article>`)
    .join("");
}

function renderTabs() {
  const categories = menuCategories();
  els.tabs.innerHTML = categories
    .map((category, index) => `<button type="button" role="tab" data-tab="${escapeAttr(category.id)}" class="${index === 0 ? "active" : ""}" aria-selected="${index === 0}">${escapeHtml(category.title)}</button>`)
    .join("");
}

function renderMenu() {
  els.sections.removeAttribute("aria-busy");
  const categories = menuCategories();
  if (!categories.length) {
    els.sections.innerHTML = `<div class="empty-state"><strong>Меню пока пустое</strong><span>Загляните чуть позже.</span></div>`;
    return;
  }
  els.sections.innerHTML = categories
    .map((category) => {
      const cards = state.groups.filter((group) => group.category_id === category.id).map(renderCard).join("");
      return `<section class="menu-section" id="cat-${escapeAttr(category.id)}" data-section="${escapeAttr(category.id)}"><h2>${escapeHtml(category.title)}</h2><div class="menu-grid">${cards}</div></section>`;
    })
    .join("");
}

function renderCard(group) {
  const image = groupImage(group);
  const first = group.variants[0];
  const volumes = group.variants.map((variant) => variant.weight).filter(Boolean);
  const price = group.variants.length > 1 ? `от ${formatPrice(first.price)}` : formatPrice(first.price);
  const art = image
    ? `<div class="menu-art"><img src="${escapeAttr(image)}" alt="" loading="lazy" decoding="async" /></div>`
    : `<div class="menu-art is-empty"><span class="cat-icon">${categoryIcon(group.category_id)}</span><small>фото скоро</small></div>`;
  return `
    <article class="menu-card" data-open="${escapeAttr(group.key)}" tabindex="0" aria-label="${escapeAttr(group.title)}">
      ${art}
      <div class="menu-copy"><h3>${escapeHtml(group.title)}</h3>${volumes.length ? `<small>${escapeHtml(volumes.join(" / "))}</small>` : ""}</div>
      <div class="menu-footer">
        <strong>${price}</strong>
        <button class="add-button" type="button" data-quick="${escapeAttr(group.key)}" aria-label="Добавить ${escapeAttr(group.title)}">+</button>
      </div>
    </article>`;
}

function renderMenuError() {
  els.sections.removeAttribute("aria-busy");
  els.tabs.innerHTML = "";
  els.sections.innerHTML = `
    <div class="empty-state">
      <strong>Не удалось загрузить меню</strong>
      <span>Проверьте подключение и попробуйте ещё раз.</span>
      <button class="button button-primary" type="button" data-retry>Повторить</button>
    </div>`;
}

function observeSections() {
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveTab(visible.target.dataset.section);
    },
    { rootMargin: "-150px 0px -55% 0px" },
  );
  els.sections.querySelectorAll("[data-section]").forEach((section) => observer.observe(section));
}

function setActiveTab(id) {
  els.tabs.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.dataset.tab === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    if (active) button.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

/* ---------- product dialog ---------- */

function optionsFor(item) {
  if (DRINK_CATEGORIES.has(item.category_id)) return { paid: state.addons.map((addon) => addon.id), remove: [] };
  return state.modifierSets[item.id] || { paid: [], remove: [] };
}

function openProduct(key) {
  const group = state.groups.find((item) => item.key === key);
  if (!group) return;
  state.product = { group, variant: 0, qty: 1, mods: {}, removes: new Set(), more: false };
  const image = groupImage(group);
  const bg = $("pd-bg");
  bg.className = image ? "pd-bg" : "pd-bg is-empty";
  bg.innerHTML = image ? `<img src="${escapeAttr(image)}" alt="" />` : `<span class="pd-cat">${categoryIcon(group.category_id)}</span>`;
  els.productTitle.textContent = group.title;
  const desc = group.variants[0].description || "";
  els.productDesc.textContent = desc;
  els.productDesc.hidden = true;
  $("product-more").hidden = !desc;
  $("product-more").setAttribute("aria-expanded", "false");
  renderProductState();
  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
  else els.dialog.setAttribute("open", "");
}

function renderProductState() {
  const product = state.product;
  const { group } = product;
  const item = group.variants[product.variant];
  const options = optionsFor(item);

  const stats = [];
  if (item.weight) stats.push([item.weight, DRINK_CATEGORIES.has(item.category_id) ? "объём" : "вес"]);
  const minutes = state.menu.cook_minutes?.[item.category_id];
  if (minutes) stats.push([`~${minutes} мин`, "готовим"]);
  stats.push([`+${Math.max(1, Math.round(productTotal() * BONUS_RATE))}`, "кунжутиков"]);
  els.productStats.innerHTML = stats.map(([value, label]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");

  $("product-removes").innerHTML = options.remove
    .map((label) => {
      const on = product.removes.has(label);
      return `<button class="remove-pill" type="button" data-remove="${escapeAttr(label)}" aria-pressed="${on}"><svg viewBox="0 0 24 24" aria-hidden="true">${on ? CROSS_ICON : CROSS_ICON}</svg>${escapeHtml(label)}</button>`;
    })
    .join("");

  $("product-tiles").innerHTML = options.paid
    .map((id) => state.itemsById.get(id))
    .filter(Boolean)
    .map((mod) => {
      const qty = product.mods[mod.id] || 0;
      const control = qty
        ? `<div class="qty-control" role="group" aria-label="${escapeAttr(mod.title)}"><button type="button" data-mod="${escapeAttr(mod.id)}" data-delta="-1" aria-label="Меньше">−</button><span>${qty}</span><button type="button" data-mod="${escapeAttr(mod.id)}" data-delta="1" aria-label="Больше" ${qty >= MAX_MOD_QTY ? "disabled" : ""}>+</button></div>`
        : `<button class="mod-add" type="button" data-mod="${escapeAttr(mod.id)}" data-delta="1" aria-label="Добавить ${escapeAttr(mod.title)}">+</button>`;
      return `
        <div class="mod-tile ${qty ? "selected" : ""}">
          <span class="mod-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[mod.id] || PLUS_ICON}</svg></span>
          <b>${escapeHtml(mod.title)}</b>
          <small>+${formatPrice(mod.price)}</small>
          ${control}
        </div>`;
    })
    .join("");
  els.productMods.hidden = !options.remove.length && !options.paid.length;

  if (group.variants.length > 1) {
    els.productSizes.hidden = false;
    els.productSizes.innerHTML = group.variants
      .map((variant, index) => `<button type="button" data-size="${index}" aria-pressed="${index === product.variant}">${sizeLetter(index, group.variants.length)}<small>${escapeHtml(variant.weight || formatPrice(variant.price))}</small></button>`)
      .join("");
  } else {
    els.productSizes.hidden = true;
    els.productSizes.innerHTML = "";
  }
  // Like the reference: with a size switch the quantity is changed in the cart.
  $("product-qty-wrap").hidden = group.variants.length > 1;
  els.productQty.textContent = String(product.qty);
  els.productPrice.textContent = formatPrice(productTotal());
}

function sizeLetter(index, count) {
  if (count === 2) return index === 0 ? "M" : "L";
  return ["S", "M", "L"][index] || String(index + 1);
}

function unitPrice(id, mods) {
  const base = state.itemsById.get(id)?.price || 0;
  return base + Object.entries(mods).reduce((sum, [modId, qty]) => sum + (state.itemsById.get(modId)?.price || 0) * qty, 0);
}

function productTotal() {
  const { group, variant, qty, mods } = state.product;
  return unitPrice(group.variants[variant].id, mods) * qty;
}

function addProductToCart() {
  const { group, variant, qty, mods, removes } = state.product;
  addLine(group.variants[variant].id, qty, mods, [...removes]);
  closeProduct();
  renderCart();
  pulseCartBar();
}

function closeProduct() {
  if (els.dialog.open) els.dialog.close();
  els.dialog.removeAttribute("open");
}

/* ---------- cart ---------- */

function lineKey(id, mods, removes) {
  const modPart = Object.keys(mods).filter((key) => mods[key]).sort().map((key) => `${key}*${mods[key]}`).join(",");
  return `${id}|${modPart}|${[...removes].sort().join(",")}`;
}

function addLine(id, qty = 1, mods = {}, removes = []) {
  const cleanMods = Object.fromEntries(Object.entries(mods).filter(([, value]) => value > 0));
  const key = lineKey(id, cleanMods, removes);
  const line = state.cart.get(key) || { id, mods: cleanMods, removes, qty: 0 };
  line.qty += qty;
  state.cart.set(key, line);
}

function changeQty(key, delta) {
  const line = state.cart.get(key);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) state.cart.delete(key);
  renderCart();
}

function cartLines() {
  return [...state.cart.entries()].map(([key, line]) => ({ key, ...line, item: state.itemsById.get(line.id) })).filter((line) => line.item);
}

function cartTotal() {
  return cartLines().reduce((sum, line) => sum + unitPrice(line.id, line.mods) * line.qty, 0);
}

function lineDetails(line) {
  const mods = Object.entries(line.mods).map(([modId, qty]) => {
    const title = state.itemsById.get(modId)?.title?.toLowerCase() || modId;
    return qty > 1 ? `${title} ×${qty}` : title;
  });
  return [...mods, ...line.removes.map((label) => label.toLowerCase())];
}

function renderCart() {
  const lines = cartLines();
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = cartTotal();

  els.cartCount.hidden = count === 0;
  els.cartCount.textContent = String(count);
  els.cartPillTotal.textContent = count ? formatPrice(total) : "Корзина";
  els.cartBar.hidden = count === 0;
  els.cartBarCount.textContent = formatCount(count);
  els.cartBarTotal.textContent = formatPrice(total);
  els.cartTotal.textContent = formatPrice(total);
  els.checkoutTotal.textContent = formatPrice(total);
  els.checkoutNext.disabled = count === 0;

  els.cartItems.innerHTML = lines.length
    ? lines
        .map((line) => {
          const { item, qty, key } = line;
          const thumb = item.image_url ? `<img src="${escapeAttr(item.image_url)}" alt="" />` : categoryIcon(item.category_id);
          const meta = [item.weight, formatPrice(unitPrice(line.id, line.mods))].filter(Boolean).join(" · ");
          const details = lineDetails(line);
          return `
            <div class="cart-line">
              <span class="cart-thumb">${thumb}</span>
              <div><b>${escapeHtml(item.title)}</b>${details.length ? `<small class="mods">${escapeHtml(details.join(", "))}</small>` : ""}<small>${escapeHtml(meta)}</small></div>
              <div class="qty-control flat" role="group" aria-label="Количество ${escapeAttr(item.title)}">
                <button type="button" data-qty="${escapeAttr(key)}" data-delta="-1" aria-label="Меньше">−</button>
                <span>${qty}</span>
                <button type="button" data-qty="${escapeAttr(key)}" data-delta="1" aria-label="Больше">+</button>
              </div>
            </div>`;
        })
        .join("")
    : `<div class="empty-state"><strong>В корзине пусто</strong><span>Добавьте что-нибудь из меню.</span></div>`;

  const inCart = new Set(lines.map((line) => line.id));
  const upsell = UPSELL_IDS.filter((id) => !inCart.has(id)).map((id) => state.itemsById.get(id)).filter(Boolean).slice(0, 3);
  els.cartUpsell.innerHTML = lines.length && upsell.length
    ? `<h3>Добавить к заказу?</h3><div class="upsell-row">${upsell.map((item) => renderAddonTile(item)).join("")}</div>`
    : "";
}

function renderAddonTile(item) {
  const thumb = item.image_url ? `<img src="${escapeAttr(item.image_url)}" alt="" />` : categoryIcon(item.category_id);
  return `
    <button class="addon-tile" type="button" data-upsell="${escapeAttr(item.id)}">
      <span class="thumb">${thumb}</span>
      <b>${escapeHtml(item.title)}</b>
      <small>+${formatPrice(item.price)}</small>
      <span class="mark" aria-hidden="true">+</span>
    </button>`;
}

// The current API takes flat items. Paid modifiers go as their own items (priced on the server);
// free removals go into the comment next to the dish they belong to.
function orderPayloadParts(comment) {
  const quantities = new Map();
  const notes = [];
  for (const line of cartLines()) {
    quantities.set(line.id, (quantities.get(line.id) || 0) + line.qty);
    for (const [modId, qty] of Object.entries(line.mods)) quantities.set(modId, (quantities.get(modId) || 0) + qty * line.qty);
    const details = lineDetails(line);
    if (details.length) notes.push(`${line.item.title}${line.item.weight ? " " + line.item.weight : ""} ×${line.qty}: ${details.join(", ")}`);
  }
  const fullComment = [comment, ...notes].filter(Boolean).join("; ").slice(0, 500);
  return { items: [...quantities.entries()].map(([item_id, quantity]) => ({ item_id, quantity })), comment: fullComment || null };
}

function openCart() {
  showPanel("review");
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.scrim.hidden = false;
  document.body.classList.add("lock");
}

function closeCart() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.scrim.hidden = true;
  document.body.classList.remove("lock");
}

function showPanel(name) {
  els.cartReview.hidden = name !== "review";
  els.checkoutForm.hidden = name !== "checkout";
  els.orderDone.hidden = name !== "done";
  els.cartTitle.textContent = { review: "Корзина", checkout: "Оформление", done: "Готово" }[name];
  if (name === "checkout") prefillTelegramUser({ silent: true });
}

/* ---------- checkout ---------- */

async function submitOrder(event) {
  event.preventDefault();
  const form = els.checkoutForm;
  if (!state.cart.size) return setStatus("Сначала добавьте что-нибудь в корзину.", true);

  let firstInvalid = null;
  form.querySelectorAll(".field[required]").forEach((field) => {
    const invalid = !field.checkValidity() || !field.value.trim();
    field.setAttribute("aria-invalid", String(invalid));
    if (invalid && !firstInvalid) firstInvalid = field;
  });
  if (firstInvalid) {
    firstInvalid.focus();
    return setStatus("Заполните имя, телефон и адрес.", true);
  }

  const data = new FormData(form);
  const parts = orderPayloadParts((data.get("comment") || "").trim());
  const payload = {
    customer_name: data.get("customer_name"),
    customer_phone: data.get("customer_phone"),
    delivery_address: data.get("delivery_address"),
    delivery_slot: data.get("delivery_slot") || null,
    payment_method: data.get("payment_method"),
    comment: parts.comment,
    customer_profile: getTelegramProfile(),
    items: parts.items,
  };

  setSubmitting(true);
  try {
    const response = await fetch("/api/v1/store/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setSubmitting(false);
      return setStatus(typeof error.detail === "string" ? error.detail : "Не удалось оформить заказ. Проверьте поля.", true);
    }
    const result = await response.json();
    const photo = cartLines().map((line) => line.item.image_url).find(Boolean);
    els.donePhoto.innerHTML = photo ? `<img src="${escapeAttr(photo)}" alt="" />` : "";
    els.doneNumber.textContent = `Заказ ${result.order_number}`;
    state.cart.clear();
    form.reset();
    setSubmitting(false);
    setStatus("");
    renderCart();
    showPanel("done");
    const webApp = window.Telegram?.WebApp;
    if (webApp?.initData) {
      webApp.HapticFeedback?.notificationOccurred("success");
      webApp.sendData?.(JSON.stringify({ type: "store_order_created", order_number: result.order_number }));
    }
  } catch (error) {
    console.error(error);
    setSubmitting(false);
    setStatus("Сеть недоступна. Попробуйте ещё раз.", true);
  }
}

function setSubmitting(on) {
  els.checkoutSubmit.disabled = on;
  els.checkoutSubmit.textContent = on ? "Отправляю…" : "Подтвердить заказ";
  els.checkoutForm.classList.toggle("is-submitting", on);
}

function setStatus(text, isError = false) {
  els.checkoutStatus.textContent = text;
  els.checkoutStatus.classList.toggle("error", isError);
}

/* ---------- Telegram ---------- */

function setupTelegram() {
  const webApp = window.Telegram?.WebApp;
  const inTelegram = window.location.pathname === "/tg" || Boolean(webApp?.initData);
  if (inTelegram) document.body.classList.add("telegram-mode");
  if (webApp?.initData) {
    webApp.ready();
    webApp.expand();
    if (webApp.colorScheme) document.documentElement.dataset.theme = webApp.colorScheme;
    webApp.onEvent?.("themeChanged", () => (document.documentElement.dataset.theme = webApp.colorScheme));
  }
}

function prefillTelegramUser({ silent = false } = {}) {
  const profile = getTelegramProfile();
  if (!profile) {
    if (!silent) els.authStatus.textContent = "В обычном браузере профиля нет — откройте сайт из бота.";
    return false;
  }
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  const input = els.checkoutForm.elements.customer_name;
  if (name && !input.value) input.value = name;
  els.authStatus.textContent = `Профиль ${profile.username ? "@" + profile.username : "Telegram"} подставлен.`;
  return true;
}

function getTelegramProfile() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (user) {
    return { provider: "telegram", id: user.id, username: user.username || null, first_name: user.first_name || null, last_name: user.last_name || null, language_code: user.language_code || null };
  }
  const params = new URLSearchParams(window.location.search);
  const id = params.get("tg_id");
  const signature = params.get("tg_sig");
  if (!id || !signature) return null;
  return { provider: "telegram_link", id, username: params.get("tg_username") || null, first_name: params.get("tg_first_name") || null, last_name: params.get("tg_last_name") || null, signature };
}

/* ---------- events ---------- */

function bindEvents() {
  if (state.bound) return;
  state.bound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const quick = target.closest("[data-quick]");
    if (quick) {
      event.stopPropagation();
      const group = state.groups.find((item) => item.key === quick.dataset.quick);
      if (!group) return;
      const only = group.variants[0];
      const options = optionsFor(only);
      if (group.variants.length === 1 && !options.paid.length && !options.remove.length) {
        addLine(only.id);
        renderCart();
        pulseCartBar();
      } else {
        openProduct(group.key);
      }
      return;
    }
    const card = target.closest("[data-open]");
    if (card) return openProduct(card.dataset.open);

    const tab = target.closest("[data-tab]");
    if (tab) {
      setActiveTab(tab.dataset.tab);
      document.getElementById(`cat-${tab.dataset.tab}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const size = target.closest("[data-size]");
    if (size && state.product) {
      state.product.variant = Number(size.dataset.size);
      return renderProductState();
    }
    const mod = target.closest("[data-mod]");
    if (mod && state.product) {
      const id = mod.dataset.mod;
      const next = Math.max(0, Math.min(MAX_MOD_QTY, (state.product.mods[id] || 0) + Number(mod.dataset.delta)));
      if (next) state.product.mods[id] = next;
      else delete state.product.mods[id];
      return renderProductState();
    }
    const remove = target.closest("[data-remove]");
    if (remove && state.product) {
      const label = remove.dataset.remove;
      state.product.removes.has(label) ? state.product.removes.delete(label) : state.product.removes.add(label);
      return renderProductState();
    }
    const upsell = target.closest("[data-upsell]");
    if (upsell) {
      addLine(upsell.dataset.upsell);
      return renderCart();
    }
    const qty = target.closest("[data-qty]");
    if (qty) return changeQty(qty.dataset.qty, Number(qty.dataset.delta));
    if (target.closest("[data-retry]")) return bootstrap();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.drawer.classList.contains("open")) closeCart();
    const card = event.target.closest?.("[data-open]");
    if (card && (event.key === "Enter" || event.key === " ") && event.target === card) {
      event.preventDefault();
      openProduct(card.dataset.open);
    }
  });

  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) closeProduct();
  });
  $("product-close").addEventListener("click", closeProduct);
  $("product-minus").addEventListener("click", () => {
    if (!state.product) return;
    state.product.qty = Math.max(1, state.product.qty - 1);
    renderProductState();
  });
  $("product-plus").addEventListener("click", () => {
    if (!state.product) return;
    state.product.qty = Math.min(50, state.product.qty + 1);
    renderProductState();
  });
  $("product-add").addEventListener("click", addProductToCart);
  $("product-more").addEventListener("click", (event) => {
    const open = event.currentTarget.getAttribute("aria-expanded") !== "true";
    event.currentTarget.setAttribute("aria-expanded", String(open));
    els.productDesc.hidden = !open;
  });

  els.cartPill.addEventListener("click", openCart);
  els.openCart.addEventListener("click", openCart);
  $("cart-close").addEventListener("click", closeCart);
  els.scrim.addEventListener("click", closeCart);
  els.checkoutNext.addEventListener("click", () => state.cart.size && showPanel("checkout"));
  $("checkout-back").addEventListener("click", () => showPanel("review"));
  $("done-close").addEventListener("click", closeCart);
  els.checkoutForm.addEventListener("submit", submitOrder);
  els.checkoutForm.addEventListener("input", (event) => {
    if (event.target.matches(".field[aria-invalid='true']") && event.target.value.trim()) event.target.setAttribute("aria-invalid", "false");
  });
  $("tg-auth").addEventListener("click", () => {
    if (!prefillTelegramUser()) window.open(TELEGRAM_BOT_URL, "_blank", "noopener,noreferrer");
  });
}

/* ---------- helpers ---------- */

function pulseCartBar() {
  els.cartBar.classList.remove("pulse");
  requestAnimationFrame(() => els.cartBar.classList.add("pulse"));
}

function formatPrice(value) {
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}

function formatCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} позиция`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} позиции`;
  return `${count} позиций`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

const escapeAttr = escapeHtml;
