"""Telegram bot: the storefront button for customers, the order feed for staff.

Staff are the Telegram ids in TELEGRAM_ALLOWED_USER_IDS. They get every new order with buttons
for the next status and can list active orders with /orders. An empty list means no staff:
nobody changes orders from Telegram.

Couriers are not here yet: when they are, the order goes to them on "Готов" (docs/roadmap.md).
"""

import asyncio
import logging
from uuid import UUID

from aiogram import Dispatcher, F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    BotCommand,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError
from app.core.telegram import make_bot
from app.db.session import SessionLocal
from app.models.order import Order
from app.models.venue import Venue
from app.services.menu import menu_payload
from app.services.notifications import STATUS_LABELS, notify_status_change, order_text, staff_actions_keyboard
from app.services.orders import ACTIVE_STATUSES, load_order, transition
from app.services.social_auth import telegram_contact_shared, telegram_link_opened
from app.services.venues import default_venue, hours_text, is_open
from app.store.catalog import BRAND_NAME

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)
router = Router()

# Reasons a staff member can pick in one tap when declining or cancelling.
REASONS = ["Закончились продукты", "Не успеваем", "Клиент не отвечает"]


def storefront_url() -> str:
    return f"{(settings.telegram_webapp_base_url or settings.app_base_url).rstrip('/')}/tg"


def storefront_keyboard() -> InlineKeyboardMarkup:
    url = storefront_url()
    # Telegram opens a WebApp only over HTTPS; locally the button is a plain link.
    if url.startswith("https://"):
        button = InlineKeyboardButton(text="Открыть меню и заказать", web_app=WebAppInfo(url=url))
    else:
        button = InlineKeyboardButton(text="Открыть меню", url=url)
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


def is_staff(user_id: int) -> bool:
    return str(user_id) in settings.telegram_allowed_user_ids


# "Войти через Telegram" on the site opens t.me/<bot>?start=login_<token>. Registered before the plain /start.
@router.message(CommandStart(deep_link=True, magic=F.args.startswith("login_")))
async def login_link(message: Message, command: CommandObject) -> None:
    db: Session = SessionLocal()
    try:
        opened = telegram_link_opened(db, command.args.removeprefix("login_"), str(message.from_user.id))
    finally:
        db.close()
    if not opened:
        await message.answer("Ссылка для входа устарела. Вернитесь на сайт и нажмите «Войти через Telegram» ещё раз.")
        return
    keyboard = ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text="Подтвердить вход", request_contact=True)]], resize_keyboard=True, one_time_keyboard=True)
    await message.answer(
        f"Вход в {BRAND_NAME}.\nНажмите «Подтвердить вход» — Telegram передаст нам ваш номер, по нему курьер свяжется с вами.\n\n"
        "Если вы не входили на сайт, ничего не нажимайте.",
        reply_markup=keyboard,
    )


@router.message(F.contact)
async def contact_shared(message: Message) -> None:
    # Only the button shares the sender's own number; a forwarded contact belongs to someone else.
    if message.contact.user_id != message.from_user.id:
        await message.answer("Нужен ваш собственный номер: нажмите кнопку «Подтвердить вход».")
        return
    user = message.from_user
    db: Session = SessionLocal()
    try:
        customer = telegram_contact_shared(
            db,
            {"id": user.id, "first_name": user.first_name, "last_name": user.last_name, "username": user.username},
            message.contact.phone_number,
        )
    finally:
        db.close()
    if not customer:
        await message.answer("Не нашли начатого входа. Нажмите «Войти через Telegram» на сайте ещё раз.", reply_markup=ReplyKeyboardRemove())
        return
    await message.answer("Готово, вы вошли. Вернитесь в браузер или в приложение — заказ можно оформлять.", reply_markup=ReplyKeyboardRemove())


@router.message(CommandStart())
async def start(message: Message) -> None:
    text = f"{BRAND_NAME}: поке, роллы и кофе с доставкой.\nНажмите кнопку, чтобы открыть меню и оформить заказ."
    if is_staff(message.from_user.id):
        text += "\n\nВы сотрудник: новые заказы будут приходить сюда. Активные — /orders."
    await message.answer(text, reply_markup=storefront_keyboard())


@router.message(Command("contacts"))
async def contacts(message: Message) -> None:
    db: Session = SessionLocal()
    try:
        venue = default_venue(db)
        if not venue:
            await message.answer("Скоро откроемся.")
            return
        state = "сейчас открыто" if is_open(venue) else "сейчас закрыто"
        await message.answer(
            f"{BRAND_NAME}\n{venue.city}, {venue.address}\nТелефон: {venue.phone}\nГрафик: {hours_text(venue)} ({state})\n"
            f"Маршрут: https://yandex.ru/maps/?rtext=~{venue.latitude},{venue.longitude}"
        )
    finally:
        db.close()


@router.message(Command("menu"))
async def menu(message: Message) -> None:
    db: Session = SessionLocal()
    try:
        payload = menu_payload(db, default_venue(db))
    finally:
        db.close()
    titles = {category["id"]: category["title"] for category in payload["categories"]}
    lines = [f"Меню {BRAND_NAME}:"]
    current = None
    for item in payload["items"]:
        if item["category_id"] != current:
            current = item["category_id"]
            lines += ["", titles[current]]
        sold_out = " — закончилось" if not item["is_available"] else ""
        lines.append(f"• {item['title']} — {int(float(item['price']))} ₽{sold_out}")
    await message.answer("\n".join(lines), reply_markup=storefront_keyboard())


@router.message(Command("orders"))
async def orders(message: Message) -> None:
    if not is_staff(message.from_user.id):
        await message.answer("Эта команда для сотрудников.")
        return
    db: Session = SessionLocal()
    try:
        active = db.query(Order).filter(Order.status.in_(ACTIVE_STATUSES)).order_by(Order.created_at).limit(20).all()
        if not active:
            await message.answer("Активных заказов нет.")
            return
        venues = {venue.id: venue.title for venue in db.query(Venue).all()}
        for order in active:
            await message.answer(order_text(order, venues.get(order.venue_id, "")), reply_markup=staff_actions_keyboard(order))
    finally:
        db.close()


@router.callback_query(F.data.startswith("order:"))
async def order_action(callback: CallbackQuery) -> None:
    if not is_staff(callback.from_user.id):
        await callback.answer("Заказами управляют только сотрудники.", show_alert=True)
        return
    try:
        _, order_id, status = callback.data.split(":", maxsplit=2)
        order_uuid = UUID(order_id)
    except ValueError:
        await callback.answer("Некорректная команда", show_alert=True)
        return

    if status in ("rejected", "cancelled"):
        # Ask for a reason first: the customer sees it.
        buttons = [[InlineKeyboardButton(text=reason, callback_data=f"why:{order_id}:{status}:{index}")] for index, reason in enumerate(REASONS)]
        buttons.append([InlineKeyboardButton(text="← Назад", callback_data=f"back:{order_id}")])
        await callback.message.edit_reply_markup(reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))
        await callback.answer("Выберите причину")
        return
    await _apply(callback, order_uuid, status, "")


@router.callback_query(F.data.startswith("why:"))
async def reason_chosen(callback: CallbackQuery) -> None:
    if not is_staff(callback.from_user.id):
        await callback.answer("Заказами управляют только сотрудники.", show_alert=True)
        return
    _, order_id, status, index = callback.data.split(":", maxsplit=3)
    await _apply(callback, UUID(order_id), status, REASONS[int(index)])


@router.callback_query(F.data.startswith("back:"))
async def back(callback: CallbackQuery) -> None:
    db: Session = SessionLocal()
    try:
        order = load_order(db, UUID(callback.data.split(":", 1)[1]))
        await callback.message.edit_reply_markup(reply_markup=staff_actions_keyboard(order))
        await callback.answer()
    finally:
        db.close()


async def _apply(callback: CallbackQuery, order_id: UUID, status: str, reason: str) -> None:
    user = callback.from_user
    actor = f"telegram:{user.id}:{user.username or user.first_name}"
    db: Session = SessionLocal()
    try:
        order = load_order(db, order_id)
        try:
            order = transition(db, order, status, actor=actor, comment=reason)
        except ApiError as error:
            await callback.answer(error.message, show_alert=True)
            return
        venue = db.get(Venue, order.venue_id)
        await callback.answer(f"Заказ № {order.number}: {STATUS_LABELS[status].lower()}")
        if callback.message:
            await callback.message.edit_text(order_text(order, venue.title if venue else ""), reply_markup=staff_actions_keyboard(order))
    finally:
        db.close()
    await asyncio.to_thread(notify_status_change, order_id, status)


async def main() -> None:
    if not settings.telegram_bot_token:
        # Idle instead of exiting: the container is restart: unless-stopped,
        # and a bare return would make it restart in a loop.
        logger.warning("TELEGRAM_BOT_TOKEN is empty; bot is idle")
        while True:
            await asyncio.sleep(3600)
    if not settings.telegram_allowed_user_ids:
        logger.warning("TELEGRAM_ALLOWED_USER_IDS is empty: nobody will get orders in Telegram")
    bot = make_bot()
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Открыть меню"),
            BotCommand(command="menu", description="Меню и цены"),
            BotCommand(command="contacts", description="Адрес и телефон"),
            BotCommand(command="orders", description="Активные заказы (для сотрудников)"),
        ]
    )
    dp = Dispatcher()
    dp.include_router(router)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
