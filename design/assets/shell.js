// Design-only helper for the static screens. Not part of the product.
//   ?app=1            render as the Expo app: hide web-only chrome, show the tab bar
//   ?state=<id>       show only the frame with data-state="<id>" (used by mobile/app.html)
//   ?tg=1             render as the Telegram WebApp (no tab bar chrome of our own beyond app-mode)
//   ?theme=dark       dark theme
(function () {
  const q = new URLSearchParams(location.search);
  if (q.get("theme")) document.documentElement.dataset.theme = q.get("theme");
  if (q.get("app")) document.body.classList.add("app-mode");
  if (q.get("tg")) document.body.classList.add("telegram-mode", "app-mode");
  const only = q.get("state");
  if (only) {
    document.body.classList.add("single-state");
    document.querySelectorAll(".spec-head, .spec-state, .spec-note").forEach((el) => el.remove());
    document.querySelectorAll("[data-state]").forEach((el) => { if (el.dataset.state !== only) el.remove(); });
    const style = document.createElement("style");
    style.textContent = ".spec-page{padding:0;background:var(--surface)}.frame{width:100%!important;margin:0!important;border-radius:0!important;box-shadow:none!important;min-height:100vh}.row-frames{width:100%;margin:0}body.app-mode .frame.overlay{padding:0;min-height:100vh;align-items:end}body.app-mode .frame .product-dialog{width:100%;height:100vh;border-radius:0}body.app-mode .frame .cart-drawer{width:100%;height:100vh;border-radius:0}";
    document.head.appendChild(style);
  }
  // Toggle demo: aria-pressed / aria-checked buttons flip on click so states can be felt.
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-toggle]");
    if (!t) return;
    const attr = t.hasAttribute("aria-checked") ? "aria-checked" : "aria-pressed";
    if (t.dataset.toggle === "one") t.parentElement.querySelectorAll("[data-toggle]").forEach((b) => b.setAttribute(attr, "false"));
    t.setAttribute(attr, String(t.getAttribute(attr) !== "true"));
  });
})();
