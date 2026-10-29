import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class MenuCategory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "menu_categories"

    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    items: Mapped[list["MenuItem"]] = relationship(back_populates="category", order_by="MenuItem.sort")


class MenuItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A dish of the chain. The price here is the base price; a venue may override it."""

    __tablename__ = "menu_items"

    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("menu_categories.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    composition: Mapped[str] = mapped_column(Text, nullable=False, default="")
    weight: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(400), nullable=True)
    # "hit", "new"
    badges: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    cook_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Can be taken free for this many bonuses (the wheel at checkout); empty — not for bonuses.
    bonus_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    category: Mapped[MenuCategory] = relationship(back_populates="items")
    group_links: Mapped[list["MenuItemModifierGroup"]] = relationship(
        back_populates="item", order_by="MenuItemModifierGroup.sort", cascade="all, delete-orphan"
    )


class ModifierGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A set of options shared between dishes: a sauce choice, paid add-ons, free removals."""

    __tablename__ = "modifier_groups"

    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    subtitle: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    # choice — pick one (radio); addon — tiles with a quantity; remove — free "без …" toggles.
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # For addon: how many of one option may go on a dish.
    max_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    modifiers: Mapped[list["Modifier"]] = relationship(back_populates="group", order_by="Modifier.sort", cascade="all, delete-orphan")


class Modifier(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "modifiers"

    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modifier_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    price_delta: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    weight: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    group: Mapped[ModifierGroup] = relationship(back_populates="modifiers")


class MenuItemModifierGroup(Base):
    __tablename__ = "menu_item_modifier_groups"

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), primary_key=True)
    group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modifier_groups.id", ondelete="CASCADE"), primary_key=True)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    item: Mapped[MenuItem] = relationship(back_populates="group_links")
    group: Mapped[ModifierGroup] = relationship()


class VenueMenuItem(Base):
    """Per-venue price and stop-list. No row means: available at the base price."""

    __tablename__ = "venue_menu_items"

    venue_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("venues.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), primary_key=True)
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Temporary stop: back on sale automatically after this moment.
    unavailable_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
