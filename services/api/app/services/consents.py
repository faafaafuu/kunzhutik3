"""Consent to personal data processing (152-ФЗ, ст. 9) and to marketing messages (38-ФЗ «О рекламе», ст. 18).

Personal data: given by an action — pressing «Получить код» / «Войти» / «Оформить заказ» under the line «…вы
соглашаетесь с документами и соглашениями» (the consent itself is its own document, /legal/consent). The server
refuses to go on without it, and every consent is written down with the version of the documents it was given for.
Marketing: only by switching «Акции» on in the notifications (never pre-ticked, never bundled with the rest).
Raise DOCUMENT_VERSION whenever the consent or the policy changes in substance.
"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.customer import Consent, Customer

# The date of the current text of /legal/consent and /legal/privacy.
DOCUMENT_VERSION = "2026-10-31"


def has_personal_data_consent(db: Session, *, customer: Customer | None = None, phone: str | None = None) -> bool:
    """Has this customer (or this phone) agreed to the current documents — and not withdrawn it since?

    A deleted account leaves a withdrawal under its phone: the next sign-in with that number is a new person to us
    and agrees anew, instead of inheriting the old consent.
    """
    query = db.query(func.max(Consent.created_at))
    given = query.filter(Consent.kind == "personal_data", Consent.version == DOCUMENT_VERSION)
    withdrawn = query.filter(Consent.kind == "withdrawn_personal_data")
    if customer is not None and given.filter(Consent.customer_id == customer.id).scalar():
        return True
    if not phone:
        return False
    given_at = given.filter(Consent.phone == phone).scalar()
    withdrawn_at = withdrawn.filter(Consent.phone == phone).scalar()
    return bool(given_at and (withdrawn_at is None or given_at > withdrawn_at))


def require_personal_data_consent(db: Session, *, given: bool, customer: Customer | None = None, phone: str | None = None) -> None:
    if not given and not has_personal_data_consent(db, customer=customer, phone=phone):
        raise ApiError("consent_required", "Подтвердите согласие на обработку персональных данных", status=422)


def record(
    db: Session,
    *,
    context: str,
    ip: str,
    personal_data: bool = False,
    marketing: bool = False,
    phone: str | None = None,
    customer: Customer | None = None,
    order_id=None,
) -> None:
    """Writes down what was ticked just now (nothing for an unticked box)."""
    kinds = [kind for kind, ticked in (("personal_data", personal_data), ("marketing", marketing)) if ticked]
    for kind in kinds:
        db.add(Consent(kind=kind, version=DOCUMENT_VERSION, context=context, phone=phone, customer_id=customer.id if customer else None, order_id=order_id, ip=ip[:64]))
    if kinds:
        db.commit()
