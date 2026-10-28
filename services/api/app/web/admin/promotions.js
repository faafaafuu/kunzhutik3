// «Акции» on the home screen: cards with a title, a line of text, a colour and what a tap does.

import { api, ask, escapeHtml, showError, toast } from "./core.js";

const ACCENTS = { brand: "Оранжевая", sesame: "Жёлтая", good: "Зелёная", info: "Синяя" };
const ACTIONS = { none: "Ничего — просто информация", promo: "Применить промокод в корзине", referral: "Открыть «Приведи друга»", welcome: "Войти и получить бонусы" };

const local = { root: null, rows: [], editing: null };

export async function mount(root) {
  local.root = root;
  root.innerHTML = `
    <div class="toolbar"><h1>Акции на главной</h1></div>
    <div class="two-columns">
      <div class="card table-card"><table class="table" id="promotion-table"></table></div>
      <form class="card form-grid" id="promotion-form"></form>
    </div>`;
  root.querySelector("#promotion-table").addEventListener("click", onTableClick);
  renderForm(null);
  await load();
}

export function unmount() {
  local.root = null;
}

async function load() {
  const { promotions } = await api("/api/v1/admin/promotions");
  local.rows = promotions;
  local.root.querySelector("#promotion-table").innerHTML = promotions.length
    ? `<thead><tr><th>Карточка</th><th>По нажатию</th><th class="num">Порядок</th><th></th></tr></thead><tbody>${promotions
        .map(
          (row) => `<tr class="${row.is_active ? "" : "is-off"}">
        <td><span class="promo-dot accent-${row.accent}"></span><b>${escapeHtml(row.title)}</b>${row.text ? `<br><small class="muted">${escapeHtml(row.text)}</small>` : ""}</td>
        <td class="small">${escapeHtml(ACTIONS[row.action] || row.action)}${row.promo_code ? ` · <b>${escapeHtml(row.promo_code)}</b>` : ""}</td>
        <td class="num">${row.sort}</td>
        <td class="actions-cell">
          <button class="btn sm subtle" type="button" data-edit="${row.id}">Изменить</button>
          <button class="btn sm ${row.is_active ? "subtle" : "primary"}" type="button" data-toggle="${row.id}">${row.is_active ? "Скрыть" : "Показать"}</button>
          <button class="btn sm danger" type="button" data-delete="${row.id}">Удалить</button>
        </td>
      </tr>`,
        )
        .join("")}</tbody>`
    : `<tr><td class="empty">Акций нет — на главной блок не показывается</td></tr>`;
}

function renderForm(row) {
  local.editing = row;
  const form = local.root.querySelector("#promotion-form");
  const value = (key, fallback = "") => escapeHtml(row?.[key] ?? fallback);
  const options = (map, current) => Object.entries(map).map(([key, label]) => `<option value="${key}" ${key === current ? "selected" : ""}>${label}</option>`).join("");
  const day = (iso) => (iso ? iso.slice(0, 10) : "");
  form.innerHTML = `
    <h2>${row ? "Изменить акцию" : "Новая акция"}</h2>
    <label class="field-label">Заголовок<input class="field" name="title" required maxlength="80" value="${value("title")}" placeholder="−10% на первый заказ" /></label>
    <label class="field-label">Текст<input class="field" name="text" maxlength="240" value="${value("text")}" placeholder="Одна строка: что и на каких условиях" /></label>
    <div class="fields-2">
      <label class="field-label">Цвет<select class="field" name="accent">${options(ACCENTS, row?.accent || "brand")}</select></label>
      <label class="field-label">Порядок<input class="field" name="sort" type="number" value="${value("sort", 100)}" title="Меньше — левее" /></label>
    </div>
    <label class="field-label">По нажатию<select class="field" name="action">${options(ACTIONS, row?.action || "none")}</select></label>
    <label class="field-label" id="promo-code-field">Промокод<input class="field" name="promo_code" value="${value("promo_code")}" placeholder="из раздела «Промокоды»" /></label>
    <div class="fields-2">
      <label class="field-label">Показывать с<input class="field" name="starts_at" type="date" value="${day(row?.starts_at)}" /></label>
      <label class="field-label">по<input class="field" name="ends_at" type="date" value="${day(row?.ends_at)}" /></label>
    </div>
    <label class="check"><input type="checkbox" name="is_active" ${row ? (row.is_active ? "checked" : "") : "checked"} /> Показывать на главной</label>
    <div class="actions">
      <button class="btn primary">${row ? "Сохранить" : "Создать"}</button>
      ${row ? `<button class="btn subtle" type="button" id="promotion-cancel">Отмена</button>` : ""}
    </div>`;
  const syncCode = () => (form.querySelector("#promo-code-field").hidden = form.querySelector("[name=action]").value !== "promo");
  form.querySelector("[name=action]").addEventListener("change", syncCode);
  syncCode();
  form.onsubmit = save;
  form.querySelector("#promotion-cancel")?.addEventListener("click", () => renderForm(null));
}

async function save(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const day = (value, end) => (value ? new Date(`${value}T${end ? "23:59:59" : "00:00:00"}`).toISOString() : null);
  const body = {
    title: data.get("title").trim(),
    text: data.get("text").trim(),
    accent: data.get("accent"),
    action: data.get("action"),
    promo_code: data.get("action") === "promo" ? data.get("promo_code").trim() : null,
    sort: Number(data.get("sort") || 100),
    is_active: data.get("is_active") === "on",
    starts_at: day(data.get("starts_at"), false),
    ends_at: day(data.get("ends_at"), true),
  };
  try {
    if (local.editing) await api(`/api/v1/admin/promotions/${local.editing.id}`, { method: "PUT", body });
    else await api("/api/v1/admin/promotions", { method: "POST", body });
    toast(local.editing ? "Акция сохранена" : "Акция создана");
    renderForm(null);
    await load();
  } catch (error) {
    showError(error);
  }
}

async function onTableClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const row = local.rows.find((item) => item.id === (button.dataset.edit || button.dataset.toggle || button.dataset.delete));
  if (!row) return;
  try {
    if (button.dataset.edit) {
      renderForm(row);
      return;
    }
    if (button.dataset.toggle) {
      const { id, uses, ...rest } = row;
      await api(`/api/v1/admin/promotions/${row.id}`, { method: "PUT", body: { ...rest, is_active: !row.is_active } });
    } else {
      const answer = await ask({ title: `Удалить акцию «${row.title}»?`, text: "Она пропадёт с главной. Можно вместо этого скрыть.", submit: "Удалить", tone: "danger" });
      if (!answer) return;
      await api(`/api/v1/admin/promotions/${row.id}`, { method: "DELETE" });
    }
    await load();
  } catch (error) {
    showError(error);
  }
}
