import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Venue(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "venues"

    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    latitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Moscow")
    # {"mon": [["10:00", "22:00"]], ..., "sun": [...]}; an empty list means closed that day.
    working_hours: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # {"2026-12-31": [["10:00", "18:00"]], "2027-01-01": []} — overrides working_hours for a date.
    special_days: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    cook_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    pickup_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    zones: Mapped[list["DeliveryZone"]] = relationship(back_populates="venue", order_by="DeliveryZone.priority.desc()")


class DeliveryZone(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_zones"

    venue_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="#ff6900")
    # Outer ring of a GeoJSON polygon: [[lng, lat], ...]. Holes are not supported.
    polygon: Mapped[list] = mapped_column(JSONB, nullable=False)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    free_delivery_from: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    min_order_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    eta_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    # When zones overlap, the higher priority wins.
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    venue: Mapped[Venue] = relationship(back_populates="zones")
