import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Customer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Anyone who ordered or signed in. Guests get a record by phone too — that is the CRM base."""

    __tablename__ = "customers"

    # +7XXXXXXXXXX. Empty for someone who signed in through Telegram and has not ordered yet.
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    telegram_id: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    telegram_username: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Has signed in at least once (by SMS or Telegram), as opposed to a guest record.
    is_registered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # CRM fields, edited by managers.
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notify_status: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_bonus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_promo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="web")


class CustomerAddress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customer_addresses"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    text: Mapped[str] = mapped_column(String(300), nullable=False)
    latitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    entrance: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    floor: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    apartment: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    intercom: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    comment: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class OtpCode(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "otp_codes"

    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    ip: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class CustomerSession(UUIDPrimaryKeyMixin, Base):
    """A refresh token. Rotated on every refresh; logout revokes it."""

    __tablename__ = "customer_sessions"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Device(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Expo push token of a phone where the customer is signed in."""

    __tablename__ = "devices"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)


class BonusTransaction(UUIDPrimaryKeyMixin, Base):
    """Bonus ledger. The balance is the sum of amounts; rows are never edited."""

    __tablename__ = "bonus_transactions"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    # accrual | redeem | reversal | manual
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    comment: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
