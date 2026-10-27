const els = {
  orders: document.getElementById("orders"),
  refreshOrders: document.getElementById("refresh-orders"),
  logoutButton: document.getElementById("logout-button"),
};

const orderStatuses = ["confirmed", "preparing", "delivering", "completed", "cancelled"];

init().catch(showFatalError);

async function init() {
  els.refreshOrders.addEventListener("click", () => loadOrders());
  els.logoutButton.addEventListener("click", logout);
  await ensureAuth();
  await loadOrders();
}

async function ensureAuth() {
  const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/admin/login";
    return;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function logout() {
  await fetch("/api/v1/auth/logout", { method: "POST" });
  window.location.href = "/admin/login";
}

/* ---------- orders ---------- */

async function loadOrders() {
  const payload = await requestJson("/api/v1/store/orders");
  renderOrders(payload.orders);
}

function renderOrders(orders) {
  if (!orders.length) {
    els.orders.innerHTML = "<div class='card empty'><p>Заказов пока нет.</p></div>";
    return;
  }
  els.orders.innerHTML = orders
    .map((order) => {
      const items = order.items_json.map((item) => `<li>${escapeHtml(item.title)} × ${item.quantity} — ${item.line_total} ₽</li>`).join("");
      const actions = orderStatuses
        .map((status) => `<button class="btn subtle" type="button" data-order-id="${order.id}" data-status="${status}">${statusLabel(status)}</button>`)
        .join("");
      return `
        <article class="card">
          <div class="order-head">
            <h3>${escapeHtml(order.customer_name)}</h3>
            <strong>${order.total_amount} ${escapeHtml(order.currency)}</strong>
          </div>
          <div class="order-meta">
            <span>${escapeHtml(order.customer_phone)}</span>
            <span>${escapeHtml(order.delivery_address)}</span>
            <span class="chip ${statusTone(order.status)}">${statusLabel(order.status)}</span>
            <span>${paymentLabel(order.payment_method)}</span>
            <span>${formatDate(order.created_at)}</span>
          </div>
          <ul class="order-items">${items}</ul>
          <div class="actions">${actions}</div>
        </article>
      `;
    })
    .join("");
  els.orders.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await requestJson(`/api/v1/store/orders/${button.dataset.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: button.dataset.status }),
      });
      await loadOrders();
    });
  });
}

/* ---------- shared helpers ---------- */

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
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
  els.orders.innerHTML = `<div class="card"><p>Ошибка: ${escapeHtml(error.message)}</p></div>`;
}

function statusLabel(status) {
  return {
    new: "Новый",
    confirmed: "Подтверждён",
    preparing: "Готовится",
    delivering: "В пути",
    completed: "Выполнен",
    cancelled: "Отменён",
  }[status] || status;
}

function statusTone(status) {
  if (["completed", "confirmed"].includes(status)) return "good";
  if (["cancelled"].includes(status)) return "bad";
  if (["new"].includes(status)) return "warn";
  if (["preparing", "delivering"].includes(status)) return "info";
  return "";
}

function paymentLabel(method) {
  return {
    cash: "Наличными",
    card_on_delivery: "Картой при получении",
    online: "Онлайн",
  }[method] || method;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
