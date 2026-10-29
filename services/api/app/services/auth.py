from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from uuid import UUID

from fastapi import HTTPException, Request, Response, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.operator_user import OperatorUser

SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
PASSWORD_ITERATIONS = 260_000
ALLOWED_ROLES = {"operator", "manager", "admin"}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected = password_hash.split("$", maxsplit=3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), _unb64(salt), int(iterations))
        return hmac.compare_digest(_b64(digest), expected)
    except (ValueError, TypeError):
        return False


# Brute-force guard for the panel's login: after LOGIN_MAX_FAILS wrong passwords from one IP or for one username
# within LOGIN_WINDOW, that IP / username waits out the window. Kept in memory: the API runs as one process.
LOGIN_MAX_FAILS = 5
LOGIN_WINDOW = 15 * 60
_login_fails: dict[str, list[float]] = {}


def _recent_fails(key: str, now: float) -> list[float]:
    fails = [at for at in _login_fails.get(key, []) if now - at < LOGIN_WINDOW]
    if fails:
        _login_fails[key] = fails
    else:
        _login_fails.pop(key, None)
    return fails


def login_blocked_for(ip: str, username: str) -> int:
    """Seconds left to wait before another attempt, 0 when one is allowed."""
    now = time.time()
    waits = [LOGIN_WINDOW - (now - fails[0]) for key in (f"ip:{ip}", f"user:{username.strip().lower()}") if len(fails := _recent_fails(key, now)) >= LOGIN_MAX_FAILS]
    return int(max(waits)) + 1 if waits else 0


def record_login_result(ip: str, username: str, ok: bool) -> None:
    keys = (f"ip:{ip}", f"user:{username.strip().lower()}")
    if ok:
        for key in keys:
            _login_fails.pop(key, None)
        return
    now = time.time()
    for key in keys:
        _login_fails.setdefault(key, []).append(now)


def authenticate_operator(db: Session, username: str, password: str) -> OperatorUser | None:
    user = db.query(OperatorUser).filter(OperatorUser.username == username.strip()).first()
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def set_session_cookie(response: Response, user: OperatorUser, request: Request | None = None) -> None:
    expires_at = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"{user.id}:{user.role}:{expires_at}"
    signature = _sign(payload)
    response.set_cookie(
        settings.dashboard_cookie_name,
        f"{payload}:{signature}",
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=_should_use_secure_cookie(request),
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.dashboard_cookie_name, path="/")


def get_current_operator(db: Session, request: Request) -> OperatorUser:
    session = request.cookies.get(settings.dashboard_cookie_name)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    parts = session.split(":")
    if len(parts) != 4:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    user_id_raw, role, expires_at_raw, signature = parts
    payload = f"{user_id_raw}:{role}:{expires_at_raw}"
    if not hmac.compare_digest(_sign(payload), signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    if int(expires_at_raw) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = db.query(OperatorUser).filter(OperatorUser.id == UUID(user_id_raw)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive")
    return user


def ensure_role(user: OperatorUser, roles: set[str]) -> OperatorUser:
    if user.role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    return user


def ensure_bootstrap_operator(db: Session) -> None:
    username = settings.dashboard_bootstrap_username
    password = settings.dashboard_bootstrap_password
    if not username or not password:
        return
    role = settings.dashboard_bootstrap_role if settings.dashboard_bootstrap_role in ALLOWED_ROLES else "admin"
    try:
        existing = db.query(OperatorUser).filter(OperatorUser.username == username).first()
        if existing:
            return
        db.add(OperatorUser(username=username, password_hash=hash_password(password), role=role, is_active=True))
        db.commit()
    except SQLAlchemyError:
        db.rollback()


def _should_use_secure_cookie(request: Request | None) -> bool:
    if not request:
        return settings.app_base_url.startswith("https://") or (settings.telegram_webapp_base_url or "").startswith("https://")
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    if forwarded_proto:
        return forwarded_proto == "https"
    return request.url.scheme == "https"


def _sign(payload: str) -> str:
    return hmac.new(settings.dashboard_secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
