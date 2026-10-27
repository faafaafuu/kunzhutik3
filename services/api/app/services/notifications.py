from __future__ import annotations

import asyncio
import logging

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.core.config import settings

logger = logging.getLogger(__name__)

ORDER_STATUS_LABELS = {
    "new": "Новый",
    "confirmed": "Принят",
    "preparing": "Готовится",
    "delivering": "В доставке",
    "completed": "Выполнен",
    "cancelled": "Отменён",
}


def notify_new_order(
    order_id: str,
    order_number: str,
    order_summary: str,
    *,
    customer_telegram_id: str | None = None,
) -> None:
    if not settings.telegram_bot_token:
        return

    recipient_ids = sorted(settings.telegram_allowed_user_ids)
    if not recipient_ids and not customer_telegram_id:
        return

    try:
        asyncio.run(_send_order_notifications(recipient_ids, order_id, order_number, order_summary, customer_telegram_id))
    except Exception:
        logger.exception("Failed to send Telegram notifications for order %s", order_number)


def notify_order_status_update(order_number: str, status: str, *, customer_telegram_id: str | None = None) -> None:
    if not settings.telegram_bot_token or not customer_telegram_id:
        return

    try:
        asyncio.run(_send_customer_status_update(order_number, status, customer_telegram_id))
    except Exception:
        logger.exception("Failed to send Telegram status update for order %s", order_number)


def build_order_status_keyboard(order_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Принять", callback_data=f"order_status:{order_id}:confirmed"),
                InlineKeyboardButton(text="Готовится", callback_data=f"order_status:{order_id}:preparing"),
            ],
            [
                InlineKeyboardButton(text="В доставке", callback_data=f"order_status:{order_id}:delivering"),
                InlineKeyboardButton(text="Выполнен", callback_data=f"order_status:{order_id}:completed"),
            ],
            [
                InlineKeyboardButton(text="Отмена", callback_data=f"order_status:{order_id}:cancelled"),
            ],
        ]
    )


async def _send_order_notifications(
    recipient_ids: list[str],
    order_id: str,
    order_number: str,
    order_summary: str,
    customer_telegram_id: str | None,
) -> None:
    bot = Bot(token=settings.telegram_bot_token)
    try:
        for recipient_id in recipient_ids:
            await bot.send_message(
                chat_id=recipient_id,
                text=f"Новый заказ {order_number}\n\n{order_summary}",
                reply_markup=build_order_status_keyboard(order_id),
            )
        if customer_telegram_id:
            await bot.send_message(
                chat_id=customer_telegram_id,
                text=f"Заказ {order_number} принят. Скоро подтвердим и напишем статус здесь.",
            )
    finally:
        await bot.session.close()


async def _send_customer_status_update(order_number: str, status: str, customer_telegram_id: str) -> None:
    status_label = ORDER_STATUS_LABELS.get(status, status)
    bot = Bot(token=settings.telegram_bot_token)
    try:
        await bot.send_message(
            chat_id=customer_telegram_id,
            text=f"Статус заказа {order_number}: {status_label}.",
        )
    finally:
        await bot.session.close()
