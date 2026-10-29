"""Menu of a venue: the chain menu with the venue's prices and stop-list applied."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session, selectinload

from app.core.errors import money_str
from app.models.menu import MenuCategory, MenuItem, MenuItemModifierGroup, ModifierGroup, VenueMenuItem
from app.models.venue import Venue
from app.services.venues import utcnow


def load_items(db: Session) -> list[MenuItem]:
    return (
        db.query(MenuItem)
        .options(
            selectinload(MenuItem.category),
            selectinload(MenuItem.group_links).selectinload(MenuItemModifierGroup.group).selectinload(ModifierGroup.modifiers),
        )
        .join(MenuCategory)
        .filter(MenuItem.is_active.is_(True), MenuCategory.is_active.is_(True))
        .order_by(MenuCategory.sort, MenuItem.sort, MenuItem.title)
        .all()
    )


def venue_overrides(db: Session, venue: Venue | None) -> dict:
    if not venue:
        return {}
    rows = db.query(VenueMenuItem).filter(VenueMenuItem.venue_id == venue.id).all()
    return {row.item_id: row for row in rows}


def is_available(override: VenueMenuItem | None, moment: datetime | None = None) -> bool:
    if not override:
        return True
    if override.unavailable_until is not None:
        return override.unavailable_until <= (moment or utcnow())
    return override.is_available


def effective_price(item: MenuItem, override: VenueMenuItem | None) -> Decimal:
    if override and override.price_override is not None:
        return override.price_override
    return item.price


def group_payload(group: ModifierGroup) -> dict:
    return {
        "id": str(group.id),
        "code": group.code,
        "title": group.title,
        "subtitle": group.subtitle,
        "kind": group.kind,
        "required": group.required,
        "max_quantity": group.max_quantity,
        "options": [
            {"id": str(mod.id), "title": mod.title, "price_delta": money_str(mod.price_delta), "weight": mod.weight}
            for mod in group.modifiers
            if mod.is_active
        ],
    }


def item_payload(item: MenuItem, override: VenueMenuItem | None, venue: Venue | None) -> dict:
    return {
        "id": str(item.id),
        "slug": item.slug,
        "category_id": str(item.category_id),
        "title": item.title,
        "description": item.description,
        "composition": item.composition,
        "weight": item.weight,
        "price": money_str(effective_price(item, override)),
        "image_url": item.image_url,
        "badges": item.badges or [],
        "cook_minutes": item.cook_minutes or (venue.cook_minutes if venue else None),
        "is_available": is_available(override),
        "modifier_groups": [group_payload(link.group) for link in item.group_links],
    }


def menu_payload(db: Session, venue: Venue | None) -> dict:
    """The menu of one venue. A dish on this venue's stop-list is left out entirely: the customer simply does not
    see it (it comes back by itself when the stop ends). A dish already in a cart is still caught by the quote."""
    overrides = venue_overrides(db, venue)
    items = [item for item in load_items(db) if venue is None or is_available(overrides.get(item.id))]
    categories: list[MenuCategory] = []
    seen = set()
    for item in items:
        if item.category_id not in seen:
            seen.add(item.category_id)
            categories.append(item.category)
    return {
        "venue_id": str(venue.id) if venue else None,
        "categories": [{"id": str(category.id), "slug": category.slug, "title": category.title} for category in categories],
        "items": [item_payload(item, overrides.get(item.id), venue) for item in items],
    }
