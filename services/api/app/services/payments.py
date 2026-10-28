"""Online payment through ЮKassa (yookassa.ru/developers).

An online order starts as «Ждёт оплаты» and reaches the kitchen only when ЮKassa confirms the money.
The confirmation comes two ways, whichever is first: the HTTP notification (webhook) and a check
of the payment when the customer's screen polls the order. Neither is trusted by what it says: the
payment is always fetched from ЮKassa with the shop's credentials, and its amount and the order it
belongs to (metadata.order_id) are compared with ours.

This module does not import services.orders (orders imports it for refunds); the one status change it
makes itself — «Ждёт оплаты» → «Новый» — is written here.
"""

from __future__ import annotations

import logging
import uuid
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError, money, money_str
from app.models.order import Order, OrderStatusEvent

logger = logging.getLogger(__name__)

API = "https://api.yookassa.ru/v3"
APP_SCHEME = "bright"


def configured() -> bool:
    return bool(settings.yookassa_shop_id and settings.yookassa_secret_key)


def _request(method: str, path: str, *, json: dict | None = None, key: str | None = None) -> dict:
    headers = {"Idempotence-Key": key} if key else {}
    try:
        response = httpx.request(method, f"{API}{path}", json=json, headers=headers, auth=(settings.yookassa_shop_id or "", settings.yookassa_secret_key or ""), timeout=15)
    except httpx.HTTPError as exc:
        logger.warning("ЮKassa %s %s failed: %s", method, path, exc.__class__.__name__)
        raise ApiError("payment_unavailable", "Платёжный сервис не отвечает, попробуйте ещё раз", status=502) from exc
    if response.status_code >= 400:
        logger.error("ЮKassa %s %s answered %s: %s", method, path, response.status_code, response.text[:500])
        raise ApiError("payment_failed", "Не получилось начать оплату. Попробуйте ещё раз или выберите оплату при получении", status=502)
    return response.json()


# ---------- the receipt (54-ФЗ) ----------


def _cents(value) -> int:
    return int((money(value) * 100).to_integral_value())


def _amount(cents: int) -> dict:
    return {"value": f"{Decimal(cents) / 100:.2f}", "currency": "RUB"}


def _item(description: str, quantity: int, unit_cents: int, subject: str) -> dict:
    return {
        "description": description[:128],
        "quantity": quantity,
        "amount": _amount(unit_cents),
        "vat_code": settings.yookassa_vat_code,
        "payment_mode": "full_payment",
        "payment_subject": subject,
    }


def _spread(amount: int, weights: list[int]) -> list[int]:
    """Splits `amount` in proportion to `weights` in whole cents; the parts add up to `amount` exactly."""
    total = sum(weights)
    raw = [amount * weight for weight in weights]
    parts = [value // total for value in raw]
    leftover = amount - sum(parts)
    for index in sorted(range(len(weights)), key=lambda i: raw[i] % total, reverse=True)[:leftover]:
        parts[index] += 1
    return parts


def receipt_items(order: Order) -> list[dict]:
    """Receipt lines that add up to the order total to the cent.

    A discount or paid-with-bonuses part is shared out between the dishes in proportion to their price
    (a receipt has no negative lines), and a line whose per-unit price would come out fractional is
    split in two: some units one cent dearer. If anything does not add up, the whole order goes as one line.
    """
    total = _cents(order.total_amount)
    fee = _cents(order.delivery_fee)
    discount = _cents(order.discount_total) + _cents(order.bonus_spent)
    lines = [(item.title, item.quantity, _cents(item.line_total)) for item in order.items]
    subtotal = sum(price for _, _, price in lines)

    items: list[dict] = []
    if lines and 0 <= discount < subtotal and subtotal - discount + fee == total:
        nets = [price - share for (_, _, price), share in zip(lines, _spread(discount, [price for _, _, price in lines]))]
        if all(net > 0 for net in nets):
            for (title, quantity, _), net in zip(lines, nets):
                unit, extra = divmod(net, quantity)
                if extra:
                    items.append(_item(title, extra, unit + 1, "commodity"))
                    items.append(_item(title, quantity - extra, unit, "commodity"))
                else:
                    items.append(_item(title, quantity, unit, "commodity"))
            if fee:
                items.append(_item("Доставка", 1, fee, "service"))
    if not items:
        items = [_item(f"Заказ № {order.number}", 1, total, "commodity")]
    return items


def build_receipt(order: Order) -> dict | None:
    if not settings.yookassa_send_receipt:
        return None
    receipt: dict = {"customer": {"phone": order.customer_phone.lstrip("+")}, "items": receipt_items(order)}
    if settings.yookassa_tax_system_code:
        receipt["tax_system_code"] = settings.yookassa_tax_system_code
    return receipt


# ---------- paying ----------


def start_payment(db: Session, order: Order) -> str:
    """A new payment for an order that waits for money. Returns the ЮKassa page to send the customer to."""
    body: dict = {
        "amount": _amount(_cents(order.total_amount)),
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": f"{settings.app_base_url.rstrip('/')}/pay/return/{order.id}"},
        "description": f"Заказ № {order.number} · {settings.app_name}"[:128],
        "metadata": {"order_id": str(order.id), "number": order.number},
    }
    receipt = build_receipt(order)
    if receipt:
        body["receipt"] = receipt
    payment = _request("POST", "/payments", json=body, key=f"{order.id}:{uuid.uuid4().hex[:12]}")
    order.payment_id = payment["id"]
    order.payment_status = "pending"
    db.commit()
    return payment["confirmation"]["confirmation_url"]


def payment_link(db: Session, order: Order) -> str:
    """The page to pay an order: the live payment's own, or a fresh payment when the last one failed or expired."""
    if order.payment_method != "online" or order.status != "pending_payment":
        raise ApiError("payment_not_needed", "Этот заказ не ждёт оплаты", status=409)
    if not configured():
        raise ApiError("payment_unavailable", "Онлайн-оплата сейчас недоступна", status=503)
    if order.payment_id:
        try:
            payment = _request("GET", f"/payments/{order.payment_id}")
        except ApiError:
            payment = None
        if payment:
            apply_payment(db, order, payment)
            if order.status != "pending_payment":
                raise ApiError("payment_not_needed", "Заказ уже оплачен", status=409)
            url = (payment.get("confirmation") or {}).get("confirmation_url")
            if payment.get("status") == "pending" and url:
                return url
    return start_payment(db, order)


def apply_payment(db: Session, order: Order, payment: dict) -> bool:
    """Brings the order in line with a payment fetched from ЮKassa. True when this paid the order just now."""
    status = payment.get("status")
    if status == "succeeded" and payment.get("paid"):
        amount = payment.get("amount") or {}
        if amount.get("currency") != "RUB" or Decimal(str(amount.get("value", "-1"))) != money(order.total_amount):
            logger.error("ЮKassa payment %s: amount %s does not match order %s (%s)", payment.get("id"), amount, order.number, order.total_amount)
            return False
        return _paid(db, order, payment)
    if status == "canceled" and payment.get("id") == order.payment_id and order.payment_status == "pending":
        # The customer can start another payment from the order screen until the order expires.
        order.payment_status = "failed"
        db.commit()
    return False


def _paid(db: Session, order: Order, payment: dict) -> bool:
    locked = db.query(Order).filter(Order.id == order.id).populate_existing().with_for_update().one()
    if locked.payment_status == "paid":
        if locked.payment_id != payment["id"]:
            _refund(payment["id"], payment["amount"], locked, key=f"duplicate:{payment['id']}")  # paid twice: the second goes back
        return False
    locked.payment_id = payment["id"]
    locked.payment_status = "paid"
    if locked.status in ("cancelled", "rejected"):
        # Paid after the order was cancelled or expired: the money goes back.
        db.commit()
        refund_order(db, locked)
        return False
    if locked.status != "pending_payment":
        db.commit()
        return False
    locked.status = "new"
    db.add(OrderStatusEvent(order_id=locked.id, from_status="pending_payment", to_status="new", actor="yookassa", comment="Оплачен онлайн"))
    db.commit()
    return True


def sync_payment(db: Session, order: Order) -> bool:
    """Asks ЮKassa about an unpaid online order. True when it turned out paid just now."""
    if not configured() or order.status != "pending_payment" or order.payment_method != "online" or not order.payment_id:
        return False
    try:
        return apply_payment(db, order, _request("GET", f"/payments/{order.payment_id}"))
    except ApiError:
        return False


def handle_notification(db: Session, payload: dict) -> Order | None:
    """A ЮKassa webhook. Returns the order it has just paid, if any. ApiError (→ HTTP 502) makes ЮKassa retry."""
    event = str(payload.get("event", ""))
    obj = payload.get("object") or {}
    payment_id = obj.get("payment_id") if event.startswith("refund.") else obj.get("id")
    if not payment_id or not event.startswith(("payment.", "refund.")):
        return None
    payment = _request("GET", f"/payments/{payment_id}")  # never believe the body, ask ЮKassa
    try:
        order = db.get(Order, uuid.UUID(str((payment.get("metadata") or {}).get("order_id", ""))))
    except ValueError:
        order = None
    if not order:
        logger.warning("ЮKassa payment %s belongs to no order of ours", payment_id)
        return None
    paid_now = apply_payment(db, order, payment)
    refunded = (payment.get("refunded_amount") or {}).get("value")
    if event == "refund.succeeded" and refunded and order.payment_status == "paid" and Decimal(str(refunded)) >= money(order.total_amount):
        order.payment_status = "refunded"
        db.commit()
    return order if paid_now else None


# ---------- refunds ----------


def _refund(payment_id: str, amount: dict, order: Order, *, key: str) -> dict | None:
    body: dict = {"payment_id": payment_id, "amount": amount, "description": f"Возврат по заказу № {order.number}"[:250]}
    receipt = build_receipt(order)
    if receipt:
        body["receipt"] = receipt
    try:
        return _request("POST", "/refunds", json=body, key=key)
    except ApiError:
        logger.error("Refund of ЮKassa payment %s (order %s) failed: return the money by hand in the ЮKassa cabinet", payment_id, order.number)
        return None


def refund_order(db: Session, order: Order) -> None:
    """The whole payment back to the customer: a paid order that was cancelled or refused."""
    if not configured() or order.payment_status != "paid" or not order.payment_id:
        return
    refund = _refund(order.payment_id, _amount(_cents(order.total_amount)), order, key=f"refund:{order.payment_id}")
    if refund and refund.get("status") == "succeeded":
        order.payment_status = "refunded"
        db.commit()
