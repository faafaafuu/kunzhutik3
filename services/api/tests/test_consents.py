from urllib.parse import parse_qs, urlparse

from conftest import order_body
from test_orders import poke_line, quote

from app.core.config import settings
from app.models.customer import Consent, Customer
from app.services.consents import DOCUMENT_VERSION


def order(client, menu, **extra):
    lines = [poke_line(menu, quantity=2)]
    body = order_body(lines, quote(client, lines)["total_amount"], **extra)
    return client.post("/api/v1/orders", json=body)


def test_an_order_is_not_taken_without_the_consent(client, menu):
    refused = order(client, menu, consent=False, customer_phone="+79002220001")
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "consent_required"


def test_the_consent_is_written_down_with_what_it_was_given_for(client, menu, db):
    response = order(client, menu, customer_phone="+79002220002", consent=True, marketing_consent=True)
    assert response.status_code == 201
    rows = db.query(Consent).filter(Consent.phone == "+79002220002").order_by(Consent.kind).all()
    assert [row.kind for row in rows] == ["marketing", "personal_data"]
    assert all(row.version == DOCUMENT_VERSION and row.context == "checkout" and str(row.order_id) == response.json()["order"]["id"] for row in rows)
    assert db.query(Customer).filter(Customer.phone == "+79002220002").one().notify_promo is True  # only because it was ticked


def test_promotions_are_off_unless_ticked(client, menu, db):
    order(client, menu, customer_phone="+79002220003", consent=True)
    assert db.query(Customer).filter(Customer.phone == "+79002220003").one().notify_promo is False
    assert db.query(Consent).filter(Consent.phone == "+79002220003", Consent.kind == "marketing").count() == 0


def test_the_same_person_is_not_asked_again_for_the_same_documents(client, menu):
    assert order(client, menu, customer_phone="+79002220004", consent=True).status_code == 201
    assert order(client, menu, customer_phone="+79002220004", consent=False).status_code == 201


def test_new_documents_ask_again(client, menu, monkeypatch):
    from app.services import consents

    assert order(client, menu, customer_phone="+79002220005", consent=True).status_code == 201
    monkeypatch.setattr(consents, "DOCUMENT_VERSION", "2099-01-01")
    assert order(client, menu, customer_phone="+79002220005", consent=False).status_code == 422


def test_sign_in_by_sms_needs_the_consent_too(client, db):
    assert client.post("/api/v1/auth/otp/request", json={"phone": "+79002220006"}).json()["error"]["code"] == "consent_required"
    assert client.post("/api/v1/auth/otp/request", json={"phone": "+79002220006", "consent": True}).status_code == 200
    assert db.query(Consent).filter(Consent.phone == "+79002220006", Consent.context == "login").count() == 1


def test_sign_in_through_telegram_and_google_needs_the_consent(client, monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_username", "bright_test_bot")
    monkeypatch.setattr(settings, "google_client_id", "client-1")
    monkeypatch.setattr(settings, "google_client_secret", "secret-1")
    assert client.post("/api/v1/auth/telegram/start").json()["error"]["code"] == "consent_required"
    assert client.post("/api/v1/auth/telegram/start", json={"consent": True}).status_code == 200
    refused = client.get("/auth/google/start", follow_redirects=False)
    assert "login_error=consent_required" in refused.headers["location"]
    allowed = client.get("/auth/google/start", params={"consent": "true"}, follow_redirects=False)
    assert "accounts.google.com" in urlparse(allowed.headers["location"]).netloc


def test_switching_promotions_on_records_the_marketing_consent(client, db):
    from app.models.customer import Consent
    from tests.test_accounts import headers, sign_in

    auth = sign_in(client, "+79005556677")
    assert client.patch("/api/v1/me", json={"notify_promo": True}, headers=headers(auth)).json()["customer"]["notify_promo"] is True
    kinds = [row.kind for row in db.query(Consent).filter(Consent.context == "profile").all()]
    assert kinds == ["marketing"]


def test_documents_page_lists_every_document(client):
    page = client.get("/legal/documents").text
    for path in ("/legal/offer", "/legal/privacy", "/legal/consent", "/legal/bonus"):
        assert f'href="{path}"' in page
