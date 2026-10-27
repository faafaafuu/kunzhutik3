# Брайт · клиентское приложение

Один код на Expo (React Native) — три платформы:

| Платформа | Как попадает к клиенту |
| --- | --- |
| iPhone | App Store, сборка через EAS |
| Android | Google Play, сборка через EAS |
| Сайт и Telegram WebApp | `expo export -p web`, раздаёт контейнер `api` на `/` и `/tg` |

Экраны повторяют макеты из `design/`: меню, блюдо с модификаторами, корзина, оформление, статус заказа, заказы, бонусы, профиль, адреса, вход по SMS. Цвета и размеры — из `src/theme/tokens.ts`, это копия `design/assets/tokens.css`.

## Запуск для разработки

API должен работать (см. корневой README). Затем:

```bash
npm install
```

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000 npx expo start
```

`EXPO_PUBLIC_API_URL` — адрес API, видимый с телефона (не `localhost`). Для сайта переменная не нужна: он ходит в API на своём же адресе.

Открыть на телефоне — приложение Expo Go и QR-код из терминала. В браузере — клавиша `w`.

В разработке удобно включить `OTP_DEBUG=true` у API: код входа придёт в ответе и подставится сам.

## Проверки

```bash
npx tsc --noEmit
```

```bash
npx expo export -p web -p ios -p android
```

## Сборка в сторы

Нужны аккаунты Apple Developer и Google Play. Один раз:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

`init` пропишет `extra.eas.projectId` в `app.json` — без него не работают пуши. Затем сборка и отправка:

```bash
npx eas-cli@latest build -p all --profile production
```

```bash
npx eas-cli@latest submit -p all
```

Перед этим поменяйте в `app.json` `ios.bundleIdentifier` и `android.package` (сейчас `ru.bright.delivery`), а также иконки в `assets/`, и задайте `EXPO_PUBLIC_API_URL` боевым адресом в профиле сборки EAS.

## Устройство

```text
src/
├── app/            экраны (Expo Router): (tabs)/ — Меню, Бонусы, Заказы, Профиль
├── api/            клиент API и типы ответов
├── store/          корзина, адрес и способ получения, сессия (zustand, сохраняются на устройстве)
├── hooks/data.ts   меню, расчёт корзины (POST /orders/quote), подбор точки по адресу
├── components/     кнопки, поля, карточки, шапка и нижние вкладки
├── lib/            форматирование, Telegram WebApp, пуши
└── theme/          токены дизайн-системы, светлая и тёмная тема
```

Итог корзины всегда считает сервер: приложение показывает только то, что вернул `quote`.

Expo меняется от версии к версии — перед правкой нативных API сверяйтесь с документацией своей версии SDK (`https://docs.expo.dev/versions/v58.0.0/`).
