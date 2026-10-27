# Модель данных

Целевая схема. Сейчас в базе есть только `operator_users` и `store_orders` — остальное предстоит создать. Порядок миграций — в [roadmap.md](roadmap.md).

Общие правила:

- первичный ключ — `UUID`, кроме справочников-перечислений;
- деньги — `NUMERIC(10, 2)`, никогда не `float`;
- время — `TIMESTAMPTZ`, хранится в UTC;
- у каждой таблицы `created_at`, у изменяемых — `updated_at`;
- `snapshot`-поля намеренно дублируют данные: заказ не должен меняться задним числом, когда меняется меню.

## Карта сущностей

```text
venues ──┬── venue_menu_items ── menu_items ──┬── menu_categories
         │                                     └── menu_item_modifier_groups ── modifier_groups ── modifiers
         ├── delivery_zones
         ├── operator_users
         ├── couriers ── courier_shifts
         └── orders ──┬── order_items ── order_item_modifiers
                      ├── order_status_events
                      └── payments ── refunds

customers ──┬── customer_addresses
            ├── devices
            └── orders

promo_codes ── orders          otp_codes (по телефону, без связей)
```

## Точки и расписание

### `venues`

Кафе сети. Корень почти всего остального.

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `slug` | varchar(60) unique | `dzerzhinskogo` |
| `code` | varchar(8) unique | `КУН` — префикс номера заказа |
| `title` | varchar(160) | «Кунжут на Дзержинского» |
| `city` | varchar(120) | |
| `address` | varchar(400) | |
| `latitude`, `longitude` | NUMERIC(9,6) | для подбора ближайшей точки |
| `phone` | varchar(40) | |
| `timezone` | varchar(64) | `Europe/Moscow`. У сети может быть точка в другом поясе |
| `working_hours` | JSONB | `{"mon": [["10:00","22:00"]], ...}`. Список интервалов — чтобы поддержать перерыв |
| `special_days` | JSONB | `{"2026-01-01": []}` — пустой список значит «закрыто» |
| `prep_time_minutes` | int | Базовое время готовки, входит в обещанное время доставки |
| `accepts_delivery` | bool | |
| `accepts_pickup` | bool | |
| `is_active` | bool | Выключенная точка не показывается и не принимает заказы |

График в JSONB, а не отдельной таблицей: меняется редко, запрашивается всегда целиком, «открыто ли сейчас» всё равно считается в коде с учётом таймзоны и `special_days`.

### `delivery_zones`

Зона доставки точки. Задаёт и стоимость, и само наличие доставки по адресу.

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `venue_id` | UUID → venues | |
| `title` | varchar(120) | «Центр», «Заречье» |
| `kind` | varchar(16) | `circle` или `polygon` |
| `center_lat`, `center_lon`, `radius_m` | | для `circle` |
| `polygon` | JSONB | GeoJSON Polygon, для `polygon` |
| `delivery_fee` | NUMERIC(10,2) | |
| `free_delivery_from` | NUMERIC(10,2) nullable | Сумма, с которой доставка бесплатна |
| `min_order_amount` | NUMERIC(10,2) | Ниже — заказ не оформляется |
| `eta_minutes` | int | Время доставки по зоне, прибавляется к `prep_time_minutes` |
| `priority` | int | При пересечении зон выигрывает меньшее значение |
| `is_active` | bool | |

Два вида зон, потому что круг задаётся за минуту и покрывает старт, а полигон нужен, когда реальная граница — это река или железная дорога.

## Меню

Меню двухуровневое: **ядро сети** (что это за блюдо) и **привязка к точке** (почём и есть ли сейчас).

### `menu_categories`

`id`, `slug` unique, `title`, `sort_order`, `is_active`.

### `menu_items`

Карточка блюда на уровне сети.

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `slug` | varchar(80) unique | `doner-bread` |
| `category_id` | UUID → menu_categories | |
| `title`, `description`, `tag` | | `tag` — подпись вроде «Турецкий донер» |
| `base_price` | NUMERIC(10,2) | Цена по умолчанию для сети |
| `weight` | varchar(40) | «300 г» |
| `badge` | varchar(40) nullable | «Хит», «Новинка» |
| `accent` | varchar(16) | Цвет карточки, уже используется витриной |
| `image_url` | varchar(500) nullable | |
| `sort_order` | int | |
| `is_active` | bool | Выключено для всей сети |

### `venue_menu_items`

Что продаёт конкретная точка. Уникальность по `(venue_id, menu_item_id)`.

| Поле | Тип | Заметки |
| --- | --- | --- |
| `venue_id`, `menu_item_id` | UUID | |
| `price_override` | NUMERIC(10,2) nullable | `NULL` — берём `base_price` |
| `is_available` | bool | Стоп-лист |
| `unavailable_until` | TIMESTAMPTZ nullable | Временный стоп: «закончилось, будет к вечеру» |

Отсутствие строки означает, что точка это блюдо не продаёт. Это удобнее, чем заводить строки на все блюда для всех точек.

### Модификаторы

`modifier_groups` — группа выбора: `id`, `title` («Соус»), `selection` (`single` / `multi`), `min_choices`, `max_choices`, `is_required`, `sort_order`.

`modifiers` — вариант: `id`, `group_id`, `title` («Чесночный»), `price_delta` NUMERIC(10,2) (может быть 0 или отрицательной), `is_active`, `sort_order`.

`menu_item_modifier_groups` — какие группы применимы к блюду: `menu_item_id`, `modifier_group_id`, `sort_order`.

Группы переиспользуются: «Соус» один на все донеры. Доступность модификатора по точкам на старте не делаем — если кончился соус, точка снимает блюдо целиком. Усложнять начнём, когда это станет реальной проблемой.

## Клиенты

### `customers`

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `phone` | varchar(20) unique | В формате `+7XXXXXXXXXX`, нормализуется при записи |
| `name` | varchar(160) nullable | |
| `telegram_id` | varchar(32) unique nullable | Заполняется при входе из Telegram |
| `is_blocked` | bool | На случай злоупотреблений |
| `created_at`, `last_order_at` | | |

Телефон — единственный обязательный идентификатор: он всё равно нужен курьеру.

### `customer_addresses`

`id`, `customer_id`, `title` («Дом»), `address`, `latitude`, `longitude`, `entrance`, `floor`, `apartment`, `intercom`, `comment`, `is_default`.

Координаты сохраняются при первом геокодировании, чтобы не дёргать геокодер на каждый повторный заказ.

### `otp_codes`

Коды подтверждения телефона: `id`, `phone`, `code_hash`, `expires_at`, `attempts`, `consumed_at`, `created_at`.

Хранится хеш, не код. Ограничения — в [order-lifecycle.md](order-lifecycle.md#вход-клиента).

### `devices`

Токены для пушей: `id`, `customer_id`, `platform` (`ios` / `android` / `web`), `token` unique, `is_active`, `last_seen_at`.

## Заказы

### `orders`

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `venue_id` | UUID → venues | |
| `customer_id` | UUID → customers nullable | `NULL` — заказ гостя |
| `order_date` | date | День по таймзоне точки |
| `daily_seq` | int | Порядковый номер за день. Unique `(venue_id, order_date, daily_seq)` |
| `number` | varchar(32) unique | `КУН-2710-047`, собирается из трёх полей выше |
| `fulfillment` | varchar(16) | `delivery` или `pickup` |
| `status` | varchar(32) | См. [order-lifecycle.md](order-lifecycle.md) |
| `customer_name`, `customer_phone` | | Снапшот: клиент может потом сменить имя |
| `delivery_address` | varchar(400) nullable | |
| `latitude`, `longitude` | NUMERIC(9,6) nullable | |
| `address_details` | JSONB | Подъезд, этаж, квартира, домофон |
| `delivery_zone_id` | UUID nullable | Снапшот зоны на момент заказа |
| `items_total` | NUMERIC(10,2) | Сумма позиций с модификаторами |
| `discount_total` | NUMERIC(10,2) | |
| `delivery_fee` | NUMERIC(10,2) | |
| `total_amount` | NUMERIC(10,2) | `items_total - discount_total + delivery_fee` |
| `currency` | varchar(8) | `RUB` |
| `payment_method` | varchar(32) | `cash`, `card_on_delivery`, `online` |
| `payment_status` | varchar(32) | `not_required`, `pending`, `paid`, `refunded`, `failed` |
| `promo_code_id` | UUID nullable | |
| `scheduled_for` | TIMESTAMPTZ nullable | Заказ ко времени |
| `promised_at` | TIMESTAMPTZ nullable | Обещанное время, фиксируется при подтверждении |
| `courier_id` | UUID → couriers nullable | |
| `comment` | varchar(500) nullable | |
| `cancel_reason` | varchar(200) nullable | |
| `confirmed_at`, `ready_at`, `picked_up_at`, `delivered_at`, `cancelled_at` | TIMESTAMPTZ nullable | Отметки времени для отчётов |

Отдельные `*_at` вместо вычисления по истории статусов — потому что по ним строятся отчёты, и `WHERE delivered_at IS NOT NULL` читается и индексируется, а разбор событий — нет.

### `order_items`

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `order_id` | UUID → orders | |
| `menu_item_id` | UUID nullable | Ссылка на карточку; `NULL`, если блюдо удалили |
| `title` | varchar(200) | Снапшот названия |
| `unit_price` | NUMERIC(10,2) | Снапшот цены блюда без модификаторов |
| `modifiers_total` | NUMERIC(10,2) | Сумма надбавок за модификаторы, за одну штуку |
| `quantity` | int | |
| `line_total` | NUMERIC(10,2) | `(unit_price + modifiers_total) * quantity` |

### `order_item_modifiers`

`id`, `order_item_id`, `modifier_id` nullable, `title` (снапшот), `price_delta` (снапшот).

### `order_status_events`

| Поле | Тип |
| --- | --- |
| `id` | UUID |
| `order_id` | UUID → orders |
| `from_status`, `to_status` | varchar(32) |
| `actor_type` | `customer`, `operator`, `courier`, `system` |
| `actor_id` | varchar(120) — id оператора, курьера или метка системы |
| `comment` | varchar(300) nullable |
| `created_at` | TIMESTAMPTZ |

Заменяет текущий `source_json.status_history`. Отсюда считается среднее время готовки и доставки.

## Оплата

### `payments`

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `order_id` | UUID → orders | |
| `provider` | varchar(32) | `yookassa` |
| `provider_payment_id` | varchar(100) unique | Идентификатор на стороне ЮKassa |
| `idempotence_key` | varchar(64) unique | Отправляется в ЮKassa, защищает от двойного платежа |
| `amount` | NUMERIC(10,2) | |
| `status` | varchar(32) | `pending`, `waiting_for_capture`, `succeeded`, `canceled` |
| `confirmation_url` | varchar(500) nullable | Куда отправить клиента платить |
| `raw_payload` | JSONB | Последний ответ провайдера целиком, для разбора проблем |
| `paid_at` | TIMESTAMPTZ nullable | |

### `refunds`

`id`, `payment_id`, `provider_refund_id` unique, `amount`, `status`, `reason`, `raw_payload`, `created_at`.

Возвраты частичные — отсюда отдельная таблица, а не поле в платеже.

## Курьеры

### `couriers`

`id`, `name`, `phone`, `telegram_id` unique, `venue_id` (основная точка), `is_active`, `created_at`.

Отдельно от `operator_users`: у курьера нет пароля и доступа в панель, у оператора нет Telegram и смен. Общая таблица означала бы половину полей пустыми у каждой записи.

### `courier_shifts`

`id`, `courier_id`, `venue_id`, `started_at`, `ended_at` nullable.

Курьер на смене видит в боте свободные заказы своей точки. Вне смены — не видит и не получает уведомлений.

## Промокоды

### `promo_codes`

| Поле | Тип | Заметки |
| --- | --- | --- |
| `id` | UUID | |
| `code` | varchar(40) unique | Хранится в верхнем регистре |
| `kind` | varchar(24) | `percent`, `fixed`, `free_delivery` |
| `value` | NUMERIC(10,2) | Процент или сумма; для `free_delivery` не используется |
| `min_order_amount` | NUMERIC(10,2) nullable | |
| `max_discount` | NUMERIC(10,2) nullable | Потолок для процентных |
| `starts_at`, `ends_at` | TIMESTAMPTZ nullable | |
| `usage_limit` | int nullable | Всего применений |
| `used_count` | int | |
| `per_customer_limit` | int nullable | |
| `venue_ids` | JSONB nullable | `NULL` — вся сеть |
| `is_active` | bool | |

Счётчик `used_count` увеличивается в той же транзакции, что и создание заказа, со `SELECT ... FOR UPDATE` на строке промокода. Иначе одноразовый код разойдётся по нескольким заказам.

## Операторы

### `operator_users` (существует, расширяется)

Добавляется:

- `venue_id` UUID nullable — точка оператора; `NULL` у администратора сети;
- `name` varchar(160);
- роли: `admin` (вся сеть, настройки, меню), `manager` (своя точка, меню точки, курьеры, отчёты), `operator` (только заказы своей точки).

## Что переносится из текущей схемы

`store_orders` → `orders` + `order_items` + `order_status_events`. Таблица переименовывается, `items_json` раскладывается в строки, `source_json.status_history` — в события. На момент миграции реальных заказов в базе нет, поэтому переносим схему, а не данные. **Если к тому моменту заказы появятся, миграцию нужно будет писать с переносом данных** — проверить перед запуском.

`operator_users` остаётся, добавляются поля.

`app/store/catalog.py` → `menu_categories`, `menu_items`, `modifier_groups`, `modifiers`. Текущие 45 позиций и 12 категорий переносятся скриптом первичного наполнения, цены привязываются к первой точке.

## Как реализовано (27.10.2026)

Схема выше реализована в миграции `20261027_0002` со следующими отличиями:

- Модификаторы позиции заказа хранятся снапшотом в `order_items.modifiers` (JSONB), а не отдельной таблицей `order_item_modifiers`. Отчёты строятся по позициям; разбор продаж по добавкам пока не нужен, а снапшот проще и не теряет названия и цены при правке меню.
- Тип группы модификаторов — поле `kind`: `choice` (один из вариантов), `addon` (плитки с количеством до `max_quantity`), `remove` (бесплатные «без …»).
- Курьеров, смен, платежей и возвратов пока нет — это следующие этапы (roadmap.md).
- Добавлены `customer_sessions` (refresh-токены с ротацией), `bonus_transactions` (журнал бонусов, баланс — сумма) и CRM-поля клиента: `note`, `tags`, `is_blocked`, согласия на уведомления.
- `store_orders` удалена: реальных заказов в ней не было.
