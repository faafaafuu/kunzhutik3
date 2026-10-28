"""Sign-in that finishes outside the app: in the Telegram bot or on Google's page.

Telegram. The app asks for a login and gets a t.me link with a one-time token, plus a secret it keeps.
The bot receives /start login_<token>, remembers who opened it and asks them to share their phone with
one button; the shared contact confirms the login. Meanwhile the app polls `collect(secret)` and gets
the session once the login is confirmed. A contact shared through that button is the person's own number,
so the login lands on the account that already has it, guest orders included.

Google. The browser goes to /auth/google/start; the state is pinned to that browser with a cookie, so
nobody can slip their own half-finished login into someone else's tab. The callback trades the code for
the ID token directly with Google and sends the browser back with a one-time code in the URL fragment,
which the app trades for a session with the same `collect`.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode

import httpx
import jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError
from app.core.telegram import api_base as telegram_api_base
from app.models.customer import Customer, LoginRequest
from app.services.customers import normalize_phone
from app.services.venues import utcnow

logger = logging.getLogger(__name__)

LOGIN_TTL = timedelta(minutes=10)
CODE_TTL = timedelta(minutes=2)
STARTS_PER_IP_HOUR = 30
APP_SCHEME = "bright"
GOOGLE_COOKIE = "bright_google_state"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

_bot_username: str | None = None


def _hash(value: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"login:{value}".encode(), hashlib.sha256).hexdigest()


def _new_request(db: Session, provider: str, ip: str, return_to: str = "") -> tuple[str, str]:
    """A fresh login request; returns its (token, secret)."""
    now = utcnow()
    db.query(LoginRequest).filter(LoginRequest.expires_at < now - timedelta(days=1)).delete(synchronize_session=False)
    if ip:
        recent = db.query(func.count(LoginRequest.id)).filter(LoginRequest.ip == ip, LoginRequest.created_at >= now - timedelta(hours=1)).scalar()
        if recent >= STARTS_PER_IP_HOUR:
            raise ApiError("login_rate_limited", "Слишком много попыток входа. Попробуйте через час", status=429)
    # The token goes into a Telegram deep link: up to 64 characters of A-Z, a-z, 0-9, _ and -.
    token, secret = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
    db.add(LoginRequest(provider=provider, token_hash=_hash(token), secret_hash=_hash(secret), return_to=return_to, ip=ip, expires_at=now + LOGIN_TTL))
    db.commit()
    return token, secret


def _open_request(db: Session, provider: str, token: str) -> LoginRequest | None:
    request = db.query(LoginRequest).filter(LoginRequest.provider == provider, LoginRequest.token_hash == _hash(token)).first()
    if not request or request.used_at or request.customer_id or request.expires_at < utcnow():
        return None
    return request


def collect(db: Session, secret: str) -> Customer | None:
    """The customer of a confirmed login, handed out once; None while the login waits for confirmation."""
    request = db.query(LoginRequest).filter(LoginRequest.secret_hash == _hash(secret)).with_for_update().first()
    if not request or request.used_at or request.expires_at < utcnow():
        raise ApiError("login_expired", "Время на вход вышло, начните заново", status=410)
    if not request.customer_id:
        db.rollback()
        return None
    request.used_at = utcnow()
    customer = db.get(Customer, request.customer_id)
    db.commit()
    if not customer or customer.is_blocked:
        raise ApiError("login_expired", "Время на вход вышло, начните заново", status=410)
    return customer


# ---------- Telegram ----------


def telegram_bot_username() -> str:
    global _bot_username
    if settings.telegram_bot_username:
        return settings.telegram_bot_username.lstrip("@")
    if _bot_username:
        return _bot_username
    if not settings.telegram_bot_token:
        raise ApiError("telegram_unavailable", "Вход через Telegram скоро заработает. Пока войдите по номеру телефона", status=503)
    try:
        response = httpx.get(f"{telegram_api_base()}/bot{settings.telegram_bot_token}/getMe", timeout=10)
        _bot_username = response.json()["result"]["username"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("Telegram getMe failed: %s", exc)
        raise ApiError("telegram_unavailable", "Telegram сейчас не отвечает, попробуйте ещё раз", status=503) from exc
    return _bot_username


def start_telegram(db: Session, ip: str) -> dict:
    username = telegram_bot_username()
    token, secret = _new_request(db, "telegram", ip)
    return {
        "url": f"https://t.me/{username}?start=login_{token}",
        "secret": secret,
        "expires_in": int(LOGIN_TTL.total_seconds()),
    }


def telegram_link_opened(db: Session, token: str, telegram_id: str) -> bool:
    """/start login_<token> in the bot: remembers who is signing in. False when the link is stale."""
    request = _open_request(db, "telegram", token)
    if not request:
        return False
    request.telegram_id = telegram_id
    db.commit()
    return True


def telegram_contact_shared(db: Session, user: dict, raw_phone: str) -> Customer | None:
    """The person's own contact, shared in the bot, confirms their latest open login. None when there is none."""
    telegram_id = str(user["id"])
    request = (
        db.query(LoginRequest)
        .filter(
            LoginRequest.provider == "telegram",
            LoginRequest.telegram_id == telegram_id,
            LoginRequest.customer_id.is_(None),
            LoginRequest.used_at.is_(None),
            LoginRequest.expires_at > utcnow(),
        )
        .order_by(LoginRequest.created_at.desc())
        .first()
    )
    if not request:
        return None
    try:
        phone = normalize_phone(raw_phone)
    except ApiError:
        phone = None  # A foreign number: sign in without it, the phone is asked at checkout.
    customer = db.query(Customer).filter(Customer.telegram_id == telegram_id).first()
    if not customer and phone:
        customer = db.query(Customer).filter(Customer.phone == phone).first()
    if not customer:
        customer = Customer(source="telegram")
        db.add(customer)
    customer.telegram_id = telegram_id
    customer.telegram_username = user.get("username") or customer.telegram_username
    if phone and not customer.phone and not db.query(Customer.id).filter(Customer.phone == phone).first():
        customer.phone = phone
    if not customer.name:
        customer.name = " ".join(part for part in (user.get("first_name"), user.get("last_name")) if part)[:160]
    customer.is_registered = True
    db.flush()
    request.customer_id = customer.id
    db.commit()
    return customer


# ---------- Google ----------


def google_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def _redirect_uri() -> str:
    return f"{settings.app_base_url.rstrip('/')}/auth/google/callback"


def safe_return_to(value: str) -> str:
    """Only back to this site or into the app: anywhere else the login code would go to a stranger."""
    base = settings.app_base_url.rstrip("/")
    value = (value or "").split("#", 1)[0]
    if value == base or value.startswith(f"{base}/") or value.startswith(f"{APP_SCHEME}://"):
        return value[:300]
    return f"{base}/login"


def with_fragment(url: str, **params: str) -> str:
    return f"{url.split('#', 1)[0]}#{urlencode(params)}"


def start_google(db: Session, ip: str, return_to: str) -> tuple[str, str]:
    """Google's consent page URL and the state to pin in the browser's cookie."""
    if not google_configured():
        raise ApiError("google_unavailable", "Вход через Google скоро заработает. Пока войдите по номеру телефона", status=503)
    state, _ = _new_request(db, "google", ip, safe_return_to(return_to))
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": _redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return f"{GOOGLE_AUTH_URL}?{query}", state


def finish_google(db: Session, state: str, cookie_state: str, code: str, error: str) -> str:
    """Where to send the browser after Google: back with a one-time login code, or with the reason it failed."""
    request = _open_request(db, "google", state) if state else None
    back = request.return_to if request else safe_return_to("")
    if error:
        return with_fragment(back, login_error="cancelled")
    if not request or not code or not cookie_state or not hmac.compare_digest(cookie_state, state):
        return with_fragment(back, login_error="login_expired")
    try:
        customer = _customer_for_google(db, _google_claims(code))
    except ApiError as exc:
        return with_fragment(back, login_error=exc.code)
    login_code = secrets.token_urlsafe(32)
    request.customer_id = customer.id
    request.secret_hash = _hash(login_code)
    request.expires_at = utcnow() + CODE_TTL
    db.commit()
    return with_fragment(back, login_code=login_code)


def _google_claims(code: str) -> dict:
    try:
        response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": _redirect_uri(),
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ApiError("google_failed", "Google не ответил, попробуйте ещё раз", status=502) from exc
    id_token = payload.get("id_token")
    if response.status_code != 200 or not id_token:
        logger.warning("Google refused the code: %s", payload.get("error"))
        raise ApiError("google_failed", "Google не подтвердил вход, попробуйте ещё раз", status=502)
    # Received straight from Google's token endpoint over TLS, so the signature needs no second check
    # (developers.google.com/identity/openid-connect/openid-connect#obtainuserinfo); the audience does.
    claims = jwt.decode(id_token, options={"verify_signature": False})
    if claims.get("aud") != settings.google_client_id or claims.get("iss") not in GOOGLE_ISSUERS or not claims.get("sub"):
        raise ApiError("google_failed", "Google не подтвердил вход, попробуйте ещё раз", status=502)
    return claims


def _customer_for_google(db: Session, claims: dict) -> Customer:
    google_id = str(claims["sub"])
    customer = db.query(Customer).filter(Customer.google_id == google_id).first()
    if not customer:
        customer = Customer(google_id=google_id, source="web")
        db.add(customer)
    if claims.get("email_verified") and claims.get("email"):
        customer.email = str(claims["email"])[:200]
    if not customer.name:
        customer.name = str(claims.get("name") or "")[:160]
    customer.is_registered = True
    db.flush()
    return customer
