"""Customer sign-in: SMS code, Telegram WebApp, access and refresh tokens."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

import httpx
import jwt
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError
from app.models.customer import Customer, CustomerSession, OtpCode
from app.services.venues import utcnow

logger = logging.getLogger(__name__)

OTP_LENGTH = 4
OTP_TTL = timedelta(minutes=5)
OTP_RESEND_AFTER = timedelta(seconds=60)
OTP_PER_PHONE_HOUR = 5
OTP_PER_IP_HOUR = 20
OTP_MAX_ATTEMPTS = 5
TELEGRAM_AUTH_MAX_AGE = timedelta(hours=24)


def normalize_phone(raw: str) -> str:
    """+7XXXXXXXXXX for Russian numbers; raises phone_invalid otherwise."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "7" + digits
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) != 11 or digits[0] != "7":
        raise ApiError("phone_invalid", "Введите номер в формате +7 900 000-00-00", status=422)
    return "+" + digits


def format_phone(phone: str | None) -> str:
    if not phone or len(phone) != 12:
        return phone or ""
    return f"+7 ({phone[2:5]}) {phone[5:8]}-{phone[8:10]}-{phone[10:12]}"


# ---------- SMS codes ----------


def request_otp(db: Session, raw_phone: str, ip: str) -> dict:
    phone = normalize_phone(raw_phone)
    now = utcnow()
    hour_ago = now - timedelta(hours=1)

    last = db.query(OtpCode).filter(OtpCode.phone == phone).order_by(OtpCode.created_at.desc()).first()
    if last and now - last.created_at < OTP_RESEND_AFTER:
        wait = int((OTP_RESEND_AFTER - (now - last.created_at)).total_seconds()) + 1
        raise ApiError("otp_rate_limited", f"Новый код можно запросить через {wait} с", status=429, details={"retry_after": wait})
    per_phone = db.query(func.count(OtpCode.id)).filter(OtpCode.phone == phone, OtpCode.created_at >= hour_ago).scalar()
    per_ip = db.query(func.count(OtpCode.id)).filter(OtpCode.ip == ip, OtpCode.created_at >= hour_ago).scalar() if ip else 0
    if per_phone >= OTP_PER_PHONE_HOUR or per_ip >= OTP_PER_IP_HOUR:
        oldest = (
            db.query(func.min(OtpCode.created_at)).filter(OtpCode.phone == phone, OtpCode.created_at >= hour_ago).scalar() or now
        )
        wait = max(60, int((oldest + timedelta(hours=1) - now).total_seconds()))
        raise ApiError(
            "otp_rate_limited",
            f"Слишком много попыток. Новый код можно запросить через {max(1, wait // 60)} мин",
            status=429,
            details={"retry_after": wait},
        )

    code = "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))
    db.add(OtpCode(phone=phone, code_hash=_otp_hash(phone, code), ip=ip, expires_at=now + OTP_TTL))
    db.commit()
    if not _send_sms(phone, f"Код для входа в Брайт: {code}"):
        raise ApiError("sms_failed", "Не получилось отправить СМС с кодом. Войдите через Telegram или попробуйте чуть позже", status=502)

    # Same answer whether or not the number is known.
    result = {"phone": phone, "retry_after": int(OTP_RESEND_AFTER.total_seconds()), "length": OTP_LENGTH}
    if settings.otp_debug and not settings.is_production:
        result["debug_code"] = code
    return result


def verify_otp(db: Session, raw_phone: str, code: str) -> Customer:
    phone = normalize_phone(raw_phone)
    now = utcnow()
    record = (
        db.query(OtpCode)
        .filter(OtpCode.phone == phone, OtpCode.used_at.is_(None), OtpCode.expires_at > now)
        .order_by(OtpCode.created_at.desc())
        .with_for_update()
        .first()
    )
    if not record or record.attempts >= OTP_MAX_ATTEMPTS:
        raise ApiError("otp_invalid", "Код неверный или истёк", status=400)
    record.attempts += 1
    if not hmac.compare_digest(record.code_hash, _otp_hash(phone, code.strip())):
        db.commit()
        raise ApiError("otp_invalid", "Код неверный или истёк", status=400, details={"attempts_left": OTP_MAX_ATTEMPTS - record.attempts})
    record.used_at = now
    customer = db.query(Customer).filter(Customer.phone == phone).first()
    if not customer:
        customer = Customer(phone=phone, source="app")
        db.add(customer)
    customer.is_registered = True
    db.commit()
    return customer


def _otp_hash(phone: str, code: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"otp:{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def _send_sms(phone: str, text: str) -> bool:
    """True when the message went out (or was written to the log). sms.ru answers "OK" for the request even when it
    refused the number itself, so the per-number status is what counts."""
    if settings.sms_provider == "smsru" and settings.smsru_api_id:
        to = phone.lstrip("+")
        try:
            response = httpx.post("https://sms.ru/sms/send", data={"api_id": settings.smsru_api_id, "to": to, "msg": text, "json": 1}, timeout=10)
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            logger.exception("sms.ru request failed")
            return False
        sent = (payload.get("sms") or {}).get(to) or {}
        if payload.get("status") != "OK" or sent.get("status") != "OK":
            logger.error("sms.ru refused the message to %s: %s %s", phone, sent.get("status_code") or payload.get("status_code"), sent.get("status_text") or payload.get("status_text"))
            return False
        return True
    logger.warning("SMS to %s: %s", phone, text)
    return True


# ---------- Telegram WebApp ----------


def verify_telegram_init_data(init_data: str) -> dict:
    """Checks the WebApp initData signature (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)."""
    if not settings.telegram_bot_token:
        raise ApiError("telegram_unavailable", "Вход через Telegram не настроен", status=503)
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", "")
    check_string = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", settings.telegram_bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not received_hash or not hmac.compare_digest(expected, received_hash):
        raise ApiError("telegram_invalid", "Подпись Telegram не сошлась", status=401)
    auth_date = datetime.fromtimestamp(int(pairs.get("auth_date", "0")), tz=timezone.utc)
    if utcnow() - auth_date > TELEGRAM_AUTH_MAX_AGE:
        raise ApiError("telegram_invalid", "Данные Telegram устарели, откройте приложение заново", status=401)
    try:
        return json.loads(pairs.get("user", "{}"))
    except ValueError as exc:
        raise ApiError("telegram_invalid", "Нет данных пользователя Telegram", status=401) from exc


def customer_from_telegram(db: Session, user: dict) -> Customer:
    telegram_id = str(user.get("id") or "")
    if not telegram_id:
        raise ApiError("telegram_invalid", "Нет данных пользователя Telegram", status=401)
    customer = db.query(Customer).filter(Customer.telegram_id == telegram_id).first()
    if not customer:
        name = " ".join(part for part in (user.get("first_name"), user.get("last_name")) if part)
        customer = Customer(telegram_id=telegram_id, name=name, source="telegram")
        db.add(customer)
    customer.telegram_username = user.get("username") or customer.telegram_username
    customer.is_registered = True
    db.commit()
    return customer


# ---------- tokens ----------


def issue_tokens(db: Session, customer: Customer) -> dict:
    now = utcnow()
    access_expires = now + timedelta(minutes=settings.customer_access_ttl_minutes)
    access = jwt.encode({"sub": str(customer.id), "typ": "access", "exp": access_expires, "iat": now}, settings.jwt_secret, algorithm="HS256")
    refresh = secrets.token_urlsafe(40)
    db.add(
        CustomerSession(
            customer_id=customer.id,
            token_hash=_refresh_hash(refresh),
            expires_at=now + timedelta(days=settings.customer_refresh_ttl_days),
        )
    )
    db.commit()
    return {"access_token": access, "refresh_token": refresh, "expires_at": access_expires.isoformat(), "token_type": "bearer"}


def refresh_tokens(db: Session, refresh: str) -> tuple[Customer, dict]:
    session = db.query(CustomerSession).filter(CustomerSession.token_hash == _refresh_hash(refresh)).with_for_update().first()
    if not session or session.revoked_at or session.expires_at < utcnow():
        raise ApiError("session_expired", "Войдите заново", status=401)
    session.revoked_at = utcnow()
    customer = db.get(Customer, session.customer_id)
    if not customer or customer.is_blocked:
        db.commit()
        raise ApiError("session_expired", "Войдите заново", status=401)
    return customer, issue_tokens(db, customer)


def revoke_refresh(db: Session, refresh: str) -> None:
    session = db.query(CustomerSession).filter(CustomerSession.token_hash == _refresh_hash(refresh)).first()
    if session and not session.revoked_at:
        session.revoked_at = utcnow()
        db.commit()


def customer_from_access_token(db: Session, token: str) -> Customer:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise ApiError("token_expired", "Сессия истекла", status=401) from exc
    except jwt.PyJWTError as exc:
        raise ApiError("token_invalid", "Нужно войти", status=401) from exc
    if payload.get("typ") != "access":
        raise ApiError("token_invalid", "Нужно войти", status=401)
    customer = db.get(Customer, payload.get("sub"))
    if not customer or customer.is_blocked:
        raise ApiError("token_invalid", "Нужно войти", status=401)
    return customer


def _refresh_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------- CRM record ----------


def is_new_phone(db: Session, raw_phone: str) -> bool:
    return db.query(Customer.id).filter(Customer.phone == normalize_phone(raw_phone)).first() is None


def upsert_by_phone(db: Session, phone: str, name: str, *, source: str, signed_in: Customer | None) -> Customer:
    """The customer an order belongs to. Signed-in customers keep their record; guests are matched by phone."""
    if signed_in:
        if not signed_in.phone:
            taken = db.query(Customer).filter(Customer.phone == phone, Customer.id != signed_in.id).first()
            if not taken:
                signed_in.phone = phone
        if not signed_in.name:
            signed_in.name = name
        return signed_in
    customer = db.query(Customer).filter(Customer.phone == phone).first()
    if customer:
        if not customer.name:
            customer.name = name
        return customer
    customer = Customer(phone=phone, name=name, source=source)
    db.add(customer)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        customer = db.query(Customer).filter(Customer.phone == phone).one()
    return customer


def customer_payload(customer: Customer) -> dict:
    return {
        "id": str(customer.id),
        "phone": customer.phone,
        "phone_display": format_phone(customer.phone),
        "name": customer.name,
        "email": customer.email,
        "telegram_linked": bool(customer.telegram_id),
        "google_linked": bool(customer.google_id),
        "notify_status": customer.notify_status,
        "notify_bonus": customer.notify_bonus,
        "notify_promo": customer.notify_promo,
    }
