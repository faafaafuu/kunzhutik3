from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StoreMenuItemRead(BaseModel):
    id: str
    category_id: str
    title: str
    tag: str
    description: str
    price: int
    weight: str
    badge: str | None = None
    accent: str
    image_url: str | None = None


class StoreMenuResponse(BaseModel):
    brand_name: str
    business: dict
    currency: str
    categories: list[dict]
    features: list[dict]
    promos: list[dict]
    items: list[StoreMenuItemRead]


class StoreOrderItemRequest(BaseModel):
    item_id: str
    quantity: int = Field(ge=1, le=50)


class StoreOrderCreateRequest(BaseModel):
    customer_name: str = Field(min_length=2, max_length=160)
    customer_phone: str = Field(min_length=5, max_length=40)
    delivery_address: str = Field(min_length=5, max_length=400)
    delivery_slot: str | None = Field(default=None, max_length=120)
    payment_method: str = Field(default="card_on_delivery", pattern="^(cash|card_on_delivery|online)$")
    comment: str | None = Field(default=None, max_length=500)
    customer_profile: dict | None = None
    items: list[StoreOrderItemRequest] = Field(min_length=1)


class StoreOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    currency: str
    total_amount: Decimal
    items_json: list
    customer_name: str
    customer_phone: str
    delivery_address: str
    delivery_slot: str | None = None
    payment_method: str
    comment: str | None = None
    created_at: datetime


class StoreOrderCreateResponse(BaseModel):
    order: StoreOrderRead
    order_number: str


class StoreOrderStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(new|confirmed|preparing|delivering|completed|cancelled)$")


class StoreOrderListResponse(BaseModel):
    orders: list[StoreOrderRead]
