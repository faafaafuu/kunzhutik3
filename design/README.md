# Макеты клиентских экранов

Статичная вёрстка всех экранов клиента (сайт, Telegram WebApp, приложение на Expo) — для переноса в код. Открыть `design/index.html` в браузере, сервер не нужен.

## Что здесь

| Путь | Что |
| --- | --- |
| `index.html` | Оглавление: экраны и все их состояния |
| `screens/*.html` | По файлу на экран, все состояния подряд. Каждое — `<section class="frame" data-state="…">` |
| `mobile/app.html` | Те же экраны в рамке телефона (режим `?app=1`) + Telegram WebApp + пуш |
| `assets/tokens.css` | Токены дизайн-системы «Кунжут». **Копия** `services/api/app/web/tokens.css` — держать одинаковыми |
| `assets/kit.css` | Все классы компонентов. Первая часть — ровно `services/api/app/web/styles.css`, вторая — компоненты для новых экранов |
| `assets/icons.svg` | Иконки 24×24, `stroke: currentColor`. В каждой странице вставлены инлайном, использование `<svg class="i"><use href="#cart"/></svg>` |
| `assets/spec.css`, `assets/shell.js` | Только для макетов (шапки, рамки, `?state=`, `?app=1`, `?theme=dark`). **Не переносить** |

Фото блюд берутся из `services/api/app/web/assets/photos/` (те же файлы, что в каталоге).

## Экраны → код → API

| Экран | Состояния (`data-state`) | Сайт / WebApp | Expo | API (`docs/api.md`) |
| --- | --- | --- | --- | --- |
| Меню `menu.html` | default, no-address, search, search-empty, loading, error, closed | `/`, `/tg` | `MenuScreen`, `SearchScreen` | `GET /menu?venue_id`, `POST /venues/resolve` |
| Блюдо `dish.html` | required-missing, configured, details, drink, soldout | модалка поверх меню | `DishScreen` | `GET /menu/items/{slug}` |
| Корзина `cart.html` | default, quoting, unavailable, min-order, promo-error, empty | шторка справа | `CartScreen` | `POST /orders/quote` на каждое изменение |
| Оформление `checkout.html` | delivery, new-address, pickup, guest, out-of-zone, price-changed, paying | `/checkout` | `CheckoutScreen` | `POST /orders/quote`, `POST /orders`, `GET /me/addresses` |
| Статус и заказы `order-status.html` | new, confirmed, preparing, delivering, ready-pickup, completed, cancelled, pending-payment, list | `/orders/:id`, `/orders` | `OrderStatusScreen`, `OrdersScreen` | `GET /orders/{id}/status` (опрос 20 с), `POST /orders/{id}/cancel`, `GET /me/orders` |
| Профиль `profile.html` | me, addresses, address-form, history, notifications | `/profile` | `ProfileScreen`, `AddressesScreen`, `AddressFormScreen`, `NotificationsScreen` | `GET/PATCH /me`, `/me/addresses`, `/me/orders`, `POST /me/devices` |
| Вход `login.html` | phone, code, code-invalid, rate-limited, telegram | `/login` | `LoginScreen`, `OtpScreen` | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/telegram` |
| Бонусы `bonus.html` | member, guest, redeem | `/bonus` | `BonusScreen` | план: `GET /loyalty/me`, `POST /loyalty/quote` |
| Системные `system.html` | offline, server-error, not-found, all-closed, update-required, location, toast | общие | `ForceUpdateScreen`, `LocationPermissionScreen` | коды ошибок `docs/api.md` |

Код ошибки API → состояние: `out_of_delivery_zone` → checkout/out-of-zone, `all_venues_closed` → system/all-closed, `venue_closed` → menu/closed, `item_unavailable` → cart/unavailable, `invalid_modifiers` → dish/required-missing, `below_min_order` → cart/min-order, `price_changed` → checkout/price-changed, `promo_invalid` → cart/promo-error, `cancel_not_allowed` → order-status/preparing (кнопка «Позвонить»), `otp_rate_limited` → login/rate-limited, `otp_invalid` → login/code-invalid, `app_update_required` → system/update-required.

## Правила переноса

- Классы и токены брать как есть: `kit.css` можно подключить целиком в `apps/web`. Никаких цветов и размеров мимо `tokens.css`.
- Интерактив в макетах условный (`data-toggle`). Состояния кнопок — через `aria-pressed` / `aria-checked` / `aria-current` / `disabled`, стили уже на них завязаны.
- Тексты — финальные, их не переписывать без причины.
- Итог корзины всегда с сервера (`quote`); пока считается — класс `is-quoting` на шторке.
- Приложение (Expo): разметка своя, но структура экранов, порядок блоков, отступы и токены те же. Вкладки: Меню · Бонусы · Заказы · Профиль. Корзина — плашка над вкладками.
- Telegram WebApp: тот же сайт, `body.telegram-mode`, своя кнопка корзины заменяется на `MainButton`.
- Тёмная тема: `?theme=dark` на любом макете; в коде — `prefers-color-scheme` или `data-theme`.

## Данные-примеры

Меню, цены и фото — «Брайт» с Яндекс Карт. Добавки, время готовки, бонусы, адреса, курьер, номер заказа — придуманы для макета.
