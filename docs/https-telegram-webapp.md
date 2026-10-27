# HTTPS для Telegram WebApp

Telegram открывает встроенные WebApp только по HTTPS. URL вида `http://<ip>:8000/tg` будет открываться как обычная внешняя ссылка, не как embedded приложение.

## Что добавлено

В проект добавлен optional HTTPS override:

```text
docker-compose.https.yml
infra/caddy/Caddyfile
```

Используется Caddy:

- слушает `80` и `443`;
- автоматически получает Let's Encrypt сертификат;
- проксирует HTTPS traffic в `api:8000`;
- делает `/tg` доступным как Telegram WebApp URL.

## Требования

1. Домен должен указывать A-записью на сервер.
2. Порты `80` и `443` должны быть открыты на firewall/security group.
3. На сервере не должен быть занят порт `80` или `443` другим nginx/apache/caddy.
4. В `.env` должен быть HTTPS base URL.

## Пример `.env` для production

```dotenv
PUBLIC_DOMAIN=orders.example.com
APP_BASE_URL=https://orders.example.com
TELEGRAM_WEBAPP_BASE_URL=https://orders.example.com
```

`TELEGRAM_WEBAPP_BASE_URL` необязателен, если он совпадает с `APP_BASE_URL`, но лучше явно задать его для Telegram-кнопок.

## Запуск HTTPS stack

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

Проверка:

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml ps
docker compose -f docker-compose.yml -f docker-compose.https.yml logs -f caddy
curl -I https://orders.example.com/tg
```

## Перезапуск после изменения `.env`

После изменения `APP_BASE_URL`, `TELEGRAM_WEBAPP_BASE_URL` или `PUBLIC_DOMAIN` нужно перезапустить минимум `api`, `telegram-bot`, `caddy`:

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build api telegram-bot caddy
```

## Проверка Telegram

1. Открыть бота.
2. Нажать `/start`.
3. Кнопка должна называться `Открыть заказ в Telegram`.
4. Telegram должен открыть embedded WebApp.
5. Внутри WebApp должен открыться `/tg`.
6. После оформления заказа оператор должен получить сообщение в Telegram.

## Если нет домена

Для production лучше использовать нормальный домен. Временные DNS-сервисы типа `sslip.io` или `nip.io` могут помочь быстро проверить HTTPS на IP, но это не production-вариант.

Пример временного домена:

```dotenv
PUBLIC_DOMAIN=<ip-с-дефисами>.sslip.io
APP_BASE_URL=https://<ip-с-дефисами>.sslip.io
TELEGRAM_WEBAPP_BASE_URL=https://<ip-с-дефисами>.sslip.io
```

Если такой домен перестанет резолвиться или Let's Encrypt откажет, нужно подключить обычный домен.

## Частые проблемы

### Telegram всё равно открывает браузер

Причины:

- URL начинается с `http://`, а не `https://`;
- бот не перезапущен после изменения `.env`;
- `TELEGRAM_WEBAPP_BASE_URL` пустой, а `APP_BASE_URL` всё еще `http://...`;
- сертификат не выпущен;
- домен не указывает на сервер.

### Caddy не получает сертификат

Проверить:

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml logs caddy
```

Типовые причины:

- порт `80` закрыт;
- порт `443` закрыт;
- DNS A-запись не указывает на сервер;
- другой процесс уже занимает `80/443`;
- слишком много попыток выпуска сертификата за короткое время.

### API работает на `:8000`, но HTTPS не работает

Проверить:

```bash
docker compose ps
docker compose -f docker-compose.yml -f docker-compose.https.yml ps
```

HTTPS работает только если запущен override с `caddy`.
