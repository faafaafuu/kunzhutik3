// Shared helpers of the operator panel: API calls, formatting, toasts.

export const STATUS_LABELS = {
  pending_payment: "Ждёт оплаты",
  new: "Новый",
  confirmed: "Принят",
  preparing: "Готовится",
  ready: "Готов",
  delivering: "В пути",
  completed: "Выполнен",
  cancelled: "Отменён",
  rejected: "Отказ",
};

export const ACTION_LABELS = {
  confirmed: "Принять",
  rejected: "Отказать",
  preparing: "Готовим",
  ready: "Готов",
  delivering: "Передан курьеру",
  completed: "Выдан",
  cancelled: "Отменить",
};

export const ROLE_RANK = { operator: 1, manager: 2, admin: 3 };

export const state = { user: null };

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || {};
  }
}

export async function api(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) {
    window.location.href = "/admin/login";
    throw new ApiError(401, "auth", "Нужно войти");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.error || {};
    throw new ApiError(response.status, error.code || "error", error.message || payload.detail || `${response.status} ${response.statusText}`, error.details);
  }
  return payload;
}

export function can(role) {
  return state.user && ROLE_RANK[state.user.role] >= ROLE_RANK[role];
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

export function money(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value || 0)) + " ₽";
}

export function time(value) {
  return value ? new Intl.DateTimeFormat("ru-RU", { timeStyle: "short" }).format(new Date(value)) : "";
}

export function dateTime(value) {
  return value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
}

export function date(value) {
  return value ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "—";
}

export function minutesAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  return dateTime(value);
}

export function statusTone(status) {
  if (["completed"].includes(status)) return "good";
  if (["cancelled", "rejected"].includes(status)) return "bad";
  if (status === "new") return "warn";
  if (["confirmed", "preparing", "ready", "delivering"].includes(status)) return "info";
  return "";
}

let toastTimer = null;
export function toast(message, tone = "") {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.className = `toast ${tone}`;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (element.hidden = true), 3500);
}

export function showError(error) {
  console.error(error);
  toast(error.message || "Что-то пошло не так", "bad");
}

export function phone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return value || "";
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
}

export function modLabel(mod) {
  const title = mod.kind === "remove" ? mod.title.toLowerCase() : mod.title;
  return mod.quantity > 1 ? `${title} ×${mod.quantity}` : title;
}

// A small form dialog. fields: [{name, label, type, value, options}] → resolves with values or null.
export function ask({ title, text = "", fields = [], submit = "Готово", tone = "primary" }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ask";
    dialog.innerHTML = `
      <form method="dialog" class="ask-form">
        <h2>${escapeHtml(title)}</h2>
        ${text ? `<p class="muted">${escapeHtml(text)}</p>` : ""}
        ${fields
          .map((field) => {
            if (field.type === "select") {
              const options = field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === field.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
              return `<label class="field-label">${escapeHtml(field.label)}<select class="field" name="${field.name}">${options}</select></label>`;
            }
            if (field.type === "textarea") {
              return `<label class="field-label">${escapeHtml(field.label)}<textarea class="field" name="${field.name}" rows="3">${escapeHtml(field.value || "")}</textarea></label>`;
            }
            return `<label class="field-label">${escapeHtml(field.label)}<input class="field" name="${field.name}" type="${field.type || "text"}" value="${escapeHtml(field.value ?? "")}" ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ""} /></label>`;
          })
          .join("")}
        ${field_presets(fields)}
        <div class="actions">
          <button class="btn ${tone}" value="ok">${escapeHtml(submit)}</button>
          <button class="btn subtle" value="cancel" formnovalidate>Отмена</button>
        </div>
      </form>`;
    document.body.append(dialog);
    dialog.addEventListener("click", (event) => {
      const preset = event.target.closest("[data-preset]");
      if (!preset) return;
      const input = dialog.querySelector(`[name="${preset.dataset.field}"]`);
      input.value = preset.dataset.preset;
    });
    dialog.addEventListener("close", () => {
      const values = {};
      dialog.querySelectorAll("[name]").forEach((input) => (values[input.name] = input.value));
      dialog.remove();
      resolve(dialog.returnValue === "ok" ? values : null);
    });
    dialog.showModal();
    dialog.querySelector("input, textarea, select")?.focus();
  });
}

function field_presets(fields) {
  return fields
    .filter((field) => field.presets)
    .map((field) => `<div class="presets">${field.presets.map((preset) => `<button type="button" class="chip" data-field="${field.name}" data-preset="${escapeHtml(preset)}">${escapeHtml(preset)}</button>`).join("")}</div>`)
    .join("");
}
