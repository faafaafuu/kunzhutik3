"""Orders: creation with a readable daily number, the status machine and what each status triggers."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ApiError, money, money_str
from app.models.customer import BonusTransaction, Customer, CustomerAddress
from app.models.order import Order, OrderItem, OrderStatusEvent
from app.models.venue import Venue
from app.schemas.orders import OrderCreateRequest
from app.services import loyalty
from app.services.customers import normalize_phone, upsert_by_phone
from app.services.notifications import PAYMENT_LABELS, STATUS_LABELS
from app.services.pricing import quote
from app.services.venues import utcnow

ACTIVE_STATUSES = ("pending_payment", "new", "confirmed", "preparing", "ready", "delivering")
FINAL_STATUSES = ("completed", "cancelled", "rejected")

# Who may move an order where. The kitchen/operator side; the customer may only cancel early.
STAFF_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "pending_payment": ("cancelled",),
    "new": ("confirmed", "rejected", "cancelled"),
    "confirmed": ("preparing", "ready", "rejected", "cancelled"),
    "preparing": ("ready", "cancelled"),
    "ready": ("delivering", "completed", "cancelled"),
    "delivering": ("completed", "cancelled"),
}
CUSTOMER_CANCELLABLE = ("pending_payment", "new", "confirmed")

TIMESTAMP_FIELDS = {
    "confirmed": "confirmed_at",
    "ready": "ready_at",
    "delivering": "picked_up_at",
    "completed": "completed_at",
    "cancelled": "cancelled_at",
    "rejected": "cancelled_at",
}


def staff_next_statuses(order: Order) -> list[str]:
    allowed = list(STAFF_TRANSITIONS.get(order.status, ()))
    if order.fulfillment == "pickup" and "delivering" in allowed:
        allowed.remove("delivering")
    return allowed


def load_order(db: Session, order_id) -> Order:
    order = db.query(Order).options(selectinload(Order.items), selectinload(Order.events)).filter(Order.id == order_id).first()
    if not order:
        raise ApiError("order_not_found", "Заказ не найден", status=404)
    return order


# ---------- creation ----------


def create_order(
    db: Session,
    request: OrderCreateRequest,
    *,
    customer: Customer | None,
    telegram_user_id: str | None = None,
    new_account: bool = False,
) -> Order:
    """new_account: a guest with a phone we have never seen — the order's delivery address goes into their new account."""
    phone = normalize_phone(request.customer_phone)
    name = request.customer_name.strip()
    if request.payment_method == "online":
        raise ApiError("payment_unavailable", "Онлайн-оплата пока не подключена — выберите оплату при получении", status=422)

    calc = quote(db, request, customer=customer, phone=phone)
    if not calc.lines:
        raise ApiError("cart_empty", "Корзина пуста", status=422)
    if calc.problems:
        problem = calc.problems[0]
        raise ApiError(problem.code, problem.message, status=422, details={**problem.details, "quote": calc.as_dict()})
    if money(request.expected_total) != calc.total_amount:
        raise ApiError(
            "price_changed",
            "Цена изменилась, проверьте заказ",
            status=409,
            details={"expected_total": money_str(request.expected_total), "quote": calc.as_dict()},
        )

    # One order at a time per venue: the daily number must not repeat.
    venue = db.query(Venue).filter(Venue.id == calc.venue.id).with_for_update().one()
    now = utcnow()
    business_date = now.astimezone(ZoneInfo(venue.timezone)).date()
    last_seq = db.query(func.max(Order.daily_seq)).filter(Order.venue_id == venue.id, Order.business_date == business_date).scalar() or 0
    seq = last_seq + 1

    owner = upsert_by_phone(db, phone, name, source=request.source, signed_in=customer)
    if owner.is_blocked:
        raise ApiError("customer_blocked", "Не получилось оформить заказ. Позвоните нам, пожалуйста", status=403)
    if calc.bonus_spent > 0:
        # Lock the customer so two orders cannot spend the same bonuses.
        db.query(Customer).filter(Customer.id == owner.id).with_for_update().one()
        if loyalty.balance(db, owner.id) < calc.bonus_spent:
            raise ApiError("price_changed", "Баланс бонусов изменился, проверьте заказ", status=409, details={"quote": calc.as_dict()})

    address = request.address if request.fulfillment == "delivery" else None
    order = Order(
        venue_id=venue.id,
        customer_id=owner.id,
        zone_id=calc.zone.id if calc.zone else None,
        business_date=business_date,
        daily_seq=seq,
        number=f"{seq:03d}",
        status="new",
        fulfillment=request.fulfillment,
        source=request.source,
        customer_name=name,
        customer_phone=phone,
        telegram_user_id=telegram_user_id or (customer.telegram_id if customer else None),
        address_text=address.text if address else "",
        address_lat=address.latitude if address else None,
        address_lon=address.longitude if address else None,
        address_details=request.address_details.model_dump() if address else {},
        payment_method=request.payment_method,
        payment_status="not_required",
        items_total=calc.items_total,
        discount_total=calc.discount_total,
        bonus_spent=calc.bonus_spent,
        delivery_fee=calc.delivery_fee or 0,
        total_amount=calc.total_amount,
        promo_code=calc.promo["code"] if calc.promo and calc.promo.get("applied") else None,
        comment=request.comment.strip(),
        scheduled_for=calc.scheduled_for,
        promised_at=calc.promised_at,
    )
    for position, line in enumerate(calc.lines):
        order.items.append(
            OrderItem(
                menu_item_id=line.item.id if line.item else None,
                position=position,
                title=line.title,
                image_url=line.image_url,
                unit_price=line.unit_price,
                quantity=line.quantity,
                line_total=line.line_total,
                modifiers=line.modifiers,
            )
        )
    order.events.append(OrderStatusEvent(from_status=None, to_status="new", actor=_actor_for(customer, telegram_user_id)))
    db.add(order)
    db.flush()
    if calc.bonus_spent > 0:
        db.add(BonusTransaction(customer_id=owner.id, order_id=order.id, kind="redeem", amount=-calc.bonus_spent, comment=f"Оплата заказа № {order.number}"))

    if address and ((customer and request.save_address) or new_account):
        _save_address(db, owner, request)
    db.commit()
    return load_order(db, order.id)


def _save_address(db: Session, customer: Customer, request: OrderCreateRequest) -> None:
    address = request.address
    exists = (
        db.query(CustomerAddress)
        .filter(CustomerAddress.customer_id == customer.id, CustomerAddress.text == address.text)
        .first()
    )
    if exists:
        return
    has_default = db.query(CustomerAddress).filter(CustomerAddress.customer_id == customer.id, CustomerAddress.is_default.is_(True)).first()
    db.add(
        CustomerAddress(
            customer_id=customer.id,
            label=request.address_label or "",
            text=address.text,
            latitude=address.latitude,
            longitude=address.longitude,
            is_default=not has_default,
            **request.address_details.model_dump(),
        )
    )


def _actor_for(customer: Customer | None, telegram_user_id: str | None) -> str:
    if telegram_user_id:
        return f"customer:telegram:{telegram_user_id}"
    if customer:
        return f"customer:{customer.id}"
    return "customer:guest"


# ---------- status machine ----------


def transition(
    db: Session,
    order: Order,
    to_status: str,
    *,
    actor: str,
    comment: str = "",
    by_customer: bool = False,
    promised_in_minutes: int | None = None,
) -> Order:
    if to_status not in STATUS_LABELS:
        raise ApiError("invalid_transition", f"Неизвестный статус {to_status}", status=422)
    if by_customer:
        allowed = ("cancelled",) if order.status in CUSTOMER_CANCELLABLE else ()
    else:
        allowed = staff_next_statuses(order)
    if to_status not in allowed:
        if by_customer:
            raise ApiError("cancel_not_allowed", "Заказ уже готовится — отменить можно по телефону кафе", status=409)
        raise ApiError(
            "invalid_transition",
            f"Нельзя перевести заказ из «{STATUS_LABELS[order.status]}» в «{STATUS_LABELS[to_status]}»",
            status=409,
            details={"allowed": staff_next_statuses(order)},
        )

    now = utcnow()
    previous = order.status
    order.status = to_status
    field = TIMESTAMP_FIELDS.get(to_status)
    if field:
        setattr(order, field, now)
    if to_status == "confirmed" and promised_in_minutes:
        order.promised_at = now + timedelta(minutes=promised_in_minutes)
    if to_status in ("cancelled", "rejected"):
        order.cancel_reason = comment.strip()
        loyalty.on_order_cancelled(db, order)
    if to_status == "completed":
        loyalty.on_order_completed(db, order)
    db.add(OrderStatusEvent(order_id=order.id, from_status=previous, to_status=to_status, actor=actor, comment=comment.strip()))
    db.commit()
    return load_order(db, order.id)


# ---------- payloads ----------


TIMELINE_DELIVERY = ["new", "preparing", "ready", "delivering", "completed"]
TIMELINE_PICKUP = ["new", "preparing", "ready", "completed"]


def timeline(order: Order) -> list[dict]:
    steps = TIMELINE_PICKUP if order.fulfillment == "pickup" else TIMELINE_DELIVERY
    titles = {"new": "Принят", "preparing": "Готовится", "ready": "Готов", "delivering": "В пути", "completed": "Выдан" if order.fulfillment == "pickup" else "Доставлен"}
    reached = {event.to_status: event.created_at for event in order.events}
    # "confirmed" sits between "new" and "preparing" and is shown as the first step.
    position = {"pending_payment": 0, "new": 0, "confirmed": 0, "preparing": 1, "ready": 2, "delivering": 3, "completed": len(steps) - 1}
    current = position.get(order.status, 0)
    if order.fulfillment == "pickup" and order.status == "completed":
        current = 3
    result = []
    for index, step in enumerate(steps):
        if order.status in ("cancelled", "rejected"):
            state = "now" if index == 0 else "todo"
        elif index < current or order.status == "completed":
            state = "done"
        elif index == current:
            state = "now"
        else:
            state = "todo"
        at = reached.get(step) or (reached.get("confirmed") if step == "new" else None)
        result.append({"status": step, "title": titles[step], "state": state, "at": at.isoformat() if at else None})
    return result


def order_payload(order: Order, venue: Venue | None = None, *, bonus_accrued=None) -> dict:
    return {
        "id": str(order.id),
        "number": order.number,
        "status": order.status,
        "status_label": STATUS_LABELS.get(order.status, order.status),
        "fulfillment": order.fulfillment,
        "source": order.source,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
        "promised_at": order.promised_at.isoformat() if order.promised_at else None,
        "scheduled_for": order.scheduled_for.isoformat() if order.scheduled_for else None,
        "completed_at": order.completed_at.isoformat() if order.completed_at else None,
        "venue": (
            {
                "id": str(venue.id),
                "title": venue.title,
                "address": venue.address,
                "phone": venue.phone,
                "latitude": float(venue.latitude),
                "longitude": float(venue.longitude),
            }
            if venue
            else None
        ),
        "items": [
            {
                "menu_item_id": str(item.menu_item_id) if item.menu_item_id else None,
                "title": item.title,
                "image_url": item.image_url,
                "unit_price": money_str(item.unit_price),
                "quantity": item.quantity,
                "line_total": money_str(item.line_total),
                "modifiers": item.modifiers,
            }
            for item in order.items
        ],
        "items_total": money_str(order.items_total),
        "discount_total": money_str(order.discount_total),
        "bonus_spent": money_str(order.bonus_spent),
        "delivery_fee": money_str(order.delivery_fee),
        "total_amount": money_str(order.total_amount),
        "promo_code": order.promo_code,
        "payment_method": order.payment_method,
        "payment_label": PAYMENT_LABELS.get(order.payment_method, order.payment_method),
        "payment_status": order.payment_status,
        "address_text": order.address_text,
        "address_details": order.address_details,
        "comment": order.comment,
        "cancel_reason": order.cancel_reason,
        "can_cancel": order.status in CUSTOMER_CANCELLABLE,
        "is_active": order.status in ACTIVE_STATUSES,
        "timeline": timeline(order),
        "bonus_accrued": money_str(bonus_accrued) if bonus_accrued else None,
    }


def admin_order_payload(order: Order, venue: Venue | None = None) -> dict:
    payload = order_payload(order, venue)
    payload.update(
        {
            "customer_id": str(order.customer_id) if order.customer_id else None,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "address_lat": float(order.address_lat) if order.address_lat is not None else None,
            "address_lon": float(order.address_lon) if order.address_lon is not None else None,
            "next_statuses": staff_next_statuses(order),
            "events": [
                {
                    "from": event.from_status,
                    "to": event.to_status,
                    "actor": event.actor,
                    "comment": event.comment,
                    "at": event.created_at.isoformat(),
                }
                for event in order.events
            ],
        }
    )
    return payload


def bonus_accrued_for(db: Session, order: Order):
    row = db.query(BonusTransaction).filter(BonusTransaction.order_id == order.id, BonusTransaction.kind == "accrual").first()
    return row.amount if row else None


def list_admin_orders(db: Session, *, status_group: str = "active", since: datetime | None = None, limit: int = 200) -> list[Order]:
    query = db.query(Order).options(selectinload(Order.items), selectinload(Order.events))
    if status_group == "active":
        query = query.filter(Order.status.in_(ACTIVE_STATUSES))
    elif status_group == "done":
        query = query.filter(Order.status.in_(FINAL_STATUSES))
    if since:
        query = query.filter(Order.created_at >= since)
    return query.order_by(Order.created_at.desc()).limit(limit).all()
