"""Deleting a customer's account (App Store guideline 5.1.1(v); 152-ФЗ, ст. 21 — the person asked to stop).

The row itself stays: orders, their receipts and the bonus ledger point at it, and the cafe keeps its books. What
goes is everything that tells who the person was — on the account and on each of its orders:

- the account: phone, name, e-mail, Telegram and Google links, CRM note and tags, referral code, notifications;
- saved addresses, push devices, sessions and pending sign-ins — deleted outright;
- every order: name, phone, Telegram id, address and its details, the comment. Amounts, dishes and statuses stay.

The bonuses left on the account are gone with it: nobody can sign in to it again. A later sign-in with the same
phone, Telegram or Google is a new account. Consent records stay as they are: they are the evidence the operator is
asked for, and a withdrawal row is added next to them.
"""

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.customer import Consent, Customer, CustomerAddress, CustomerSession, Device, LoginRequest, OtpCode
from app.models.order import Order
from app.services.orders import ACTIVE_STATUSES
from app.services.venues import utcnow


def delete_account(db: Session, customer: Customer, *, ip: str = "") -> None:
    # An order on its way still needs the phone and the address: the courier calls, the cafe cancels or refunds.
    active = db.query(Order.id).filter(Order.customer_id == customer.id, Order.status.in_(ACTIVE_STATUSES)).first()
    if active:
        raise ApiError("active_order", "Сейчас у вас есть заказ в работе. Удалить аккаунт можно, когда он завершится", status=409)

    phone = customer.phone
    now = utcnow()

    for order in db.query(Order).filter(Order.customer_id == customer.id):
        order.customer_name = ""
        order.customer_phone = ""
        order.telegram_user_id = None
        order.address_text = ""
        order.address_lat = None
        order.address_lon = None
        order.address_details = {}
        order.comment = ""

    for model in (CustomerAddress, Device, CustomerSession, LoginRequest):
        db.query(model).filter(model.customer_id == customer.id).delete(synchronize_session=False)
    if phone:
        db.query(OtpCode).filter(OtpCode.phone == phone).delete(synchronize_session=False)

    # Under the phone too: a later sign-in with this number must agree anew (consents.has_personal_data_consent).
    db.add(Consent(kind="withdrawn_personal_data", version="", context="account", phone=phone, customer_id=customer.id, ip=ip[:64]))

    customer.phone = None
    customer.name = ""
    customer.email = None
    customer.telegram_id = None
    customer.telegram_username = None
    customer.google_id = None
    customer.apple_id = None
    customer.is_registered = False
    customer.note = ""
    customer.tags = []
    customer.notify_status = False
    customer.notify_bonus = False
    customer.notify_promo = False
    customer.referral_code = None
    customer.deleted_at = now
    db.commit()
