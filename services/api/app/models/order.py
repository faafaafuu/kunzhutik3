import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("venue_id", "business_date", "daily_seq"),)

    venue_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("venues.id"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True, index=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("delivery_zones.id", ondelete="SET NULL"), nullable=True)

    # Readable number, restarts every day per venue: "047".
    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    daily_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    number: Mapped[str] = mapped_column(String(20), nullable=False)

    status: Mapped[str] = mapped_column(String(24), nullable=False, default="new", index=True)
    # delivery | pickup
    fulfillment: Mapped[str] = mapped_column(String(16), nullable=False)
    # web | ios | android | telegram
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="web")

    customer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    telegram_user_id: Mapped[str | None] = mapped_column(String(40), nullable=True)

    address_text: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    address_lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    address_lon: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    # entrance, floor, apartment, intercom
    address_details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # cash | card_on_delivery | online
    payment_method: Mapped[str] = mapped_column(String(24), nullable=False)
    # not_required | pending | paid | refunded
    payment_status: Mapped[str] = mapped_column(String(16), nullable=False, default="not_required")

    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="RUB")
    items_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    bonus_spent: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    promo_code: Mapped[str | None] = mapped_column(String(40), nullable=True)

    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cancel_reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    promised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.position")
    events: Mapped[list["OrderStatusEvent"]] = relationship(back_populates="order", cascade="all, delete-orphan", order_by="OrderStatusEvent.created_at")


class OrderItem(UUIDPrimaryKeyMixin, Base):
    """A line of the order. Title, prices and modifiers are a snapshot taken at checkout."""

    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(400), nullable=True)
    # Dish price plus modifiers, for one piece.
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # [{"id", "title", "group", "kind", "price_delta", "quantity"}]
    modifiers: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_status_events"

    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    to_status: Mapped[str] = mapped_column(String(24), nullable=False)
    # customer | operator:<username> | telegram:<id> | system
    actor: Mapped[str] = mapped_column(String(80), nullable=False)
    comment: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order: Mapped[Order] = relationship(back_populates="events")


class PromoCode(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "promo_codes"

    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    # percent | fixed
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    min_order_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # One use per phone number.
    once_per_customer: Mapped[bool] = mapped_column(nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    note: Mapped[str] = mapped_column(String(200), nullable=False, default="")
