"""Online payment: the page to pay an order, ЮKassa's notifications, and the way back from ЮKassa's page."""

from html import escape
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.models.order import Order
from app.services import payments
from app.services.notifications import notify_new_order
from app.services.orders import load_order

router = APIRouter(tags=["payments"])


@router.post("/api/v1/orders/{order_id}/pay")
def pay_order(order_id: UUID, db: Session = Depends(get_db)) -> dict:
    """The ЮKassa page for an order that waits for money (the order id is the access key, as for the order itself)."""
    return {"url": payments.payment_link(db, load_order(db, order_id))}


@router.post("/api/v1/payments/yookassa/webhook")
def yookassa_webhook(background: BackgroundTasks, payload: dict = Body(...), db: Session = Depends(get_db)) -> dict:
    """Set in the ЮKassa cabinet: Интеграция → HTTP-уведомления, events payment.succeeded, payment.canceled, refund.succeeded."""
    if not payments.configured():
        return {"status": "ignored"}
    paid = payments.handle_notification(db, payload)
    if paid:
        background.add_task(notify_new_order, paid.id)
    return {"status": "ok"}


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
