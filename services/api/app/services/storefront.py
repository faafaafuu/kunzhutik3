from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.models.store_order import StoreOrder
from app.services.notifications import ORDER_STATUS_LABELS, notify_new_order, notify_order_status_update
from app.store.catalog import BUSINESS_PROFILE, CATEGORIES, FEATURES, MENU_ITEMS, PROMOS, STORE_CURRENCY

CATALOG_BY_ID = {item["id"]: item for item in MENU_ITEMS}
ORDER_STATUS_VALUES = set(ORDER_STATUS_LABELS)


def get_storefront_payload() -> dict:
    return {
        "brand_name": BUSINESS_PROFILE["brand_name"],
        "business": BUSINESS_PROFILE,
        "currency": STORE_CURRENCY,
        "categories": CATEGORIES,
        "features": FEATURES,
        "promos": PROMOS,
        "items": MENU_ITEMS,
    }


def create_store_order(
    db: Session,
    *,
    customer_name: str,
    customer_phone: str,
    delivery_address: str,
    delivery_slot: str | None,
    payment_method: str,
    comment: str | None,
    customer_profile: dict | None,
    items: list[dict],
) -> tuple[StoreOrder, str]:
    normalized_items: list[dict] = []
    total_amount = Decimal("0.00")

    for requested_item in items:
        catalog_item = CATALOG_BY_ID.get(requested_item["item_id"])
        if not catalog_item:
            raise HTTPException(status_code=400, detail=f"Unknown item: {requested_item['item_id']}")
        quantity = requested_item["quantity"]
        line_total = Decimal(str(catalog_item["price"])) * quantity
        normalized_items.append(
            {
                "item_id": catalog_item["id"],
                "title": catalog_item["title"],
                "price": catalog_item["price"],
                "quantity": quantity,
                "line_total": float(line_total),
                "category_id": catalog_item["category_id"],
            }
        )
        total_amount += line_total

    order = StoreOrder(
        customer_name=customer_name.strip(),
        customer_phone=customer_phone.strip(),
        delivery_address=delivery_address.strip(),
        delivery_slot=delivery_slot.strip() if delivery_slot else None,
        payment_method=payment_method,
        comment=comment.strip() if comment else None,
        status="new",
        currency=STORE_CURRENCY,
        total_amount=total_amount.quantize(Decimal("0.01")),
        items_json=normalized_items,
        source_json={
            "channel": "web_storefront",
            "customer_profile": _sanitize_customer_profile(customer_profile),
            "status_history": [
                {
                    "from": None,
                    "to": "new",
                    "actor": "storefront",
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            ],
        },
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    order_number = build_order_number(order)
    notify_new_order(
        str(order.id),
        order_number,
        build_order_notification_summary(order),
        customer_telegram_id=extract_verified_customer_telegram_id(order),
    )
    return order, order_number


def build_order_number(order: StoreOrder) -> str:
    return f"KUN-{order.created_at.strftime('%d%m')}-{str(order.id)[:8].upper()}"


def list_store_orders(db: Session) -> list[StoreOrder]:
    return db.query(StoreOrder).order_by(StoreOrder.created_at.desc()).all()


def update_store_order_status(db: Session, order_id, status: str, *, actor: str = "api") -> StoreOrder:
    if status not in ORDER_STATUS_VALUES:
        raise HTTPException(status_code=400, detail="Unsupported order status")

    order = db.query(StoreOrder).filter(StoreOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    previous_status = order.status
    if previous_status == status:
        return order

    order.status = status
    source_json = dict(order.source_json) if isinstance(order.source_json, dict) else {}
    history = list(source_json.get("status_history") or [])
    history.append(
        {
            "from": previous_status,
            "to": status,
            "actor": actor,
            "at": datetime.now(timezone.utc).isoformat(),
        }
    )
    source_json["status_history"] = history[-30:]
    order.source_json = source_json
    flag_modified(order, "source_json")
    db.commit()
    db.refresh(order)

    notify_order_status_update(
        build_order_number(order),
        order.status,
        customer_telegram_id=extract_verified_customer_telegram_id(order),
    )
    return order


def build_order_notification_summary(order: StoreOrder) -> str:
    item_lines = "\n".join(f"- {item['title']} × {item['quantity']}" for item in order.items_json)
    customer_profile = order.source_json.get("customer_profile") if isinstance(order.source_json, dict) else None
    profile_line = _format_customer_profile(customer_profile)
    comment_line = f"\n\nКомментарий: {order.comment}" if order.comment else ""
    return (
        f"Заведение: {BUSINESS_PROFILE['brand_name']}\n"
        f"Адрес: {BUSINESS_PROFILE['address']}\n"
        f"Клиент: {order.customer_name}\n"
        f"Телефон: {order.customer_phone}\n"
        f"{profile_line}"
        f"Адрес доставки: {order.delivery_address}\n"
        f"Время: {order.delivery_slot or 'как можно скорее'}\n"
        f"Оплата: {order.payment_method}\n"
        f"Сумма: {order.total_amount} {order.currency}\n\n"
        f"{item_lines}"
        f"{comment_line}"
    )


def extract_verified_customer_telegram_id(order: StoreOrder) -> str | None:
    customer_profile = order.source_json.get("customer_profile") if isinstance(order.source_json, dict) else None
    if not isinstance(customer_profile, dict):
        return None
    if customer_profile.get("provider") != "telegram_link" or customer_profile.get("verified") != "true":
        return None
    profile_id = customer_profile.get("id")
    return str(profile_id) if profile_id else None


def _sanitize_customer_profile(customer_profile: dict | None) -> dict:
    if not customer_profile:
        return {}
    allowed_keys = {
        "provider",
        "id",
        "username",
        "first_name",
        "last_name",
        "language_code",
        "signature",
    }
    sanitized = {
        key: str(value)[:160]
        for key, value in customer_profile.items()
        if key in allowed_keys and value is not None
    }
    if sanitized.get("provider") == "telegram_link":
        verified = _verify_telegram_link_profile(sanitized)
        if not verified:
            return {"provider": "telegram_link", "verified": "false"}
        sanitized["verified"] = "true"
    sanitized.pop("signature", None)
    return sanitized


def _verify_telegram_link_profile(customer_profile: dict) -> bool:
    signature = customer_profile.get("signature")
    if not signature or not settings.telegram_bot_token:
        return False
    message = "\n".join(
        [
            customer_profile.get("id", ""),
            customer_profile.get("username", ""),
            customer_profile.get("first_name", ""),
            customer_profile.get("last_name", ""),
        ]
    )
    expected = hmac.new(settings.telegram_bot_token.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def _format_customer_profile(customer_profile: dict | None) -> str:
    if not customer_profile:
        return ""
    provider = customer_profile.get("provider")
    username = customer_profile.get("username")
    profile_id = customer_profile.get("id")
    verified = customer_profile.get("verified")
    parts = [str(provider)] if provider else []
    if username:
        parts.append(f"@{username}")
    if profile_id:
        parts.append(f"id:{profile_id}")
    if verified:
        parts.append("verified" if verified == "true" else "unverified")
    return f"Профиль: {' '.join(parts)}\n" if parts else ""
