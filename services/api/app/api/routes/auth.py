from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_operator
from app.models.operator_user import OperatorUser
from app.schemas.auth import LoginRequest, LoginResponse, OperatorMe
from app.services.auth import authenticate_operator, clear_session_cookie, set_session_cookie

router = APIRouter(tags=["auth"])

STATIC_DIR = Path(__file__).resolve().parents[2] / "web"


@router.get("/admin/login", include_in_schema=False)
def admin_login_page(request: Request, db: Session = Depends(get_db)):
    try:
        require_operator(request, db)
        return RedirectResponse("/admin/orders", status_code=status.HTTP_303_SEE_OTHER)
    except HTTPException:
        return FileResponse(STATIC_DIR / "login.html")


@router.post("/api/v1/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    user = authenticate_operator(db, payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    set_session_cookie(response, user, request)
    return LoginResponse(user=_to_me(user))


@router.post("/api/v1/auth/logout")
def logout(response: Response) -> dict:
    clear_session_cookie(response)
    return {"status": "ok"}


@router.get("/api/v1/auth/me", response_model=OperatorMe)
def me(user: OperatorUser = Depends(require_operator)) -> OperatorMe:
    return _to_me(user)


def _to_me(user: OperatorUser) -> OperatorMe:
    return OperatorMe(id=user.id, username=user.username, role=user.role)
