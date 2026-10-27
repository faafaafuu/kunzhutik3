const state = {
  menu: null,
  activeCategoryId: null,
  cart: new Map(),
  eventsBound: false,
};

const TELEGRAM_BOT_URL = "https://t.me/orderbookk_bot?start=order";

const els = {
  topnav: document.getElementById("topnav"),
  features: document.getElementById("features"),
  heroTags: document.getElementById("hero-tags"),
  brandName: document.getElementById("brand-name"),
  brandAddress: document.getElementById("brand-address"),
  mapLink: document.getElementById("map-link"),
  contactAddress: document.getElementById("contact-address"),
  contactPhone: document.getElementById("contact-phone"),
  contactHours: document.getElementById("contact-hours"),
  contactLinks: document.getElementById("contact-links"),
  categoryTabs: document.getElementById("category-tabs"),
  activeCategoryTitle: document.getElementById("active-category-title"),
  menuGrid: document.getElementById("menu-grid"),
  cartDrawer: document.getElementById("cart-drawer"),
  drawerBackdrop: document.getElementById("drawer-backdrop"),
  cartReview: document.getElementById("cart-review"),
  cartItems: document.getElementById("cart-items"),
  cartTotal: document.getElementById("cart-total"),
  cartCount: document.getElementById("cart-count"),
  cartPill: document.getElementById("cart-pill"),
  cartBar: document.getElementById("cart-bar"),
  cartBarCount: document.getElementById("cart-bar-count"),
  cartBarTotal: document.getElementById("cart-bar-total"),
  openCart: document.getElementById("open-cart"),
  cartClose: document.getElementById("cart-close"),
  checkoutNext: document.getElementById("checkout-next"),
  checkoutBack: document.getElementById("checkout-back"),
  checkoutForm: document.getElementById("checkout-form"),
  checkoutSubmit: document.getElementById("checkout-submit"),
  checkoutStatus: document.getElementById("checkout-status"),
  authStatus: document.getElementById("auth-status"),
  cartTitle: document.getElementById("cart-title"),
  stepCart: document.getElementById("step-cart"),
  stepCheckout: document.getElementById("step-checkout"),
};

bootstrap().catch((error) => {
  console.error(error);
  renderMenuError();
});

async function bootstrap() {
  setupTelegramShell();
  const response = await fetch("/api/v1/store/menu", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Menu request failed: ${response.status}`);
  }
  state.menu = await response.json();
  state.activeCategoryId = state.menu.categories[0]?.id || null;

  setupTelegramTheme();
  renderBusinessProfile();
  renderTopnav();
  renderHeroTags();
  renderFeatures();
  renderCategories();
  renderMenu();
  renderCart();
  bindEvents();
}

function setupTelegramShell() {
  if (isTelegramMode()) {
    document.documentElement.classList.add("telegram-mode");
    document.body.classList.add("telegram-mode");
  }
}

function bindEvents() {
  if (state.eventsBound) {
    return;
  }
  state.eventsBound = true;
  els.cartPill.addEventListener("click", openCartReview);
  els.openCart.addEventListener("click", openCartReview);
  els.cartClose.addEventListener("click", closeCart);
  els.drawerBackdrop.addEventListener("click", closeCart);
  els.checkoutNext.addEventListener("click", showCheckout);
  els.checkoutBack.addEventListener("click", showCartReview);
  els.checkoutForm.addEventListener("submit", submitOrder);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCart();
    }
  });
  document.addEventListener("click", (event) => {
    const retryButton = event.target.closest("[data-retry-menu]");
    if (retryButton) {
      retryButton.disabled = true;
      retryButton.textContent = "Загружаю...";
      bootstrap().catch((error) => {
        console.error(error);
        renderMenuError();
      });
    }
  });
  document.querySelectorAll("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => applyQuickAuth(button.dataset.auth));
  });
}

function setupTelegramTheme() {
  if (!window.Telegram?.WebApp) {
    prefillTelegramUser({ silent: true });
    return;
  }
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
  applyTelegramThemeParams();
  prefillTelegramUser({ silent: true });
}

function applyTelegramThemeParams() {
  const webApp = window.Telegram?.WebApp;
  const theme = webApp?.themeParams || {};
  if (theme.bg_color) {
    document.documentElement.style.setProperty("--tg-bg", theme.bg_color);
  }
  if (theme.text_color) {
    document.documentElement.style.setProperty("--tg-text", theme.text_color);
  }
  if (theme.button_color) {
    document.documentElement.style.setProperty("--tg-button", theme.button_color);
  }
  if (theme.button_text_color) {
    document.documentElement.style.setProperty("--tg-button-text", theme.button_text_color);
  }
}

function renderTopnav() {
  const links = [
    { href: "#menu", label: "Меню" },
    { href: "#contacts", label: "Контакты" },
  ];
  els.topnav.innerHTML = links.map((link) => `<a href="${link.href}">${link.label}</a>`).join("");
}

function renderHeroTags() {
  const business = state.menu.business || {};
  const tags = [
    business.hours || "ежедневно с 10:00 до 22:00",
    business.phone || "+7 (916) 498-39-09",
    "заказ в Telegram",
  ];
  els.heroTags.innerHTML = tags.map((tag) => `<span>${tag}</span>`).join("");
}

function renderBusinessProfile() {
  const business = state.menu.business || {};
  const links = [
    business.map_url ? { href: business.map_url, label: "Карты" } : null,
    business.instagram_url ? { href: business.instagram_url, label: "Instagram" } : null,
    business.vk_url ? { href: business.vk_url, label: "VK" } : null,
  ].filter(Boolean);

  els.brandName.textContent = state.menu.brand_name || business.brand_name || "Кунжут";
  els.brandAddress.textContent = business.address || "ул. Дзержинского, 18";
  els.contactAddress.textContent = `${business.city || "Солнечногорск"}, ${business.address || "ул. Дзержинского, 18"}`;
  els.contactPhone.textContent = business.phone || "";
  els.contactHours.textContent = business.hours || "";

  if (business.map_url) {
    els.mapLink.href = business.map_url;
  }

  els.contactLinks.innerHTML = links
    .map((link) => `<a href="${link.href}" target="_blank" rel="noreferrer">${link.label}</a>`)
    .join("");
}

function renderFeatures() {
  els.features.classList.remove("is-loading");
  els.features.removeAttribute("aria-busy");
  els.features.innerHTML = state.menu.features
    .map(
      (feature) => `
        <article>
          <strong>${feature.title}</strong>
          <span>${feature.text}</span>
        </article>
      `,
    )
    .join("");
}

function renderCategories() {
  els.categoryTabs.classList.remove("is-loading");
  els.categoryTabs.removeAttribute("aria-busy");
  if (!state.menu.categories.length) {
    els.categoryTabs.innerHTML = "";
    return;
  }
  els.categoryTabs.innerHTML = state.menu.categories
    .map(
      (category) => `
        <button class="${category.id === state.activeCategoryId ? "active" : ""}" type="button" data-category="${category.id}">
          ${category.title}
        </button>
      `,
    )
    .join("");

  els.categoryTabs.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategoryId = button.dataset.category;
      renderCategories();
      renderMenu();
    });
  });
}

function renderMenu() {
  const category = state.menu.categories.find((item) => item.id === state.activeCategoryId);
  const items = state.menu.items.filter((item) => item.category_id === state.activeCategoryId);
  els.activeCategoryTitle.textContent = category?.title || "Меню";
  els.menuGrid.classList.remove("is-loading");
  els.menuGrid.removeAttribute("aria-busy");

  if (!items.length) {
    els.menuGrid.innerHTML = `
      <div class="empty-state empty-state-wide">
        <strong>В этой категории пока пусто</strong>
        <span>Переключите раздел или загляните позже.</span>
      </div>
    `;
    return;
  }
  els.menuGrid.innerHTML = items.map(renderItemCard).join("");
  els.menuGrid.querySelectorAll("[data-add-item]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.addItem));
  });
}

function renderItemCard(item) {
  return `
    <article class="menu-card" style="--card-accent:${item.accent}">
      <div class="menu-art">
        ${item.image_url ? `<img src="${item.image_url}" alt="${item.title}" loading="lazy" decoding="async" />` : ""}
      </div>
      <div class="menu-copy">
        <div class="menu-meta">
          <span>${item.tag}</span>
          ${item.badge ? `<strong>${item.badge}</strong>` : ""}
        </div>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
      </div>
      <div class="menu-footer">
        <div>
          <strong>${formatPrice(item.price)}</strong>
          <small>${item.weight}</small>
        </div>
        <button class="add-button" type="button" data-add-item="${item.id}">Добавить</button>
      </div>
    </article>
  `;
}

function addToCart(itemId) {
  state.cart.set(itemId, (state.cart.get(itemId) || 0) + 1);
  renderCart();
  pulseCartBar();
}

function changeQuantity(itemId, delta) {
  const next = (state.cart.get(itemId) || 0) + delta;
  if (next <= 0) {
    state.cart.delete(itemId);
  } else {
    state.cart.set(itemId, next);
  }
  renderCart();
}

function renderCart() {
  const items = getCartItems();
  const totalCount = [...state.cart.values()].reduce((sum, quantity) => sum + quantity, 0);
  const total = getCartTotal(items);

  els.cartCount.textContent = String(totalCount);
  els.cartTotal.textContent = formatPrice(total);
  els.cartBarCount.textContent = formatItemsCount(totalCount);
  els.cartBarTotal.textContent = formatPrice(total);
  els.cartBar.hidden = totalCount === 0;
  els.checkoutNext.disabled = totalCount === 0;

  if (!items.length) {
    els.cartItems.innerHTML = "<p class='empty-state'>Корзина пустая. Добавьте блюдо из меню.</p>";
    return;
  }

  els.cartItems.innerHTML = items
    .map(
      ({ item, quantity }) => `
        <div class="cart-line">
          <div>
            <strong>${item.title}</strong>
            <small>${formatPrice(item.price)} · ${item.weight}</small>
          </div>
          <div class="qty-control">
            <button type="button" data-qty="${item.id}" data-delta="-1">−</button>
            <span>${quantity}</span>
            <button type="button" data-qty="${item.id}" data-delta="1">+</button>
          </div>
        </div>
      `,
    )
    .join("");

  els.cartItems.querySelectorAll("[data-qty]").forEach((button) => {
    button.addEventListener("click", () => changeQuantity(button.dataset.qty, Number(button.dataset.delta)));
  });
}

function openCartReview() {
  showCartReview();
  els.cartDrawer.classList.add("open");
  els.cartDrawer.setAttribute("aria-hidden", "false");
  els.drawerBackdrop.hidden = false;
  document.body.classList.add("drawer-open");
}

function closeCart() {
  els.cartDrawer.classList.remove("open");
  els.cartDrawer.setAttribute("aria-hidden", "true");
  els.drawerBackdrop.hidden = true;
  document.body.classList.remove("drawer-open");
}

function showCartReview() {
  els.cartTitle.textContent = "Проверьте корзину";
  els.cartReview.hidden = false;
  els.checkoutForm.hidden = true;
  els.stepCart.classList.add("active");
  els.stepCheckout.classList.remove("active");
}

function showCheckout() {
  if (!state.cart.size) {
    return;
  }
  els.cartTitle.textContent = "Оформление";
  els.cartReview.hidden = true;
  els.checkoutForm.hidden = false;
  els.stepCart.classList.remove("active");
  els.stepCheckout.classList.add("active");
  prefillTelegramUser();
}

function applyQuickAuth(provider) {
  if (provider === "telegram") {
    const didPrefill = prefillTelegramUser();
    if (!didPrefill) {
      window.open(TELEGRAM_BOT_URL, "_blank", "noopener,noreferrer");
    }
    const text = didPrefill
      ? "Telegram-профиль подставлен в заказ."
      : "Открыл бот Telegram. Нажмите там кнопку сайта, чтобы вернуться с профилем.";
    els.authStatus.textContent = text;
    els.checkoutStatus.textContent = text;
    return;
  }
  if (provider === "phone") {
    els.checkoutForm.customer_phone.focus();
    els.authStatus.textContent = "Телефон Telegram/VK/Google не отдают автоматически. Введите номер вручную.";
    els.checkoutStatus.textContent = "Введите телефон, оператор свяжется для подтверждения.";
    return;
  }
  els.authStatus.textContent = `${provider.toUpperCase()} не подключен: нужны OAuth client id/secret и callback-домен. Без них безопасная авторизация невозможна.`;
  els.checkoutStatus.textContent = els.authStatus.textContent;
}

function prefillTelegramUser(options = {}) {
  const profile = getTelegramProfile();
  if (!profile) {
    if (!options.silent && els.authStatus) {
      els.authStatus.textContent = "Telegram-профиль недоступен в обычном браузере. Откройте сайт из бота.";
    }
    return false;
  }
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  if (name && !els.checkoutForm.customer_name.value) {
    els.checkoutForm.customer_name.value = name;
  }
  if (els.authStatus) {
    const username = profile.username ? `@${profile.username}` : `id ${profile.id}`;
    const verified = profile.provider === "telegram_link" ? " Подпись бота будет проверена при заказе." : "";
    els.authStatus.textContent = `Подтянут Telegram-профиль: ${username}.${verified}`;
  }
  return true;
}

async function submitOrder(event) {
  event.preventDefault();
  const items = [...state.cart.entries()].map(([item_id, quantity]) => ({ item_id, quantity }));
  if (!items.length) {
    els.checkoutStatus.textContent = "Сначала добавьте блюдо в корзину.";
    return;
  }

  const formData = new FormData(els.checkoutForm);
  const payload = {
    customer_name: formData.get("customer_name"),
    customer_phone: formData.get("customer_phone"),
    delivery_address: formData.get("delivery_address"),
    delivery_slot: formData.get("delivery_slot"),
    payment_method: formData.get("payment_method"),
    comment: formData.get("comment"),
    customer_profile: getCustomerProfile(),
    items,
  };

  setCheckoutSubmitting(true, "Отправляю заказ...");

  try {
    const response = await fetch("/api/v1/store/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Ошибка оформления заказа" }));
      setCheckoutSubmitting(false, typeof error.detail === "string" ? error.detail : "Не удалось оформить заказ.");
      return;
    }

    const result = await response.json();
    state.cart.clear();
    els.checkoutForm.reset();
    renderCart();
    setCheckoutSubmitting(false, `Заказ ${result.order_number} принят.`);

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.HapticFeedback?.notificationOccurred("success");
      window.Telegram.WebApp.MainButton.setText(`Заказ ${result.order_number} принят`);
      window.Telegram.WebApp.MainButton.show();
      window.Telegram.WebApp.sendData?.(JSON.stringify({ type: "store_order_created", order_number: result.order_number }));
    }
  } catch (error) {
    console.error(error);
    setCheckoutSubmitting(false, "Сеть недоступна. Попробуйте отправить заказ ещё раз.");
  }
}

function renderMenuError() {
  els.features.classList.remove("is-loading");
  els.categoryTabs.classList.remove("is-loading");
  els.menuGrid.classList.remove("is-loading");
  els.features.removeAttribute("aria-busy");
  els.categoryTabs.removeAttribute("aria-busy");
  els.menuGrid.removeAttribute("aria-busy");
  els.features.innerHTML = "";
  els.heroTags.innerHTML = "";
  els.categoryTabs.innerHTML = "";
  els.activeCategoryTitle.textContent = "Меню недоступно";
  els.menuGrid.innerHTML = `
    <div class="empty-state empty-state-wide error-state">
      <strong>Не удалось загрузить меню</strong>
      <span>Проверьте подключение или повторите попытку.</span>
      <button class="button button-primary" type="button" data-retry-menu>Повторить</button>
    </div>
  `;
}

function setCheckoutSubmitting(isSubmitting, statusText) {
  els.checkoutSubmit.disabled = isSubmitting;
  els.checkoutSubmit.textContent = isSubmitting ? "Отправляю..." : "Подтвердить заказ";
  els.checkoutForm.classList.toggle("is-submitting", isSubmitting);
  els.checkoutStatus.textContent = statusText;
}

function getCustomerProfile() {
  return getTelegramProfile();
}

function getTelegramProfile() {
  return getTelegramWebAppProfile() || getTelegramLinkProfile();
}

function isTelegramMode() {
  return window.location.pathname === "/tg" || Boolean(window.Telegram?.WebApp?.initData);
}

function getTelegramWebAppProfile() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!user) {
    return null;
  }
  return {
    provider: "telegram",
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
  };
}

function getTelegramLinkProfile() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("tg_id");
  const signature = params.get("tg_sig");
  if (!id || !signature) {
    return null;
  }
  return {
    provider: "telegram_link",
    id,
    username: params.get("tg_username") || null,
    first_name: params.get("tg_first_name") || null,
    last_name: params.get("tg_last_name") || null,
    signature,
  };
}

function getCartItems() {
  if (!state.menu) {
    return [];
  }
  return state.menu.items
    .filter((item) => state.cart.has(item.id))
    .map((item) => ({ item, quantity: state.cart.get(item.id) }));
}

function getCartTotal(items) {
  return items.reduce((sum, { item, quantity }) => sum + item.price * quantity, 0);
}

function pulseCartBar() {
  els.cartBar.classList.remove("pulse");
  requestAnimationFrame(() => els.cartBar.classList.add("pulse"));
}

function formatPrice(price) {
  return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
}

function formatItemsCount(count) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} позиция`;
  }
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} позиции`;
  }
  return `${count} позиций`;
}
