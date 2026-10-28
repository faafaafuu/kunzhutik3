"""Client API: config, venues, menu, address search, quote and orders. Base path /api/v1."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, optional_customer
from app.core.config import settings
from app.core.errors import ApiError
from app.models.customer import Customer
from app.models.venue import Venue
from app.schemas.orders import CancelRequest, OrderCreateRequest, QuoteRequest
from app.services import geo
from app.services.customers import customer_payload, is_new_phone, issue_tokens
from app.services.menu import item_payload, load_items, menu_payload, venue_overrides
from app.services.notifications import notify_new_order, notify_status_change
from app.services.orders import bonus_accrued_for, create_order, load_order, order_payload, transition
from app.services.pricing import quote
from app.services.social_auth import google_configured
from app.services.venues import active_venues, default_venue, get_venue, resolve_delivery, venue_payload, zone_payload
from app.store.catalog import BRAND_NAME

router = APIRouter(prefix="/api/v1", tags=["client"])


@router.get("/config")
def get_config() -> dict:
    return {
        "brand_name": BRAND_NAME,
        "currency": "RUB",
        "min_supported_app_version": settings.min_supported_app_version,
        "ios_store_url": settings.ios_store_url,
        "android_store_url": settings.android_store_url,
        "payment_methods": ["card_on_delivery", "cash"],
        "support_phone": settings.support_phone,
        "bonus": {"levels": settings.bonus_levels, "max_redeem_percent": settings.bonus_max_redeem_percent},
        "telegram_login": bool(settings.telegram_bot_token),
        # Sign-in options that are set up; the app still shows all three and explains what is not ready yet.
        "auth": {"phone": True, "telegram": bool(settings.telegram_bot_token), "google": google_configured()},
    }


@router.get("/venues")
def list_venues(db: Session = Depends(get_db)) -> dict:
    return {"venues": [venue_payload(venue) for venue in active_venues(db)]}


class ResolveRequest(BaseModel):
    latitude: float
    longitude: float


@router.post("/venues/resolve")
def resolve(payload: ResolveRequest, db: Session = Depends(get_db)) -> dict:
    """Which venue delivers to the point, at what price and how fast."""
    resolution = resolve_delivery(db, payload.latitude, payload.longitude)
    return {"venue": venue_payload(resolution.venue), "zone": zone_payload(resolution.zone)}


@router.get("/zones")
def list_zones(db: Session = Depends(get_db)) -> dict:
    """Delivery zones of all venues, for the map in the address picker."""
    zones = [zone_payload(zone) for venue in active_venues(db) for zone in venue.zones if zone.is_active]
    return {"zones": zones}


@router.get("/menu")
def get_menu(venue_id: UUID | None = None, db: Session = Depends(get_db)) -> dict:
    """Menu of a venue. Without venue_id — the default venue, prices preliminary until the address is known."""
    venue = get_venue(db, venue_id) if venue_id else default_venue(db)
    payload = menu_payload(db, venue)
    payload["venue"] = venue_payload(venue) if venue else None
    payload["prices_final"] = venue_id is not None
    return payload


@router.get("/menu/items/{item_id}")
def get_menu_item(item_id: str, venue_id: UUID | None = None, db: Session = Depends(get_db)) -> dict:
    venue = get_venue(db, venue_id) if venue_id else default_venue(db)
    overrides = venue_overrides(db, venue)
    for item in load_items(db):
        if str(item.id) == item_id or item.slug == item_id:
            return item_payload(item, overrides.get(item.id), venue)
    raise ApiError("item_not_found", "Блюдо не найдено", status=404)


def _near(db: Session) -> tuple[float, float] | None:
    venue: Venue | None = default_venue(db)
    return (float(venue.latitude), float(venue.longitude)) if venue else None


@router.get("/geo/suggest")
def geo_suggest(q: str = Query(min_length=2, max_length=200), db: Session = Depends(get_db)) -> dict:
    return {"results": geo.suggest(q, _near(db))}


@router.get("/geo/reverse")
def geo_reverse(lat: float, lon: float) -> dict:
    return {"result": geo.reverse(lat, lon)}


@router.post("/orders/quote")
def post_quote(payload: QuoteRequest, db: Session = Depends(get_db), customer: Customer | None = Depends(optional_customer)) -> dict:
    return quote(db, payload, customer=customer).as_dict()


@router.post("/orders", status_code=201)
def post_order(
    payload: OrderCreateRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    customer: Customer | None = Depends(optional_customer),
) -> dict:
    # A guest with a new phone gets an account from the order and is signed in on this device right away.
    # A phone we already know is never signed in this way: whoever types it would see that person's
    # addresses, orders and bonuses. The order still lands in that account; its owner signs in by SMS.
    new_account = customer is None and is_new_phone(db, payload.customer_phone)
    # Signed in through Telegram → status updates also go to that chat.
    order = create_order(db, payload, customer=customer, telegram_user_id=customer.telegram_id if customer else None, new_account=new_account)
    background.add_task(notify_new_order, order.id)
    account = None
    if new_account:
        owner = db.get(Customer, order.customer_id)
        account = {"customer": customer_payload(owner), "tokens": issue_tokens(db, owner)}
    return {"order": order_payload(order, db.get(Venue, order.venue_id)), "account": account}


@router.get("/orders/{order_id}")
def get_order(order_id: UUID, db: Session = Depends(get_db)) -> dict:
    """The order id is a random UUID and works as the access key: guests open their order by the link."""
    order = load_order(db, order_id)
    return {"order": order_payload(order, db.get(Venue, order.venue_id), bonus_accrued=bonus_accrued_for(db, order))}


@router.get("/orders/{order_id}/status")
def get_order_status(order_id: UUID, db: Session = Depends(get_db)) -> dict:
    """Light payload polled every 20 seconds while the order is active."""
    order = load_order(db, order_id)
    payload = order_payload(order)
    return {key: payload[key] for key in ("id", "number", "status", "status_label", "promised_at", "updated_at", "can_cancel", "is_active", "timeline", "cancel_reason")}


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: UUID, payload: CancelRequest, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    order = load_order(db, order_id)
    order = transition(db, order, "cancelled", actor="customer", comment=payload.reason or "Отменён клиентом", by_customer=True)
    background.add_task(notify_status_change, order.id, "cancelled")
    return {"order": order_payload(order, db.get(Venue, order.venue_id))}
