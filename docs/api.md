# API

Целевой контракт. Сейчас реализована только часть «витрина и заказы» в упрощённом виде — см. [roadmap.md](roadmap.md).

Базовый путь `/api/v1`. Правила совместимости — в [architecture.md](architecture.md#совместимость-api): в `v1` только аддитивные изменения, потому что в сторах живут старые версии приложения.

## Соглашения

- Деньги — строки с двумя знаками: `"350.00"`.
- Время — ISO 8601 в UTC: `"2026-10-27T16:40:00Z"`.
- Идентификаторы — UUID строкой.
- Ошибка: `{"error": {"code": "out_of_delivery_zone", "message": "Мы не доставляем по этому адресу", "details": {...}}}`. `code` для клиента, `message` можно показать человеку.
- Авторизация клиента: `Authorization: Bearer <access>`. Панель: cookie-сессия. Бот ходит в базу напрямую, своего API не имеет.

## Публичное — без авторизации

### `GET /config`

Настройки для клиента при запуске.

```json
{
  "brand_name": "Кунжут",
  "currency": "RUB",
  "min_supported_app_version": "1.0.0",
  "payment_methods": ["cash", "card_on_delivery", "online"],
  "support_phone": "+7 (916) 498-39-09"
}
```

### `GET /venues`

Активные точки: адрес, координаты, телефон, график, открыта ли сейчас.

### `POST /venues/resolve`

Какая точка обслужит адрес.

```json
{ "address": "Солнечногорск, ул. Дзержинского, 18" }
```

Ответ — точка, зона, стоимость доставки, минимальный заказ, ожидаемое время. Либо ошибка `out_of_delivery_zone` или `all_venues_closed` — это разные ситуации, и клиент показывает разные сообщения.

Можно передать `latitude`/`longitude` вместо адреса и сэкономить вызов геокодера.

### `GET /menu?venue_id=...`

Меню точки: категории, блюда с ценами этой точки, флаг `is_available`, группы модификаторов с вариантами и надбавками.

Без `venue_id` — меню сети по базовым ценам, с пометкой, что цены предварительные.

### `GET /menu/items/{slug}?venue_id=...`

Одно блюдо целиком.

## Заказы

### `POST /orders/quote`

Расчёт без создания. Вызывается при каждом изменении корзины или адреса.

```json
{
  "venue_id": "...",
  "fulfillment": "delivery",
  "address": { "latitude": 56.18, "longitude": 36.98, "text": "..." },
  "items": [
    { "menu_item_id": "...", "quantity": 2, "modifier_ids": ["...", "..."] }
  ],
  "promo_code": "KUNZHUT10",
  "scheduled_for": null
}
```

Ответ:

```json
{
  "venue": { "id": "...", "title": "Кунжут на Дзержинского" },
  "items": [
    { "menu_item_id": "...", "title": "Донер в хлебе", "unit_price": "350.00",
      "modifiers": [{ "title": "Острый соус", "price_delta": "0.00" }],
      "quantity": 2, "line_total": "700.00" }
  ],
  "items_total": "700.00",
  "discount_total": "70.00",
  "delivery_fee": "0.00",
  "total_amount": "630.00",
  "promised_at": "2026-10-27T16:40:00Z",
  "warnings": []
}
```

`warnings` — непустое, когда заказ оформить можно, но клиенту стоит кое-что знать: например, точка закрывается через 20 минут. Блокирующие проблемы приходят ошибкой, а не предупреждением.

### `POST /orders`

Создание. Тело — как у `quote`, плюс:

```json
{
  "customer_name": "Иван",
  "customer_phone": "+79001234567",
  "address_details": { "entrance": "2", "floor": "5", "apartment": "48", "intercom": "48К" },
  "payment_method": "online",
  "comment": "без лука",
  "expected_total": "630.00"
}
```

`expected_total` обязателен. Если расчёт на сервере дал другую сумму — ответ 409 `price_changed` с новым расчётом; клиент показывает изменения и просит подтвердить.

Ответ 201: заказ, его `number` и, для онлайн-оплаты, `payment.confirmation_url`.

Работает и с токеном, и без: гостевой заказ допустим.

### `GET /orders/{id}` · `GET /orders/{id}/status`

Полный заказ и облегчённый статус для опроса. Для гостя доступ по `id` и совпадению телефона, для авторизованного — по владельцу.

`/status` отдаёт `status`, `promised_at`, курьера и `updated_at` — то, что опрашивается раз в 20 секунд, пока заказ активен.

### `POST /orders/{id}/cancel`

Отмена клиентом. Разрешена до `preparing`, иначе 409 `cancel_not_allowed`.

## Аккаунт

### `POST /auth/otp/request` · `POST /auth/otp/verify`

Вход по телефону. Лимиты и правила — в [order-lifecycle.md](order-lifecycle.md#вход-клиента). Ответ на `request` не зависит от того, зарегистрирован ли номер.

### `POST /auth/telegram`

Вход из WebApp по `initData`. Сервер проверяет подпись и свежесть.

### `POST /auth/refresh` · `POST /auth/logout`

### `GET /me` · `PATCH /me`

Профиль: телефон, имя.

### `GET /me/addresses` · `POST` · `PATCH /{id}` · `DELETE /{id}`

Адреса с координатами и деталями.

### `GET /me/orders`

История с пагинацией.

### `POST /me/devices`

Регистрация токена для пушей: `platform`, `token`.

## Вебхуки

### `POST /webhooks/yookassa`

Без авторизации, но:

- принимается только с IP-диапазонов ЮKassa;
- статус и сумма перепроверяются обратным запросом в API ЮKassa по `payment_id` — телу вебхука не доверяем;
- обработка идемпотентна: повторная доставка того же события отвечает 200 и ничего не меняет.

Всегда отвечаем 200 на распознанное событие, даже если ничего не делали: иначе ЮKassa будет слать его повторно.

## Админ-API

Префикс `/api/v1/admin`, cookie-сессия, права по роли. Этот контракт ломать можно — панель катится вместе с сервером.

| Группа | Эндпоинты | Роль |
| --- | --- | --- |
| Заказы | `GET /orders` (фильтры), `GET /orders/{id}`, `POST /orders/{id}/transition`, `POST /orders/{id}/assign-courier`, `POST /orders/{id}/refund` | operator |
| Стоп-лист | `GET /venues/{id}/menu`, `PATCH /venues/{id}/menu/{item_id}` | operator |
| Меню | CRUD `/menu/categories`, `/menu/items`, `/modifier-groups`, `/modifiers` | manager |
| Точки | CRUD `/venues`, `/venues/{id}/zones` | manager |
| Курьеры | CRUD `/couriers`, `POST /couriers/{id}/shift` | manager |
| Промокоды | CRUD `/promo-codes` | manager |
| Отчёты | `GET /reports/orders`, `/reports/performance`, `/reports/items` | manager |
| Пользователи | CRUD `/users` | admin |

`POST /orders/{id}/transition` принимает `{"to": "confirmed", "comment": "..."}`. Один эндпоинт на все переходы вместо отдельных ручек: правила перехода всё равно в одном месте, и дублировать их по эндпоинтам — значит однажды разойтись.

## Коды ошибок

| Код | Когда |
| --- | --- |
| `out_of_delivery_zone` | Адрес вне всех зон |
| `all_venues_closed` | Зона есть, но точки закрыты |
| `venue_closed` | Выбранная точка закрыта |
| `item_unavailable` | Блюдо в стоп-листе; в `details` — какое |
| `invalid_modifiers` | Не выбран обязательный модификатор или их больше допустимого |
| `below_min_order` | Сумма меньше минимальной; в `details` — сколько не хватает |
| `price_changed` | Расчёт разошёлся с `expected_total`; в `details` — новый расчёт |
| `promo_invalid` | Промокод не существует, истёк или исчерпан |
| `cancel_not_allowed` | Отмена на этом статусе запрещена |
| `invalid_transition` | Переход статуса не разрешён |
| `otp_rate_limited` | Слишком часто запрашивают код |
| `otp_invalid` | Код неверный или истёк |
| `payment_init_failed` | Не удалось создать платёж |
| `app_update_required` | Версия приложения ниже минимальной |

## Генерация клиента

FastAPI отдаёт OpenAPI на `/openapi.json`. Из неё `openapi-typescript` собирает типы в `packages/api-client`, которые использует и сайт, и мобильное приложение. Руками типы не пишутся — иначе они разойдутся с сервером, и узнаем мы об этом от пользователя.
