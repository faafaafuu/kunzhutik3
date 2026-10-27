import uuid
from decimal import Decimal
from datetime import datetime

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin


class StoreOrder(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "store_orders"

    customer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    delivery_address: Mapped[str] = mapped_column(String(400), nullable=False)
    delivery_slot: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False, default="card_on_delivery")
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="new")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="RUB")
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    items_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
