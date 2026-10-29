from conftest import INSIDE, OUTSIDE

from app.services.geo import circle_polygon, point_in_polygon, validate_ring


def test_config_has_brand_and_payment_methods(client):
    payload = client.get("/api/v1/config").json()
    assert payload["brand_name"] == "Брайт"
    assert "online" not in payload["payment_methods"]
    assert payload["min_supported_app_version"]


def test_menu_comes_from_the_database_with_modifiers(client):
    payload = client.get("/api/v1/menu").json()
    assert payload["venue"]["title"] == "Брайт на Дзержинского"
    assert payload["prices_final"] is False
    assert [category["title"] for category in payload["categories"]][:2] == ["Поке", "Салаты"]  # drinks go last
    items = {item["slug"]: item for item in payload["items"]}
    assert len(items) == 15
    poke = items["poke-salmon"]
    assert poke["price"] == "650.00"
    assert poke["badges"] == ["hit"]
    kinds = {group["kind"]: group for group in poke["modifier_groups"]}
    assert kinds["choice"]["required"] is True
    assert kinds["addon"]["max_quantity"] == 3
    assert any(option["title"] == "Без лука" for option in kinds["remove"]["options"])


def test_menu_item_by_slug(client):
    response = client.get("/api/v1/menu/items/raf")
    assert response.status_code == 200
    assert response.json()["title"] == "Раф"
    assert client.get("/api/v1/menu/items/pizza").json()["error"]["code"] == "item_not_found"


def test_point_in_polygon_and_ring_validation():
    ring = circle_polygon(56.18858, 36.982054, 3)
    assert point_in_polygon(INSIDE["latitude"], INSIDE["longitude"], ring)
    assert not point_in_polygon(OUTSIDE["latitude"], OUTSIDE["longitude"], ring)
    square = validate_ring([[0, 0], [0, 1], [1, 1], [1, 0]])
    assert square[0] == square[-1]
    assert point_in_polygon(0.5, 0.5, square)
    assert not point_in_polygon(1.5, 0.5, square)


def test_resolve_finds_the_zone_or_says_no_delivery(client):
    inside = client.post("/api/v1/venues/resolve", json=INSIDE).json()
    assert inside["zone"]["title"] == "Солнечногорск"
    assert inside["zone"]["min_order_amount"] == "700.00"
    outside = client.post("/api/v1/venues/resolve", json=OUTSIDE)
    assert outside.status_code == 422
    assert outside.json()["error"]["code"] == "out_of_delivery_zone"


def test_address_search_uses_the_geocoder(client):
    results = client.get("/api/v1/geo/suggest", params={"q": "Красная"}).json()["results"]
    assert results[0]["title"] == "улица Красная, 1"
    assert results[0]["latitude"] == INSIDE["latitude"]
