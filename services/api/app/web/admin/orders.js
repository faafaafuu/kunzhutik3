// Orders feed: what came in, what is cooking, what is on the way. Polls every 15 seconds.

import { ACTION_LABELS, STATUS_LABELS, api, ask, escapeHtml, minutesAgo, modLabel, money, phone as formatPhone, showError, statusTone, time, toast } from "./core.js";

const REFRESH_MS = 15000;
const FILTERS = [
  { id: "active", label: "В работе", group: "active", match: () => true },
  { id: "new", label: "Новые", group: "active", match: (order) => order.status === "new" },
  { id: "kitchen", label: "На кухне", group: "active", match: (order) => ["confirmed", "preparing"].includes(order.status) },
  { id: "ready", label: "Готовы", group: "active", match: (order) => order.status === "ready" },
  { id: "delivering", label: "В пути", group: "active", match: (order) => order.status === "delivering" },
  { id: "done", label: "Завершённые", group: "done", match: () => true },
];

const local = { filter: "active", orders: [], timer: null, root: null, dashboard: null };
const seen = new Set();
let firstLoad = true;

export async function mount(root) {
  local.root = root;
  root.innerHTML = `
    <div class="kpis" id="kpis"></div>
    <div class="toolbar">
      <h1>Заказы</h1>
      <div class="filters" id="filters" role="tablist"></div>
      <span class="updated muted small" id="updated"></span>
    </div>
    <div class="orders-list" id="orders"></div>`;
  root.querySelector("#filters").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    local.filter = button.dataset.filter;
    await load();
  });
  root.querySelector("#orders").addEventListener("click", onAction);
  await load();
  local.timer = setInterval(() => document.visibilityState === "visible" && load().catch(showError), REFRESH_MS);
}

export function unmount() {
  clearInterval(local.timer);
  local.root = null;
}

async function load() {
  const filter = FILTERS.find((item) => item.id === local.filter) || FILTERS[0];
  const [payload, dashboard] = await Promise.all([
    api(`/api/v1/admin/orders?group=${filter.group}&days=3`),
    api("/api/v1/admin/dashboard").catch(() => null),
  ]);
  local.orders = payload.orders;
  local.dashboard = dashboard;
  if (filter.group === "active") updateBadge(payload.orders);
  render();
}

function render() {
  if (!local.root) return;
  const root = local.root;
  const filter = FILTERS.find((item) => item.id === local.filter) || FILTERS[0];
  root.querySelector("#filters").innerHTML = FILTERS.map((item) => {
    const count = item.group === "active" && filter.group === "active" ? local.orders.filter(item.match).length : "";
    return `<button type="button" role="tab" data-filter="${item.id}" class="${item.id === local.filter ? "active" : ""}">${item.label}${count !== "" ? `<b>${count}</b>` : ""}</button>`;
  }).join("");
  root.querySelector("#updated").textContent = `обновлено в ${time(new Date())}`;
  if (local.dashboard) {
    const today = local.dashboard.today;
    root.querySelector("#kpis").innerHTML = `
      <div class="kpi"><span>Заказов сегодня</span><b>${today.orders}</b></div>
      <div class="kpi"><span>Выручка сегодня</span><b>${money(today.revenue)}</b></div>
      <div class="kpi"><span>Средний чек</span><b>${money(today.avg_check)}</b></div>
      <div class="kpi"><span>В работе</span><b>${today.active}</b></div>
      <div class="kpi ${today.late ? "is-bad" : ""}"><span>Опаздывают</span><b>${today.late}</b></div>`;
  }
  const orders = local.orders.filter(filter.match);
  root.querySelector("#orders").innerHTML = orders.length ? orders.map(renderOrder).join("") : `<div class="card empty">Здесь пока пусто.</div>`;
}

function renderOrder(order) {
  const items = order.items
    .map((item) => {
      const mods = item.modifiers.length ? `<small>${escapeHtml(item.modifiers.map(modLabel).join(", "))}</small>` : "";
      return `<li><span><b>${escapeHtml(item.title)}</b> × ${item.quantity}${mods}</span><span>${money(item.line_total)}</span></li>`;
    })
    .join("");
  const actions = order.next_statuses
    .map((status) => {
      const tone = ["cancelled", "rejected"].includes(status) ? "danger" : "primary";
      return `<button class="btn sm ${tone}" type="button" data-order-id="${order.id}" data-status="${status}">${ACTION_LABELS[status] || STATUS_LABELS[status]}</button>`;
    })
    .join("");
  const details = order.address_details || {};
  const extra = [["entrance", "подъезд"], ["floor", "этаж"], ["apartment", "кв."], ["intercom", "домофон"]]
    .filter(([key]) => details[key])
    .map(([key, label]) => `${label} ${escapeHtml(details[key])}`)
    .join(", ");
  const late = order.promised_at && order.is_active && new Date(order.promised_at) < new Date();
  const where =
    order.fulfillment === "delivery"
      ? `<span>🛵 ${escapeHtml(order.address_text)}${extra ? ` · ${extra}` : ""}</span>${
          order.address_lat ? `<a href="https://yandex.ru/maps/?pt=${order.address_lon},${order.address_lat}&z=17&l=map" target="_blank" rel="noopener">карта</a>` : ""
        }`
      : `<span>🏃 Самовывоз</span>`;
  const phone = escapeHtml(order.customer_phone);
  const phoneText = escapeHtml(formatPhone(order.customer_phone));
  const money_rows = [
    order.discount_total !== "0.00" ? `<span>скидка −${money(order.discount_total)}${order.promo_code ? ` (${escapeHtml(order.promo_code)})` : ""}</span>` : "",
    order.bonus_spent !== "0.00" ? `<span>бонусами −${money(order.bonus_spent)}</span>` : "",
    order.fulfillment === "delivery" ? `<span>доставка ${money(order.delivery_fee)}</span>` : "",
  ].join("");
  return `
    <article class="card order ${order.status === "new" ? "is-new" : ""} ${late ? "is-late" : ""}">
      <div class="order-head">
        <div>
          <h3>№ ${escapeHtml(order.number)} <span class="chip ${statusTone(order.status)}">${STATUS_LABELS[order.status] || order.status}</span></h3>
          <span class="muted small">${minutesAgo(order.created_at)}${order.venue ? ` · ${escapeHtml(order.venue.title)}` : ""}</span>
        </div>
        <strong>${money(order.total_amount)}</strong>
      </div>
      <div class="order-meta">
        ${order.scheduled_for ? `<span class="chip accent">ко времени ${time(order.scheduled_for)}</span>` : ""}
        ${order.promised_at && order.is_active ? `<span class="${late ? "late" : ""}">обещали к ${time(order.promised_at)}</span>` : ""}
        <span>${escapeHtml(order.payment_label)}</span>
      </div>
      <div class="order-meta"><b>${escapeHtml(order.customer_name)}</b><a href="tel:${phone}">${phoneText}</a>${
        order.customer_id ? `<a href="/admin/customers?id=${order.customer_id}">карточка</a>` : ""
      }</div>
      <div class="order-meta">${where}</div>
      <ul class="order-items">${items}</ul>
      ${money_rows ? `<div class="order-meta small">${money_rows}</div>` : ""}
      ${order.comment ? `<p class="order-comment">${escapeHtml(order.comment)}</p>` : ""}
      ${order.cancel_reason ? `<p class="order-comment bad">${escapeHtml(order.cancel_reason)}</p>` : ""}
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </article>`;
}

async function onAction(event) {
  const button = event.target.closest("[data-order-id]");
  if (!button) return;
  const status = button.dataset.status;
  const body = { to: status, comment: "" };
  if (status === "confirmed") {
    const answer = await ask({
      title: "Принять заказ",
      text: "Через сколько минут заказ будет у клиента? Пусто — оставить расчёт системы.",
      fields: [{ name: "minutes", label: "Минут", type: "number", value: "", presets: ["20", "30", "45", "60", "90"] }],
      submit: "Принять",
    });
    if (!answer) return;
    if (answer.minutes) body.promised_in_minutes = Number(answer.minutes);
  }
  if (["cancelled", "rejected"].includes(status)) {
    const answer = await ask({
      title: status === "rejected" ? "Отказать в заказе" : "Отменить заказ",
      text: "Причину увидит клиент.",
      fields: [{ name: "reason", label: "Причина", value: "", presets: ["Закончились продукты", "Не успеваем", "Клиент не отвечает", "Клиент попросил отменить"] }],
      submit: status === "rejected" ? "Отказать" : "Отменить заказ",
      tone: "danger",
    });
    if (!answer) return;
    body.comment = answer.reason;
  }
  button.disabled = true;
  try {
    await api(`/api/v1/admin/orders/${button.dataset.orderId}/transition`, { method: "POST", body });
    toast(`Заказ: ${STATUS_LABELS[status].toLowerCase()}`);
    await load();
  } catch (error) {
    button.disabled = false;
    showError(error);
  }
}

// ---- new order alert, works on every page of the panel ----

function updateBadge(orders) {
  const fresh = orders.filter((order) => order.status === "new");
  const badge = document.getElementById("active-count");
  badge.hidden = fresh.length === 0;
  badge.textContent = fresh.length;
  document.title = fresh.length ? `(${fresh.length}) Брайт · Панель` : "Брайт · Панель";
  let arrived = false;
  for (const order of fresh) {
    if (!seen.has(order.id)) {
      seen.add(order.id);
      arrived = true;
    }
  }
  if (arrived && !firstLoad) beep();
  firstLoad = false;
}

export function watchNewOrders() {
  const poll = () => api("/api/v1/admin/orders?group=active").then((payload) => updateBadge(payload.orders)).catch(() => {});
  poll();
  setInterval(poll, REFRESH_MS);
}

function beep() {
  try {
    const context = new AudioContext();
    [0, 0.25, 0.5].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + offset + 0.2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.2);
    });
  } catch {
    // Autoplay may be blocked until the first click; the badge still shows.
  }
  toast("Новый заказ!", "accent");
}
