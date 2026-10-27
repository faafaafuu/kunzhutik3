# Брайт · доставка еды

Площадка заказа еды из кафе «Брайт»: приложение для iPhone и Android, сайт, Telegram WebApp, панель для кафе со встроенной CRM и Telegram-бот для сотрудников.

## Что есть

| Часть | Где | Что умеет |
| --- | --- | --- |
| Приложение и сайт | `apps/client` (Expo) | Один код для iOS, Android, сайта и Telegram WebApp. Меню с поиском и стоп-листом, блюдо с модификаторами, корзина с промокодом, оформление с адресом, временем и оплатой, статус заказа, история и повтор, бонусы, профиль и адреса, вход по SMS-коду или через Telegram, пуши. Светлая и тёмная тема |
| API | `services/api` (FastAPI) | Точки и график, зоны доставки, меню в базе, расчёт заказа на сервере, заказы с номером дня, статусы с правами, клиенты, бонусы, промокоды |
| Панель кафе | `/admin` | Лента заказов со звуком, **карта зон доставки** (нарисовать, тянуть границы, цены, проверка адреса), меню и стоп-лист, **CRM**: база клиентов, сегменты, карточка, заметки, метки, бонусы вручную, выгрузка CSV, выручка по дням; промокоды; сотрудники и роли |
| Telegram-бот | `services/telegram-bot` | Кнопка открытия сайта в Telegram; сотрудникам — каждый новый заказ с кнопками статусов и причинами отказа, `/orders` |
| Макеты | `design/` | Вёрстка всех экранов и состояний — эталон для приложения |

Проект и решения — в `docs/`:

| Документ | О чём |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Компоненты, стек, развёртывание, принятые решения |
| [docs/domain-model.md](docs/domain-model.md) | Сущности и схема базы |
| [docs/order-lifecycle.md](docs/order-lifecycle.md) | Статусы заказа, переходы, расчёт, вход клиента |
| [docs/functional-spec.md](docs/functional-spec.md) | Функционал по ролям и экранам |
| [docs/api.md](docs/api.md) | Контракт API и коды ошибок |
| [docs/roadmap.md](docs/roadmap.md) | Что сделано, что дальше, что нужно от вас |

## Запуск

```bash
cp .env.example .env
```

```bash
docker compose up -d --build
```

Контейнер `api` сам собирает сайт, применяет миграции и при первом старте наполняет базу: точка на Дзержинского, 18, зона доставки кругом 3 км, меню «Брайт» с фото и примерами модификаторов, промокод `BRIGHT10`. Всё это меняется в панели.

- сайт — http://localhost:8000/
- Telegram WebApp — http://localhost:8000/tg
- панель — http://localhost:8000/admin (логин и пароль — `DASHBOARD_BOOTSTRAP_USERNAME` и `DASHBOARD_BOOTSTRAP_PASSWORD`)
- документация API — http://localhost:8000/docs

Приложение для телефонов: [apps/client/README.md](apps/client/README.md) — разработка через Expo Go, сборка в сторы через EAS.

## Структура

```text
├── apps/client/                # Expo: iOS, Android, сайт, Telegram WebApp
├── design/                     # макеты экранов и токены дизайн-системы
├── docs/                       # проект
├── infra/caddy/Caddyfile       # HTTPS
├── docker-compose.yml          # postgres, api (+ собранный сайт), telegram-bot
├── docker-compose.https.yml    # Caddy + Let's Encrypt
└── services/
    ├── api/
    │   ├── alembic/            # миграции
    │   ├── app/
    │   │   ├── api/routes/     # public, account, admin, auth, client_app
    │   │   ├── models/         # venue, menu, customer, order
    │   │   ├── services/       # pricing, orders, venues, geo, loyalty, crm, customers, notifications
    │   │   ├── store/catalog.py   # данные первого запуска
    │   │   └── web/            # панель: admin.html, admin/*.js
    │   └── tests/
    └── telegram-bot/
```

## Тесты

Бэкенду нужен настоящий PostgreSQL:

```bash
docker run -d --name pg-test -e POSTGRES_DB=delivery -e POSTGRES_USER=delivery -e POSTGRES_PASSWORD=delivery -p 55432:5432 postgres:16-alpine
```

```bash
python3 -m venv .venv && .venv/bin/pip install -r services/api/requirements-dev.txt
```

```bash
cd services/api && ../../.venv/bin/python -m pytest -q
```

Клиент:

```bash
cd apps/client && npx tsc --noEmit
```

## HTTPS и Telegram

Telegram открывает WebApp только по HTTPS. Как поднять Caddy с сертификатом — в [docs/https-telegram-webapp.md](docs/https-telegram-webapp.md).

## Переменные окружения

Полный список с пояснениями — в `.env.example`. Перед запуском для людей обязательно:

| Переменная | Зачем |
| --- | --- |
| `DASHBOARD_SECRET_KEY`, `DASHBOARD_BOOTSTRAP_PASSWORD` | Сменить: подпись сессий и пароль первого администратора |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS` | Бот и id сотрудников, которым приходят заказы. Пустой список — заказы в Telegram не приходят никому |
| `SMS_PROVIDER=smsru`, `SMSRU_API_ID` | Отправка кодов входа. Без этого код пишется только в лог |
| `YANDEX_GEOCODER_API_KEY` | Точный поиск адресов. Без ключа работает OpenStreetMap, он хуже знает дома |
| `APP_ENV=production` | Отключает выдачу кода входа в ответе API |
