"""Order notifications: staff in Telegram, the customer in Telegram and by push.

Everything here runs after the response (FastAPI BackgroundTasks) and never raises:
a failed message must not fail an order.
"""

from __future__ import annotations

import asyncio
import logging

import httpx
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.customer import Customer, Device
from app.models.order import Order

logger = logging.getLogger(__name__)

STATUS_LABELS = {
    "pending_payment": "Ждёт оплаты",
    "new": "Новый",
    "confirmed": "Принят",
    "preparing": "Готовится",
    "ready": "Готов",
    "delivering": "В пути",
    "completed": "Выполнен",
    "cancelled": "Отменён",
    "rejected": "Отказ",
}

# What the customer hears about each status. None — no message.
CUSTOMER_MESSAGES = {
    "confirmed": "Заказ № {number} принят кафе",
    "preparing": "Заказ № {number} готовится",
    "ready": "Заказ № {number} готов",
    "delivering": "Курьер везёт заказ № {number}",
    "completed": "Заказ № {number} выполнен. Приятного аппетита!",
    "cancelled": "Заказ № {number} отменён",
    "rejected": "Кафе не сможет выполнить заказ № {number}",
}

PAYMENT_LABELS = {"cash": "Наличными", "card_on_delivery": "Картой курьеру", "online": "Онлайн"}

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def staff_actions_keyboard(order: Order) -> InlineKeyboardMarkup | None:
    from app.services.orders import staff_next_statuses

    buttons = [
        InlineKeyboardButton(text=ACTION_LABELS.get(status, STATUS_LABELS[status]), callback_data=f"order:{order.id}:{status}")
        for status in staff_next_statuses(order)
    ]
    if not buttons:
        return None
    rows = [buttons[index : index + 2] for index in range(0, len(buttons), 2)]
    return InlineKeyboardMarkup(inline_keyboard=rows)


ACTION_LABELS = {
    "confirmed": "Принять",
    "rejected": "Отказать",
    "preparing": "Готовим",
    "ready": "Готов",
    "delivering": "Передан курьеру",
    "completed": "Выдан",
    "cancelled": "Отменить",
}


def order_text(order: Order, venue_title: str = "") -> str:
    lines = [f"Заказ № {order.number} · {STATUS_LABELS.get(order.status, order.status)}"]
    if venue_title:
        lines.append(venue_title)
    lines.append("")
    for item in order.items:
        mods = ", ".join(_mod_label(mod) for mod in item.modifiers)
        lines.append(f"• {item.title} × {item.quantity} — {int(item.line_total)} ₽" + (f"\n   {mods}" if mods else ""))
    lines.append("")
    if order.discount_total:
        lines.append(f"Скидка: −{int(order.discount_total)} ₽")
    if order.bonus_spent:
        lines.append(f"Бонусами: −{int(order.bonus_spent)} ₽")
    if order.fulfillment == "delivery":
        lines.append(f"Доставка: {int(order.delivery_fee)} ₽")
    lines.append(f"Итого: {int(order.total_amount)} ₽ · {PAYMENT_LABELS.get(order.payment_method, order.payment_method)}")
    lines.append("")
    lines.append(f"{order.customer_name}, {order.customer_phone}")
    if order.fulfillment == "delivery":
        details = order.address_details or {}
        extra = ", ".join(
            f"{label} {details[key]}"
            for key, label in (("entrance", "подъезд"), ("floor", "этаж"), ("apartment", "кв."), ("intercom", "домофон"))
            if details.get(key)
        )
        lines.append(f"Доставка: {order.address_text}" + (f" ({extra})" if extra else ""))
    else:
        lines.append("Самовывоз")
    if order.scheduled_for:
        lines.append(f"Ко времени: {order.scheduled_for.astimezone().strftime('%d.%m %H:%M')}")
    if order.comment:
        lines.append(f"Комментарий: {order.comment}")
    return "\n".join(lines)


def _mod_label(mod: dict) -> str:
    title = mod["title"].lower() if mod.get("kind") == "remove" else mod["title"]
    return f"{title} ×{mod['quantity']}" if mod.get("quantity", 1) > 1 else title


def notify_new_order(order_id) -> None:
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            return
        text = order_text(order)
        keyboard = staff_actions_keyboard(order)
        recipients = sorted(settings.telegram_allowed_user_ids)
        messages = [(chat_id, text, keyboard) for chat_id in recipients]
        if order.telegram_user_id:
            messages.append((order.telegram_user_id, f"Заказ № {order.number} оформлен. Напишем здесь, когда кафе его примет.", None))
        _send_telegram(messages)
    except Exception:
        logger.exception("Failed to notify about a new order %s", order_id)
    finally:
        db.close()


def notify_status_change(order_id, status: str) -> None:
    template = CUSTOMER_MESSAGES.get(status)
    if not template:
        return
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            return
        text = template.format(number=order.number)
        if status in ("cancelled", "rejected") and order.cancel_reason:
            text += f": {order.cancel_reason}"
        customer = db.get(Customer, order.customer_id) if order.customer_id else None
        if customer and not customer.notify_status:
            return
        telegram_id = order.telegram_user_id or (customer.telegram_id if customer else None)
        if telegram_id:
            _send_telegram([(telegram_id, text, None)])
        if customer:
            tokens = [device.token for device in db.query(Device).filter(Device.customer_id == customer.id).all()]
            _send_push(tokens, "Брайт", text, {"order_id": str(order.id)})
    except Exception:
        logger.exception("Failed to notify about order %s status %s", order_id, status)
    finally:
        db.close()


def _send_telegram(messages: list[tuple[str, str, InlineKeyboardMarkup | None]]) -> None:
    if not settings.telegram_bot_token or not messages:
        return

    async def send() -> None:
        bot = Bot(token=settings.telegram_bot_token)
        try:
            for chat_id, text, keyboard in messages:
                try:
                    await bot.send_message(chat_id=chat_id, text=text, reply_markup=keyboard)
                except Exception:
                    logger.exception("Telegram message to %s failed", chat_id)
        finally:
            await bot.session.close()

    asyncio.run(send())


def _send_push(tokens: list[str], title: str, body: str, data: dict) -> None:
    tokens = [token for token in tokens if token.startswith("ExponentPushToken") or token.startswith("ExpoPushToken")]
    if not tokens:
        return
    try:
        httpx.post(
            EXPO_PUSH_URL,
            json=[{"to": token, "title": title, "body": body, "data": data, "sound": "default"} for token in tokens],
            timeout=10,
        )
    except httpx.HTTPError:
        logger.exception("Expo push failed")
