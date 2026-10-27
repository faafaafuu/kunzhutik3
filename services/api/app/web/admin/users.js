// Panel accounts: operators run the orders and the stop-list, managers also the menu, zones and CRM.

import { api, escapeHtml, showError, state, toast } from "./core.js";

const ROLES = { operator: "Оператор", manager: "Менеджер", admin: "Администратор" };
const local = { root: null };

export async function mount(root) {
  local.root = root;
  root.innerHTML = `
    <div class="toolbar"><h1>Сотрудники</h1></div>
    <div class="two-columns">
      <div class="card table-card"><table class="table" id="users-table"></table></div>
      <form class="card form-grid" id="user-form">
        <h2>Новый сотрудник</h2>
        <label class="field-label">Логин<input class="field" name="username" required autocomplete="off" /></label>
        <label class="field-label">Пароль<input class="field" name="password" type="password" minlength="8" required autocomplete="new-password" /></label>
        <label class="field-label">Роль<select class="field" name="role">${Object.entries(ROLES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
        <p class="muted small">Оператор — заказы и стоп-лист. Менеджер — ещё меню, зоны, клиенты и промокоды. Администратор — всё, включая сотрудников.</p>
        <button class="btn primary">Добавить</button>
      </form>
    </div>`;
  root.querySelector("#user-form").addEventListener("submit", create);
  root.querySelector("#users-table").addEventListener("click", toggle);
  await load();
}

export function unmount() {
  local.root = null;
}

async function load() {
  const { users } = await api("/api/v1/admin/users");
  local.root.querySelector("#users-table").innerHTML = `<thead><tr><th>Логин</th><th>Роль</th><th></th></tr></thead><tbody>${users
    .map(
      (user) => `<tr class="${user.is_active ? "" : "is-off"}">
      <td><b>${escapeHtml(user.username)}</b></td><td>${ROLES[user.role] || user.role}</td>
      <td>${user.username === state.user.username ? '<span class="muted small">это вы</span>' : `<button class="btn sm subtle" data-user="${user.id}" data-active="${!user.is_active}">${user.is_active ? "Отключить" : "Включить"}</button>`}</td>
    </tr>`,
    )
    .join("")}</tbody>`;
}

async function create(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await api("/api/v1/admin/users", { method: "POST", body: { username: data.get("username"), password: data.get("password"), role: data.get("role") } });
    event.currentTarget.reset();
    toast("Сотрудник добавлен");
    await load();
  } catch (error) {
    showError(error);
  }
}

async function toggle(event) {
  const button = event.target.closest("[data-user]");
  if (!button) return;
  try {
    await api(`/api/v1/admin/users/${button.dataset.user}?is_active=${button.dataset.active}`, { method: "PATCH" });
    await load();
  } catch (error) {
    showError(error);
  }
}
