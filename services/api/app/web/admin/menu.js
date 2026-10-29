// Menu of the venue: stop-list in one click, prices and badges for managers.

import { api, ask, can, escapeHtml, money, pickVenue, rememberVenue, showError, toast, venueSelect } from "./core.js";

const local = { root: null, venue: null, items: [], query: "" };

export async function mount(root) {
  local.root = root;
  root.innerHTML = `
    <div class="toolbar">
      <h1>Меню и стоп-лист</h1>
      <span id="venue-picker"></span>
      <input class="field search-field" id="menu-search" type="search" placeholder="Поиск блюда" />
    </div>
    <p class="muted small">Стоп-лист — у каждой точки свой. «Закончилось» — блюдо пропадает из меню этой точки, пока не вернёте. «До конца дня» само вернётся утром.</p>
    <div class="card table-card"><table class="table" id="menu-table"></table></div>`;
  root.querySelector("#menu-search").addEventListener("input", (event) => {
    local.query = event.target.value.trim().toLowerCase();
    render();
  });
  root.querySelector("#menu-table").addEventListener("click", onClick);
  const { venues } = await api("/api/v1/admin/venues");
  local.venue = pickVenue(venues);
  const picker = root.querySelector("#venue-picker");
  picker.innerHTML = venueSelect(venues, local.venue);
  picker.querySelector("select")?.addEventListener("change", (event) => {
    local.venue = venues.find((venue) => venue.id === event.target.value);
    rememberVenue(local.venue.id);
    load().catch(showError);
  });
  await load();
}

export function unmount() {
  local.root = null;
}

async function load() {
  const { items } = await api(`/api/v1/admin/venues/${local.venue.id}/menu`);
  local.items = items;
  render();
}

function render() {
  const manager = can("manager");
  const items = local.items.filter((item) => !local.query || item.title.toLowerCase().includes(local.query) || item.category.toLowerCase().includes(local.query));
  let category = "";
  const rows = items
    .map((item) => {
      const header = item.category !== category ? `<tr class="group"><th colspan="5">${escapeHtml((category = item.category))}</th></tr>` : "";
      const stop = item.is_available
        ? `<button class="btn sm subtle" data-stop="${item.id}">Закончилось</button><button class="btn sm subtle" data-stop-today="${item.id}">До конца дня</button>`
        : `<span class="chip bad">${item.unavailable_until ? `стоп до ${new Date(item.unavailable_until).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "закончилось"}</span>
           <button class="btn sm primary" data-back="${item.id}">Вернуть</button>`;
      const badges = ["hit", "new"]
        .map((badge) => {
          const on = item.badges.includes(badge);
          return manager
            ? `<button class="chip ${on ? "accent" : ""}" data-badge="${badge}" data-item="${item.id}">${badge === "hit" ? "Хит" : "Новинка"}</button>`
            : on
              ? `<span class="chip accent">${badge === "hit" ? "Хит" : "Новинка"}</span>`
              : "";
        })
        .join(" ");
      return `${header}
        <tr class="${item.is_available ? "" : "is-off"} ${item.is_active ? "" : "is-hidden"}">
          <td class="thumb-cell">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="" />` : ""}</td>
          <td><b>${escapeHtml(item.title)}</b>${item.weight ? ` <span class="muted small">${escapeHtml(item.weight)}</span>` : ""}${item.is_active ? "" : ' <span class="chip">скрыто</span>'}<div class="badges-cell">${badges}</div></td>
          <td class="num">${money(item.price)}${item.price_override ? `<br><small class="muted">база ${money(item.base_price)}</small>` : ""}${
            manager ? `<br><button class="link-button small" data-price="${item.id}">изменить</button>` : ""
          }</td>
          <td class="actions-cell">${stop}</td>
          <td>${manager ? `<button class="link-button small" data-visible="${item.id}">${item.is_active ? "Скрыть из меню" : "Показать"}</button>` : ""}</td>
        </tr>`;
    })
    .join("");
  local.root.querySelector("#menu-table").innerHTML = rows || `<tr><td class="empty">Ничего не нашли</td></tr>`;
}

function endOfDay() {
  const moment = new Date();
  moment.setHours(23, 59, 0, 0);
  return moment.toISOString();
}

async function onClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  const venueItem = (id, body) => api(`/api/v1/admin/venues/${local.venue.id}/menu/${id}`, { method: "PATCH", body });
  try {
    if (target.dataset.stop) await venueItem(target.dataset.stop, { is_available: false });
    else if (target.dataset.stopToday) await venueItem(target.dataset.stopToday, { is_available: false, unavailable_until: endOfDay() });
    else if (target.dataset.back) await venueItem(target.dataset.back, { is_available: true });
    else if (target.dataset.badge) {
      const item = local.items.find((entry) => entry.id === target.dataset.item);
      const badges = item.badges.includes(target.dataset.badge) ? item.badges.filter((badge) => badge !== target.dataset.badge) : [...item.badges, target.dataset.badge];
      await api(`/api/v1/admin/menu/items/${item.id}`, { method: "PATCH", body: { badges } });
    } else if (target.dataset.visible) {
      const item = local.items.find((entry) => entry.id === target.dataset.visible);
      await api(`/api/v1/admin/menu/items/${item.id}`, { method: "PATCH", body: { is_active: !item.is_active } });
    } else if (target.dataset.price) {
      const item = local.items.find((entry) => entry.id === target.dataset.price);
      const answer = await ask({
        title: item.title,
        text: "Базовая цена — для всей сети. Цена точки — только здесь; пусто — как в сети.",
        fields: [
          { name: "base", label: "Цена сети, ₽", type: "number", value: Number(item.base_price) },
          { name: "override", label: "Цена этой точки, ₽", type: "number", value: item.price_override ? Number(item.price_override) : "" },
        ],
        submit: "Сохранить",
      });
      if (!answer) return;
      if (Number(answer.base) !== Number(item.base_price)) {
        await api(`/api/v1/admin/menu/items/${item.id}`, { method: "PATCH", body: { price: Number(answer.base) } });
      }
      await venueItem(item.id, answer.override === "" ? { clear_price_override: true } : { price_override: Number(answer.override) });
    } else return;
    toast("Сохранено");
    await load();
  } catch (error) {
    showError(error);
  }
}
