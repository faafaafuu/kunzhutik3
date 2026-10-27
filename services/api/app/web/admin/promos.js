// Promo codes: create, switch off, see how many times each was used.

import { api, date, escapeHtml, money, showError, toast } from "./core.js";

const local = { root: null };

export async function mount(root) {
  local.root = root;
  root.innerHTML = `
    <div class="toolbar"><h1>Промокоды</h1></div>
    <div class="two-columns">
      <div class="card table-card"><table class="table" id="promo-table"></table></div>
      <form class="card form-grid" id="promo-form">
        <h2>Новый промокод</h2>
        <label class="field-label">Код<input class="field" name="code" required pattern="[A-Za-z0-9_-]+" placeholder="WELCOME" /></label>
        <div class="fields-2">
          <label class="field-label">Тип<select class="field" name="kind"><option value="percent">Процент</option><option value="fixed">Рубли</option></select></label>
          <label class="field-label">Скидка<input class="field" name="value" type="number" min="1" required value="10" /></label>
          <label class="field-label">Заказ от, ₽<input class="field" name="min_order_amount" type="number" min="0" value="0" /></label>
          <label class="field-label">Всего использований<input class="field" name="max_uses" type="number" min="1" placeholder="без ограничений" /></label>
          <label class="field-label">Действует с<input class="field" name="starts_at" type="date" /></label>
          <label class="field-label">по<input class="field" name="ends_at" type="date" /></label>
        </div>
        <label class="check"><input type="checkbox" name="once_per_customer" checked /> Один раз на номер телефона</label>
        <label class="field-label">Заметка<input class="field" name="note" placeholder="для кого и зачем" /></label>
        <button class="btn primary">Создать</button>
      </form>
    </div>`;
  root.querySelector("#promo-form").addEventListener("submit", create);
  root.querySelector("#promo-table").addEventListener("click", toggle);
  await load();
}

export function unmount() {
  local.root = null;
}

async function load() {
  const { promo_codes } = await api("/api/v1/admin/promo-codes");
  local.root.querySelector("#promo-table").innerHTML = promo_codes.length
    ? `<thead><tr><th>Код</th><th>Скидка</th><th>Условия</th><th class="num">Использован</th><th></th></tr></thead><tbody>${promo_codes
        .map(
          (promo) => `<tr class="${promo.is_active ? "" : "is-off"}">
        <td><b>${escapeHtml(promo.code)}</b>${promo.note ? `<br><small class="muted">${escapeHtml(promo.note)}</small>` : ""}</td>
        <td>${promo.kind === "percent" ? `${Number(promo.value)}%` : money(promo.value)}</td>
        <td class="small">${Number(promo.min_order_amount) ? `от ${money(promo.min_order_amount)}` : "любой заказ"}${promo.once_per_customer ? ", 1 раз на клиента" : ""}${
          promo.ends_at ? `, до ${date(promo.ends_at)}` : ""
        }</td>
        <td class="num">${promo.uses}${promo.max_uses ? ` из ${promo.max_uses}` : ""}</td>
        <td><button class="btn sm ${promo.is_active ? "subtle" : "primary"}" data-promo="${promo.id}" data-active="${!promo.is_active}">${promo.is_active ? "Выключить" : "Включить"}</button></td>
      </tr>`,
        )
        .join("")}</tbody>`
    : `<tr><td class="empty">Промокодов нет</td></tr>`;
}

async function create(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const day = (value, end) => (value ? new Date(`${value}T${end ? "23:59:59" : "00:00:00"}`).toISOString() : null);
  try {
    await api("/api/v1/admin/promo-codes", {
      method: "POST",
      body: {
        code: data.get("code").trim(),
        kind: data.get("kind"),
        value: Number(data.get("value")),
        min_order_amount: Number(data.get("min_order_amount") || 0),
        max_uses: data.get("max_uses") ? Number(data.get("max_uses")) : null,
        starts_at: day(data.get("starts_at"), false),
        ends_at: day(data.get("ends_at"), true),
        once_per_customer: data.get("once_per_customer") === "on",
        note: data.get("note").trim(),
      },
    });
    event.currentTarget.reset();
    toast("Промокод создан");
    await load();
  } catch (error) {
    showError(error);
  }
}

async function toggle(event) {
  const button = event.target.closest("[data-promo]");
  if (!button) return;
  try {
    await api(`/api/v1/admin/promo-codes/${button.dataset.promo}?is_active=${button.dataset.active}`, { method: "PATCH" });
    await load();
  } catch (error) {
    showError(error);
  }
}
