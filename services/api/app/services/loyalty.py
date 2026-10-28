"""Bonuses: a percent of each completed order comes back as bonuses, 1 bonus = 1 ₽.

The percent depends on the level — spend on completed orders over the last 90 days.
Bonuses may pay up to BONUS_MAX_REDEEM_PERCENT of the dishes. The ledger is append-only.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from decimal import ROUND_DOWN, Decimal

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError, money_str
from app.models.customer import BonusTransaction, Customer
from app.models.order import Order
from app.services.venues import utcnow

LEVEL_WINDOW_DAYS = 90


def balance(db: Session, customer_id) -> Decimal:
    value = db.query(func.coalesce(func.sum(BonusTransaction.amount), 0)).filter(BonusTransaction.customer_id == customer_id).scalar()
    return Decimal(value)


def spent_in_window(db: Session, customer_id) -> Decimal:
    since = utcnow() - timedelta(days=LEVEL_WINDOW_DAYS)
    value = (
        db.query(func.coalesce(func.sum(Order.total_amount - Order.delivery_fee), 0))
        .filter(Order.customer_id == customer_id, Order.status == "completed", Order.completed_at >= since)
        .scalar()
    )
    return Decimal(value)


def level_for(spent: Decimal) -> tuple[dict, dict | None]:
    levels = settings.bonus_levels
    current = levels[0]
    upcoming = None
    for level in levels:
        if spent >= level["threshold"]:
            current = level
        elif upcoming is None:
            upcoming = level
    return current, upcoming


def percent_for(db: Session, customer_id) -> int:
    if not customer_id:
        return settings.bonus_levels[0]["percent"]
    return level_for(spent_in_window(db, customer_id))[0]["percent"]


def accrual_for(amount: Decimal, percent: int) -> Decimal:
    return (amount * percent / 100).quantize(Decimal("1"), rounding=ROUND_DOWN)


def max_redeem(items_after_discount: Decimal, available: Decimal) -> Decimal:
    cap = (items_after_discount * settings.bonus_max_redeem_percent / 100).quantize(Decimal("1"), rounding=ROUND_DOWN)
    return max(Decimal(0), min(cap, available.quantize(Decimal("1"), rounding=ROUND_DOWN)))


def on_order_completed(db: Session, order: Order) -> None:
    if not order.customer_id:
        return
    already = db.query(BonusTransaction).filter(BonusTransaction.order_id == order.id, BonusTransaction.kind == "accrual").first()
    if already:
        return
    base = order.items_total - order.discount_total - order.bonus_spent
    amount = accrual_for(base, percent_for(db, order.customer_id))
    if amount > 0:
        db.add(BonusTransaction(customer_id=order.customer_id, order_id=order.id, kind="accrual", amount=amount, comment=f"Заказ № {order.number}"))
    _reward_referral(db, order)


# ---------- welcome bonus and invite-a-friend ----------

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I: a code is read out and typed by hand


def grant_welcome(db: Session, customer: Customer) -> bool:
    """Welcome bonuses, once per customer (the database refuses a second one). True when this call gave them."""
    if settings.welcome_bonus <= 0:
        return False
    if db.query(BonusTransaction.id).filter(BonusTransaction.customer_id == customer.id, BonusTransaction.kind == "welcome").first():
        return False
    db.add(BonusTransaction(customer_id=customer.id, kind="welcome", amount=settings.welcome_bonus, comment="Приветственные бонусы"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    return True


def referral_code_of(db: Session, customer: Customer) -> str:
    """The customer's own invite code, made on first request."""
    if customer.referral_code:
        return customer.referral_code
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.query(Customer.id).filter(Customer.referral_code == code).first():
            customer.referral_code = code
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                continue
            return code
    raise ApiError("referral_unavailable", "Не получилось создать код, попробуйте ещё раз", status=503)


def referral_enabled() -> bool:
    return settings.referral_friend_bonus > 0 or settings.referral_referrer_bonus > 0


def _has_completed_order(db: Session, customer_id) -> bool:
    return db.query(Order.id).filter(Order.customer_id == customer_id, Order.status == "completed").first() is not None


def can_apply_referral(db: Session, customer: Customer) -> bool:
    return referral_enabled() and customer.referred_by_id is None and not _has_completed_order(db, customer.id)


def apply_referral(db: Session, customer: Customer, raw_code: str) -> None:
    """The friend's code, entered by the invited customer before their first order is completed."""
    if not referral_enabled():
        raise ApiError("referral_off", "Программа «Приведи друга» сейчас не действует", status=409)
    code = (raw_code or "").strip().upper()
    referrer = db.query(Customer).filter(Customer.referral_code == code).first() if code else None
    if not referrer or referrer.is_blocked:
        raise ApiError("referral_invalid", "Такого кода нет. Проверьте, пожалуйста", status=404)
    if referrer.id == customer.id:
        raise ApiError("referral_own", "Свой код вводить не нужно: поделитесь им с другом", status=422)
    if customer.referred_by_id:
        raise ApiError("referral_already", "Код друга уже введён", status=409)
    if _has_completed_order(db, customer.id):
        raise ApiError("referral_late", "Код друга можно ввести до первого выполненного заказа", status=409)
    customer.referred_by_id = referrer.id
    db.commit()


def _reward_referral(db: Session, order: Order) -> None:
    """On the invited customer's first completed order both get bonuses — once, and only for a real order."""
    customer = db.get(Customer, order.customer_id)
    if not customer or not customer.referred_by_id or customer.referral_rewarded_at or not referral_enabled():
        return
    if db.query(Order.id).filter(Order.customer_id == customer.id, Order.status == "completed", Order.id != order.id).first():
        customer.referral_rewarded_at = utcnow()  # not the first one any more: no reward, and no second look
        return
    if order.items_total - order.discount_total < settings.referral_min_order:
        return  # a small first order does not count; a later one may
    referrer = db.get(Customer, customer.referred_by_id)
    customer.referral_rewarded_at = utcnow()
    if not referrer or referrer.is_blocked:
        return
    if settings.referral_friend_bonus > 0:
        db.add(BonusTransaction(customer_id=customer.id, order_id=order.id, kind="referral", amount=settings.referral_friend_bonus, comment="Бонус за код друга"))
    if settings.referral_referrer_bonus > 0:
        db.add(BonusTransaction(customer_id=referrer.id, order_id=order.id, kind="referral", amount=settings.referral_referrer_bonus, comment="Друг сделал первый заказ"))


def referral_payload(db: Session, customer: Customer) -> dict:
    code = referral_code_of(db, customer)
    invited = db.query(func.count(Customer.id)).filter(Customer.referred_by_id == customer.id).scalar()
    rewarded = db.query(func.count(Customer.id)).filter(Customer.referred_by_id == customer.id, Customer.referral_rewarded_at.isnot(None)).scalar()
    earned = (
        db.query(func.coalesce(func.sum(BonusTransaction.amount), 0))
        .filter(BonusTransaction.customer_id == customer.id, BonusTransaction.kind == "referral", BonusTransaction.comment == "Друг сделал первый заказ")
        .scalar()
    )
    return {
        "enabled": referral_enabled(),
        "code": code,
        "link": f"{settings.app_base_url.rstrip('/')}/?ref={code}",
        "friend_bonus": settings.referral_friend_bonus,
        "referrer_bonus": settings.referral_referrer_bonus,
        "min_order": settings.referral_min_order,
        "invited": invited,
        "rewarded": rewarded,
        "earned": money_str(earned),
        "can_apply": can_apply_referral(db, customer),
        "applied": customer.referred_by_id is not None,
    }


def on_order_cancelled(db: Session, order: Order) -> None:
    """Give back bonuses the cancelled order was paid with."""
    if not order.customer_id or order.bonus_spent <= 0:
        return
    already = db.query(BonusTransaction).filter(BonusTransaction.order_id == order.id, BonusTransaction.kind == "reversal").first()
    if already:
        return
    db.add(
        BonusTransaction(
            customer_id=order.customer_id,
            order_id=order.id,
            kind="reversal",
            amount=order.bonus_spent,
            comment=f"Возврат за отменённый заказ № {order.number}",
        )
    )


def loyalty_payload(db: Session, customer_id) -> dict:
    spent = spent_in_window(db, customer_id)
    current, upcoming = level_for(spent)
    history = (
        db.query(BonusTransaction)
        .filter(BonusTransaction.customer_id == customer_id)
        .order_by(BonusTransaction.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "balance": money_str(balance(db, customer_id)),
        "level": current,
        "next_level": upcoming,
        "spent_90_days": money_str(spent),
        "to_next_level": money_str(max(Decimal(0), Decimal(upcoming["threshold"]) - spent)) if upcoming else None,
        "levels": settings.bonus_levels,
        "max_redeem_percent": settings.bonus_max_redeem_percent,
        "history": [
            {
                "id": str(row.id),
                "kind": row.kind,
                "amount": money_str(row.amount),
                "comment": row.comment,
                "created_at": row.created_at.isoformat(),
            }
            for row in history
        ],
    }
