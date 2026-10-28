from app.core.config import settings


def test_legal_pages_render_without_javascript(client):
    for path in ("/legal", "/legal/offer", "/legal/delivery", "/legal/refund", "/legal/privacy"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.headers["content-type"].startswith("text/html")
        assert "<h1>" in response.text


def test_requisites_come_from_settings(client, monkeypatch):
    assert "не указано" in client.get("/legal").text
    monkeypatch.setattr(settings, "legal_name", "ИП Тестов Тест Тестович")
    monkeypatch.setattr(settings, "legal_inn", "771234567890")
    monkeypatch.setattr(settings, "legal_ogrnip", "312774600000012")
    page = client.get("/legal").text
    assert "ИП Тестов Тест Тестович" in page and "771234567890" in page and "312774600000012" in page
    assert "ИНН 771234567890" in client.get("/legal/offer").text


def test_delivery_terms_come_from_the_zone(client, menu):
    page = client.get("/legal/delivery").text
    # The seeded zone: minimum 700, delivery 150, free from 1500.
    assert "от 700 ₽" in page and "150 ₽" in page and "1 500 ₽" in page


def test_unknown_legal_path_is_not_the_client_app(client):
    assert client.get("/legal/nope").status_code == 404
