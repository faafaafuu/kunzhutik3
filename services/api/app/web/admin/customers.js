// CRM: everyone who ordered, by segment; a customer card with history, notes, tags and bonuses.

import { STATUS_LABELS, api, ask, date, dateTime, escapeHtml, money, showError, statusTone, toast } from "./core.js";

const PAGE = 50;
const SORTS = { last_order: "по последнему заказу", spent: "по сумме", orders: "по числу заказов", created: "по дате появления" };
const SEGMENT_HINTS = {
  new: "первый заказ за последние 30 дней",
  regular: "3+ заказа, заказывали за 45 дней",
  sleeping: "не заказывали больше 45 дней",
  vip: "потратили от 10 000 ₽",
};

const local = { root: null, segment: "all", sort: "last_order", q: "", offset: 0, data: null, timer: null };

export async function mount(root) {
  local.root = root;
  root.innerHTML = `
    <div class="kpis" id="crm-kpis"></div>
    <div class="toolbar">
      <h1>Клиенты</h1>
      <input class="field search-field" id="crm-search" type="search" placeholder="Имя, телефон, метка, заметка" />
      <select class="field select-field" id="crm-sort">${Object.entries(SORTS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>
      <a class="btn subtle" id="crm-export" href="/api/v1/admin/customers.csv">Скачать CSV</a>
    </div>
    <div class="filters" id="crm-segments"></div>
    <div class="card table-card"><table class="table" id="crm-table"></table></div>
    <div class="pager" id="crm-pager"></div>
    <aside class="drawer" id="crm-card" hidden></aside>`;
  root.querySelector("#crm-search").addEventListener("input", (event) => {
    clearTimeout(local.timer);
    local.timer = setTimeout(() => {
      local.q = event.target.value.trim();
      local.offset = 0;
      load().catch(showError);
    }, 300);
  });
  root.querySelector("#crm-sort").addEventListener("change", (event) => {
    local.sort = event.target.value;
    load().catch(showError);
  });
  root.querySelector("#crm-segments").addEventListener("click", (event) => {
    const button = event.target.closest("[data-segment]");
    if (!button) return;
    local.segment = button.dataset.segment;
    local.offset = 0;
    load().catch(showError);
  });
  root.querySelector("#crm-table").addEventListener("click", (event) => {
    const row = event.target.closest("[data-customer]");
    if (row) openCard(row.dataset.customer).catch(showError);
  });
  root.querySelector("#crm-pager").addEventListener("click", (event) => {
    const button = event.target.closest("[data-offset]");
    if (!button) return;
    local.offset = Number(button.dataset.offset);
    load().catch(showError);
  });
  await Promise.all([load(), loadKpis()]);
  const linked = new URLSearchParams(window.location.search).get("id");
  if (linked) await openCard(linked);
}

export function unmount() {
  local.root = null;
}

async function loadKpis() {
  const dashboard = await api("/api/v1/admin/dashboard");
  const total = dashboard.series.reduce((sum, day) => sum + Number(day.revenue), 0);
  const orders = dashboard.series.reduce((sum, day) => sum + day.orders, 0);
  const peak = Math.max(1, ...dashboard.series.map((day) => Number(day.revenue)));
  local.root.querySelector("#crm-kpis").innerHTML = `
    <div class="kpi"><span>Выручка за 14 дней</span><b>${money(total)}</b></div>
    <div class="kpi"><span>Заказов за 14 дней</span><b>${orders}</b></div>
    <div class="kpi"><span>Новых клиентов сегодня</span><b>${dashboard.today.new_customers}</b></div>
    <div class="kpi wide"><span>Выручка по дням</span>
      <div class="spark">${dashboard.series
        .map((day) => `<i style="height:${Math.max(3, (Number(day.revenue) / peak) * 100)}%" title="${day.date}: ${money(day.revenue)}, ${day.orders} зак."></i>`)
        .join("")}</div>
    </div>
    <div class="kpi wide"><span>Топ блюд</span><small>${dashboard.top_items.map((item) => `${escapeHtml(item.title)} — ${item.quantity}`).join("<br>") || "пока нет"}</small></div>`;
}

async function load() {
  const params = new URLSearchParams({ q: local.q, segment: local.segment, sort: local.sort, limit: PAGE, offset: local.offset });
  local.data = await api(`/api/v1/admin/customers?${params}`);
  render();
}

function render() {
  const { segments, customers, total } = local.data;
  local.root.querySelector("#crm-segments").innerHTML = Object.entries(segments)
    .map(([id, label]) => `<button type="button" data-segment="${id}" class="${id === local.segment ? "active" : ""}" title="${SEGMENT_HINTS[id] || ""}">${label}${id === local.segment ? `<b>${total}</b>` : ""}</button>`)
    .join("");
  local.root.querySelector("#crm-export").href = `/api/v1/admin/customers.csv?${new URLSearchParams({ segment: local.segment, q: local.q })}`;
  local.root.querySelector("#crm-table").innerHTML = customers.length
    ? `<thead><tr><th>Клиент</th><th>Телефон</th><th class="num" title="Выполненные заказы">Выполнено</th><th class="num">Сумма</th><th class="num">Средний чек</th><th>Последний заказ</th><th>Метки</th></tr></thead>
       <tbody>${customers
         .map(
           (customer) => `
        <tr class="clickable" data-customer="${customer.id}">
          <td><b>${escapeHtml(customer.name || "Без имени")}</b>${customer.is_registered ? ' <span class="chip info" title="Входил в приложение">аккаунт</span>' : ""}${customer.is_blocked ? ' <span class="chip bad">блок</span>' : ""}${segmentChip(customer.segment)}</td>
          <td>${escapeHtml(customer.phone_display || (customer.telegram_username ? "@" + customer.telegram_username : "—"))}</td>
          <td class="num">${customer.orders_count}</td>
          <td class="num">${money(customer.total_spent)}</td>
          <td class="num">${money(customer.avg_check)}</td>
          <td>${customer.last_order_at ? date(customer.last_order_at) : "—"}</td>
          <td>${customer.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join(" ")}</td>
        </tr>`,
         )
         .join("")}</tbody>`
    : `<tr><td class="empty">Клиентов пока нет — они появятся с первыми заказами.</td></tr>`;
  const pages = [];
  if (local.offset > 0) pages.push(`<button class="btn subtle sm" data-offset="${Math.max(0, local.offset - PAGE)}">← Назад</button>`);
  if (local.offset + PAGE < total) pages.push(`<button class="btn subtle sm" data-offset="${local.offset + PAGE}">Дальше →</button>`);
  local.root.querySelector("#crm-pager").innerHTML = pages.join("") + (total ? `<span class="muted small">${local.offset + 1}–${Math.min(total, local.offset + PAGE)} из ${total}</span>` : "");
}

function segmentChip(segment) {
  const labels = { new: ["Новый", "good"], regular: ["Постоянный", "accent"], sleeping: ["Уснул", "warn"], vip: ["VIP", "accent"] };
  const entry = labels[segment];
  return entry ? ` <span class="chip ${entry[1]}">${entry[0]}</span>` : "";
}

async function openCard(customerId) {
  const { customer } = await api(`/api/v1/admin/customers/${customerId}`);
  const drawer = local.root.querySelector("#crm-card");
  drawer.hidden = false;
  const phone = customer.phone ? `<a href="tel:${customer.phone}">${escapeHtml(customer.phone_display)}</a>` : "нет телефона";
  drawer.innerHTML = `
    <div class="drawer-head">
      <div><h2>${escapeHtml(customer.name || "Без имени")}</h2><span class="muted small">${phone}${customer.telegram_username ? ` · @${escapeHtml(customer.telegram_username)}` : ""}</span></div>
      <button class="ghost" type="button" data-close>×</button>
    </div>
    <div class="kpis compact">
      <div class="kpi"><span>Выполнено заказов</span><b>${customer.orders_count}</b></div>
      <div class="kpi"><span>Сумма</span><b>${money(customer.total_spent)}</b></div>
      <div class="kpi"><span>Средний чек</span><b>${money(customer.avg_check)}</b></div>
      <div class="kpi"><span>Бонусы</span><b>${money(customer.bonus.balance)}</b><small>${escapeHtml(customer.bonus.level.title)} · ${customer.bonus.level.percent}%</small></div>
    </div>
    <p class="muted small">С нами с ${date(customer.first_order_at || customer.created_at)} · источник: ${escapeHtml(customer.source)}${customer.is_registered ? " · есть аккаунт" : " · гость"}</p>
    <form id="crm-edit" class="form-grid">
      <label class="field-label">Имя<input class="field" name="name" value="${escapeHtml(customer.name)}" /></label>
      <label class="field-label">Метки через запятую<input class="field" name="tags" value="${escapeHtml(customer.tags.join(", "))}" placeholder="офис, острое, аллергия на орехи" /></label>
      <label class="field-label">Заметка<textarea class="field" name="note" rows="3" placeholder="Что важно помнить об этом клиенте">${escapeHtml(customer.note)}</textarea></label>
      <label class="check"><input type="checkbox" name="is_blocked" ${customer.is_blocked ? "checked" : ""} /> Заблокировать заказы</label>
      <div class="actions"><button class="btn primary">Сохранить</button><button class="btn subtle" type="button" data-bonus>Начислить или списать бонусы</button></div>
    </form>
    ${customer.favourites.length ? `<h3>Любит</h3><p>${customer.favourites.map((item) => `${escapeHtml(item.title)} ×${item.quantity}`).join(", ")}</p>` : ""}
    ${customer.addresses.length ? `<h3>Адреса</h3><ul class="plain">${customer.addresses.map((address) => `<li>${address.label ? `<b>${escapeHtml(address.label)}:</b> ` : ""}${escapeHtml(address.text)}${address.apartment ? `, кв. ${escapeHtml(address.apartment)}` : ""}</li>`).join("")}</ul>` : ""}
    <h3>Заказы</h3>
    <ul class="plain history">${
      customer.orders
        .map(
          (order) =>
            `<li><span>${dateTime(order.created_at)} · № ${escapeHtml(order.number)}</span><span class="chip ${statusTone(order.status)}">${STATUS_LABELS[order.status]}</span><b>${money(order.total_amount)}</b></li>`,
        )
        .join("") || "<li class='muted'>Заказов нет</li>"
    }</ul>
    <h3>Бонусы</h3>
    <ul class="plain history">${
      customer.bonus.history
        .map((row) => `<li><span>${dateTime(row.created_at)} · ${escapeHtml(row.comment)}</span><b class="${Number(row.amount) < 0 ? "minus" : "plus"}">${Number(row.amount) > 0 ? "+" : ""}${money(row.amount)}</b></li>`)
        .join("") || "<li class='muted'>Движений нет</li>"
    }</ul>`;
  drawer.querySelector("[data-close]").addEventListener("click", () => {
    drawer.hidden = true;
    history.replaceState({}, "", "/admin/customers");
  });
  drawer.querySelector("#crm-edit").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(`/api/v1/admin/customers/${customer.id}`, {
        method: "PATCH",
        body: {
          name: data.get("name"),
          note: data.get("note"),
          tags: data.get("tags").split(",").map((tag) => tag.trim()).filter(Boolean),
          is_blocked: data.get("is_blocked") === "on",
        },
      });
      toast("Карточка сохранена");
      await Promise.all([load(), openCard(customer.id)]);
    } catch (error) {
      showError(error);
    }
  });
  drawer.querySelector("[data-bonus]").addEventListener("click", async () => {
    const answer = await ask({
      title: "Бонусы вручную",
      text: "Положительное число — начислить, отрицательное — списать.",
      fields: [
        { name: "amount", label: "Сумма", type: "number", value: "100" },
        { name: "comment", label: "За что", value: "", presets: ["Извинение за опоздание", "Подарок на день рождения", "Ошибка в заказе"] },
      ],
      submit: "Провести",
    });
    if (!answer) return;
    try {
      await api(`/api/v1/admin/customers/${customer.id}/bonus`, { method: "POST", body: { amount: Number(answer.amount), comment: answer.comment } });
      toast("Бонусы проведены");
      await openCard(customer.id);
    } catch (error) {
      showError(error);
    }
  });
}
