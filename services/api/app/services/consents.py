"""Consent to personal data processing (152-ФЗ, ст. 9) and to marketing messages (38-ФЗ «О рекламе», ст. 18).

The checkbox is ticked by the person, the server refuses to go on without it, and every consent is written down with
the version of the documents it was given for. Raise DOCUMENT_VERSION whenever the consent or the policy changes
in substance: people then tick again.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.customer import Consent, Customer

# The date of the current text of /legal/consent and /legal/privacy.
DOCUMENT_VERSION = "2026-10-31"


def has_personal_data_consent(db: Session, *, customer: Customer | None = None, phone: str | None = None) -> bool:
    """Has this customer (or this phone) agreed to the current documents before?"""
    query = db.query(Consent.id).filter(Consent.kind == "personal_data", Consent.version == DOCUMENT_VERSION)
    if customer is not None and query.filter(Consent.customer_id == customer.id).first():
        return True
    return bool(phone and query.filter(Consent.phone == phone).first())


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
