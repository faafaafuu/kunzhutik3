from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_operator
from app.models.operator_user import OperatorUser
from app.schemas.storefront import (
    StoreMenuResponse,
    StoreOrderCreateRequest,
    StoreOrderCreateResponse,
    StoreOrderListResponse,
    StoreOrderRead,
    StoreOrderStatusUpdateRequest,
)
from app.services.auth import get_current_operator
from app.services.storefront import create_store_order, get_storefront_payload, list_store_orders, update_store_order_status

router = APIRouter(tags=["storefront"])

STATIC_DIR = Path(__file__).resolve().parents[2] / "web"


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
def storefront_home() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@router.get("/tg", response_class=HTMLResponse, include_in_schema=False)
def telegram_storefront() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@router.get("/admin", response_class=HTMLResponse, include_in_schema=False)
@router.get("/admin/orders", response_class=HTMLResponse, include_in_schema=False)
def storefront_admin(request: Request, db: Session = Depends(get_db)):
    try:
        get_current_operator(db, request)
    except HTTPException:
        return RedirectResponse("/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    return FileResponse(STATIC_DIR / "admin.html")


@router.get("/api/v1/store/menu", response_model=StoreMenuResponse)
def get_menu() -> StoreMenuResponse:
    return StoreMenuResponse(**get_storefront_payload())


@router.post("/api/v1/store/orders", response_model=StoreOrderCreateResponse, status_code=201)
def create_order(payload: StoreOrderCreateRequest, db: Session = Depends(get_db)) -> StoreOrderCreateResponse:
    order, order_number = create_store_order(
        db,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        delivery_address=payload.delivery_address,
        delivery_slot=payload.delivery_slot,
        payment_method=payload.payment_method,
        comment=payload.comment,
        customer_profile=payload.customer_profile,
        items=[item.model_dump() for item in payload.items],
    )
    return StoreOrderCreateResponse(order=StoreOrderRead.model_validate(order), order_number=order_number)


@router.get("/api/v1/store/orders", response_model=StoreOrderListResponse)
def get_orders(db: Session = Depends(get_db), user: OperatorUser = Depends(require_operator)) -> StoreOrderListResponse:
    return StoreOrderListResponse(orders=[StoreOrderRead.model_validate(order) for order in list_store_orders(db)])


@router.patch("/api/v1/store/orders/{order_id}", response_model=StoreOrderRead)
def patch_order(
    order_id: UUID,
    payload: StoreOrderStatusUpdateRequest,
    db: Session = Depends(get_db),
    user: OperatorUser = Depends(require_operator),
) -> StoreOrderRead:
    order = update_store_order_status(db, order_id, payload.status, actor=f"dashboard:{user.username}")
    return StoreOrderRead.model_validate(order)
