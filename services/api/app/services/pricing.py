"""Order calculation. The single place where a total is computed — clients never compute it.

`quote` never fails on what is wrong with the cart: it returns the totals plus `problems`,
so the cart can show "Эклер закончился" or "ещё 320 ₽ до минимальной суммы" next to real
numbers. Creating an order refuses while any problem remains.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import ApiError, money, money_str
from app.models.customer import Customer
from app.models.menu import MenuItem
from app.models.order import Order, PromoCode
from app.models.venue import DeliveryZone, Venue
from app.schemas.orders import QuoteRequest
from app.services import loyalty
from app.services.menu import effective_price, is_available, load_items, venue_overrides
from app.services.venues import (
    closes_at,
    default_venue,
    get_venue,
    is_open,
    next_opening,
    resolve_delivery,
    time_slots,
    utcnow,
    venue_payload,
    zone_payload,
)

CLOSING_SOON_MINUTES = 40


@dataclass
class Problem:
    code: str
    message: str
    details: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "details": self.details}


@dataclass
class QuotedLine:
    item: MenuItem | None
    menu_item_id: str
    title: str
    image_url: str | None
    unit_price: Decimal
    quantity: int
    line_total: Decimal
    modifiers: list[dict]
    is_available: bool


@dataclass
class Quote:
    venue: Venue
    zone: DeliveryZone | None
    fulfillment: str
    lines: list[QuotedLine]
    items_total: Decimal
    discount_total: Decimal
    bonus_spent: Decimal
    bonus_available: Decimal | None
    delivery_fee: Decimal | None
    total_amount: Decimal
    promo: dict | None
    promised_at: datetime | None
    scheduled_for: datetime | None
    slots: list[datetime]
    bonus_accrual: Decimal
    problems: list[Problem]
    warnings: list[str]

    @property
    def can_order(self) -> bool:
        return not self.problems and bool(self.lines)

    def as_dict(self) -> dict:
        return {
            "venue": venue_payload(self.venue),
            "zone": zone_payload(self.zone) if self.zone else None,
            "fulfillment": self.fulfillment,
            "items": [
                {
                    "menu_item_id": line.menu_item_id,
                    "title": line.title,
                    "image_url": line.image_url,
                    "unit_price": money_str(line.unit_price),
                    "quantity": line.quantity,
                    "line_total": money_str(line.line_total),
                    "modifiers": line.modifiers,
                    "is_available": line.is_available,
                }
                for line in self.lines
            ],
            "items_total": money_str(self.items_total),
            "discount_total": money_str(self.discount_total),
            "bonus_spent": money_str(self.bonus_spent),
            "bonus_available": money_str(self.bonus_available) if self.bonus_available is not None else None,
            "delivery_fee": money_str(self.delivery_fee) if self.delivery_fee is not None else None,
            "total_amount": money_str(self.total_amount),
            "promo": self.promo,
            "min_order_amount": money_str(self.zone.min_order_amount) if self.zone else None,
            "free_delivery_from": money_str(self.zone.free_delivery_from) if self.zone and self.zone.free_delivery_from is not None else None,
            "promised_at": self.promised_at.isoformat() if self.promised_at else None,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "slots": [slot.isoformat() for slot in self.slots],
            "bonus_accrual": money_str(self.bonus_accrual),
            "problems": [problem.as_dict() for problem in self.problems],
            "warnings": self.warnings,
            "can_order": self.can_order,
        }


def quote(db: Session, request: QuoteRequest, *, customer: Customer | None = None, phone: str | None = None) -> Quote:
    now = utcnow()
    problems: list[Problem] = []
    warnings: list[str] = []

    venue, zone = _pick_venue(db, request, problems)
    lines = _price_lines(db, request, venue, problems)
    items_total = money(sum((line.line_total for line in lines if line.is_available), Decimal(0)))

    promo_payload = None
    discount = Decimal(0)
    if request.promo_code and request.promo_code.strip():
        discount, promo_payload = _apply_promo(db, request.promo_code, items_total, customer, phone, problems)
    after_discount = items_total - discount

    bonus_available = None
    bonus_spent = Decimal(0)
    if customer:
        bonus_available = loyalty.balance(db, customer.id)
        if request.use_bonus:
            bonus_spent = loyalty.max_redeem(after_discount, bonus_available)

    delivery_fee: Decimal | None = Decimal(0)
    if request.fulfillment == "delivery":
        if zone is None:
            delivery_fee = None
        else:
            free = zone.free_delivery_from is not None and after_discount >= zone.free_delivery_from
            delivery_fee = Decimal(0) if free else zone.delivery_fee
            if after_discount < zone.min_order_amount and lines:
                missing = zone.min_order_amount - after_discount
                problems.append(
                    Problem(
                        "below_min_order",
                        f"Минимальный заказ на доставку {int(zone.min_order_amount)} ₽, не хватает {int(missing)} ₽",
                        {"min_order_amount": money_str(zone.min_order_amount), "missing": money_str(missing)},
                    )
                )

    total = money(after_discount - bonus_spent + (delivery_fee or 0))

    cook = max([line.item.cook_minutes or venue.cook_minutes for line in lines if line.item] or [venue.cook_minutes])
    lead = cook + (zone.eta_minutes if zone and request.fulfillment == "delivery" else 0)
    slots = time_slots(venue, lead, now)
    scheduled_for = request.scheduled_for
    promised_at = None
    if scheduled_for:
        if scheduled_for.tzinfo is None:
            raise ApiError("invalid_request", "scheduled_for должен быть со смещением часового пояса", status=422)
        if not any(abs((slot - scheduled_for).total_seconds()) < 60 for slot in slots):
            problems.append(Problem("slot_unavailable", "Это время уже недоступно, выберите другое", {}))
        promised_at = scheduled_for
    elif not is_open(venue, now):
        opens = next_opening(venue, now)
        problems.append(
            Problem(
                "venue_closed",
                "Сейчас закрыто — можно оформить заказ ко времени",
                {"opens_at": opens.isoformat() if opens else None},
            )
        )
    else:
        promised_at = now + timedelta(minutes=lead)
        closing = closes_at(venue, now)
        if closing and closing - now < timedelta(minutes=CLOSING_SOON_MINUTES):
            minutes = max(1, int((closing - now).total_seconds() // 60))
            warnings.append(f"Точка закрывается через {minutes} мин — успеем, если оформите сейчас.")

    accrual_percent = loyalty.percent_for(db, customer.id if customer else None)
    bonus_accrual = loyalty.accrual_for(after_discount - bonus_spent, accrual_percent)

    return Quote(
        venue=venue,
        zone=zone,
        fulfillment=request.fulfillment,
        lines=lines,
        items_total=items_total,
        discount_total=discount,
        bonus_spent=bonus_spent,
        bonus_available=bonus_available,
        delivery_fee=delivery_fee,
        total_amount=total,
        promo=promo_payload,
        promised_at=promised_at,
        scheduled_for=scheduled_for,
        slots=slots,
        bonus_accrual=bonus_accrual,
        problems=problems,
        warnings=warnings,
    )


def _pick_venue(db: Session, request: QuoteRequest, problems: list[Problem]) -> tuple[Venue, DeliveryZone | None]:
    if request.fulfillment == "delivery" and request.address:
        try:
            resolution = resolve_delivery(db, request.address.latitude, request.address.longitude)
            return resolution.venue, resolution.zone
        except ApiError as error:
            problems.append(Problem(error.code, error.message, error.details))
    if request.fulfillment == "delivery" and not request.address:
        problems.append(Problem("address_required", "Укажите адрес доставки", {}))
    if request.venue_id:
        venue = get_venue(db, request.venue_id)
    else:
        venue = default_venue(db)
        if not venue:
            raise ApiError("no_venues", "Нет ни одной работающей точки", status=503)
    if request.fulfillment == "pickup" and not venue.pickup_enabled:
        problems.append(Problem("pickup_unavailable", "В этой точке нет самовывоза", {}))
    return venue, None


def _price_lines(db: Session, request: QuoteRequest, venue: Venue, problems: list[Problem]) -> list[QuotedLine]:
    if not request.items:
        return []
    items = {item.id: item for item in load_items(db)}
    overrides = venue_overrides(db, venue)
    lines: list[QuotedLine] = []
    for cart_line in request.items:
        item = items.get(cart_line.menu_item_id)
        if not item:
            problems.append(Problem("item_unavailable", "Этого блюда больше нет в меню", {"menu_item_id": str(cart_line.menu_item_id)}))
            lines.append(QuotedLine(None, str(cart_line.menu_item_id), "Блюдо снято с меню", None, Decimal(0), cart_line.quantity, Decimal(0), [], False))
            continue
        override = overrides.get(item.id)
        available = is_available(override)
        if not available:
            problems.append(Problem("item_unavailable", f"{item.title} закончилось", {"menu_item_id": str(item.id), "title": item.title}))
        modifiers, delta = _price_modifiers(item, cart_line.modifiers, problems)
        unit = money(effective_price(item, override) + delta)
        lines.append(
            QuotedLine(
                item=item,
                menu_item_id=str(item.id),
                title=item.title,
                image_url=item.image_url,
                unit_price=unit,
                quantity=cart_line.quantity,
                line_total=money(unit * cart_line.quantity),
                modifiers=modifiers,
                is_available=available,
            )
        )
    return lines


def _price_modifiers(item: MenuItem, chosen, problems: list[Problem]) -> tuple[list[dict], Decimal]:
    allowed = {}
    for link in item.group_links:
        for mod in link.group.modifiers:
            if mod.is_active:
                allowed[mod.id] = (link.group, mod)
    picked_per_group: dict = {}
    result = []
    delta = Decimal(0)
    for choice in chosen:
        pair = allowed.get(choice.id)
        if not pair:
            problems.append(Problem("invalid_modifiers", f"Добавка недоступна для «{item.title}»", {"menu_item_id": str(item.id)}))
            continue
        group, mod = pair
        quantity = choice.quantity if group.kind == "addon" else 1
        if quantity > group.max_quantity:
            problems.append(Problem("invalid_modifiers", f"«{mod.title}» — не больше {group.max_quantity}", {"menu_item_id": str(item.id)}))
            quantity = group.max_quantity
        picked_per_group.setdefault(group.id, []).append(mod)
        delta += mod.price_delta * quantity
        result.append(
            {
                "id": str(mod.id),
                "title": mod.title,
                "group": group.title,
                "kind": group.kind,
                "price_delta": money_str(mod.price_delta),
                "quantity": quantity,
            }
        )
    for link in item.group_links:
        group = link.group
        picked = picked_per_group.get(group.id, [])
        if group.kind == "choice" and len(picked) > 1:
            problems.append(Problem("invalid_modifiers", f"{group.title}: выберите один вариант", {"menu_item_id": str(item.id), "group_id": str(group.id)}))
        if group.required and not picked:
            problems.append(
                Problem("invalid_modifiers", f"{item.title}: выберите «{group.title.lower()}»", {"menu_item_id": str(item.id), "group_id": str(group.id)})
            )
    return result, delta


def _apply_promo(db: Session, raw_code: str, items_total: Decimal, customer: Customer | None, phone: str | None, problems: list[Problem]):
    code = raw_code.strip().upper()
    promo = db.query(PromoCode).filter(func.upper(PromoCode.code) == code, PromoCode.is_active.is_(True)).first()
    now = utcnow()
    invalid = Problem("promo_invalid", "Промокод не найден или истёк", {"code": code})
    if not promo or (promo.starts_at and promo.starts_at > now) or (promo.ends_at and promo.ends_at < now):
        problems.append(invalid)
        return Decimal(0), {"code": code, "applied": False, "message": invalid.message}
    if promo.max_uses is not None:
        used = db.query(func.count(Order.id)).filter(func.upper(Order.promo_code) == code, Order.status.notin_(["cancelled", "rejected"])).scalar()
        if used >= promo.max_uses:
            problems.append(Problem("promo_invalid", "Промокод больше не действует", {"code": code}))
            return Decimal(0), {"code": code, "applied": False, "message": "Промокод больше не действует"}
    who = (customer.phone if customer and customer.phone else None) or phone
    if promo.once_per_customer and who:
        used_by_customer = (
            db.query(func.count(Order.id))
            .filter(func.upper(Order.promo_code) == code, Order.customer_phone == who, Order.status.notin_(["cancelled", "rejected"]))
            .scalar()
        )
        if used_by_customer:
            problems.append(Problem("promo_invalid", "Вы уже использовали этот промокод", {"code": code}))
            return Decimal(0), {"code": code, "applied": False, "message": "Вы уже использовали этот промокод"}
    if items_total < promo.min_order_amount:
        message = f"Промокод действует от {int(promo.min_order_amount)} ₽"
        problems.append(Problem("promo_invalid", message, {"code": code, "min_order_amount": money_str(promo.min_order_amount)}))
        return Decimal(0), {"code": code, "applied": False, "message": message}
    if promo.kind == "percent":
        discount = money(items_total * promo.value / 100)
        label = f"−{int(promo.value)}%"
    else:
        discount = min(money(promo.value), items_total)
        label = f"−{int(promo.value)} ₽"
    return discount, {"code": code, "applied": True, "label": label, "message": ""}
