import os

import pytest

# Tests need a real PostgreSQL: the models use JSONB and the UUID dialect type.
# Point TEST_DATABASE_URL at a throwaway database, e.g.
#   docker run -d --name pg-test -e POSTGRES_DB=delivery -e POSTGRES_USER=delivery \
#     -e POSTGRES_PASSWORD=delivery -p 55432:5432 postgres:16-alpine
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://delivery:delivery@127.0.0.1:55432/delivery",
)

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("DASHBOARD_SECRET_KEY", "test-secret")
os.environ.setdefault("DASHBOARD_BOOTSTRAP_USERNAME", "admin")
os.environ.setdefault("DASHBOARD_BOOTSTRAP_PASSWORD", "test-pass")
os.environ["TELEGRAM_BOT_TOKEN"] = "123456:test-token"
os.environ["TELEGRAM_ALLOWED_USER_IDS"] = ""
os.environ["GEOCODER"] = "stub"
os.environ["OTP_DEBUG"] = "true"
os.environ["APP_ENV"] = "test"
# Older tests count bonuses to the ruble; the welcome bonus is switched on by the tests that are about it.
os.environ["WELCOME_BONUS"] = "0"
os.environ["CLIENT_DIST_DIR"] = "/nonexistent"

# Inside the seeded 3 km zone around ул. Дзержинского, 18 / far outside it.
INSIDE = {"latitude": 56.1846, "longitude": 36.9795, "text": "Солнечногорск, улица Красная, 1"}
OUTSIDE = {"latitude": 55.991, "longitude": 37.214, "text": "Зеленоград, корпус 1801"}
ALL_DAY = {day: [["00:00", "00:00"]] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}

# Rows a test may create; the seeded venue, zone and menu stay.
VOLATILE_TABLES = [
    "bonus_transactions",
    "order_status_events",
    "order_items",
    "orders",
    "devices",
    "customer_sessions",
    "customer_addresses",
    "otp_codes",
    "login_requests",
    "consents",
    "customers",
    "venue_menu_items",
]


@pytest.fixture(scope="session")
def db_engine():
    from sqlalchemy.exc import OperationalError

    from app.db.base import Base
    from app.db.session import SessionLocal, engine
    from app.models import all_models  # noqa: F401
    from app.services.seed import seed

    try:
        with engine.connect():
            pass
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL is not reachable at {TEST_DATABASE_URL}: {exc}")

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    seed(db)
    db.close()
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture
def db(db_engine):
    from app.db.session import SessionLocal

    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client(db_engine):
    from fastapi.testclient import TestClient
    from sqlalchemy import text

    from app.main import app
    from app.models.venue import DeliveryZone, Venue

    with db_engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {', '.join(VOLATILE_TABLES)} CASCADE"))
        # Open around the clock, so tests do not depend on when they run.
        connection.execute(Venue.__table__.update().values(working_hours=ALL_DAY, special_days={}, is_active=True))
        connection.execute(DeliveryZone.__table__.update().values(is_active=True, min_order_amount=700, delivery_fee=150, free_delivery_from=1500))

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def operator_client(client):
    response = client.post("/api/v1/admin/auth/login", json={"username": "admin", "password": "test-pass"})
    assert response.status_code == 200
    return client


@pytest.fixture
def menu(client):
    payload = client.get("/api/v1/menu").json()
    return {item["slug"]: item for item in payload["items"]}


def option(item: dict, title: str) -> str:
    for group in item["modifier_groups"]:
        for opt in group["options"]:
            if opt["title"] == title:
                return opt["id"]
    raise KeyError(title)


def order_body(lines: list[dict], total: str, **extra) -> dict:
    body = {
        "fulfillment": "delivery",
        "address": INSIDE,
        "items": lines,
        "customer_name": "Фарид",
        "customer_phone": "+7 900 123-45-67",
        "address_details": {"entrance": "2", "floor": "5", "apartment": "48", "intercom": "48К"},
        "payment_method": "card_on_delivery",
        "consent": True,
        "comment": "",
        "expected_total": total,
    }
    body.update(extra)
    return body
