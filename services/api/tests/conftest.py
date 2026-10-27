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

os.environ.setdefault("DATABASE_URL", TEST_DATABASE_URL)
os.environ.setdefault("DASHBOARD_SECRET_KEY", "test-secret")
os.environ.setdefault("DASHBOARD_BOOTSTRAP_USERNAME", "admin")
os.environ.setdefault("DASHBOARD_BOOTSTRAP_PASSWORD", "test-pass")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "")


@pytest.fixture(scope="session")
def db_engine():
    from sqlalchemy.exc import OperationalError

    from app.db.base import Base
    from app.db.session import engine
    from app.models import all_models  # noqa: F401

    try:
        with engine.connect():
            pass
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL is not reachable at {TEST_DATABASE_URL}: {exc}")

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_engine):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.models.store_order import StoreOrder

    with db_engine.begin() as connection:
        connection.execute(StoreOrder.__table__.delete())

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def operator_client(client):
    response = client.post("/api/v1/auth/login", json={"username": "admin", "password": "test-pass"})
    assert response.status_code == 200
    return client
