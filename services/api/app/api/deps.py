from collections.abc import Generator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.operator_user import OperatorUser
from app.services.auth import ensure_role, get_current_operator


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_operator(request: Request, db: Session = Depends(get_db)) -> OperatorUser:
    return ensure_role(get_current_operator(db, request), {"operator", "admin"})


def require_admin(request: Request, db: Session = Depends(get_db)) -> OperatorUser:
    return ensure_role(get_current_operator(db, request), {"admin"})
