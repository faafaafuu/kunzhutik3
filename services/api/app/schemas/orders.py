from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ModifierChoice(BaseModel):
    id: UUID
    quantity: int = Field(default=1, ge=1, le=10)


class CartLine(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(ge=1, le=50)
    modifiers: list[ModifierChoice] = Field(default_factory=list, max_length=30)


class AddressInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    text: str = Field(default="", max_length=300)


class QuoteRequest(BaseModel):
    venue_id: UUID | None = None
    fulfillment: Literal["delivery", "pickup"] = "delivery"
    address: AddressInput | None = None
    items: list[CartLine] = Field(default_factory=list, max_length=60)
    promo_code: str | None = Field(default=None, max_length=40)
    use_bonus: bool = False
    # Empty — as soon as possible.
    scheduled_for: datetime | None = None


class AddressDetails(BaseModel):
    entrance: str = Field(default="", max_length=20)
    floor: str = Field(default="", max_length=20)
    apartment: str = Field(default="", max_length=20)
    intercom: str = Field(default="", max_length=20)


class OrderCreateRequest(QuoteRequest):
    customer_name: str = Field(min_length=1, max_length=160)
    customer_phone: str = Field(min_length=5, max_length=40)
    address_details: AddressDetails = Field(default_factory=AddressDetails)
    payment_method: Literal["cash", "card_on_delivery", "online"] = "card_on_delivery"
    comment: str = Field(default="", max_length=500)
    # Total the customer saw. A different server total → 409 price_changed.
    expected_total: Decimal
    # Save the address to the profile (signed-in customers only).
    save_address: bool = False
    address_label: str = Field(default="", max_length=60)
    source: Literal["web", "ios", "android", "telegram"] = "web"


class CancelRequest(BaseModel):
    reason: str = Field(default="", max_length=300)


class TransitionRequest(BaseModel):
    to: str = Field(min_length=1, max_length=24)
    comment: str = Field(default="", max_length=300)
    # On confirm: minutes until the order reaches the customer (overrides the estimate).
    promised_in_minutes: int | None = Field(default=None, ge=1, le=600)
