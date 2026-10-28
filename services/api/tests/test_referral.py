import pytest
from conftest import order_body
from test_accounts import headers, sign_in
from test_orders import poke_line, quote

from app.core.config import settings
from app.models.customer import Customer


@pytest.fixture
def programme(monkeypatch):
    monkeypatch.setattr(settings, "welcome_bonus", 200)
    monkeypatch.setattr(settings, "referral_friend_bonus", 150)
    monkeypatch.setattr(settings, "referral_referrer_bonus", 250)
    monkeypatch.setattr(settings, "referral_min_order", 500)


def balance(client, auth) -> int:
    return int(float(client.get("/api/v1/loyalty/me", headers=headers(auth)).json()["balance"]))


def place_and_complete(client, auth, menu, phone, bowls=2):
    """A delivered order of `bowls` poke bowls (650 ₽ each), through the kitchen's statuses."""
    lines = [poke_line(menu, quantity=bowls)]
    total = quote(client, lines)["total_amount"]
    body = order_body(lines, total, customer_phone=phone)
    order = client.post("/api/v1/orders", json=body, headers=headers(auth)).json()["order"]
    for status in ("confirmed", "preparing", "ready", "delivering", "completed"):
        assert client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": status}).status_code == 200
    return order


def test_welcome_bonus_is_given_once_on_the_first_sign_in(client, programme, db):
    from app.services import loyalty

    auth = sign_in(client, "+79001110001")
    assert balance(client, auth) == 200
    history = client.get("/api/v1/loyalty/me", headers=headers(auth)).json()["history"]
    assert [row["kind"] for row in history] == ["welcome"]
    # Every later sign-in asks again and gets nothing more.
    customer = db.query(Customer).filter(Customer.phone == "+79001110001").one()
    assert loyalty.grant_welcome(db, customer) is False
    assert balance(client, auth) == 200


def test_welcome_bonus_with_the_account_made_by_the_first_order(client, menu, programme):
    lines = [poke_line(menu, quantity=2)]
    body = order_body(lines, quote(client, lines)["total_amount"], customer_phone="+79001110002")
    account = client.post("/api/v1/orders", json=body).json()["account"]
    auth = {"Authorization": f"Bearer {account['tokens']['access_token']}"}
    assert balance(client, auth) == 200
    # A phone we already know is not signed in by an order, so it gets nothing from it.
    second = client.post("/api/v1/orders", json={**body, "expected_total": body["expected_total"]}).json()
    assert second["account"] is None


def test_welcome_bonus_can_be_switched_off(client, monkeypatch):
    monkeypatch.setattr(settings, "welcome_bonus", 0)
    assert balance(client, sign_in(client, "+79001110003")) == 0


def test_inviting_a_friend_rewards_both_after_the_first_completed_order(operator_client, menu, programme):
    client = operator_client
    inviter = sign_in(client, "+79001110010")
    invite = client.get("/api/v1/me/referral", headers=headers(inviter)).json()
    assert len(invite["code"]) == 6 and invite["link"].endswith(f"/?ref={invite['code']}") and invite["can_apply"]

    friend = sign_in(client, "+79001110011")
    applied = client.post("/api/v1/me/referral/apply", json={"code": invite["code"].lower()}, headers=headers(friend)).json()
    assert applied["applied"] and not applied["can_apply"]
    assert balance(client, friend) == 200  # nothing yet but the welcome bonus

    place_and_complete(client, friend, menu, "+79001110011")
    accrual = 3 * 1300 // 100  # the first level: 3 % of 1300 ₽
    assert balance(client, friend) == 200 + accrual + 150
    assert balance(client, inviter) == 200 + 250
    stats = client.get("/api/v1/me/referral", headers=headers(inviter)).json()
    assert stats["invited"] == 1 and stats["rewarded"] == 1 and stats["earned"] == "250.00"

    place_and_complete(client, friend, menu, "+79001110011")  # the second order pays nobody again
    assert balance(client, inviter) == 200 + 250


def test_a_small_first_order_does_not_count_but_a_later_one_does(operator_client, menu, programme):
    client = operator_client
    inviter = sign_in(client, "+79001110020")
    code = client.get("/api/v1/me/referral", headers=headers(inviter)).json()["code"]
    friend = sign_in(client, "+79001110021")
    client.post("/api/v1/me/referral/apply", json={"code": code}, headers=headers(friend))
    # A 270 ₽ latte is below the 500 ₽ minimum of the programme (and below the delivery minimum: pick it up).
    latte = menu["latte"]
    lines = [{"menu_item_id": latte["id"], "quantity": 1, "modifiers": []}]
    total = quote(client, lines, fulfillment="pickup")["total_amount"]
    body = order_body(lines, total, fulfillment="pickup", customer_phone="+79001110021")
    order = client.post("/api/v1/orders", json=body, headers=headers(friend)).json()["order"]
    for status in ("confirmed", "preparing", "ready", "completed"):
        client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": status})
    assert balance(client, inviter) == 200  # only the welcome bonus
    # But it was the friend's first completed order: the programme counts it, so the reward is gone for good.
    place_and_complete(client, friend, menu, "+79001110021")
    assert balance(client, inviter) == 200


def test_referral_code_rules(client, programme):
    a = sign_in(client, "+79001110030")
    b = sign_in(client, "+79001110031")
    code_a = client.get("/api/v1/me/referral", headers=headers(a)).json()["code"]

    def apply(auth, code):
        return client.post("/api/v1/me/referral/apply", json={"code": code}, headers=headers(auth)).json()

    assert apply(a, code_a)["error"]["code"] == "referral_own"
    assert apply(b, "ZZZZZZ")["error"]["code"] == "referral_invalid"
    assert apply(b, code_a)["applied"]
    assert apply(b, code_a)["error"]["code"] == "referral_already"


def test_friend_code_given_with_the_first_order_of_a_new_account(client, menu, programme, db):
    inviter = sign_in(client, "+79001110040")
    code = client.get("/api/v1/me/referral", headers=headers(inviter)).json()["code"]
    lines = [poke_line(menu, quantity=2)]
    body = order_body(lines, quote(client, lines)["total_amount"], customer_phone="+79001110041", referral_code=code)
    assert client.post("/api/v1/orders", json=body).json()["account"]
    friend = db.query(Customer).filter(Customer.phone == "+79001110041").one()
    assert friend.referred_by_id is not None
    # A wrong code must not spoil an order.
    other = order_body(lines, body["expected_total"], customer_phone="+79001110042", referral_code="NOPE12")
    assert client.post("/api/v1/orders", json=other).status_code == 201


def test_programme_can_be_switched_off(client, monkeypatch):
    monkeypatch.setattr(settings, "referral_friend_bonus", 0)
    monkeypatch.setattr(settings, "referral_referrer_bonus", 0)
    auth = sign_in(client, "+79001110050")
    assert client.get("/api/v1/me/referral", headers=headers(auth)).json()["enabled"] is False
    assert client.post("/api/v1/me/referral/apply", json={"code": "ABCDEF"}, headers=headers(auth)).json()["error"]["code"] == "referral_off"
