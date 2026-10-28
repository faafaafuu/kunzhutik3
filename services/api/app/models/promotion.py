from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Promotion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A card in «Акции» on the home screen. A tap does what `action` says; the card itself is only text and a colour."""

    __tablename__ = "promotions"

    title: Mapped[str] = mapped_column(String(80), nullable=False)
    text: Mapped[str] = mapped_column(String(240), nullable=False, default="")
    # brand | sesame | good | info — a colour of the card, see client theme
    accent: Mapped[str] = mapped_column(String(12), nullable=False, default="brand")
    # promo: put `promo_code` into the cart | referral: open «Бонусы» (invite a friend) | welcome: sign in or «Бонусы» | none
    action: Mapped[str] = mapped_column(String(12), nullable=False, default="none")
    promo_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
