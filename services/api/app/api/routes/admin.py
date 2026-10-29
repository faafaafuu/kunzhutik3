"""Operator panel API. Base path /api/v1/admin, cookie session, rights by role.

This contract moves together with the panel, so it may change freely (docs/api.md).
"""

from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_db, require_admin, require_manager, require_operator
from app.core.errors import ApiError, money_str
from app.models.menu import MenuCategory, MenuItem, VenueMenuItem
from app.models.operator_user import OperatorUser
from app.models.order import Order, PromoCode
from app.models.promotion import Promotion
from app.services.promotions import promotion_payload
from app.models.venue import DeliveryZone, Venue
from app.schemas.orders import TransitionRequest
from app.services import crm, geo
from app.services.auth import ALLOWED_ROLES, hash_password
from app.services.menu import effective_price, is_available, venue_overrides
from app.services.notifications import notify_status_change
from app.services.orders import admin_order_payload, list_admin_orders, load_order, transition
from app.services.venues import WEEKDAYS, get_venue, resolve_delivery, utcnow, venue_payload, zone_payload

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ---------- orders ----------


@router.get("/orders")
def admin_orders(
    group: str = Query(default="active", pattern="^(active|done|all)$"),
    days: int = Query(default=2, ge=1, le=90),
    db: Session = Depends(get_db),
    user: OperatorUser = Depends(require_operator),
) -> dict:
    since = None if group == "active" else utcnow() - timedelta(days=days)
    orders = list_admin_orders(db, status_group=group, since=since)
    venues = {venue.id: venue for venue in db.query(Venue).all()}
    return {"orders": [admin_order_payload(order, venues.get(order.venue_id)) for order in orders]}


@router.get("/orders/{order_id}")
def admin_order(order_id: UUID, db: Session = Depends(get_db), user: OperatorUser = Depends(require_operator)) -> dict:
    order = load_order(db, order_id)
    return {"order": admin_order_payload(order, db.get(Venue, order.venue_id))}


@router.post("/orders/{order_id}/transition")
def admin_transition(
    order_id: UUID,
    payload: TransitionRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: OperatorUser = Depends(require_operator),
) -> dict:
    order = load_order(db, order_id)
    order = transition(
        db,
        order,
        payload.to,
        actor=f"operator:{user.username}",
        comment=payload.comment,
        promised_in_minutes=payload.promised_in_minutes,
    )
    background.add_task(notify_status_change, order.id, order.status)
    return {"order": admin_order_payload(order, db.get(Venue, order.venue_id))}


# ---------- venues and zones ----------


class VenuePatch(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    working_hours: dict[str, list[list[str]]] | None = None
    special_days: dict[str, list[list[str]]] | None = None
    cook_minutes: int | None = Field(default=None, ge=1, le=240)
    pickup_enabled: bool | None = None
    is_active: bool | None = None


@router.get("/venues")
def admin_venues(db: Session = Depends(get_db), user: OperatorUser = Depends(require_operator)) -> dict:
    venues = db.query(Venue).options(selectinload(Venue.zones)).order_by(Venue.created_at).all()
    result = []
    for venue in venues:
        payload = venue_payload(venue)
        payload.update(
            {
                "working_hours": venue.working_hours,
                "special_days": venue.special_days,
                "is_active": venue.is_active,
                "zones": [zone_payload(zone) for zone in venue.zones],
            }
        )
        result.append(payload)
    return {"venues": result}


class VenueCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    city: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=300)
    phone: str = Field(min_length=5, max_length=40)
    # Found by the address when not given.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


@router.post("/venues", status_code=201)
def admin_create_venue(payload: VenueCreate, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    """A new venue: hours and cooking time copied from the first one, no zones yet — draw them on the map."""
    latitude, longitude = payload.latitude, payload.longitude
    if latitude is None or longitude is None:
        found = geo.suggest(f"{payload.city}, {payload.address}", None)
        if not found:
            raise ApiError("address_not_found", "Не нашли адрес — проверьте город и улицу", status=422)
        latitude, longitude = found[0]["latitude"], found[0]["longitude"]
    first = db.query(Venue).order_by(Venue.created_at).first()
    taken = {code for (code,) in db.query(Venue.code).all()}
    number = len(taken) + 1
    while f"V{number}" in taken:
        number += 1
    venue = Venue(
        code=f"V{number}",
        title=payload.title.strip(),
        city=payload.city.strip(),
        address=payload.address.strip(),
        phone=payload.phone.strip(),
        latitude=latitude,
        longitude=longitude,
        working_hours=dict(first.working_hours) if first else {day: [["10:00", "22:00"]] for day in WEEKDAYS},
        cook_minutes=first.cook_minutes if first else 15,
        timezone=first.timezone if first else "Europe/Moscow",
    )
    db.add(venue)
    db.commit()
    return {"venue": venue_payload(venue)}


@router.patch("/venues/{venue_id}")
def admin_patch_venue(venue_id: UUID, payload: VenuePatch, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    venue = db.get(Venue, venue_id)
    if not venue:
        raise ApiError("venue_not_found", "Точка не найдена", status=404)
    data = payload.model_dump(exclude_none=True)
    if "working_hours" in data:
        _check_hours(data["working_hours"], weekdays=True)
    if "special_days" in data:
        _check_hours(data["special_days"], weekdays=False)
    for field, value in data.items():
        setattr(venue, field, value)
    db.commit()
    return {"venue": venue_payload(venue)}


def _check_hours(hours: dict, *, weekdays: bool) -> None:
    for key, intervals in hours.items():
        if weekdays and key not in WEEKDAYS:
            raise ApiError("invalid_request", f"Неизвестный день недели {key}", status=422)
        if not weekdays:
            try:
                datetime.strptime(key, "%Y-%m-%d")
            except ValueError as exc:
                raise ApiError("invalid_request", f"Дата {key} — нужен формат ГГГГ-ММ-ДД", status=422) from exc
        for interval in intervals:
            if len(interval) != 2:
                raise ApiError("invalid_request", "Интервал — это начало и конец", status=422)
            for value in interval:
                try:
                    datetime.strptime(value, "%H:%M")
                except ValueError as exc:
                    raise ApiError("invalid_request", f"Время {value} — нужен формат ЧЧ:ММ", status=422) from exc


class ZoneBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    color: str = Field(default="#ff6900", max_length=16)
    polygon: list[list[float]]
    delivery_fee: Decimal = Field(ge=0)
    free_delivery_from: Decimal | None = Field(default=None, ge=0)
    min_order_amount: Decimal = Field(default=Decimal(0), ge=0)
    eta_minutes: int = Field(default=30, ge=5, le=300)
    priority: int = 0
    is_active: bool = True


def _zone_values(payload: ZoneBody) -> dict:
    data = payload.model_dump()
    try:
        data["polygon"] = geo.validate_ring(data["polygon"])
    except (ValueError, TypeError, IndexError) as exc:
        raise ApiError("invalid_zone", str(exc) or "Неверный контур зоны", status=422) from exc
    return data


@router.post("/venues/{venue_id}/zones", status_code=201)
def admin_create_zone(venue_id: UUID, payload: ZoneBody, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    if not db.get(Venue, venue_id):
        raise ApiError("venue_not_found", "Точка не найдена", status=404)
    zone = DeliveryZone(venue_id=venue_id, **_zone_values(payload))
    db.add(zone)
    db.commit()
    return {"zone": zone_payload(zone)}


@router.put("/zones/{zone_id}")
def admin_update_zone(zone_id: UUID, payload: ZoneBody, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    zone = db.get(DeliveryZone, zone_id)
    if not zone:
        raise ApiError("zone_not_found", "Зона не найдена", status=404)
    for field, value in _zone_values(payload).items():
        setattr(zone, field, value)
    db.commit()
    return {"zone": zone_payload(zone)}


@router.delete("/zones/{zone_id}")
def admin_delete_zone(zone_id: UUID, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    zone = db.get(DeliveryZone, zone_id)
    if not zone:
        raise ApiError("zone_not_found", "Зона не найдена", status=404)
    db.delete(zone)
    db.commit()
    return {"status": "ok"}


@router.get("/zones/check")
def admin_check_point(
    lat: float | None = None,
    lon: float | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    user: OperatorUser = Depends(require_operator),
) -> dict:
    """Which zone and venue an address or a point falls into — the check on the map page."""
    found = None
    if q:
        venue = db.query(Venue).filter(Venue.is_active.is_(True)).first()
        near = (float(venue.latitude), float(venue.longitude)) if venue else None
        results = geo.suggest(q, near)
        if not results:
            return {"found": None, "inside": False, "message": "Адрес не найден"}
        found = results[0]
        lat, lon = found["latitude"], found["longitude"]
    if lat is None or lon is None:
        raise ApiError("invalid_request", "Нужен адрес или координаты", status=422)
    try:
        resolution = resolve_delivery(db, lat, lon)
    except ApiError as error:
        return {"found": found, "latitude": lat, "longitude": lon, "inside": False, "message": error.message}
    return {
        "found": found,
        "latitude": lat,
        "longitude": lon,
        "inside": True,
        "venue": venue_payload(resolution.venue),
        "zone": zone_payload(resolution.zone),
        "message": f"{resolution.zone.title}: доставка {int(resolution.zone.delivery_fee)} ₽, ~{resolution.zone.eta_minutes} мин",
    }


# ---------- menu and stop-list ----------


@router.get("/venues/{venue_id}/menu")
def admin_venue_menu(venue_id: UUID, db: Session = Depends(get_db), user: OperatorUser = Depends(require_operator)) -> dict:
    venue = get_venue(db, venue_id)
    overrides = venue_overrides(db, venue)
    all_items = db.query(MenuItem).options(selectinload(MenuItem.category)).join(MenuCategory).order_by(MenuCategory.sort, MenuItem.sort).all()
    return {
        "items": [
            {
                "id": str(item.id),
                "slug": item.slug,
                "title": item.title,
                "category": item.category.title,
                "image_url": item.image_url,
                "base_price": money_str(item.price),
                "price": money_str(effective_price(item, overrides.get(item.id))),
                "price_override": money_str(overrides[item.id].price_override)
                if item.id in overrides and overrides[item.id].price_override is not None
                else None,
                "is_available": is_available(overrides.get(item.id)),
                "unavailable_until": overrides[item.id].unavailable_until.isoformat()
                if item.id in overrides and overrides[item.id].unavailable_until
                else None,
                "is_active": item.is_active,
                "badges": item.badges or [],
                "description": item.description,
                "weight": item.weight,
            }
            for item in all_items
        ]
    }


class StopListPatch(BaseModel):
    is_available: bool | None = None
    # Stop until this moment (e.g. end of the day); null with is_available=false — until switched back.
    unavailable_until: datetime | None = None
    price_override: Decimal | None = Field(default=None, ge=0)
    clear_price_override: bool = False


@router.patch("/venues/{venue_id}/menu/{item_id}")
def admin_patch_venue_item(
    venue_id: UUID,
    item_id: UUID,
    payload: StopListPatch,
    db: Session = Depends(get_db),
    user: OperatorUser = Depends(require_operator),
) -> dict:
    row = db.get(VenueMenuItem, {"venue_id": venue_id, "item_id": item_id})
    if not row:
        row = VenueMenuItem(venue_id=venue_id, item_id=item_id, is_available=True)
        db.add(row)
    if payload.is_available is not None:
        row.is_available = payload.is_available
        row.unavailable_until = None if payload.is_available else payload.unavailable_until
    if payload.price_override is not None or payload.clear_price_override:
        if user.role not in ("manager", "admin"):
            raise ApiError("forbidden", "Цены меняет менеджер", status=403)
        row.price_override = None if payload.clear_price_override else payload.price_override
    db.commit()
    return {"status": "ok"}


class ItemPatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    weight: str | None = Field(default=None, max_length=40)
    price: Decimal | None = Field(default=None, ge=0)
    badges: list[str] | None = None
    is_active: bool | None = None


@router.patch("/menu/items/{item_id}")
def admin_patch_item(item_id: UUID, payload: ItemPatch, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    item = db.get(MenuItem, item_id)
    if not item:
        raise ApiError("item_not_found", "Блюдо не найдено", status=404)
    data = payload.model_dump(exclude_none=True)
    if "badges" in data:
        data["badges"] = [badge for badge in data["badges"] if badge in ("hit", "new")]
    for field, value in data.items():
        setattr(item, field, value)
    db.commit()
    return {"status": "ok"}


# ---------- CRM ----------


@router.get("/dashboard")
def admin_dashboard(db: Session = Depends(get_db), user: OperatorUser = Depends(require_operator)) -> dict:
    return crm.dashboard(db)


@router.get("/customers")
def admin_customers(
    q: str = "",
    segment: str = "all",
    sort: str = "last_order",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: OperatorUser = Depends(require_manager),
) -> dict:
    return crm.list_customers(db, q=q, segment=segment, sort=sort, limit=limit, offset=offset)


@router.get("/customers.csv")
def admin_customers_csv(segment: str = "all", q: str = "", db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> Response:
    return Response(
        content=crm.export_csv(db, segment=segment, q=q),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="customers.csv"'},
    )


@router.get("/customers/{customer_id}")
def admin_customer(customer_id: UUID, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    return {"customer": crm.customer_card(db, customer_id)}


class CustomerPatch(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = Field(default=None, max_length=30)
    is_blocked: bool | None = None


@router.patch("/customers/{customer_id}")
def admin_patch_customer(customer_id: UUID, payload: CustomerPatch, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    return {"customer": crm.update_customer(db, customer_id, **payload.model_dump())}


class BonusAdjust(BaseModel):
    amount: Decimal
    comment: str = Field(default="", max_length=150)


@router.post("/customers/{customer_id}/bonus")
def admin_adjust_bonus(customer_id: UUID, payload: BonusAdjust, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    return {"customer": crm.adjust_bonus(db, customer_id, payload.amount, payload.comment, user.username)}


# ---------- promo codes ----------


class PromoBody(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern="^[A-Za-z0-9_-]+$")
    kind: str = Field(pattern="^(percent|fixed)$")
    value: Decimal = Field(gt=0)
    min_order_amount: Decimal = Field(default=Decimal(0), ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_uses: int | None = Field(default=None, ge=1)
    once_per_customer: bool = True
    is_active: bool = True
    note: str = Field(default="", max_length=200)


def _promo_payload(db: Session, promo: PromoCode) -> dict:
    uses = db.query(Order).filter(Order.promo_code == promo.code, Order.status.notin_(["cancelled", "rejected"])).count()
    return {
        "id": str(promo.id),
        "code": promo.code,
        "kind": promo.kind,
        "value": money_str(promo.value),
        "min_order_amount": money_str(promo.min_order_amount),
        "starts_at": promo.starts_at.isoformat() if promo.starts_at else None,
        "ends_at": promo.ends_at.isoformat() if promo.ends_at else None,
        "max_uses": promo.max_uses,
        "once_per_customer": promo.once_per_customer,
        "is_active": promo.is_active,
        "note": promo.note,
        "uses": uses,
    }


@router.get("/promo-codes")
def admin_promos(db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    return {"promo_codes": [_promo_payload(db, promo) for promo in db.query(PromoCode).order_by(PromoCode.created_at.desc()).all()]}


@router.post("/promo-codes", status_code=201)
def admin_create_promo(payload: PromoBody, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    data = payload.model_dump()
    data["code"] = data["code"].upper()
    if payload.kind == "percent" and payload.value > 100:
        raise ApiError("invalid_request", "Скидка в процентах — не больше 100", status=422)
    if db.query(PromoCode).filter(PromoCode.code == data["code"]).first():
        raise ApiError("promo_exists", "Такой промокод уже есть", status=409)
    promo = PromoCode(**data)
    db.add(promo)
    db.commit()
    return {"promo_code": _promo_payload(db, promo)}


@router.patch("/promo-codes/{promo_id}")
def admin_toggle_promo(promo_id: UUID, is_active: bool, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    promo = db.get(PromoCode, promo_id)
    if not promo:
        raise ApiError("promo_not_found", "Промокод не найден", status=404)
    promo.is_active = is_active
    db.commit()
    return {"promo_code": _promo_payload(db, promo)}


# ---------- promotions on the home screen ----------


class PromotionBody(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    text: str = Field(default="", max_length=240)
    accent: str = Field(default="brand", pattern="^(brand|sesame|good|info)$")
    action: str = Field(default="none", pattern="^(none|promo|referral|welcome)$")
    promo_code: str | None = Field(default=None, max_length=40, pattern="^[A-Za-z0-9_-]*$")
    sort: int = 100
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None


def _checked_promotion(db: Session, payload: PromotionBody) -> dict:
    data = payload.model_dump()
    data["promo_code"] = (data["promo_code"] or "").upper() or None
    if data["action"] == "promo":
        if not data["promo_code"]:
            raise ApiError("invalid_request", "Для действия «Применить промокод» укажите код", status=422)
        if not db.query(PromoCode).filter(PromoCode.code == data["promo_code"]).first():
            raise ApiError("promo_not_found", "Такого промокода нет в разделе «Промокоды»", status=404)
    else:
        data["promo_code"] = None
    return data


@router.get("/promotions")
def admin_promotions(db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    rows = db.query(Promotion).order_by(Promotion.sort, Promotion.created_at).all()
    return {"promotions": [promotion_payload(row) for row in rows]}


@router.post("/promotions", status_code=201)
def admin_create_promotion(payload: PromotionBody, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    row = Promotion(**_checked_promotion(db, payload))
    db.add(row)
    db.commit()
    return {"promotion": promotion_payload(row)}


@router.put("/promotions/{promotion_id}")
def admin_update_promotion(promotion_id: UUID, payload: PromotionBody, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    row = db.get(Promotion, promotion_id)
    if not row:
        raise ApiError("promotion_not_found", "Акция не найдена", status=404)
    for key, value in _checked_promotion(db, payload).items():
        setattr(row, key, value)
    db.commit()
    return {"promotion": promotion_payload(row)}


@router.delete("/promotions/{promotion_id}")
def admin_delete_promotion(promotion_id: UUID, db: Session = Depends(get_db), user: OperatorUser = Depends(require_manager)) -> dict:
    row = db.get(Promotion, promotion_id)
    if not row:
        raise ApiError("promotion_not_found", "Акция не найдена", status=404)
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# ---------- panel users ----------


class UserBody(BaseModel):
    username: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=255)
    role: str


@router.get("/users")
def admin_users(db: Session = Depends(get_db), user: OperatorUser = Depends(require_admin)) -> dict:
    users = db.query(OperatorUser).order_by(OperatorUser.created_at).all()
    return {"users": [{"id": str(item.id), "username": item.username, "role": item.role, "is_active": item.is_active} for item in users]}


@router.post("/users", status_code=201)
def admin_create_user(payload: UserBody, db: Session = Depends(get_db), user: OperatorUser = Depends(require_admin)) -> dict:
    if payload.role not in ALLOWED_ROLES:
        raise ApiError("invalid_request", "Роль: operator, manager или admin", status=422)
    if db.query(OperatorUser).filter(OperatorUser.username == payload.username.strip()).first():
        raise ApiError("user_exists", "Такой логин уже есть", status=409)
    db.add(OperatorUser(username=payload.username.strip(), password_hash=hash_password(payload.password), role=payload.role, is_active=True))
    db.commit()
    return {"status": "ok"}


@router.patch("/users/{user_id}")
def admin_toggle_user(user_id: UUID, is_active: bool, db: Session = Depends(get_db), user: OperatorUser = Depends(require_admin)) -> dict:
    target = db.get(OperatorUser, user_id)
    if not target:
        raise ApiError("user_not_found", "Пользователь не найден", status=404)
    if target.id == user.id:
        raise ApiError("invalid_request", "Себя отключить нельзя", status=422)
    target.is_active = is_active
    db.commit()
    return {"status": "ok"}
