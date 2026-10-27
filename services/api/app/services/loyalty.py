"""Bonuses: a percent of each completed order comes back as bonuses, 1 bonus = 1 ₽.

The percent depends on the level — spend on completed orders over the last 90 days.
Bonuses may pay up to BONUS_MAX_REDEEM_PERCENT of the dishes. The ledger is append-only.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import ROUND_DOWN, Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import money_str
from app.models.customer import BonusTransaction
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
