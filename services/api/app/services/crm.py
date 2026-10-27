"""Built-in CRM: the customer base assembled from orders, segments, a customer card and sales numbers."""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Integer, Text, and_, case, cast, func, or_
from sqlalchemy.orm import Session

from app.core.errors import ApiError, money_str
from app.models.customer import BonusTransaction, Customer, CustomerAddress
from app.models.order import Order, OrderItem
from app.services import loyalty
from app.services.customers import format_phone
from app.services.venues import utcnow

SLEEP_AFTER_DAYS = 45
VIP_FROM = Decimal(10000)

SEGMENTS = {
    "all": "Все",
    "new": "Новые",
    "regular": "Постоянные",
    "sleeping": "Уснувшие",
    "vip": "VIP",
    "registered": "С аккаунтом",
    "blocked": "Заблокированы",
}


def _stats_subquery(db: Session):
    completed = Order.status == "completed"
    alive = Order.status.notin_(["cancelled", "rejected"])
    return (
        db.query(
            Order.customer_id.label("customer_id"),
            func.sum(cast(completed, Integer)).label("orders_count"),
            func.coalesce(func.sum(case((completed, Order.total_amount), else_=0)), 0).label("total_spent"),
            func.max(case((alive, Order.created_at), else_=None)).label("last_order_at"),
            func.min(Order.created_at).label("first_order_at"),
            func.count(Order.id).label("all_orders"),
        )
        .group_by(Order.customer_id)
        .subquery()
    )


def list_customers(db: Session, *, q: str = "", segment: str = "all", sort: str = "last_order", limit: int = 50, offset: int = 0) -> dict:
    stats = _stats_subquery(db)
    orders_count = func.coalesce(stats.c.orders_count, 0)
    total_spent = func.coalesce(stats.c.total_spent, 0)
    query = db.query(Customer, orders_count, total_spent, stats.c.last_order_at, stats.c.first_order_at).outerjoin(
        stats, stats.c.customer_id == Customer.id
    )

    if q.strip():
        needle = q.strip()
        digits = re.sub(r"\D", "", needle)
        conditions = [Customer.name.ilike(f"%{needle}%"), Customer.note.ilike(f"%{needle}%"), Customer.telegram_username.ilike(f"%{needle}%")]
        if len(digits) >= 3:
            conditions.append(Customer.phone.like(f"%{digits[-10:]}%"))
        conditions.append(cast(Customer.tags, Text).ilike(f"%{needle}%"))
        query = query.filter(or_(*conditions))

    now = utcnow()
    sleep_border = now - timedelta(days=SLEEP_AFTER_DAYS)
    if segment == "new":
        query = query.filter(orders_count <= 1, stats.c.first_order_at >= now - timedelta(days=30))
    elif segment == "regular":
        query = query.filter(orders_count >= 3, stats.c.last_order_at >= sleep_border)
    elif segment == "sleeping":
        query = query.filter(orders_count >= 1, stats.c.last_order_at < sleep_border)
    elif segment == "vip":
        query = query.filter(total_spent >= VIP_FROM)
    elif segment == "registered":
        query = query.filter(Customer.is_registered.is_(True))
    elif segment == "blocked":
        query = query.filter(Customer.is_blocked.is_(True))

    total = query.count()
    order_by = {
        "last_order": stats.c.last_order_at.desc().nullslast(),
        "spent": total_spent.desc(),
        "orders": orders_count.desc(),
        "created": Customer.created_at.desc(),
    }.get(sort, stats.c.last_order_at.desc().nullslast())
    rows = query.order_by(order_by, Customer.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "segments": SEGMENTS,
        "customers": [_row_payload(row) for row in rows],
    }


def _row_payload(row) -> dict:
    customer, orders_count, total_spent, last_order_at, first_order_at = row
    return {
        "id": str(customer.id),
        "name": customer.name,
        "phone": customer.phone,
        "phone_display": format_phone(customer.phone),
        "telegram_username": customer.telegram_username,
        "is_registered": customer.is_registered,
        "is_blocked": customer.is_blocked,
        "tags": customer.tags or [],
        "orders_count": int(orders_count or 0),
        "total_spent": money_str(total_spent or 0),
        "avg_check": money_str((Decimal(total_spent) / orders_count) if orders_count else 0),
        "last_order_at": last_order_at.isoformat() if last_order_at else None,
        "first_order_at": first_order_at.isoformat() if first_order_at else None,
        "segment": _segment_of(int(orders_count or 0), Decimal(total_spent or 0), last_order_at, first_order_at),
        "created_at": customer.created_at.isoformat(),
    }


def _segment_of(orders_count: int, total_spent: Decimal, last_order_at, first_order_at) -> str:
    now = utcnow()
    if total_spent >= VIP_FROM:
        return "vip"
    if last_order_at and orders_count >= 1 and last_order_at < now - timedelta(days=SLEEP_AFTER_DAYS):
        return "sleeping"
    if orders_count >= 3:
        return "regular"
    if first_order_at and first_order_at >= now - timedelta(days=30):
        return "new"
    return "all"


def customer_card(db: Session, customer_id) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise ApiError("customer_not_found", "Клиент не найден", status=404)
    stats = _stats_subquery(db)
    row = (
        db.query(Customer, func.coalesce(stats.c.orders_count, 0), func.coalesce(stats.c.total_spent, 0), stats.c.last_order_at, stats.c.first_order_at)
        .outerjoin(stats, stats.c.customer_id == Customer.id)
        .filter(Customer.id == customer.id)
        .one()
    )
    orders = db.query(Order).filter(Order.customer_id == customer.id).order_by(Order.created_at.desc()).limit(100).all()
    favourites = (
        db.query(OrderItem.title, func.sum(OrderItem.quantity).label("qty"))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.customer_id == customer.id, Order.status == "completed")
        .group_by(OrderItem.title)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
        .all()
    )
    addresses = db.query(CustomerAddress).filter(CustomerAddress.customer_id == customer.id).order_by(CustomerAddress.created_at).all()
    payload = _row_payload(row)
    payload.update(
        {
            "note": customer.note,
            "telegram_id": customer.telegram_id,
            "source": customer.source,
            "notify_promo": customer.notify_promo,
            "bonus": loyalty.loyalty_payload(db, customer.id),
            "favourites": [{"title": title, "quantity": int(qty)} for title, qty in favourites],
            "addresses": [
                {"id": str(address.id), "label": address.label, "text": address.text, "apartment": address.apartment}
                for address in addresses
            ],
            "orders": [
                {
                    "id": str(order.id),
                    "number": order.number,
                    "status": order.status,
                    "total_amount": money_str(order.total_amount),
                    "fulfillment": order.fulfillment,
                    "created_at": order.created_at.isoformat(),
                }
                for order in orders
            ],
        }
    )
    return payload


def update_customer(db: Session, customer_id, *, name=None, note=None, tags=None, is_blocked=None) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise ApiError("customer_not_found", "Клиент не найден", status=404)
    if name is not None:
        customer.name = name.strip()
    if note is not None:
        customer.note = note
    if tags is not None:
        customer.tags = sorted({tag.strip() for tag in tags if tag.strip()})
    if is_blocked is not None:
        customer.is_blocked = is_blocked
    db.commit()
    return customer_card(db, customer.id)


def adjust_bonus(db: Session, customer_id, amount: Decimal, comment: str, actor: str) -> dict:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise ApiError("customer_not_found", "Клиент не найден", status=404)
    if amount == 0:
        raise ApiError("invalid_request", "Сумма не может быть нулевой", status=422)
    if amount < 0 and loyalty.balance(db, customer.id) + amount < 0:
        raise ApiError("invalid_request", "Нельзя списать больше, чем на балансе", status=422)
    db.add(BonusTransaction(customer_id=customer.id, kind="manual", amount=amount, comment=f"{comment.strip() or 'Вручную'} ({actor})"))
    db.commit()
    return customer_card(db, customer.id)


def export_csv(db: Session, *, segment: str = "all", q: str = "") -> str:
    data = list_customers(db, q=q, segment=segment, sort="spent", limit=100000)
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(["Имя", "Телефон", "Заказов", "Сумма", "Средний чек", "Последний заказ", "Сегмент", "Метки", "Аккаунт"])
    for row in data["customers"]:
        writer.writerow(
            [
                row["name"],
                row["phone"] or "",
                row["orders_count"],
                row["total_spent"].replace(".", ","),
                row["avg_check"].replace(".", ","),
                row["last_order_at"][:10] if row["last_order_at"] else "",
                SEGMENTS.get(row["segment"], ""),
                ", ".join(row["tags"]),
                "да" if row["is_registered"] else "нет",
            ]
        )
    # BOM so Excel opens Cyrillic correctly.
    return "﻿" + buffer.getvalue()


def dashboard(db: Session, tz_name: str = "Europe/Moscow", days: int = 14) -> dict:
    tz = ZoneInfo(tz_name)
    now = utcnow()
    today_start = datetime.combine(now.astimezone(tz).date(), datetime.min.time(), tz)
    since = today_start - timedelta(days=days - 1)
    local_day = func.date(func.timezone(tz_name, Order.created_at))
    rows = (
        db.query(
            local_day.label("day"),
            func.count(Order.id),
            func.coalesce(func.sum(case((Order.status == "completed", Order.total_amount), else_=0)), 0),
            func.sum(cast(Order.status.in_(["cancelled", "rejected"]), Integer)),
        )
        .filter(Order.created_at >= since)
        .group_by(local_day)
        .all()
    )
    by_day = {row[0]: row for row in rows}
    series = []
    for offset in range(days):
        day = (since + timedelta(days=offset)).date()
        row = by_day.get(day)
        series.append(
            {
                "date": day.isoformat(),
                "orders": int(row[1]) if row else 0,
                "revenue": money_str(row[2]) if row else "0.00",
                "cancelled": int(row[3] or 0) if row else 0,
            }
        )
    today = series[-1]
    completed_today = (
        db.query(func.count(Order.id), func.coalesce(func.avg(Order.total_amount), 0))
        .filter(Order.created_at >= today_start, Order.status == "completed")
        .one()
    )
    new_customers = db.query(func.count(Customer.id)).filter(Customer.created_at >= today_start).scalar()
    active = db.query(func.count(Order.id)).filter(Order.status.in_(["new", "confirmed", "preparing", "ready", "delivering"])).scalar()
    late = (
        db.query(func.count(Order.id))
        .filter(and_(Order.status.in_(["confirmed", "preparing", "ready", "delivering"]), Order.promised_at < now))
        .scalar()
    )
    top = (
        db.query(OrderItem.title, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.status == "completed", Order.created_at >= since)
        .group_by(OrderItem.title)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
        .all()
    )
    return {
        "today": {
            "orders": today["orders"],
            "revenue": today["revenue"],
            "avg_check": money_str(completed_today[1]),
            "new_customers": int(new_customers or 0),
            "active": int(active or 0),
            "late": int(late or 0),
        },
        "series": series,
        "top_items": [{"title": title, "quantity": int(qty)} for title, qty in top],
    }
