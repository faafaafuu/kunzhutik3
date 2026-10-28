"""The Telegram Bot API: api.telegram.org, or the same through a tunnel where Telegram is blocked.

In Russian clouds api.telegram.org does not answer. There TELEGRAM_API_BASE points at a local SSH tunnel to
a server abroad (https://api.telegram.org:8443 with api.telegram.org resolved to the tunnel): TLS still ends
at Telegram, the tunnel only carries the bytes, so the bot token stays encrypted all the way.
"""

from aiogram import Bot
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer

from app.core.config import settings


def api_base() -> str:
    return settings.telegram_api_base.rstrip("/")


def make_bot() -> Bot:
    return Bot(token=settings.telegram_bot_token, session=AiohttpSession(api=TelegramAPIServer.from_base(api_base())))
