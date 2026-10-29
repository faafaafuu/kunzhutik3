from app.core.config import settings


def test_legal_pages_render_without_javascript(client):
    for path in ("/legal", "/legal/offer", "/legal/delivery", "/legal/refund", "/legal/bonus", "/legal/privacy", "/legal/consent"):
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


def test_legal_pages_load_nothing_from_other_sites(client):
    # A font from Google would send every visitor's IP address abroad.
    for path in ("/legal", "/legal/offer", "/legal/privacy", "/legal/consent", "/legal/bonus"):
        assert "googleapis" not in client.get(path).text and "gstatic" not in client.get(path).text


def test_consent_page_has_what_article_9_asks_for(client, monkeypatch):
    monkeypatch.setattr(settings, "legal_name", "ИП Тестов Тест Тестович")
    monkeypatch.setattr(settings, "legal_address", "г. Солнечногорск, ул. Тестовая, 1")
    page = client.get("/legal/consent").text
    for part in ("ИП Тестов Тест Тестович", "ул. Тестовая, 1", "Цели", "Данные", "Действия", "отзыв", "30 дней", "Редакция от"):
        assert part.lower() in page.lower(), part


def test_bonus_rules_follow_the_settings(client, monkeypatch):
    monkeypatch.setattr(settings, "welcome_bonus", 333)
    monkeypatch.setattr(settings, "referral_friend_bonus", 111)
    monkeypatch.setattr(settings, "referral_referrer_bonus", 222)
    page = client.get("/legal/bonus").text
    assert "333 бонусов" in page and "111 бонусов" in page and "222 бонусов" in page
    # Bonuses are exchanged for dishes, they do not pay part of an order.
    assert "Обмен бонусов" in page and "частью стоимости заказа ими не платят" in page
    monkeypatch.setattr(settings, "referral_friend_bonus", 0)
    monkeypatch.setattr(settings, "referral_referrer_bonus", 0)
    assert "не действует" in client.get("/legal/bonus").text
