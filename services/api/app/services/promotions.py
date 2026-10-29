"""«Акции» on the home screen: cards the owner writes in the panel; three are made on the first start."""

from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.promotion import Promotion
from app.services.venues import utcnow

ACCENTS = ("brand", "sesame", "good", "info")
ACTIONS = ("none", "promo", "referral", "welcome")


def active_promotions(db: Session) -> list[Promotion]:
    now = utcnow()
    return (
        db.query(Promotion)
        .filter(Promotion.is_active.is_(True), or_(Promotion.starts_at.is_(None), Promotion.starts_at <= now), or_(Promotion.ends_at.is_(None), Promotion.ends_at >= now))
        .order_by(Promotion.sort, Promotion.created_at)
        .all()
    )


def promotion_payload(promotion: Promotion) -> dict:
    return {
        "id": str(promotion.id),
        "title": promotion.title,
        "text": promotion.text,
        "accent": promotion.accent,
        "action": promotion.action,
        "promo_code": promotion.promo_code,
        "sort": promotion.sort,
        "is_active": promotion.is_active,
        "starts_at": promotion.starts_at.isoformat() if promotion.starts_at else None,
        "ends_at": promotion.ends_at.isoformat() if promotion.ends_at else None,
    }


def seed_promotions(db: Session) -> None:
    if db.query(Promotion.id).first():
        return
    cards = []
    if settings.welcome_bonus > 0:
        cards.append(Promotion(title=f"{settings.welcome_bonus} бонусов в подарок", text="Зарегистрируйтесь и оплатите ими часть первого заказа", accent="sesame", action="welcome", sort=10))
    if settings.referral_friend_bonus > 0 or settings.referral_referrer_bonus > 0:
        cards.append(
            Promotion(
                title="Приведи друга",
                text=f"Вам {settings.referral_referrer_bonus} и другу {settings.referral_friend_bonus} бонусов после его первого заказа",
                accent="good",
                action="referral",
                sort=20,
            )
        )
    cards.append(Promotion(title="−10% на заказ от 2490 ₽", text="Промокод BRIGHT10: нажмите, и он применится в корзине", accent="brand", action="promo", promo_code="BRIGHT10", sort=30))
    db.add_all(cards)
