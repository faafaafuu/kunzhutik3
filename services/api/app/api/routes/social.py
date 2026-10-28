"""Sign-in with Telegram (through the bot) and Google; the logic is in services/social_auth.py."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_db
from app.core.config import settings
from app.core.errors import ApiError
from app.services.customers import customer_payload, issue_tokens
from app.services.social_auth import (
    GOOGLE_COOKIE,
    LOGIN_TTL,
    collect,
    finish_google,
    safe_return_to,
    start_google,
    start_telegram,
    with_fragment,
)

router = APIRouter(tags=["social-login"])


class CollectRequest(BaseModel):
    secret: str = Field(min_length=20, max_length=100)


@router.post("/api/v1/auth/telegram/start")
def telegram_start(request: Request, db: Session = Depends(get_db)) -> dict:
    return start_telegram(db, client_ip(request))


@router.post("/api/v1/auth/collect")
def collect_login(payload: CollectRequest, db: Session = Depends(get_db)) -> dict:
    """Polled by the app while the person confirms in Telegram; called once after Google's redirect."""
    customer = collect(db, payload.secret)
    if not customer:
        return {"status": "pending"}
    return {"status": "ok", "customer": customer_payload(customer), "tokens": issue_tokens(db, customer)}


@router.get("/auth/google/start", include_in_schema=False)
def google_start(request: Request, return_to: str = "", db: Session = Depends(get_db)):
    try:
        url, state = start_google(db, client_ip(request), return_to)
    except ApiError as error:
        return RedirectResponse(with_fragment(safe_return_to(return_to), login_error=error.code), status_code=303)
    response = RedirectResponse(url, status_code=303)
    response.set_cookie(
        GOOGLE_COOKIE,
        state,
        max_age=int(LOGIN_TTL.total_seconds()),
        httponly=True,
        secure=settings.app_base_url.startswith("https://"),
        samesite="lax",
        path="/auth/google",
    )
    return response


@router.get("/auth/google/callback", include_in_schema=False)
def google_callback(request: Request, state: str = "", code: str = "", error: str = "", db: Session = Depends(get_db)):
    target = finish_google(db, state, request.cookies.get(GOOGLE_COOKIE, ""), code, error)
    response = RedirectResponse(target, status_code=303)
    response.delete_cookie(GOOGLE_COOKIE, path="/auth/google")
    return response
