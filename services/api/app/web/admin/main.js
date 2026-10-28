import { api, can, showError, state } from "./core.js";
import * as customers from "./customers.js";
import * as menu from "./menu.js";
import * as orders from "./orders.js";
import * as promos from "./promos.js";
import * as promotions from "./promotions.js";
import * as users from "./users.js";
import * as zones from "./zones.js";

const SECTIONS = { orders, zones, menu, customers, promos, promotions, users };
const REQUIRED_ROLE = { customers: "manager", promos: "manager", promotions: "manager", users: "admin" };

let current = null;

init().catch(showError);

async function init() {
  state.user = await api("/api/v1/admin/auth/me");
  document.getElementById("who").textContent = `${state.user.username} · ${{ operator: "оператор", manager: "менеджер", admin: "администратор" }[state.user.role]}`;
  document.querySelectorAll("[data-role]").forEach((link) => (link.hidden = !can(link.dataset.role)));
  document.getElementById("logout-button").addEventListener("click", async () => {
    await fetch("/api/v1/admin/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  });
  document.getElementById("sections").addEventListener("click", (event) => {
    const link = event.target.closest("[data-section]");
    if (!link || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    history.pushState({}, "", link.href);
    route();
  });
  window.addEventListener("popstate", route);
  orders.watchNewOrders();
  route();
}

function route() {
  let name = window.location.pathname.split("/")[2] || "orders";
  if (!SECTIONS[name] || (REQUIRED_ROLE[name] && !can(REQUIRED_ROLE[name]))) name = "orders";
  document.querySelectorAll("[data-section]").forEach((link) => link.classList.toggle("active", link.dataset.section === name));
  current?.unmount?.();
  const view = document.getElementById("view");
  view.className = `shell section-${name}`;
  view.innerHTML = "";
  current = SECTIONS[name];
  current.mount(view).catch(showError);
}
