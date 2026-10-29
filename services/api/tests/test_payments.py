from decimal import Decimal
from types import SimpleNamespace

import pytest
from conftest import INSIDE, order_body
from test_orders import poke_line, quote

from app.core.config import settings
from app.models.order import Order
from app.api.routes import payments as payments_routes
from app.api.routes import public
from app.services import payments


class FakeYooKassa:
    """Stands in for api.yookassa.ru: remembers payments and refunds, answers like the real one."""

    def __init__(self):
        self.payments: dict[str, dict] = {}
        self.refunds: list[dict] = []
        self.down = False

    def request(self, method, url, json=None, headers=None, auth=None, timeout=None):
        if self.down:
            raise payments.httpx.ConnectError("down")
        path = url.removeprefix(payments.API)
        if method == "POST" and path == "/payments":
            pid = f"pay-{len(self.payments) + 1}"
            embedded = json["confirmation"]["type"] == "embedded"
            self.payments[pid] = {
                "id": pid,
                "status": "pending",
                "paid": False,
                "amount": json["amount"],
                "metadata": json["metadata"],
                "confirmation": {"type": "embedded", "confirmation_token": f"ct-{pid}"} if embedded else {"type": "redirect", "confirmation_url": f"https://yoomoney.example/checkout/{pid}"},
                "receipt": json.get("receipt"),
            }
            return self._answer(self.payments[pid])
        if method == "GET" and path.startswith("/payments/"):
            payment = self.payments.get(path.rsplit("/", 1)[1])
            return self._answer(payment, 200 if payment else 404)
        if method == "POST" and path == "/refunds":
            self.refunds.append(json)
            return self._answer({"id": f"ref-{len(self.refunds)}", "status": "succeeded"})
        raise AssertionError(f"unexpected {method} {path}")

    @staticmethod
    def _answer(body, status=200):
        return SimpleNamespace(status_code=status, text=str(body), json=lambda: body)

    def pay(self, pid):
        self.payments[pid].update(status="succeeded", paid=True)

    def cancel(self, pid):
        self.payments[pid].update(status="canceled", paid=False)


@pytest.fixture
def yookassa(monkeypatch):
    fake = FakeYooKassa()
    monkeypatch.setattr(settings, "yookassa_shop_id", "123456")
    monkeypatch.setattr(settings, "yookassa_secret_key", "test_secret")
    monkeypatch.setattr(payments.httpx, "request", fake.request)
    # Which orders were announced to the kitchen (staff in Telegram), and how many times.
    fake.announced = []
    for module in (public, payments_routes):
        monkeypatch.setattr(module, "notify_new_order", lambda order_id: fake.announced.append(str(order_id)))
    return fake


def place_online(client, menu, **extra):
    lines = [poke_line(menu, quantity=2)]  # 1300 ₽: above the 700 ₽ minimum of the delivery zone
    total = quote(client, lines)["total_amount"]
    response = client.post("/api/v1/orders", json=order_body(lines, total, payment_method="online", **extra))
    assert response.status_code == 201, response.text
    return response.json()


def test_online_is_offered_only_when_configured(client, monkeypatch):
    assert "online" not in client.get("/api/v1/config").json()["payment_methods"]
    monkeypatch.setattr(settings, "yookassa_shop_id", "1")
    monkeypatch.setattr(settings, "yookassa_secret_key", "s")
    assert "online" in client.get("/api/v1/config").json()["payment_methods"]


def test_online_order_is_refused_when_not_configured(client, menu):
    lines = [poke_line(menu, quantity=2)]
    response = client.post("/api/v1/orders", json=order_body(lines, quote(client, lines)["total_amount"], payment_method="online"))
    assert response.status_code == 422 and response.json()["error"]["code"] == "payment_unavailable"


def test_online_order_waits_for_money_and_the_kitchen_hears_only_after_it(client, menu, yookassa):
    created = place_online(client, menu)
    order = created["order"]
    assert order["status"] == "pending_payment" and order["payment_status"] == "pending" and order["can_pay"]
    assert created["payment"] == {"token": "ct-pay-1"}  # the site shows the widget, no trip to ЮKassa's page
    assert yookassa.announced == []  # nobody in the kitchen yet

    # Open before it is paid: still waiting.
    assert client.get(f"/api/v1/orders/{order['id']}/status").json()["status"] == "pending_payment"

    yookassa.pay("pay-1")
    status = client.get(f"/api/v1/orders/{order['id']}/status").json()  # the screen's poll notices the money
    assert status["status"] == "new" and status["payment_status"] == "paid" and not status["can_pay"]
    assert client.get(f"/api/v1/orders/{order['id']}/status").json()["status"] == "new"
    assert yookassa.announced == [order["id"]]  # announced once, however often the screen polls


def test_webhook_confirms_payment_by_asking_yookassa_not_by_its_own_body(client, menu, yookassa):
    order = place_online(client, menu)["order"]
    # A forged notification: the body says succeeded, ЮKassa says the payment is still pending.
    forged = {"event": "payment.succeeded", "object": {"id": "pay-1", "status": "succeeded", "paid": True}}
    assert client.post("/api/v1/payments/yookassa/webhook", json=forged).status_code == 200
    assert client.get(f"/api/v1/orders/{order['id']}").json()["order"]["status"] == "pending_payment"

    yookassa.pay("pay-1")
    assert client.post("/api/v1/payments/yookassa/webhook", json=forged).status_code == 200
    assert client.get(f"/api/v1/orders/{order['id']}").json()["order"]["payment_status"] == "paid"
    # Told twice, and polled too: announced to the kitchen exactly once.
    client.post("/api/v1/payments/yookassa/webhook", json=forged)
    client.get(f"/api/v1/orders/{order['id']}/status")
    assert yookassa.announced == [order["id"]]


def test_amount_mismatch_does_not_pay_the_order(client, menu, yookassa):
    order = place_online(client, menu)["order"]
    yookassa.payments["pay-1"]["amount"]["value"] = "1.00"
    yookassa.pay("pay-1")
    assert client.get(f"/api/v1/orders/{order['id']}/status").json()["status"] == "pending_payment"


def test_failed_payment_can_be_retried_from_the_order(client, menu, yookassa):
    order = place_online(client, menu)["order"]
    yookassa.cancel("pay-1")
    status = client.get(f"/api/v1/orders/{order['id']}/status").json()
    assert status["status"] == "pending_payment" and status["payment_status"] == "failed" and status["can_pay"]

    again = client.post(f"/api/v1/orders/{order['id']}/pay?embedded=true")
    assert again.status_code == 200 and again.json() == {"token": "ct-pay-2"}
    # While the new payment is alive the same widget token is handed out again, no third payment.
    assert client.post(f"/api/v1/orders/{order['id']}/pay?embedded=true").json() == {"token": "ct-pay-2"}
    assert len(yookassa.payments) == 2
    # The app asks for ЮKassa's page instead: a payment of that kind is made for it.
    assert client.post(f"/api/v1/orders/{order['id']}/pay").json()["url"].endswith("/pay-3")


def test_yookassa_down_leaves_the_order_waiting_for_a_retry(client, menu, yookassa):
    yookassa.down = True
    created = place_online(client, menu)
    assert created["payment"] is None and created["order"]["status"] == "pending_payment" and created["order"]["can_pay"]
    yookassa.down = False
    assert client.post(f"/api/v1/orders/{created['order']['id']}/pay").status_code == 200


def test_paid_order_refused_by_staff_is_refunded(operator_client, client, menu, yookassa, db):
    order = place_online(client, menu)["order"]
    yookassa.pay("pay-1")
    client.get(f"/api/v1/orders/{order['id']}/status")
    response = operator_client.post(f"/api/v1/admin/orders/{order['id']}/transition", json={"to": "rejected", "comment": "Закончились продукты"})
    assert response.status_code == 200, response.text
    assert len(yookassa.refunds) == 1 and yookassa.refunds[0]["payment_id"] == "pay-1"
    db.expire_all()
    assert db.get(Order, order["id"]).payment_status == "refunded"


def test_unpaid_online_orders_expire(client, menu, yookassa, db):
    from datetime import timedelta

    from app.services.orders import expire_unpaid
    from app.services.venues import utcnow

    order = place_online(client, menu)["order"]
    row = db.get(Order, order["id"])
    row.created_at = utcnow() - timedelta(minutes=settings.payment_ttl_minutes + 1)
    db.commit()
    paid, cancelled = expire_unpaid(db)
    assert [o.id for o in cancelled] == [row.id] and not paid
    assert client.get(f"/api/v1/orders/{order['id']}").json()["order"]["status"] == "cancelled"


def test_return_page_goes_back_to_the_site_or_the_app(client, menu, yookassa):
    web = place_online(client, menu)["order"]
    back = client.get(f"/pay/return/{web['id']}", follow_redirects=False)
    assert back.status_code == 303 and back.headers["location"].endswith(f"/order/{web['id']}")
    app = place_online(client, menu, source="ios")["order"]
    assert f"bright://order/{app['id']}" in client.get(f"/pay/return/{app['id']}").text


# ---------- the receipt ----------


def fake_order(lines, *, discount=0, bonus=0, fee=0):
    items = [SimpleNamespace(title=title, quantity=quantity, line_total=Decimal(total)) for title, quantity, total in lines]
    subtotal = sum(Decimal(total) for _, _, total in lines)
    return SimpleNamespace(items=items, discount_total=Decimal(discount), bonus_spent=Decimal(bonus), delivery_fee=Decimal(fee), total_amount=subtotal - Decimal(discount) - Decimal(bonus) + Decimal(fee), number="007")


def receipt_sum(order) -> Decimal:
    return sum(Decimal(item["amount"]["value"]) * item["quantity"] for item in payments.receipt_items(order))


@pytest.mark.parametrize(
    "lines,discount,bonus,fee",
    [
        ([("Поке", 1, "650")], 0, 0, 150),
        ([("Поке", 3, "1950"), ("Латте", 2, "540")], 10, 0, 150),
        ([("Поке", 3, "1950"), ("Латте", 2, "540"), ("Сэндвич", 7, "1771")], "333.33", 17, 0),
        ([("Эклер", 3, "540")], 0, "0.01", 0),
        ([("Эклер", 3, "540"), ("Шу", 1, "180")], 0, 700, 150),
    ],
)
def test_receipt_adds_up_to_the_total_to_the_cent(lines, discount, bonus, fee):
    order = fake_order(lines, discount=discount, bonus=bonus, fee=fee)
    assert receipt_sum(order) == order.total_amount


def test_receipt_falls_back_to_one_line_when_a_dish_is_fully_discounted():
    order = fake_order([("Эклер", 1, "180"), ("Шу", 1, "180")], discount=360)
    items = payments.receipt_items(order)
    assert len(items) == 1 and items[0]["description"] == "Заказ № 007" and Decimal(items[0]["amount"]["value"]) == order.total_amount


def test_receipt_carries_phone_vat_and_delivery_as_a_service(monkeypatch):
    monkeypatch.setattr(settings, "yookassa_tax_system_code", 2)
    order = fake_order([("Поке", 1, "650")], fee=150)
    order.customer_phone = "+79001234567"
    receipt = payments.build_receipt(order)
    assert receipt["customer"] == {"phone": "79001234567"} and receipt["tax_system_code"] == 2
    assert receipt["items"][0]["vat_code"] == 1 and receipt["items"][-1]["payment_subject"] == "service"
    monkeypatch.setattr(settings, "yookassa_send_receipt", False)
    assert payments.build_receipt(order) is None


def test_empty_tax_system_in_env_means_unset(monkeypatch):
    from app.core.config import Settings

    monkeypatch.setenv("YOOKASSA_TAX_SYSTEM_CODE", "")
    assert Settings().yookassa_tax_system_code is None


def test_the_app_pays_on_our_page_with_the_widget(client, menu, yookassa):
    order = place_online(client, menu, source="ios")["order"]
    page = client.get(f"/pay/{order['id']}")
    assert page.status_code == 200 and "YooMoneyCheckoutWidget" in page.text and "ct-pay-1" in page.text
    assert f"bright://order/{order['id']}" in page.text
    yookassa.pay("pay-1")
    client.get(f"/api/v1/orders/{order['id']}/status")
    # Paid: the page is not a payment form any more.
    assert "YooMoneyCheckoutWidget" not in client.get(f"/pay/{order['id']}").text
