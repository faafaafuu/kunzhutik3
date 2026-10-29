from datetime import timedelta

from conftest import INSIDE, OUTSIDE, option, order_body


def poke_line(menu, quantity=1, **mods):
    poke = menu["poke-salmon"]
    modifiers = [{"id": option(poke, "Унаги")}]
    if mods.get("avocado"):
        modifiers.append({"id": option(poke, "Авокадо"), "quantity": mods["avocado"]})
    if mods.get("no_onion"):
        modifiers.append({"id": option(poke, "Без лука")})
    return {"menu_item_id": poke["id"], "quantity": quantity, "modifiers": modifiers}


def quote(client, lines, **extra):
    body = {"fulfillment": "delivery", "address": INSIDE, "items": lines}
    body.update(extra)
    response = client.post("/api/v1/orders/quote", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_quote_prices_modifiers_on_the_server(client, menu):
    # 650 + 2 × 120 avocado = 890 per bowl, two bowls.
    result = quote(client, [poke_line(menu, quantity=2, avocado=2, no_onion=True)])
    line = result["items"][0]
    assert line["unit_price"] == "890.00"
    assert line["line_total"] == "1780.00"
    assert {mod["title"] for mod in line["modifiers"]} == {"Унаги", "Авокадо", "Без лука"}
    assert result["items_total"] == "1780.00"
    # Free delivery from 1500.
    assert result["delivery_fee"] == "0.00"
    assert result["total_amount"] == "1780.00"
    assert result["can_order"] is True
    assert result["promised_at"]


def test_quote_reports_problems_instead_of_failing(client, menu):
    poke = menu["poke-salmon"]
    result = quote(client, [{"menu_item_id": poke["id"], "quantity": 1, "modifiers": []}])
    codes = [problem["code"] for problem in result["problems"]]
    assert "invalid_modifiers" in codes  # sauce is required
    assert "below_min_order" in codes  # 650 < 700
    assert result["can_order"] is False
    assert result["delivery_fee"] == "150.00"
    assert result["total_amount"] == "800.00"
    missing = next(problem for problem in result["problems"] if problem["code"] == "below_min_order")
    assert missing["details"]["missing"] == "50.00"


def test_out_of_zone_and_pickup(client, menu):
    result = quote(client, [poke_line(menu, quantity=2)], address=OUTSIDE)
    assert [problem["code"] for problem in result["problems"]] == ["out_of_delivery_zone"]
    pickup = quote(client, [poke_line(menu)], fulfillment="pickup", address=None)
    assert pickup["can_order"] is True
    assert pickup["delivery_fee"] == "0.00"


def test_stop_list_blocks_the_item(operator_client, menu):
    client = operator_client
    venue_id = client.get("/api/v1/menu").json()["venue"]["id"]
    eclair = menu["eclair"]
    assert client.patch(f"/api/v1/admin/venues/{venue_id}/menu/{eclair['id']}", json={"is_available": False}).status_code == 200
    menu_after = {item["slug"]: item for item in client.get("/api/v1/menu").json()["items"]}
    assert "eclair" not in menu_after  # off the menu of this venue altogether
    # A cart that already holds it is still told so by the quote.
    result = quote(client, [poke_line(menu, quantity=2), {"menu_item_id": eclair["id"], "quantity": 1}])
    assert result["problems"][0]["code"] == "item_unavailable"
    # The unavailable line does not count towards the total.
    assert result["items_total"] == "1300.00"


def test_promo_code(client, menu):
    result = quote(client, [poke_line(menu, quantity=2)], promo_code="bright10")
    assert result["promo"]["applied"] is True
    assert result["discount_total"] == "130.00"
    assert result["total_amount"] == "1320.00"  # 1300 − 130 + 150 delivery (1170 < 1500)
    bad = quote(client, [poke_line(menu, quantity=2)], promo_code="LETO2025")
    assert bad["problems"][0]["code"] == "promo_invalid"


def test_create_order_with_daily_number_and_snapshot(client, menu):
    first = client.post("/api/v1/orders", json=order_body([poke_line(menu, quantity=2, avocado=1)], "1540.00"))
    assert first.status_code == 201, first.text
    order = first.json()["order"]
    assert order["number"] == "001"
    assert order["status"] == "new"
    assert order["items"][0]["title"] == "Поке с лососем"
    assert order["items"][0]["unit_price"] == "770.00"
    assert order["delivery_fee"] == "0.00"
    second = client.post("/api/v1/orders", json=order_body([poke_line(menu, quantity=2)], "1450.00"))
    assert second.json()["order"]["number"] == "002"
    status = client.get(f"/api/v1/orders/{order['id']}/status").json()
    assert status["status_label"] == "Новый"
    assert status["timeline"][0]["state"] == "now"


def test_price_changed_and_cart_problems_refuse_the_order(client, menu):
    changed = client.post("/api/v1/orders", json=order_body([poke_line(menu, quantity=2)], "1000.00"))
    assert changed.status_code == 409
    error = changed.json()["error"]
    assert error["code"] == "price_changed"
    assert error["details"]["quote"]["total_amount"] == "1450.00"
    out = client.post("/api/v1/orders", json=order_body([poke_line(menu, quantity=2)], "1450.00", address=OUTSIDE))
    assert out.status_code == 422
    assert out.json()["error"]["code"] == "out_of_delivery_zone"
    bad_phone = client.post("/api/v1/orders", json=order_body([poke_line(menu, quantity=2)], "1450.00", customer_phone="12345"))
    assert bad_phone.json()["error"]["code"] == "phone_invalid"


def test_closed_venue_allows_only_scheduled_orders(client, db, menu):
    from app.models.venue import Venue

    venue = db.query(Venue).first()
    venue.working_hours = {day: [] for day in venue.working_hours}
    tomorrow = (venue.created_at + timedelta(days=1)).date().isoformat()
    venue.special_days = {}
    db.commit()
    result = quote(client, [poke_line(menu, quantity=2)])
    assert result["problems"][0]["code"] == "venue_closed"
    assert result["slots"] == []
    venue.special_days = {tomorrow: [["10:00", "22:00"]]}
    db.commit()
    assert quote(client, [poke_line(menu, quantity=2)])["problems"][0]["code"] == "venue_closed"


def test_status_machine_and_customer_cancel(operator_client, menu):
    client = operator_client
    order = client.post("/api/v1/orders", json=order_body([poke_line(menu, quantity=2)], "1450.00")).json()["order"]
    jump = client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": "completed"})
    assert jump.status_code == 409
    assert jump.json()["error"]["code"] == "invalid_transition"
    for status in ("confirmed", "preparing"):
        response = client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": status})
        assert response.status_code == 200, response.text
    late_cancel = client.post(f"/api/v1/orders/{order['id']}/cancel", json={})
    assert late_cancel.status_code == 409
    assert late_cancel.json()["error"]["code"] == "cancel_not_allowed"
    for status in ("ready", "delivering", "completed"):
        assert client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": status}).status_code == 200
    detail = client.get(f"/api/v1/admin/orders/{order['id']}").json()["order"]
    assert [event["to"] for event in detail["events"]] == ["new", "confirmed", "preparing", "ready", "delivering", "completed"]
    assert all(step["state"] == "done" for step in detail["timeline"])

    other = client.post("/api/v1/orders", json=order_body([poke_line(menu, quantity=2)], "1450.00")).json()["order"]
    cancelled = client.post(f"/api/v1/orders/{other['id']}/cancel", json={"reason": "передумал"})
    assert cancelled.json()["order"]["status"] == "cancelled"


def test_pickup_order_skips_delivering(operator_client, menu):
    client = operator_client
    body = order_body([poke_line(menu)], "650.00", fulfillment="pickup", address=None)
    order = client.post("/api/v1/orders", json=body).json()["order"]
    for status in ("confirmed", "ready"):
        client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": status})
    detail = client.get(f"/api/v1/admin/orders/{order['id']}").json()["order"]
    assert detail["next_statuses"] == ["completed", "cancelled"]


def test_orders_require_an_operator(client):
    assert client.get("/api/v1/admin/orders").status_code == 401


def test_the_customer_cancels_only_until_the_cafe_accepts(operator_client, menu):
    client = operator_client
    lines = [poke_line(menu, quantity=2)]
    first = client.post("/api/v1/orders", json=order_body(lines, quote(client, lines)["total_amount"])).json()["order"]
    assert first["can_cancel"]
    assert client.post(f"/api/v1/orders/{first['id']}/cancel", json={"reason": ""}).json()["order"]["status"] == "cancelled"

    second = client.post("/api/v1/orders", json=order_body(lines, quote(client, lines)["total_amount"])).json()["order"]
    accepted = client.post(f"/api/v1/admin/orders/{second['id']}/transition", json={"to": "confirmed"}).json()["order"]
    assert accepted["can_cancel"] is False
    refused = client.post(f"/api/v1/orders/{second['id']}/cancel", json={"reason": ""})
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "cancel_not_allowed"
