from app.models.promotion import Promotion


def test_home_screen_gets_the_seeded_promotions(client):
    promotions = client.get("/api/v1/promotions").json()["promotions"]
    assert [p["action"] for p in promotions][-1] == "promo" and promotions[-1]["promo_code"] == "BRIGHT10"
    assert {"accent", "title", "text", "action"} <= promotions[0].keys()


def test_panel_creates_edits_hides_and_deletes_a_promotion(operator_client):
    client = operator_client
    body = {"title": "Кофе в подарок", "text": "К поке — латте", "accent": "info", "action": "promo", "promo_code": "bright10", "sort": 5}
    created = client.post("/api/v1/admin/promotions", json=body)
    assert created.status_code == 201, created.text
    promo = created.json()["promotion"]
    assert promo["promo_code"] == "BRIGHT10"  # codes are upper-case, as in the promo list
    assert client.get("/api/v1/promotions").json()["promotions"][0]["id"] == promo["id"]  # sort 5 goes first

    client.put(f"/api/v1/admin/promotions/{promo['id']}", json={**body, "is_active": False})
    assert promo["id"] not in [p["id"] for p in client.get("/api/v1/promotions").json()["promotions"]]
    assert promo["id"] in [p["id"] for p in client.get("/api/v1/admin/promotions").json()["promotions"]]

    assert client.delete(f"/api/v1/admin/promotions/{promo['id']}").status_code == 200
    assert client.delete(f"/api/v1/admin/promotions/{promo['id']}").status_code == 404


def test_promotion_with_a_code_needs_a_real_one(operator_client):
    unknown = operator_client.post("/api/v1/admin/promotions", json={"title": "Скидка", "action": "promo", "promo_code": "NOSUCH"})
    assert unknown.json()["error"]["code"] == "promo_not_found"
    missing = operator_client.post("/api/v1/admin/promotions", json={"title": "Скидка", "action": "promo"})
    assert missing.status_code == 422


def test_promotions_outside_their_dates_are_not_shown(operator_client, db):
    from datetime import timedelta

    from app.services.venues import utcnow

    row = Promotion(title="Прошлая акция", accent="brand", action="none", sort=1, ends_at=utcnow() - timedelta(days=1))
    db.add(row)
    db.commit()
    try:
        assert "Прошлая акция" not in [p["title"] for p in operator_client.get("/api/v1/promotions").json()["promotions"]]
    finally:
        db.delete(row)
        db.commit()
