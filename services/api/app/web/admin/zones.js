// Delivery zones on a map: draw, drag the vertices, add or cut a piece around a few houses, set prices.
// An address outside every zone gets no delivery. Pieces are merged with Turf (union / difference).

import { api, ask, can, escapeHtml, money, showError, toast } from "./core.js";

const DAYS = [
  ["mon", "Пн"],
  ["tue", "Вт"],
  ["wed", "Ср"],
  ["thu", "Чт"],
  ["fri", "Пт"],
  ["sat", "Сб"],
  ["sun", "Вс"],
];
const COLORS = ["#ff6900", "#245d9e", "#157a42", "#8f5a0b", "#c2343a", "#6b4fd8"];

const local = { root: null, map: null, venue: null, layers: new Map(), selected: null, draft: null, checkMarker: null, venueMarker: null, tool: null, history: [] };

const HINTS = {
  edit: "Тяните белые точки, чтобы сдвинуть границу. Полупрозрачная точка на стороне — новый изгиб. Правый клик по точке — убрать её.",
  add: "Обведите дома, которые нужно добавить: ставьте точки и замкните контур на первой. Участок сольётся с зоной.",
  cut: "Обведите кусок, который нужно убрать: начните и закончите снаружи зоны.",
};

export async function mount(root) {
  local.root = root;
  const editable = can("manager");
  root.innerHTML = `
    <div class="toolbar">
      <h1>Зоны доставки</h1>
      <form class="check-form" id="check-form">
        <input class="field" name="q" placeholder="Проверить адрес: Солнечногорск, ул. Красная, 1" />
        <button class="btn subtle">Проверить</button>
      </form>
    </div>
    <p class="notice-line muted small" id="check-result">Нажмите на карту, чтобы проверить точку. Адрес вне всех зон — доставки туда нет.</p>
    <div class="zones-layout">
      <div class="map-wrap">
        <div id="map"></div>
        <div class="map-tools" id="map-tools" hidden>
          <button class="btn sm" type="button" data-tool="add">＋ Добавить участок</button>
          <button class="btn sm" type="button" data-tool="cut">− Вырезать участок</button>
          <button class="btn sm subtle" type="button" id="tool-undo" disabled>↶ Отменить шаг</button>
        </div>
        <p class="map-hint" id="map-hint" hidden></p>
      </div>
      <aside class="zones-side">
        <div class="card" id="zone-list"></div>
        <div class="card" id="zone-form" hidden></div>
        <div class="card" id="venue-form"></div>
      </aside>
    </div>`;
  root.querySelector("#check-form").addEventListener("submit", onCheckAddress);
  root.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => startTool(button.dataset.tool)));
  root.querySelector("#tool-undo").addEventListener("click", undo);
  if (!editable) root.querySelector(".zones-layout").classList.add("read-only");
  await load();
}

export function unmount() {
  local.map?.remove();
  local.map = null;
  local.layers.clear();
  local.root = null;
}

async function load() {
  const { venues } = await api("/api/v1/admin/venues");
  local.venue = venues[0];
  if (!local.venue) {
    local.root.querySelector("#zone-list").innerHTML = "<p>Нет ни одной точки.</p>";
    return;
  }
  setupMap();
  renderZones();
  renderVenueForm();
}

function setupMap() {
  const venue = local.venue;
  if (!local.map) {
    local.map = L.map("map", { zoomControl: true }).setView([venue.latitude, venue.longitude], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(local.map);
    local.map.pm.setLang("ru");
    local.map.pm.setGlobalOptions({ snappable: true, allowSelfIntersection: false });
    local.map.on("pm:create", onDrawn);
    local.map.on("pm:drawend", onDrawEnd);
    local.map.on("click", (event) => {
      if (local.map.pm.globalDrawModeEnabled()) return;
      checkPoint(event.latlng.lat, event.latlng.lng);
    });
  }
  local.layers.forEach((layer) => layer.remove());
  local.layers.clear();
  for (const zone of venue.zones) addZoneLayer(zone);

  local.venueMarker?.remove();
  local.venueMarker = L.marker([venue.latitude, venue.longitude], { draggable: can("manager"), title: venue.title })
    .addTo(local.map)
    .bindTooltip(`${escapeHtml(venue.title)}${can("manager") ? "<br><small>перетащите, чтобы поправить</small>" : ""}`);
  local.venueMarker.on("dragend", async () => {
    const { lat, lng } = local.venueMarker.getLatLng();
    try {
      await api(`/api/v1/admin/venues/${venue.id}`, { method: "PATCH", body: { latitude: round(lat), longitude: round(lng) } });
      venue.latitude = lat;
      venue.longitude = lng;
      toast("Точка на карте сохранена");
    } catch (error) {
      showError(error);
    }
  });
  const group = L.featureGroup([...local.layers.values()]);
  if (local.layers.size) local.map.fitBounds(group.getBounds().pad(0.15));
}

function addZoneLayer(zone) {
  const layer = L.polygon(
    zone.polygon.map(([lng, lat]) => [lat, lng]),
    { color: zone.color, weight: 2, fillOpacity: zone.is_active ? 0.18 : 0.05, dashArray: zone.is_active ? null : "6 6" },
  ).addTo(local.map);
  layer.bindTooltip(`${escapeHtml(zone.title)} · ${money(zone.delivery_fee)}`, { sticky: true });
  layer.on("click", (event) => {
    // While an outline is being drawn the click is a point of it, even inside a zone.
    if (local.map.pm.globalDrawModeEnabled()) return;
    L.DomEvent.stopPropagation(event);
    selectZone(zone.id);
  });
  layer.on("pm:edit", () => changed(layer));
  local.layers.set(zone.id, layer);
}

function renderZones() {
  const editable = can("manager");
  const zones = local.venue.zones;
  local.root.querySelector("#zone-list").innerHTML = `
    <div class="row-head"><h2>${escapeHtml(local.venue.title)}</h2></div>
    <div class="zone-items">
      ${
        zones.length
          ? zones
              .map(
                (zone) => `
        <button type="button" class="zone-item ${local.selected === zone.id ? "active" : ""}" data-zone="${zone.id}">
          <i style="background:${escapeHtml(zone.color)}"></i>
          <span><b>${escapeHtml(zone.title)}</b>${zone.is_active ? "" : ' <span class="chip">выключена</span>'}
          <small>доставка ${money(zone.delivery_fee)}${zone.free_delivery_from ? `, бесплатно от ${money(zone.free_delivery_from)}` : ""} · мин. ${money(zone.min_order_amount)} · ~${zone.eta_minutes} мин</small></span>
        </button>`,
              )
              .join("")
          : `<p class="muted">Зон нет — доставка никуда не работает. Нарисуйте первую.</p>`
      }
    </div>
    ${
      editable
        ? `<div class="actions">
            <button class="btn primary sm" type="button" id="draw-zone">Нарисовать зону</button>
            <button class="btn subtle sm" type="button" id="circle-zone">Круг вокруг точки</button>
          </div>`
        : ""
    }`;
  local.root.querySelectorAll("[data-zone]").forEach((button) => button.addEventListener("click", () => selectZone(button.dataset.zone)));
  local.root.querySelector("#draw-zone")?.addEventListener("click", startDrawing);
  local.root.querySelector("#circle-zone")?.addEventListener("click", addCircleZone);
}

function selectZone(zoneId) {
  cancelDraft();
  local.layers.forEach((layer, id) => {
    layer.pm.disable();
    layer.setStyle({ weight: id === zoneId ? 4 : 2 });
  });
  local.selected = zoneId;
  const zone = local.venue.zones.find((item) => item.id === zoneId);
  const layer = local.layers.get(zoneId);
  if (can("manager")) startEditing(layer);
  local.map.fitBounds(layer.getBounds().pad(0.2));
  renderZones();
  renderZoneForm(zone);
}

function renderZoneForm(zone, isNew = false) {
  const form = local.root.querySelector("#zone-form");
  const editable = can("manager");
  form.hidden = false;
  form.innerHTML = `
    <form id="zone-edit" class="form-grid">
      <h2>${isNew ? "Новая зона" : escapeHtml(zone.title)}</h2>
      ${editable ? `<p class="muted small">${isNew ? "Поправьте контур на карте и заполните условия." : "Границу правьте прямо на карте: тяните точки или добавьте/вырежьте участок кнопками над картой."}</p>` : ""}
      <label class="field-label">Название<input class="field" name="title" value="${escapeHtml(zone.title)}" required /></label>
      <div class="fields-2">
        <label class="field-label">Доставка, ₽<input class="field" name="delivery_fee" type="number" min="0" step="1" value="${Number(zone.delivery_fee)}" /></label>
        <label class="field-label">Бесплатно от, ₽<input class="field" name="free_delivery_from" type="number" min="0" step="1" value="${zone.free_delivery_from ? Number(zone.free_delivery_from) : ""}" placeholder="никогда" /></label>
        <label class="field-label">Мин. заказ, ₽<input class="field" name="min_order_amount" type="number" min="0" step="1" value="${Number(zone.min_order_amount)}" /></label>
        <label class="field-label">Везём, мин<input class="field" name="eta_minutes" type="number" min="5" step="5" value="${zone.eta_minutes}" /></label>
        <label class="field-label">Приоритет<input class="field" name="priority" type="number" step="1" value="${zone.priority}" title="Если зоны пересекаются, побеждает больший" /></label>
        <label class="field-label">Цвет<input class="field color" name="color" type="color" value="${escapeHtml(zone.color)}" /></label>
      </div>
      <label class="check"><input type="checkbox" name="is_active" ${zone.is_active ? "checked" : ""} /> Зона работает</label>
      ${
        editable
          ? `<div class="actions">
              <button class="btn primary" type="submit">Сохранить</button>
              ${isNew ? `<button class="btn subtle" type="button" id="zone-cancel">Отмена</button>` : `<button class="btn danger" type="button" id="zone-delete">Удалить</button>`}
            </div>`
          : ""
      }
    </form>`;
  form.querySelectorAll("input, button").forEach((element) => (element.disabled = !editable && element.type !== "button"));
  form.querySelector("#zone-edit").addEventListener("submit", (event) => {
    event.preventDefault();
    saveZone(zone, isNew);
  });
  form.querySelector("#zone-delete")?.addEventListener("click", () => deleteZone(zone));
  form.querySelector("#zone-cancel")?.addEventListener("click", () => {
    cancelDraft();
    form.hidden = true;
  });
  form.querySelector("[name=color]").addEventListener("input", (event) => {
    const layer = isNew ? local.draft : local.layers.get(zone.id);
    layer?.setStyle({ color: event.target.value });
  });
}

function markDirty() {
  const submit = local.root?.querySelector("#zone-edit [type=submit]");
  if (submit) submit.textContent = "Сохранить изменения";
}

function zoneBody(form, layer) {
  const data = new FormData(form);
  const ring = layer.getLatLngs()[0].map((point) => [round(point.lng), round(point.lat)]);
  return {
    title: data.get("title").trim(),
    color: data.get("color"),
    polygon: ring,
    delivery_fee: Number(data.get("delivery_fee") || 0),
    free_delivery_from: data.get("free_delivery_from") === "" ? null : Number(data.get("free_delivery_from")),
    min_order_amount: Number(data.get("min_order_amount") || 0),
    eta_minutes: Number(data.get("eta_minutes") || 30),
    priority: Number(data.get("priority") || 0),
    is_active: data.get("is_active") === "on",
  };
}

async function saveZone(zone, isNew) {
  const form = local.root.querySelector("#zone-edit");
  const layer = isNew ? local.draft : local.layers.get(zone.id);
  try {
    const body = zoneBody(form, layer);
    if (isNew) {
      const { zone: created } = await api(`/api/v1/admin/venues/${local.venue.id}/zones`, { method: "POST", body });
      local.draft.remove();
      local.draft = null;
      local.selected = created.id;
    } else {
      await api(`/api/v1/admin/zones/${zone.id}`, { method: "PUT", body });
    }
    toast("Зона сохранена");
    await reload();
  } catch (error) {
    showError(error);
  }
}

async function deleteZone(zone) {
  const answer = await ask({ title: `Удалить зону «${zone.title}»?`, text: "Адреса из неё перестанут получать доставку.", submit: "Удалить", tone: "danger" });
  if (!answer) return;
  try {
    await api(`/api/v1/admin/zones/${zone.id}`, { method: "DELETE" });
    local.selected = null;
    local.root.querySelector("#zone-form").hidden = true;
    toast("Зона удалена");
    await reload();
  } catch (error) {
    showError(error);
  }
}

async function reload() {
  const { venues } = await api("/api/v1/admin/venues");
  local.venue = venues.find((venue) => venue.id === local.venue.id) || venues[0];
  setupMap();
  renderZones();
  if (local.selected && local.layers.has(local.selected)) selectZone(local.selected);
}

function newZoneDefaults() {
  return {
    title: `Зона ${local.venue.zones.length + 1}`,
    color: COLORS[local.venue.zones.length % COLORS.length],
    delivery_fee: "150.00",
    free_delivery_from: "1500.00",
    min_order_amount: "700.00",
    eta_minutes: 40,
    priority: 0,
    is_active: true,
  };
}

function startDrawing() {
  cancelDraft();
  stopEditing();
  local.layers.forEach((layer) => layer.pm.disable());
  toast("Ставьте точки на карте. Замкните контур на первой точке.");
  local.map.pm.enableDraw("Polygon", { pathOptions: { color: COLORS[local.venue.zones.length % COLORS.length] } });
}

function onDrawn(event) {
  if (local.tool) {
    applyPiece(event.layer);
    return;
  }
  local.draft = event.layer;
  local.draft.on("pm:edit", () => changed(local.draft));
  startEditing(local.draft);
  renderZoneForm(newZoneDefaults(), true);
}

async function addCircleZone() {
  const answer = await ask({ title: "Зона кругом", text: "Круг вокруг точки — потом его можно подправить мышью.", fields: [{ name: "km", label: "Радиус, км", type: "number", value: "3" }], submit: "Создать" });
  if (!answer) return;
  cancelDraft();
  const km = Number(answer.km) || 3;
  const points = [];
  for (let step = 0; step < 24; step += 1) {
    const angle = (2 * Math.PI * step) / 24;
    points.push([
      local.venue.latitude + (km / 111.32) * Math.cos(angle),
      local.venue.longitude + (km / (111.32 * Math.cos((local.venue.latitude * Math.PI) / 180))) * Math.sin(angle),
    ]);
  }
  const defaults = newZoneDefaults();
  local.draft = L.polygon(points, { color: defaults.color, weight: 3, fillOpacity: 0.18 }).addTo(local.map);
  local.draft.on("pm:edit", () => changed(local.draft));
  startEditing(local.draft);
  local.map.fitBounds(local.draft.getBounds().pad(0.2));
  renderZoneForm({ ...defaults, title: `До ${km} км` }, true);
}

function cancelDraft() {
  if (local.draft) {
    local.draft.remove();
    local.draft = null;
    stopEditing();
  }
  local.map?.pm.disableDraw();
}

// ---- editing the border ----

function editingLayer() {
  return local.draft || (local.selected && local.layers.get(local.selected)) || null;
}

function ringOf(layer) {
  return layer.getLatLngs()[0].map((point) => [point.lng, point.lat]);
}

function setRing(layer, ring) {
  layer.pm.disable();
  layer.setLatLngs(ring.map(([lng, lat]) => [lat, lng]));
  if (!local.tool) layer.pm.enable({ allowSelfIntersection: false });
}

function startEditing(layer) {
  layer.pm.enable({ allowSelfIntersection: false });
  local.tool = null;
  local.history = [ringOf(layer)];
  renderTools();
}

function stopEditing() {
  local.tool = null;
  local.history = [];
  renderTools();
}

function changed(layer) {
  local.history.push(ringOf(layer));
  markDirty();
  renderTools();
}

function undo() {
  const layer = editingLayer();
  if (!layer || local.history.length < 2) return;
  local.history.pop();
  setRing(layer, local.history[local.history.length - 1]);
  markDirty();
  renderTools();
}

function startTool(tool) {
  const layer = editingLayer();
  if (!layer) return;
  if (local.tool === tool) {
    local.map.pm.disableDraw();
    return;
  }
  // The zone's own handles would catch the clicks meant for the new outline: hide them while drawing.
  layer.pm.disable();
  local.tool = tool;
  local.map.pm.enableDraw("Polygon", { pathOptions: { color: tool === "add" ? "#157a42" : "#c2343a", dashArray: "6 6", fillOpacity: 0.12 } });
  renderTools();
}

/** Drawing ended — finished, cancelled with the button or Esc: the zone's handles come back. */
function onDrawEnd() {
  if (!local.tool && !local.history.length) return;
  local.tool = null;
  const layer = editingLayer();
  if (layer && !layer.pm.enabled()) layer.pm.enable({ allowSelfIntersection: false });
  renderTools();
}

/** Merges the drawn piece into the zone or cuts it out; the zone stays one polygon without holes. */
function applyPiece(piece) {
  const tool = local.tool;
  const layer = editingLayer();
  piece.remove();
  local.tool = null;
  renderTools();
  if (!layer) return;
  const closed = (ring) => turf.polygon([[...ring, ring[0]]]);
  const shapes = turf.featureCollection([closed(ringOf(layer)), closed(ringOf(piece))]);
  const result = tool === "add" ? turf.union(shapes) : turf.difference(shapes);
  if (!result) {
    toast("Так от зоны ничего не останется", "bad");
    return;
  }
  if (result.geometry.type !== "Polygon") {
    toast(tool === "add" ? "Участок должен касаться зоны или заходить на неё" : "Зона распадётся на части — вырежьте кусок поменьше", "bad");
    return;
  }
  if (result.geometry.coordinates.length > 1) {
    toast("Вырезать можно только с края: дырку внутри зоны сделать нельзя", "bad");
    return;
  }
  setRing(layer, result.geometry.coordinates[0].slice(0, -1));
  changed(layer);
  toast(tool === "add" ? "Участок добавлен — не забудьте сохранить" : "Участок вырезан — не забудьте сохранить", "accent");
}

function renderTools() {
  if (!local.root) return;
  const editing = Boolean(editingLayer()) && can("manager") && (local.history.length > 0 || local.tool);
  const tools = local.root.querySelector("#map-tools");
  const hint = local.root.querySelector("#map-hint");
  tools.hidden = !editing;
  hint.hidden = !editing;
  hint.textContent = HINTS[local.tool || "edit"];
  tools.querySelectorAll("[data-tool]").forEach((button) => {
    const active = local.tool === button.dataset.tool;
    button.classList.toggle("primary", active);
    button.textContent = active ? "Отмена" : button.dataset.tool === "add" ? "＋ Добавить участок" : "− Вырезать участок";
  });
  tools.querySelector("#tool-undo").disabled = local.history.length < 2;
}

// ---- address check ----

async function onCheckAddress(event) {
  event.preventDefault();
  const query = new FormData(event.currentTarget).get("q").trim();
  if (!query) return;
  try {
    showCheck(await api(`/api/v1/admin/zones/check?q=${encodeURIComponent(query)}`));
  } catch (error) {
    showError(error);
  }
}

async function checkPoint(lat, lon) {
  try {
    showCheck(await api(`/api/v1/admin/zones/check?lat=${lat}&lon=${lon}`));
  } catch (error) {
    showError(error);
  }
}

function showCheck(result) {
  const line = local.root.querySelector("#check-result");
  if (!result.latitude) {
    line.textContent = result.message;
    line.className = "notice-line bad";
    return;
  }
  const label = result.found ? `${result.found.text}: ` : "";
  line.textContent = result.inside ? `✓ ${label}${result.message}` : `✕ ${label}${result.message}`;
  line.className = `notice-line ${result.inside ? "good" : "bad"}`;
  local.checkMarker?.remove();
  local.checkMarker = L.circleMarker([result.latitude, result.longitude], {
    radius: 9,
    color: result.inside ? "#157a42" : "#c2343a",
    fillOpacity: 0.9,
  }).addTo(local.map);
  if (result.found) local.map.setView([result.latitude, result.longitude], Math.max(local.map.getZoom(), 14));
}

// ---- venue settings ----

function renderVenueForm() {
  const venue = local.venue;
  const editable = can("manager");
  const hours = venue.working_hours || {};
  const rows = DAYS.map(([day, label]) => {
    const interval = (hours[day] || [])[0];
    return `<div class="hours-row">
      <span>${label}</span>
      <input class="field" type="time" name="${day}-from" value="${interval ? interval[0] : ""}" />
      <input class="field" type="time" name="${day}-to" value="${interval ? interval[1] : ""}" />
      <label class="check small"><input type="checkbox" name="${day}-off" ${interval ? "" : "checked"} /> выходной</label>
    </div>`;
  }).join("");
  const form = local.root.querySelector("#venue-form");
  form.innerHTML = `
    <form id="venue-edit" class="form-grid">
      <h2>Точка</h2>
      <label class="field-label">Название<input class="field" name="title" value="${escapeHtml(venue.title)}" /></label>
      <label class="field-label">Адрес<input class="field" name="address" value="${escapeHtml(venue.address)}" /></label>
      <div class="fields-2">
        <label class="field-label">Телефон<input class="field" name="phone" value="${escapeHtml(venue.phone)}" /></label>
        <label class="field-label">Готовим, мин<input class="field" name="cook_minutes" type="number" min="1" value="${venue.cook_minutes}" /></label>
      </div>
      <label class="check"><input type="checkbox" name="pickup_enabled" ${venue.pickup_enabled ? "checked" : ""} /> Самовывоз</label>
      <label class="check"><input type="checkbox" name="is_active" ${venue.is_active ? "checked" : ""} /> Принимает заказы</label>
      <h3>График</h3>
      <div class="hours">${rows}</div>
      <p class="muted small">Сейчас: ${venue.is_open ? "открыто" : "закрыто"} · ${escapeHtml(venue.hours_text)}</p>
      ${editable ? `<div class="actions"><button class="btn primary" type="submit">Сохранить точку</button></div>` : ""}
    </form>`;
  form.querySelectorAll("input").forEach((input) => (input.disabled = !editable));
  form.querySelector("#venue-edit").addEventListener("submit", saveVenue);
}

async function saveVenue(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const working_hours = {};
  for (const [day] of DAYS) {
    const from = data.get(`${day}-from`);
    const to = data.get(`${day}-to`);
    working_hours[day] = data.get(`${day}-off`) === "on" || !from || !to ? [] : [[from, to]];
  }
  try {
    await api(`/api/v1/admin/venues/${local.venue.id}`, {
      method: "PATCH",
      body: {
        title: data.get("title").trim(),
        address: data.get("address").trim(),
        phone: data.get("phone").trim(),
        cook_minutes: Number(data.get("cook_minutes")),
        pickup_enabled: data.get("pickup_enabled") === "on",
        is_active: data.get("is_active") === "on",
        working_hours,
      },
    });
    toast("Точка сохранена");
    await reload();
    renderVenueForm();
  } catch (error) {
    showError(error);
  }
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}
