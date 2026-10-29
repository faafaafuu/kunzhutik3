"""Online payment: the page to pay an order, ЮKassa's notifications, and the way back from ЮKassa's page."""

from html import escape
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.core.errors import ApiError
from app.models.order import Order
from app.services import payments
from app.services.notifications import notify_new_order
from app.services.orders import load_order

router = APIRouter(tags=["payments"])


@router.post("/api/v1/orders/{order_id}/pay")
def pay_order(order_id: UUID, embedded: bool = False, db: Session = Depends(get_db)) -> dict:
    """How to pay an order that waits for money: {"token"} for ЮKassa's widget on the site (embedded=true),
    {"url"} of ЮKassa's page otherwise. The order id is the access key, as for the order itself."""
    return payments.payment_link(db, load_order(db, order_id), embedded=embedded)


@router.post("/api/v1/payments/yookassa/webhook")
def yookassa_webhook(background: BackgroundTasks, payload: dict = Body(...), db: Session = Depends(get_db)) -> dict:
    """Set in the ЮKassa cabinet: Интеграция → HTTP-уведомления, events payment.succeeded, payment.canceled, refund.succeeded."""
    if not payments.configured():
        return {"status": "ignored"}
    paid = payments.handle_notification(db, payload)
    if paid:
        background.add_task(notify_new_order, paid.id)
    return {"status": "ok"}


PAY_PAGE = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Оплата заказа № {number} · Брайт</title><link rel="icon" type="image/png" href="/static/favicon.png">
<link rel="preconnect" href="https://yookassa.ru"><link rel="preconnect" href="https://yoomoney.ru">
<style>
body {{ margin: 0; background: #f4f4f6; color: #1c1c1e; font: 500 16px/1.5 -apple-system, system-ui, sans-serif; }}
.wrap {{ max-width: 520px; margin: 0 auto; padding: 20px 16px 40px; }}
h1 {{ font-size: 22px; margin: 4px 0 2px; }} .muted {{ color: #62666f; font-size: 14px; }}
.card {{ background: #fff; border-radius: 24px; padding: 16px; margin-top: 16px; }}
.done {{ display: none; text-align: center; padding: 24px 8px; }} .done a {{ display: inline-block; margin-top: 12px; padding: 14px 28px; border-radius: 999px; background: #ff6900; color: #fff; text-decoration: none; font-weight: 600; }}
</style></head>
<body><div class="wrap">
<div class="muted">Брайт · заказ № {number}</div>
<h1>Оплата {total} ₽</h1>
<div class="muted">Выберите способ — картой, по СБП или SberPay.</div>
<div class="card"><div class="muted" id="wait" style="text-align:center;padding:32px 0">Загружаем способы оплаты…</div><div id="widget"></div>
<div class="done" id="done"><h1>Оплачено</h1><div class="muted">Заказ уже передан в кафе.</div><a href="{back}">Вернуться к заказу</a></div></div>
</div>
<script src="https://yookassa.ru/checkout-widget/v1/checkout-widget.js"></script>
<script>
const widget = new window.YooMoneyCheckoutWidget({{
  confirmation_token: "{token}",
  return_url: "{return_url}",
  customization: {{ colors: {{ control_primary: "#FF6900" }} }},
  error_callback: function () {{ location.reload(); }},
}});
widget.on("success", function () {{ widget.destroy(); document.getElementById("done").style.display = "block"; }});
widget.on("fail", function () {{ widget.destroy(); location.reload(); }});
widget.render("widget").then(function () {{ document.getElementById("wait").remove(); }});
</script></body></html>"""


@router.get("/pay/{order_id}", include_in_schema=False)
def pay_page(order_id: UUID, db: Session = Depends(get_db)):
    """ЮKassa's widget on our own page: the app opens it in an in-app browser, the same list of payment methods
    as on the site's order screen. A paid or cancelled order goes back to the order instead."""
    order = db.get(Order, order_id)
    if not order:
        return HTMLResponse("Заказ не найден", status_code=404)
    back = f"{payments.APP_SCHEME}://order/{order_id}" if order.source in ("ios", "android") else f"{settings.app_base_url.rstrip('/')}/order/{order_id}"
    try:
        confirmation = payments.payment_link(db, load_order(db, order_id), embedded=True)
    except ApiError:
        return pay_return(order_id, db)
    page = PAY_PAGE.format(
        number=escape(order.number),
        total=f"{int(order.total_amount):,}".replace(",", " "),
        token=escape(confirmation["token"]),
        return_url=escape(f"{settings.app_base_url.rstrip('/')}/pay/return/{order_id}"),
        back=escape(back),
    )
    return HTMLResponse(page, headers={"Cache-Control": "no-store"})


@router.get("/pay/return/{order_id}", include_in_schema=False)
def pay_return(order_id: UUID, db: Session = Depends(get_db)):
    """Where ЮKassa sends the customer after the payment page: back to the order, on the site or in the app."""
    order = db.get(Order, order_id)
    if order and order.source in ("ios", "android"):
        target = f"{payments.APP_SCHEME}://order/{order_id}"
        return HTMLResponse(
            f'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<meta http-equiv="refresh" content="0;url={escape(target)}"><title>Брайт</title>'
            f'<body style="font-family:system-ui;text-align:center;padding:48px 24px">'
            f'<p><a href="{escape(target)}" style="font-size:20px">Вернуться в приложение</a></p></body>'
        )
    return RedirectResponse(f"{settings.app_base_url.rstrip('/')}/order/{order_id}", status_code=303)
