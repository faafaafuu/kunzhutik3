from conftest import INSIDE, OUTSIDE, option, order_body


def test_operator_login(client):
    assert client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401
    assert client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "test-pass"}).status_code == 200
    assert client.get("/api/v1/admin/auth/me").json()["role"] == "admin"


def test_panel_pages_redirect_to_login(client):
    response = client.get("/admin/zones", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/admin/login"


def test_zone_drawn_on_the_map_changes_delivery(operator_client):
    client = operator_client
    venue = client.get("/api/v1/admin/venues").json()["venues"][0]
    zone = venue["zones"][0]
    assert client.get("/api/v1/admin/zones/check", params={"lat": OUTSIDE["latitude"], "lon": OUTSIDE["longitude"]}).json()["inside"] is False

    # A second zone around Зеленоград, more expensive.
    lon, lat = OUTSIDE["longitude"], OUTSIDE["latitude"]
    square = [[lon - 0.05, lat - 0.05], [lon + 0.05, lat - 0.05], [lon + 0.05, lat + 0.05], [lon - 0.05, lat + 0.05]]
    created = client.post(
        f"/api/v1/admin/venues/{venue['id']}/zones",
        json={"title": "Зеленоград", "polygon": square, "delivery_fee": 300, "min_order_amount": 1500, "eta_minutes": 70},
    )
    assert created.status_code == 201, created.text
    check = client.get("/api/v1/admin/zones/check", params={"q": "Зеленоград"}).json()
    assert check["inside"] is True
    assert check["zone"]["title"] == "Зеленоград"
    assert client.post("/api/v1/venues/resolve", json=OUTSIDE).json()["zone"]["delivery_fee"] == "300.00"

    # Shrink the city zone so the inside point drops out.
    tiny = [[36.98, 56.188], [36.984, 56.188], [36.984, 56.19], [36.98, 56.19]]
    body = {**zone, "polygon": tiny}
    body.pop("id"), body.pop("venue_id")
    assert client.put(f"/api/v1/admin/zones/{zone['id']}", json=body).status_code == 200
    assert client.post("/api/v1/venues/resolve", json=INSIDE).json()["error"]["code"] == "out_of_delivery_zone"
    client.delete(f"/api/v1/admin/zones/{created.json()['zone']['id']}")
    assert client.put(f"/api/v1/admin/zones/{zone['id']}", json={**body, "polygon": [[1, 1], [2, 2]]}).json()["error"]["code"] == "invalid_zone"
    # Restore the seeded circle for the other tests.
    assert client.put(f"/api/v1/admin/zones/{zone['id']}", json={**body, "polygon": zone["polygon"]}).status_code == 200


def test_venue_hours_validation(operator_client):
    client = operator_client
    venue = client.get("/api/v1/admin/venues").json()["venues"][0]
    bad = client.patch(f"/api/v1/admin/venues/{venue['id']}", json={"working_hours": {"mon": [["25:00", "22:00"]]}})
    assert bad.json()["error"]["code"] == "invalid_request"
    ok = client.patch(f"/api/v1/admin/venues/{venue['id']}", json={"cook_minutes": 20})
    assert ok.json()["venue"]["cook_minutes"] == 20


def test_crm_builds_customers_from_orders(operator_client, menu):
    client = operator_client
    poke = menu["poke-salmon"]
    line = {"menu_item_id": poke["id"], "quantity": 2, "modifiers": [{"id": option(poke, "Унаги")}]}
    order = client.post("/api/v1/orders", json=order_body([line], "1450.00")).json()["order"]
    client.post("/api/v1/orders", json=order_body([line], "1450.00", customer_phone="+79110000000", customer_name="Анна"))
    for status in ("confirmed", "ready", "delivering", "completed"):
        client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": status})

    listing = client.get("/api/v1/admin/customers", params={"sort": "spent"}).json()
    assert listing["total"] == 2
    top = listing["customers"][0]
    assert top["name"] == "Фарид"
    assert top["orders_count"] == 1
    assert top["total_spent"] == "1450.00"
    assert client.get("/api/v1/admin/customers", params={"q": "911"}).json()["customers"][0]["name"] == "Анна"

    card = client.get(f"/api/v1/admin/customers/{top['id']}").json()["customer"]
    assert card["favourites"][0] == {"title": "Поке с лососем", "quantity": 2}
    assert card["bonus"]["balance"] == "39.00"
    updated = client.patch(f"/api/v1/admin/customers/{top['id']}", json={"note": "Любит острое", "tags": ["vip", " офис "]}).json()["customer"]
    assert updated["tags"] == ["vip", "офис"]
    adjusted = client.post(f"/api/v1/admin/customers/{top['id']}/bonus", json={"amount": "100", "comment": "Извинение"}).json()["customer"]
    assert adjusted["bonus"]["balance"] == "139.00"

    csv = client.get("/api/v1/admin/customers.csv")
    assert csv.headers["content-type"].startswith("text/csv")
    assert "Фарид" in csv.text
    dashboard = client.get("/api/v1/admin/dashboard").json()
    assert dashboard["today"]["orders"] == 2
    assert dashboard["top_items"][0]["title"] == "Поке с лососем"


def test_blocked_customer_cannot_order(operator_client, menu):
    client = operator_client
    poke = menu["poke-salmon"]
    line = {"menu_item_id": poke["id"], "quantity": 2, "modifiers": [{"id": option(poke, "Унаги")}]}
    client.post("/api/v1/orders", json=order_body([line], "1450.00"))
    customer = client.get("/api/v1/admin/customers").json()["customers"][0]
    client.patch(f"/api/v1/admin/customers/{customer['id']}", json={"is_blocked": True})
    blocked = client.post("/api/v1/orders", json=order_body([line], "1450.00"))
    assert blocked.status_code == 403


def test_promo_codes_admin(operator_client):
    client = operator_client
    created = client.post("/api/v1/admin/promo-codes", json={"code": "welcome", "kind": "fixed", "value": 200, "min_order_amount": 1000})
    assert created.json()["promo_code"]["code"] == "WELCOME"
    assert client.post("/api/v1/admin/promo-codes", json={"code": "WELCOME", "kind": "fixed", "value": 1}).status_code == 409
    codes = [promo["code"] for promo in client.get("/api/v1/admin/promo-codes").json()["promo_codes"]]
    assert "BRIGHT10" in codes


def test_client_app_fallback_when_not_built(client):
    response = client.get("/orders/123")
    assert response.status_code == 503
    assert "Сайт ещё не собран" in response.text
    assert client.get("/api/v1/nope").status_code == 404


def test_panel_login_stops_guessing_after_five_wrong_passwords(client):
    from app.services import auth

    auth._login_fails.clear()
    try:
        for _ in range(5):
            assert client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401
        # Even the right password waits now: the guesser cannot tell when they hit it.
        assert client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "test-pass"}).status_code == 429
    finally:
        auth._login_fails.clear()
