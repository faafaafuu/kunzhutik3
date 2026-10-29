"""First-start data: the venue, a delivery zone and the menu from app/store/catalog.py.

Each part is created only when its table is empty, so editing in the panel is never overwritten.
"""

from __future__ import annotations

import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.menu import MenuCategory, MenuItem, MenuItemModifierGroup, Modifier, ModifierGroup
from app.models.order import PromoCode
from app.models.venue import DeliveryZone, Venue
from app.services.geo import circle_polygon
from app.services.promotions import seed_promotions
from app.store import catalog

logger = logging.getLogger(__name__)


def seed(db: Session) -> None:
    try:
        if not db.query(Venue).first():
            _seed_venue(db)
        if not db.query(MenuItem).first():
            _seed_menu(db)
        if not db.query(PromoCode).first():
            for promo in catalog.PROMO_CODES:
                db.add(PromoCode(**promo))
        seed_promotions(db)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Seeding failed")


def _seed_venue(db: Session) -> None:
    venue = Venue(**catalog.VENUE)
    db.add(venue)
    db.flush()
    zone = catalog.ZONE
    db.add(
        DeliveryZone(
            venue_id=venue.id,
            title=zone["title"],
            polygon=circle_polygon(catalog.VENUE["latitude"], catalog.VENUE["longitude"], zone["radius_km"]),
            delivery_fee=zone["delivery_fee"],
            free_delivery_from=zone["free_delivery_from"],
            min_order_amount=zone["min_order_amount"],
            eta_minutes=zone["eta_minutes"],
        )
    )


def _seed_menu(db: Session) -> None:
    categories = {}
    for sort, (slug, title) in enumerate(catalog.CATEGORIES):
        category = MenuCategory(slug=slug, title=title, sort=sort)
        db.add(category)
        categories[slug] = category
    db.flush()

    groups = {}
    for code, (title, subtitle, kind, required, max_quantity, options) in catalog.GROUPS.items():
        group = ModifierGroup(code=code, title=title, subtitle=subtitle, kind=kind, required=required, max_quantity=max_quantity)
        for sort, option in enumerate(options):
            if kind == "addon":
                option_title, price, weight = catalog.ADDONS[option]
                group.modifiers.append(Modifier(code=f"{code}:{option}", title=option_title, price_delta=price, weight=weight, sort=sort))
            else:
                group.modifiers.append(Modifier(code=f"{code}:{sort}", title=option, price_delta=0, sort=sort))
        db.add(group)
        groups[code] = group
    db.flush()

    for sort, (slug, category_slug, title, description, price, weight, badges, composition) in enumerate(catalog.ITEMS):
        item = MenuItem(
            slug=slug,
            category_id=categories[category_slug].id,
            title=title,
            description=description,
            composition=composition,
            weight=weight,
            price=price,
            image_url=catalog.PHOTO.format(slug),
            badges=badges,
            cook_minutes=catalog.COOK_MINUTES.get(category_slug),
            bonus_price=catalog.BONUS_PRICES.get(slug),
            sort=sort,
        )
        for group_sort, code in enumerate(catalog.ITEM_GROUPS.get(slug, [])):
            item.group_links.append(MenuItemModifierGroup(group_id=groups[code].id, sort=group_sort))
        db.add(item)
