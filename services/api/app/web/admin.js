const els = {
  orders: document.getElementById("orders"),
  filters: document.getElementById("filters"),
  updated: document.getElementById("updated"),
  refreshOrders: document.getElementById("refresh-orders"),
  logoutButton: document.getElementById("logout-button"),
};

const STATUS_LABELS = {
  new: "Новый",
  confirmed: "Подтверждён",
  preparing: "Готовится",
  delivering: "В пути",
  completed: "Выполнен",
  cancelled: "Отменён",
};
// Next steps offered on a card, in workflow order.
const NEXT = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["delivering", "completed", "cancelled"],
  delivering: ["completed", "cancelled"],
  completed: [],
  cancelled: ["new"],
};
const FILTERS = [
  { id: "active", label: "В работе", match: (s) => ["new", "confirmed", "preparing", "delivering"].includes(s) },
  { id: "new", label: "Новые", match: (s) => s === "new" },
  { id: "preparing", label: "Готовятся", match: (s) => s === "preparing" },
  { id: "delivering", label: "В пути", match: (s) => s === "delivering" },
  { id: "done", label: "Завершённые", match: (s) => ["completed", "cancelled"].includes(s) },
  { id: "all", label: "Все", match: () => true },
];
const REFRESH_MS = 20000;

const state = { orders: [], filter: "active", timer: null };

init().catch(showFatalError);

async function init() {
  els.refreshOrders.addEventListener("click", () => loadOrders());
  els.logoutButton.addEventListener("click", logout);
  els.filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    render();
  });
  els.orders.addEventListener("click", onAction);
  await ensureAuth();
  await loadOrders();
  state.timer = setInterval(() => document.visibilityState === "visible" && loadOrders(), REFRESH_MS);
}

async function ensureAuth() {
  const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/admin/login";
    return;
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function logout() {
  await fetch("/api/v1/auth/logout", { method: "POST" });
  window.location.href = "/admin/login";
}

async function loadOrders() {
  const payload = await requestJson("/api/v1/store/orders");
  state.orders = payload.orders;
  els.updated.textContent = `Обновлено в ${new Intl.DateTimeFormat("ru-RU", { timeStyle: "short" }).format(new Date())}`;
  render();
}

function render() {
  els.filters.innerHTML = FILTERS.map((filter) => {
    const count = state.orders.filter((order) => filter.match(order.status)).length;
    return `<button type="button" role="tab" data-filter="${filter.id}" class="${filter.id === state.filter ? "active" : ""}" aria-selected="${filter.id === state.filter}">${filter.label}<b>${count}</b></button>`;
  }).join("");

  const filter = FILTERS.find((item) => item.id === state.filter) || FILTERS[0];
  const orders = state.orders.filter((order) => filter.match(order.status));
  if (!orders.length) {
    els.orders.innerHTML = `<div class="card empty">Здесь пока пусто.</div>`;
    return;
  }
  els.orders.innerHTML = orders.map(renderOrder).join("");
}

function renderOrder(order) {
  const items = order.items_json
    .map((item) => `<li><span>${escapeHtml(item.title)} × ${item.quantity}</span><span>${formatMoney(item.line_total)}</span></li>`)
    .join("");
  const actions = (NEXT[order.status] || [])
    .map((status) => {
      const tone = status === "cancelled" ? "danger" : status === "new" ? "subtle" : "primary";
      return `<button class="btn sm ${tone}" type="button" data-order-id="${order.id}" data-status="${status}">${actionLabel(status)}</button>`;
    })
    .join("");
  const phone = escapeHtml(order.customer_phone);
  return `
    <article class="card order ${order.status === "new" ? "is-new" : ""}">
      <div class="order-head">
        <div>
          <h3>${escapeHtml(order.customer_name)}</h3>
          <span class="muted small">№ ${escapeHtml(String(order.id).slice(0, 8).toUpperCase())} · ${formatDate(order.created_at)}</span>
        </div>
        <strong>${formatMoney(order.total_amount)}</strong>
      </div>
      <div class="order-meta">
        <span class="chip ${statusTone(order.status)}">${STATUS_LABELS[order.status] || escapeHtml(order.status)}</span>
        <a href="tel:${phone.replace(/[^+\d]/g, "")}">${phone}</a>
        <span>${paymentLabel(order.payment_method)}</span>
      </div>
      <div class="order-meta"><span>${escapeHtml(order.delivery_address)}</span>${order.delivery_slot ? `<span>· ${escapeHtml(order.delivery_slot)}</span>` : ""}</div>
      <ul class="order-items">${items}</ul>
      ${order.comment ? `<p class="order-comment">${escapeHtml(order.comment)}</p>` : ""}
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </article>`;
}

async function onAction(event) {
  const button = event.target.closest("[data-order-id]");
  if (!button) return;
  button.disabled = true;
  try {
    await requestJson(`/api/v1/store/orders/${button.dataset.orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: button.dataset.status }),
    });
    await loadOrders();
  } catch (error) {
    button.disabled = false;
    showFatalError(error);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = "/admin/login";
      throw new Error("Authentication required");
    }
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function showFatalError(error) {
  console.error(error);
  els.orders.insertAdjacentHTML("afterbegin", `<div class="card empty">Ошибка: ${escapeHtml(error.message)}</div>`);
}

function actionLabel(status) {
  return { confirmed: "Подтвердить", preparing: "Готовим", delivering: "Передать курьеру", completed: "Выдан", cancelled: "Отменить", new: "Вернуть в новые" }[status] || STATUS_LABELS[status];
}

function statusTone(status) {
  if (["completed", "confirmed"].includes(status)) return "good";
  if (status === "cancelled") return "bad";
  if (status === "new") return "warn";
  if (["preparing", "delivering"].includes(status)) return "info";
  return "";
}

function paymentLabel(method) {
  return { cash: "Наличными", card_on_delivery: "Картой при получении", online: "Онлайн" }[method] || escapeHtml(method);
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value)) + " ₽";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
