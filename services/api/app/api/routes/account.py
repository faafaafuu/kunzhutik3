"""Customer sign-in and the account: profile, addresses, order history, devices, bonuses."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from app.api.deps import client_ip, get_db, require_customer
from app.core.errors import ApiError
from app.models.customer import Customer, CustomerAddress, Device
from app.models.order import Order
from app.models.venue import Venue
from app.services import consents, loyalty
from app.services.customers import (
    customer_from_telegram,
    customer_payload,
    issue_tokens,
    normalize_phone,
    refresh_tokens,
    request_otp,
    revoke_refresh,
    verify_otp,
    verify_telegram_init_data,
)
from app.services.orders import order_payload

router = APIRouter(prefix="/api/v1", tags=["account"])


class OtpRequest(BaseModel):
    phone: str = Field(min_length=5, max_length=40)
    # The consent boxes of the sign-in screen.
    consent: bool = False
    marketing_consent: bool = False


class OtpVerify(BaseModel):
    phone: str = Field(min_length=5, max_length=40)
    code: str = Field(min_length=4, max_length=8)


class TelegramLogin(BaseModel):
    init_data: str = Field(min_length=10, max_length=4096)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=200)


def _session(db: Session, customer: Customer) -> dict:
    loyalty.grant_welcome(db, customer)  # the first sign-in is the registration; later ones change nothing
    return {"customer": customer_payload(customer), "tokens": issue_tokens(db, customer)}


@router.post("/auth/otp/request")
def otp_request(payload: OtpRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    phone = normalize_phone(payload.phone)
    consents.require_personal_data_consent(db, given=payload.consent, phone=phone)
    result = request_otp(db, payload.phone, client_ip(request))
    consents.record(db, context="login", ip=client_ip(request), personal_data=payload.consent, marketing=payload.marketing_consent, phone=phone)
    return result


@router.post("/auth/otp/verify")
def otp_verify(payload: OtpVerify, db: Session = Depends(get_db)) -> dict:
    return _session(db, verify_otp(db, payload.phone, payload.code))


@router.post("/auth/telegram")
def telegram_login(payload: TelegramLogin, db: Session = Depends(get_db)) -> dict:
    user = verify_telegram_init_data(payload.init_data)
    return _session(db, customer_from_telegram(db, user))


@router.post("/auth/refresh")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> dict:
    customer, tokens = refresh_tokens(db, payload.refresh_token)
    return {"customer": customer_payload(customer), "tokens": tokens}


@router.post("/auth/logout")
def logout(payload: RefreshRequest, db: Session = Depends(get_db)) -> dict:
    revoke_refresh(db, payload.refresh_token)
    return {"status": "ok"}


# ---------- profile ----------


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    notify_status: bool | None = None
    notify_bonus: bool | None = None
    notify_promo: bool | None = None


@router.get("/me")
def me(customer: Customer = Depends(require_customer)) -> dict:
    return {"customer": customer_payload(customer)}


@router.patch("/me")
def patch_me(payload: ProfilePatch, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(customer, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    return {"customer": customer_payload(customer)}


# ---------- addresses ----------


class AddressBody(BaseModel):
    label: str = Field(default="", max_length=60)
    text: str = Field(min_length=3, max_length=300)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    entrance: str = Field(default="", max_length=20)
    floor: str = Field(default="", max_length=20)
    apartment: str = Field(default="", max_length=20)
    intercom: str = Field(default="", max_length=20)
    comment: str = Field(default="", max_length=300)
    is_default: bool = False


def _address_payload(address: CustomerAddress) -> dict:
    return {
        "id": str(address.id),
        "label": address.label,
        "text": address.text,
        "latitude": float(address.latitude),
        "longitude": float(address.longitude),
        "entrance": address.entrance,
        "floor": address.floor,
        "apartment": address.apartment,
        "intercom": address.intercom,
        "comment": address.comment,
        "is_default": address.is_default,
    }


def _addresses(db: Session, customer: Customer) -> list[CustomerAddress]:
    return (
        db.query(CustomerAddress)
        .filter(CustomerAddress.customer_id == customer.id)
        .order_by(CustomerAddress.is_default.desc(), CustomerAddress.created_at)
        .all()
    )


def _own_address(db: Session, customer: Customer, address_id: UUID) -> CustomerAddress:
    address = db.query(CustomerAddress).filter(CustomerAddress.id == address_id, CustomerAddress.customer_id == customer.id).first()
    if not address:
        raise ApiError("address_not_found", "Адрес не найден", status=404)
    return address


def _make_default(db: Session, customer: Customer, address: CustomerAddress) -> None:
    for other in _addresses(db, customer):
        other.is_default = other.id == address.id


@router.get("/me/addresses")
def list_addresses(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    return {"addresses": [_address_payload(address) for address in _addresses(db, customer)]}


@router.post("/me/addresses", status_code=201)
def add_address(payload: AddressBody, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    first = not _addresses(db, customer)
    address = CustomerAddress(customer_id=customer.id, **payload.model_dump(exclude={"is_default"}))
    db.add(address)
    db.flush()
    if payload.is_default or first:
        _make_default(db, customer, address)
    db.commit()
    return {"address": _address_payload(address)}


@router.patch("/me/addresses/{address_id}")
def update_address(address_id: UUID, payload: AddressBody, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    address = _own_address(db, customer, address_id)
    for field, value in payload.model_dump(exclude={"is_default"}).items():
        setattr(address, field, value)
    if payload.is_default:
        _make_default(db, customer, address)
    db.commit()
    return {"address": _address_payload(address)}


@router.delete("/me/addresses/{address_id}")
def delete_address(address_id: UUID, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    address = _own_address(db, customer, address_id)
    was_default = address.is_default
    db.delete(address)
    db.flush()
    rest = _addresses(db, customer)
    if was_default and rest:
        _make_default(db, customer, rest[0])
    db.commit()
    return {"status": "ok"}


# ---------- orders, devices, bonuses ----------


@router.get("/me/orders")
def my_orders(limit: int = 30, offset: int = 0, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    orders = (
        db.query(Order)
        .options(selectinload(Order.items), selectinload(Order.events))
        .filter(Order.customer_id == customer.id)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
        .all()
    )
    venues = {venue.id: venue for venue in db.query(Venue).all()}
    return {"orders": [order_payload(order, venues.get(order.venue_id)) for order in orders]}


class DeviceBody(BaseModel):
    platform: str = Field(pattern="^(ios|android|web)$")
    token: str = Field(min_length=10, max_length=255)


@router.post("/me/devices")
def register_device(payload: DeviceBody, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    device = db.query(Device).filter(Device.token == payload.token).first()
    if device:
        device.customer_id = customer.id
        device.platform = payload.platform
    else:
        db.add(Device(customer_id=customer.id, platform=payload.platform, token=payload.token))
    db.commit()
    return {"status": "ok"}


class ReferralApply(BaseModel):
    code: str = Field(min_length=3, max_length=12)


@router.get("/me/referral")
def my_referral(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    return loyalty.referral_payload(db, customer)


@router.post("/me/referral/apply")
def apply_referral(payload: ReferralApply, customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    loyalty.apply_referral(db, customer, payload.code)
    return loyalty.referral_payload(db, customer)


@router.get("/loyalty/me")
def my_bonuses(customer: Customer = Depends(require_customer), db: Session = Depends(get_db)) -> dict:
    return loyalty.loyalty_payload(db, customer.id)
