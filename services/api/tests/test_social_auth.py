from urllib.parse import parse_qs, urlparse

import jwt
import pytest

from app.core.config import settings
from app.models.customer import Customer
from app.services import social_auth


@pytest.fixture(autouse=True)
def bot_username(monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_username", "bright_test_bot")


def _start_telegram(client):
    response = client.post("/api/v1/auth/telegram/start", json={"consent": True})
    assert response.status_code == 200
    payload = response.json()
    token = payload["url"].split("start=login_", 1)[1]
    return token, payload["secret"]


def test_telegram_login_waits_for_the_contact_then_hands_out_the_session_once(client, db):
    token, secret = _start_telegram(client)
    assert client.post("/api/v1/auth/collect", json={"secret": secret}).json() == {"status": "pending"}

    assert social_auth.telegram_link_opened(db, token, "555")
    customer = social_auth.telegram_contact_shared(db, {"id": 555, "first_name": "Анна", "username": "anna"}, "+7 916 000-11-22")
    assert customer and customer.phone == "+79160001122" and customer.name == "Анна"

    done = client.post("/api/v1/auth/collect", json={"secret": secret}).json()
    assert done["status"] == "ok" and done["tokens"]["access_token"]
    assert done["customer"]["phone"] == "+79160001122" and done["customer"]["telegram_linked"]
    assert client.post("/api/v1/auth/collect", json={"secret": secret}).status_code == 410


def test_telegram_contact_lands_on_the_account_that_has_the_phone(client, db):
    guest = Customer(phone="+79160002233", name="Гость", source="web")
    db.add(guest)
    db.commit()
    token, _ = _start_telegram(client)
    social_auth.telegram_link_opened(db, token, "777")
    customer = social_auth.telegram_contact_shared(db, {"id": 777, "first_name": "Пётр"}, "89160002233")
    assert customer.id == guest.id and customer.telegram_id == "777" and customer.name == "Гость"


def test_telegram_contact_without_an_opened_link_confirms_nothing(client, db):
    _start_telegram(client)
    assert social_auth.telegram_contact_shared(db, {"id": 999}, "+79160009999") is None
    assert not social_auth.telegram_link_opened(db, "not-a-token", "999")


def test_telegram_login_says_when_it_is_not_set_up(client, monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_username", None)
    monkeypatch.setattr(settings, "telegram_bot_token", None)
    response = client.post("/api/v1/auth/telegram/start", json={"consent": True})
    assert response.status_code == 503 and response.json()["error"]["code"] == "telegram_unavailable"


def test_return_to_stays_on_the_site_or_in_the_app():
    base = settings.app_base_url.rstrip("/")
    assert social_auth.safe_return_to(f"{base}/checkout") == f"{base}/checkout"
    assert social_auth.safe_return_to("bright://login") == "bright://login"
    assert social_auth.safe_return_to("https://evil.example/login") == f"{base}/login"
    assert social_auth.safe_return_to(f"{base}.evil.example/") == f"{base}/login"


@pytest.fixture
def google(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "client-1")
    monkeypatch.setattr(settings, "google_client_secret", "secret-1")
    claims = {"aud": "client-1", "iss": "https://accounts.google.com", "sub": "g-42", "email": "anna@example.com", "email_verified": True, "name": "Анна Г."}

    class Answer:
        status_code = 200

        @staticmethod
        def json():
            return {"id_token": jwt.encode(claims, "irrelevant", algorithm="HS256")}

    monkeypatch.setattr(social_auth.httpx, "post", lambda *args, **kwargs: Answer())
    return claims


def test_google_login_returns_a_one_time_code_to_the_page_that_started_it(client, google):
    base = settings.app_base_url.rstrip("/")
    start = client.get("/auth/google/start", params={"return_to": f"{base}/login", "consent": "true"}, follow_redirects=False)
    assert start.status_code == 303
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    back = client.get("/auth/google/callback", params={"state": state, "code": "c-1"}, follow_redirects=False)
    target = back.headers["location"]
    assert target.startswith(f"{base}/login#login_code=")
    code = target.split("login_code=", 1)[1]
    done = client.post("/api/v1/auth/collect", json={"secret": code}).json()
    assert done["status"] == "ok" and done["customer"]["email"] == "anna@example.com" and done["customer"]["google_linked"]


def test_google_callback_without_the_browser_cookie_is_refused(client, google):
    start = client.get("/auth/google/start", params={"consent": "true"}, follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    client.cookies.clear()
    back = client.get("/auth/google/callback", params={"state": state, "code": "c-1"}, follow_redirects=False)
    assert "login_error=login_expired" in back.headers["location"]


def test_google_not_set_up_goes_back_with_the_reason(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", None)
    back = client.get("/auth/google/start", params={"consent": "true"}, follow_redirects=False)
    assert back.status_code == 303 and "login_error=google_unavailable" in back.headers["location"]


def test_config_lists_sign_in_options(client):
    assert client.get("/api/v1/config").json()["auth"]["phone"] is True


def test_telegram_api_can_go_through_a_tunnel(monkeypatch):
    from app.core import telegram

    monkeypatch.setattr(settings, "telegram_api_base", "https://api.telegram.org:8443/")
    bot = telegram.make_bot()
    assert bot.session.api.api_url(token="T", method="getMe") == "https://api.telegram.org:8443/botT/getMe"


# ---------- Apple ----------


@pytest.fixture
def apple_key(monkeypatch):
    """Signs identity tokens with a throwaway RSA key that stands in for Apple's published one."""
    from cryptography.hazmat.primitives.asymmetric import rsa

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class Keys:
        def get_signing_key_from_jwt(self, token):
            return type("Key", (), {"key": private.public_key()})()

    monkeypatch.setattr(social_auth, "_apple_keys", Keys())

    def sign(**claims):
        base = {"iss": social_auth.APPLE_ISSUER, "aud": settings.apple_bundle_id, "sub": "001234.apple", "exp": 9999999999, "iat": 1}
        return jwt.encode({**base, **claims}, private, algorithm="RS256", headers={"kid": "test"})

    return sign


def test_apple_login_creates_the_account_once_and_keeps_the_first_name(client, apple_key):
    first = client.post("/api/v1/auth/apple", json={"identity_token": apple_key(email="x@privaterelay.appleid.com"), "name": "Анна", "consent": True})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["tokens"]["access_token"] and body["customer"]["apple_linked"] and body["customer"]["name"] == "Анна"

    again = client.post("/api/v1/auth/apple", json={"identity_token": apple_key(), "consent": True}).json()
    assert again["customer"]["id"] == body["customer"]["id"] and again["customer"]["name"] == "Анна"


def test_apple_login_refuses_a_token_for_another_app_or_unsigned(client, apple_key):
    wrong_app = client.post("/api/v1/auth/apple", json={"identity_token": apple_key(aud="com.other.app"), "consent": True})
    assert wrong_app.status_code == 401 and wrong_app.json()["error"]["code"] == "apple_failed"
    forged = jwt.encode({"iss": social_auth.APPLE_ISSUER, "aud": settings.apple_bundle_id, "sub": "x", "exp": 9999999999}, "secret-but-long-enough-for-hs256", algorithm="HS256")
    assert client.post("/api/v1/auth/apple", json={"identity_token": forged, "consent": True}).status_code == 401


def test_apple_login_needs_the_consent(client, apple_key):
    response = client.post("/api/v1/auth/apple", json={"identity_token": apple_key()})
    assert response.status_code == 422 and response.json()["error"]["code"] == "consent_required"
