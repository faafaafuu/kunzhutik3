ORDER_PAYLOAD = {
    "customer_name": "Тест Тестов",
    "customer_phone": "+79001234567",
    "delivery_address": "ул. Дзержинского, 18, кв. 5",
    "delivery_slot": "сегодня 19:00",
    "payment_method": "card_on_delivery",
    "comment": "без лука",
    "items": [{"item_id": "doner-bread", "quantity": 2}],
}


def test_menu_is_public(client):
    response = client.get("/api/v1/store/menu")
    assert response.status_code == 200
    payload = response.json()
    assert payload["currency"] == "RUB"
    assert payload["categories"]
    assert payload["items"]


def test_storefront_pages_render(client):
    assert client.get("/").status_code == 200
    assert client.get("/tg").status_code == 200
    assert client.get("/admin/login").status_code == 200


def test_create_order_prices_from_catalog(client):
    response = client.post("/api/v1/store/orders", json=ORDER_PAYLOAD)
    assert response.status_code == 201
    payload = response.json()

    assert payload["order_number"].startswith("KUN-")
    assert payload["order"]["status"] == "new"
    # The client never sets the price: it comes from the server-side catalog.
    assert float(payload["order"]["total_amount"]) == 700.0
    assert payload["order"]["items_json"][0]["line_total"] == 700.0


def test_create_order_rejects_unknown_item(client):
    payload = {**ORDER_PAYLOAD, "items": [{"item_id": "does-not-exist", "quantity": 1}]}
    assert client.post("/api/v1/store/orders", json=payload).status_code == 400


def test_orders_require_authentication(client):
    client.post("/api/v1/store/orders", json=ORDER_PAYLOAD)
    assert client.get("/api/v1/store/orders").status_code == 401


def test_operator_lists_and_updates_orders(operator_client):
    created = operator_client.post("/api/v1/store/orders", json=ORDER_PAYLOAD).json()
    order_id = created["order"]["id"]

    listed = operator_client.get("/api/v1/store/orders")
    assert listed.status_code == 200
    assert [order["id"] for order in listed.json()["orders"]] == [order_id]

    updated = operator_client.patch(f"/api/v1/store/orders/{order_id}", json={"status": "preparing"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "preparing"


def test_status_history_is_recorded(operator_client, db_engine):
    from sqlalchemy.orm import Session

    from app.models.store_order import StoreOrder

    order_id = operator_client.post("/api/v1/store/orders", json=ORDER_PAYLOAD).json()["order"]["id"]
    operator_client.patch(f"/api/v1/store/orders/{order_id}", json={"status": "confirmed"})
    operator_client.patch(f"/api/v1/store/orders/{order_id}", json={"status": "delivering"})

    with Session(db_engine) as session:
        order = session.get(StoreOrder, order_id)
        history = order.source_json["status_history"]

    assert [entry["to"] for entry in history] == ["new", "confirmed", "delivering"]


def test_unsupported_status_is_rejected(operator_client):
    order_id = operator_client.post("/api/v1/store/orders", json=ORDER_PAYLOAD).json()["order"]["id"]
    assert operator_client.patch(f"/api/v1/store/orders/{order_id}", json={"status": "teleported"}).status_code == 422


def test_login_rejects_bad_password(client):
    assert client.post("/api/v1/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401
