from collections.abc import Generator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.db.session import SessionLocal
from app.models.customer import Customer
from app.models.operator_user import OperatorUser
from app.services.auth import ensure_role, get_current_operator
from app.services.customers import customer_from_access_token


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_operator(request: Request, db: Session = Depends(get_db)) -> OperatorUser:
    return ensure_role(get_current_operator(db, request), {"operator", "manager", "admin"})


def require_manager(request: Request, db: Session = Depends(get_db)) -> OperatorUser:
    return ensure_role(get_current_operator(db, request), {"manager", "admin"})


def require_admin(request: Request, db: Session = Depends(get_db)) -> OperatorUser:
    return ensure_role(get_current_operator(db, request), {"admin"})


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def optional_customer(request: Request, db: Session = Depends(get_db)) -> Customer | None:
    """The signed-in customer, or None for a guest. A broken token is an error, not a guest."""
    token = _bearer(request)
    if not token:
        return None
    return customer_from_access_token(db, token)


def require_customer(customer: Customer | None = Depends(optional_customer)) -> Customer:
    if not customer:
        raise ApiError("auth_required", "Нужно войти", status=401)
    return customer


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""
