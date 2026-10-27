import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from conftest import option, order_body


def sign_in(client, phone="+79001234567") -> dict:
    code = client.post("/api/v1/auth/otp/request", json={"phone": phone}).json()["debug_code"]
    session = client.post("/api/v1/auth/otp/verify", json={"phone": phone, "code": code}).json()
    return {"Authorization": f"Bearer {session['tokens']['access_token']}", "_refresh": session["tokens"]["refresh_token"]}


def headers(auth: dict) -> dict:
    return {"Authorization": auth["Authorization"]}


def test_otp_sign_in_and_refresh(client):
    requested = client.post("/api/v1/auth/otp/request", json={"phone": "8 (900) 123-45-67"})
    assert requested.status_code == 200
    assert requested.json()["phone"] == "+79001234567"
    code = requested.json()["debug_code"]
    wrong = client.post("/api/v1/auth/otp/verify", json={"phone": "+79001234567", "code": "0000" if code != "0000" else "1111"})
    assert wrong.json()["error"]["code"] == "otp_invalid"
    session = client.post("/api/v1/auth/otp/verify", json={"phone": "+79001234567", "code": code}).json()
    access = session["tokens"]["access_token"]
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {access}"}).json()
    assert me["customer"]["phone"] == "+79001234567"
    # A used code does not work twice.
    again = client.post("/api/v1/auth/otp/verify", json={"phone": "+79001234567", "code": code})
    assert again.json()["error"]["code"] == "otp_invalid"
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": session["tokens"]["refresh_token"]})
    assert refreshed.status_code == 200
    # Refresh tokens rotate.
    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": session["tokens"]["refresh_token"]})
    assert reused.json()["error"]["code"] == "session_expired"


def test_otp_rate_limit(client):
    assert client.post("/api/v1/auth/otp/request", json={"phone": "+79005556677"}).status_code == 200
    second = client.post("/api/v1/auth/otp/request", json={"phone": "+79005556677"})
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "otp_rate_limited"


def test_telegram_init_data(client):
    user = {"id": 4242, "first_name": "Фарид", "username": "farid"}
    fields = {"auth_date": str(int(time.time())), "user": json.dumps(user, ensure_ascii=False), "query_id": "AAE"}
    check = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", b"123456:test-token", hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    ok = client.post("/api/v1/auth/telegram", json={"init_data": urlencode(fields)})
    assert ok.status_code == 200, ok.text
    assert ok.json()["customer"]["name"] == "Фарид"
    fields["hash"] = "0" * 64
    forged = client.post("/api/v1/auth/telegram", json={"init_data": urlencode(fields)})
    assert forged.json()["error"]["code"] == "telegram_invalid"


def test_addresses_crud_and_default(client):
    auth = sign_in(client)
    body = {"label": "Дом", "text": "Солнечногорск, улица Ленина, 5", "latitude": 56.1812, "longitude": 36.9739, "apartment": "48"}
    first = client.post("/api/v1/me/addresses", json=body, headers=headers(auth)).json()["address"]
    assert first["is_default"] is True
    second = client.post("/api/v1/me/addresses", json={**body, "label": "Работа", "is_default": True}, headers=headers(auth)).json()["address"]
    listed = client.get("/api/v1/me/addresses", headers=headers(auth)).json()["addresses"]
    assert [item["label"] for item in listed] == ["Работа", "Дом"]
    client.delete(f"/api/v1/me/addresses/{second['id']}", headers=headers(auth))
    listed = client.get("/api/v1/me/addresses", headers=headers(auth)).json()["addresses"]
    assert listed[0]["is_default"] is True
    other = sign_in(client, "+79009998877")
    assert client.delete(f"/api/v1/me/addresses/{first['id']}", headers=headers(other)).status_code == 404


def test_bonuses_accrue_on_completion_and_pay_part_of_the_next_order(operator_client, menu):
    client = operator_client
    auth = sign_in(client)
    poke = menu["poke-salmon"]
    line = {"menu_item_id": poke["id"], "quantity": 2, "modifiers": [{"id": option(poke, "Унаги")}]}
    order = client.post("/api/v1/orders", json=order_body([line], "1450.00"), headers=headers(auth)).json()["order"]
    for status in ("confirmed", "preparing", "ready", "delivering", "completed"):
        client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": status})
    bonuses = client.get("/api/v1/loyalty/me", headers=headers(auth)).json()
    # 3 % of 1300 for the first level.
    assert bonuses["balance"] == "39.00"
    assert bonuses["level"]["title"] == "Старт"
    quoted = client.post(
        "/api/v1/orders/quote",
        json={"fulfillment": "pickup", "items": [line], "use_bonus": True},
        headers=headers(auth),
    ).json()
    assert quoted["bonus_spent"] == "39.00"
    assert quoted["total_amount"] == "1261.00"
    paid = client.post(
        "/api/v1/orders",
        json=order_body([line], "1261.00", fulfillment="pickup", address=None, use_bonus=True),
        headers=headers(auth),
    ).json()["order"]
    assert client.get("/api/v1/loyalty/me", headers=headers(auth)).json()["balance"] == "0.00"
    cancelled = client.post(f"/api/v1/orders/{paid['id']}/cancel", json={})
    assert cancelled.status_code == 200, cancelled.text
    assert client.get("/api/v1/loyalty/me", headers=headers(auth)).json()["balance"] == "39.00"
    history = client.get("/api/v1/me/orders", headers=headers(auth)).json()["orders"]
    assert len(history) == 2


def test_saving_address_with_the_order(client, menu):
    auth = sign_in(client)
    poke = menu["poke-salmon"]
    line = {"menu_item_id": poke["id"], "quantity": 2, "modifiers": [{"id": option(poke, "Унаги")}]}
    response = client.post("/api/v1/orders", json=order_body([line], "1450.00", save_address=True, address_label="Дом"), headers=headers(auth))
    assert response.status_code == 201
    addresses = client.get("/api/v1/me/addresses", headers=headers(auth)).json()["addresses"]
    assert addresses[0]["apartment"] == "48"
    assert addresses[0]["label"] == "Дом"
