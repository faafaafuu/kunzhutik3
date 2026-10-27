# Кунжут · Доставка еды

Площадка заказа еды из кафе: витрина меню, корзина, оформление заказа, панель оператора и Telegram-бот.

Код выделен из проекта `kunzhutik-content-factory` — взяты только заказы, меню, авторизация операторов и инфраструктура. Пайплайн AI-видео и публикаций в соцсети не переносился.

## Проект

Площадка проектируется целиком до написания кода. Что решено:

| Документ | О чём |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Компоненты, стек, развёртывание, принятые решения и почему |
| [docs/domain-model.md](docs/domain-model.md) | Сущности и схема базы |
| [docs/order-lifecycle.md](docs/order-lifecycle.md) | Статусы заказа, права на переходы, оплата, расчёт доставки, вход клиента |
| [docs/functional-spec.md](docs/functional-spec.md) | Функционал по ролям и экранам |
| [docs/api.md](docs/api.md) | Контракт API и коды ошибок |
| [docs/roadmap.md](docs/roadmap.md) | Этапы работ и что нужно от заказчика |

Коротко: своя сеть кафе с несколькими точками, общее ядро меню и цены со стоп-листом на точку; свои курьеры работают через Telegram-бота; оплата при получении и онлайн через ЮKassa; клиенты заказывают через мобильное приложение на Expo, сайт и Telegram WebApp.

## Что работает сейчас

| Часть | Где | Состояние |
| --- | --- | --- |
| Витрина меню и корзина | `services/api/app/web/` (`index.html`, `app.js`, `styles.css`, `tokens.css`) | Работает: оранжевый стиль дизайн-системы, светлая и тёмная тема, десктоп и мобильный, экран товара с размерами и добавками, режим Telegram WebApp |
| API меню и заказов | `services/api/app/api/routes/storefront.py` | Работает |
| Панель заказов для оператора | `/admin/orders`, `services/api/app/web/admin.*` | Работает, список заказов и смена статуса |
| Авторизация операторов | `services/api/app/services/auth.py` | Cookie-сессия, роли `operator` / `admin` |
| Telegram-бот | `services/telegram-bot/bot_main.py` | Меню, контакты, кнопка WebApp, статусы заказов для сотрудников |

Статусы заказа: `new` → `confirmed` → `preparing` → `delivering` → `completed`, плюс `cancelled`. Каждая смена пишется в `source_json.status_history`.

Меню сейчас лежит в коде (`services/api/app/store/catalog.py`), не в базе: 15 позиций и их фото из карточки «Брайт» на Яндекс Картах. Добавки к еде (`MODIFIER_SETS`) и время приготовления — пример, их надо заменить реальными. Платные добавки уходят в заказ отдельными позициями, «без лука» и т. п. — в комментарий, пока в API нет модификаторов (этап 1).

## Чего ещё нет

Несколько кафе и подбор точки по адресу, зоны и стоимость доставки, модификаторы блюд, курьеры, онлайн-оплата, аккаунты покупателей, меню в базе, мобильное приложение. Всё это спроектировано и разложено по этапам в [docs/roadmap.md](docs/roadmap.md).

## Структура

```text
kunzhut-delivery/
├── docker-compose.yml          # postgres, api, telegram-bot
├── docker-compose.https.yml    # override: Caddy + Let's Encrypt
├── Makefile
├── docs/
│   └── https-telegram-webapp.md
├── infra/caddy/Caddyfile
└── services/
    ├── api/                    # FastAPI: витрина, заказы, авторизация
    │   ├── alembic/            # миграции
    │   ├── app/
    │   │   ├── api/routes/     # storefront, auth, health
    │   │   ├── models/         # StoreOrder, OperatorUser
    │   │   ├── services/       # заказы, авторизация, уведомления
    │   │   ├── store/catalog.py
    │   │   └── web/            # витрина и панель оператора
    │   └── tests/
    └── telegram-bot/           # aiogram
```

## Запуск

```bash
cp .env.example .env
docker compose up -d --build
```

Контейнер `api` сам применяет миграции при старте. Адреса:

- витрина — http://localhost:8000/
- Telegram WebApp — http://localhost:8000/tg
- панель оператора — http://localhost:8000/admin/orders

Логин и пароль первого оператора задаются через `DASHBOARD_BOOTSTRAP_USERNAME` и `DASHBOARD_BOOTSTRAP_PASSWORD`. Пользователь создаётся при первом старте, пароль из `.env` после этого не перечитывается.

Полезное:

```bash
make ps
make logs
make migrate
```

## Тесты

Тестам нужен настоящий PostgreSQL: модели используют `JSONB` и UUID из диалекта PostgreSQL.

```bash
docker run -d --name pg-test -e POSTGRES_DB=delivery -e POSTGRES_USER=delivery \
  -e POSTGRES_PASSWORD=delivery -p 55432:5432 postgres:16-alpine
```

```bash
python3 -m venv .venv && .venv/bin/pip install -r services/api/requirements-dev.txt
cd services/api && ../../.venv/bin/python -m pytest -q
```

Адрес базы переопределяется через `TEST_DATABASE_URL`. Если база недоступна, тесты пропускаются.

## HTTPS и Telegram

Telegram открывает WebApp только по HTTPS. Как поднять Caddy с сертификатом — в [docs/https-telegram-webapp.md](docs/https-telegram-webapp.md).

## Переменные окружения

Полный список — в `.env.example`. Главные:

| Переменная | Зачем |
| --- | --- |
| `DATABASE_URL` | Подключение к PostgreSQL |
| `APP_BASE_URL` | Внешний адрес, используется ботом |
| `TELEGRAM_BOT_TOKEN` | Токен бота; без него бот не стартует, а уведомления молча не отправляются |
| `TELEGRAM_WEBAPP_BASE_URL` | HTTPS-адрес для кнопки WebApp, если отличается от `APP_BASE_URL` |
| `TELEGRAM_ALLOWED_USER_IDS` | Telegram-id сотрудников, которые получают заказы и меняют статусы. Пустое значение открывает доступ всем |
| `DASHBOARD_SECRET_KEY` | Подпись cookie-сессии. В production обязательно сменить |
