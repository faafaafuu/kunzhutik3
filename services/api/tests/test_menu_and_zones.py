from conftest import INSIDE, OUTSIDE

from app.services.geo import circle_polygon, point_in_polygon, validate_ring


def test_config_has_brand_and_payment_methods(client):
    payload = client.get("/api/v1/config").json()
    assert payload["brand_name"] == "Брайтс"
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


def test_a_dish_on_a_venues_stop_list_is_not_shown_there(operator_client, menu, db):
    from app.models.venue import Venue

    client = operator_client
    venue = db.query(Venue).first()
    latte = menu["latte"]
    assert client.patch(f"/api/v1/admin/venues/{venue.id}/menu/{latte['id']}", json={"is_available": False}).status_code == 200
    slugs = [item["slug"] for item in client.get(f"/api/v1/menu?venue_id={venue.id}").json()["items"]]
    assert "latte" not in slugs and "raf" in slugs
    client.patch(f"/api/v1/admin/venues/{venue.id}/menu/{latte['id']}", json={"is_available": True})
    assert "latte" in [item["slug"] for item in client.get(f"/api/v1/menu?venue_id={venue.id}").json()["items"]]


def test_a_second_venue_is_added_from_the_panel(operator_client, db):
    from app.models.venue import Venue

    created = operator_client.post("/api/v1/admin/venues", json={"title": "Брайт в Клину", "city": "Клин", "address": "ул. Ленина, 1", "phone": "+7 (926) 407-01-00", "latitude": 56.3333, "longitude": 36.7333})
    assert created.status_code == 201, created.text
    venue = db.get(Venue, created.json()["venue"]["id"])
    first = db.query(Venue).order_by(Venue.created_at).first()
    try:
        assert venue.working_hours == first.working_hours and venue.code.startswith("V")
        assert created.json()["venue"]["id"] in [v["id"] for v in operator_client.get("/api/v1/admin/venues").json()["venues"]]
    finally:
        db.delete(venue)
        db.commit()
