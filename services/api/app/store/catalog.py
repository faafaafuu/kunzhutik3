"""Seed data: the first venue, its delivery zone and the menu.

Loaded into an empty database on first start (app/services/seed.py). After that everything is
edited in the operator panel, and this file is not read again.

Menu, prices and photos — from the «Брайт» card on Yandex Maps (Солнечногорск), photos cropped
to 800×800. Modifiers, cooking times, the zone and its prices are EXAMPLE values set while
designing the app: replace them with the real ones in the panel.
"""

BRAND_NAME = "Брайтс"

VENUE = {
    "code": "BR",
    "title": "Брайт на Дзержинского",
    "address": "ул. Дзержинского, 18",
    "city": "Солнечногорск",
    "phone": "+7 (926) 407-01-00",
    "latitude": 56.188580,
    "longitude": 36.982054,
    "timezone": "Europe/Moscow",
    "working_hours": {day: [["10:00", "22:00"]] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")},
    "cook_minutes": 15,
}

# EXAMPLE zone: a 3 km circle around the venue. Redraw it on the map in the panel.
ZONE = {
    "title": "Солнечногорск",
    "radius_km": 3.0,
    "delivery_fee": 150,
    "free_delivery_from": 1500,
    "min_order_amount": 700,
    "eta_minutes": 35,
}

# Food first, drinks at the end of the menu.
CATEGORIES = [
    ("poke", "Поке"),
    ("salads", "Салаты"),
    ("sandwiches", "Окинавские сэндвичи"),
    ("rolls", "Ролл"),
    ("scramble", "Скрембл"),
    ("desserts", "Десерты"),
    ("coffee", "Кофе"),
]

# EXAMPLE cooking times per category, minutes.
COOK_MINUTES = {"coffee": 4, "poke": 10, "salads": 8, "sandwiches": 7, "rolls": 7, "scramble": 10, "desserts": 1}

PHOTO = "/static/assets/photos/{}.jpg"

# slug, category, title, description, price, weight, badges, composition
ITEMS = [
    ("latte", "coffee", "Латте", "Нежный латте с бархатной пенкой.", 270, "300 мл", [], ""),
    ("raf", "coffee", "Раф", "Нежный кремовый кофе с ванильной ноткой, взбитый до идеальной консистенции.", 300, "300 мл", ["hit"], ""),
    ("flat-white", "coffee", "Флэт Уайт", "Мягкий флэт уайт с бархатной текстурой!", 270, "200 мл", [], ""),
    ("espresso", "coffee", "Эспрессо", "Интенсивный эспрессо, который подарит вам заряд бодрости на весь день!", 200, "200 мл", [], ""),
    ("americano", "coffee", "Американо", "Легкий и крепкий американо для тех, кто предпочитает классический кофе.", 200, "200 мл", [], ""),
    ("poke-shrimp", "poke", "Поке с креветкой", "Освежающий поке с сочными креветками и яркими овощами.", 630, "", [], ""),
    (
        "poke-salmon",
        "poke",
        "Поке с лососем",
        "Нежный лосось, свежие ингредиенты и ароматный соус.",
        650,
        "350 г",
        ["hit"],
        "рис, лосось, огурец, эдамаме, редис, водоросли чука, соус унаги, кунжут",
    ),
    ("salad-arugula-shrimp", "salads", "Салат с рукколой и креветками", "Свежая руккола, нежные креветки и легкая заправка.", 450, "", [], ""),
    (
        "salad-uzbek-tomato-stracciatella",
        "salads",
        "Салат с узбекскими томатами, страчателлой и креветкой",
        "Легкий салат с яркими вкусами и морским акцентом.",
        650,
        "",
        [],
        "",
    ),
    ("okinawa-unagi-crab", "sandwiches", "Окинавский сэндвич с крабом унаги", "Изысканный сендвич с крабом унаги.", 350, "", ["new"], ""),
    ("roll-salmon", "rolls", "Ролл с лососем", "Свежий ролл с нежным лососем.", 400, "", [], ""),
    ("scramble-shrimp-avocado", "scramble", "Скрембл с креветкой и авокадо", "Нежный скрембл, дополненный креветками и авокадо.", 400, "", [], ""),
    ("cheesecake", "desserts", "Чизкейк", "Нежный чизкейк с хрустящей основой и сливочным вкусом!", 220, "", [], ""),
    ("eclair", "desserts", "Эклер", "Сладкое удовольствие для настоящих сладкоежек!", 180, "", [], ""),
    ("choux", "desserts", "Пирожное Шу", "Хрустящее пирожное Шу, наполненное нежным кремом.", 180, "", [], ""),
]

# EXAMPLE modifiers. Options: (code, title, price, weight).
ADDONS = {
    "double": ("Двойная порция", 250, "+70 г"),
    "avocado": ("Авокадо", 120, "+50 г"),
    "egg": ("Яйцо пашот", 60, "1 шт"),
    "sauce-spicy": ("Соус спайси", 40, "30 г"),
    "sauce-unagi": ("Соус унаги", 40, "30 г"),
    "sesame": ("Кунжут", 20, "5 г"),
    "syrup": ("Сироп", 50, ""),
    "oat-milk": ("Альтернативное молоко", 60, ""),
    "espresso-shot": ("Шот эспрессо", 90, ""),
}

# Group code → (title, subtitle, kind, required, max_quantity, options).
# For choice/remove groups the options are plain titles, for addon groups — keys of ADDONS.
GROUPS = {
    "poke-sauce": ("Соус", "один на выбор", "choice", True, 1, ["Унаги", "Спайси", "Кунжутный"]),
    "syrup-flavour": ("Сироп", "вкус", "choice", False, 1, ["Ваниль", "Карамель", "Орех"]),
    "coffee-addons": ("Добавить", "", "addon", False, 3, ["syrup", "oat-milk", "espresso-shot"]),
    "poke-addons": ("Добавить", "", "addon", False, 3, ["double", "avocado", "egg", "sauce-spicy", "sauce-unagi", "sesame"]),
    "poke-remove": ("Убрать", "", "remove", False, 1, ["Без лука", "Без огурца", "Без соуса", "Без кунжута"]),
    "salad-addons": ("Добавить", "", "addon", False, 3, ["double", "avocado", "egg", "sesame"]),
    "salad-remove": ("Убрать", "", "remove", False, 1, ["Без соуса", "Без пармезана"]),
    "tomato-salad-addons": ("Добавить", "", "addon", False, 3, ["double", "avocado"]),
    "tomato-salad-remove": ("Убрать", "", "remove", False, 1, ["Без лука", "Без соуса"]),
    "roll-addons": ("Добавить", "", "addon", False, 3, ["double", "avocado", "sauce-spicy", "sauce-unagi", "sesame"]),
    "roll-remove": ("Убрать", "", "remove", False, 1, ["Без огурца", "Без соуса"]),
    "sandwich-addons": ("Добавить", "", "addon", False, 3, ["avocado", "egg", "sauce-spicy", "sauce-unagi"]),
    "sandwich-remove": ("Убрать", "", "remove", False, 1, ["Без соуса", "Без огурца"]),
    "scramble-addons": ("Добавить", "", "addon", False, 3, ["double", "avocado", "egg", "sauce-spicy"]),
    "scramble-remove": ("Убрать", "", "remove", False, 1, ["Без лука", "Без зелени"]),
}

ITEM_GROUPS = {
    "latte": ["syrup-flavour", "coffee-addons"],
    "raf": ["syrup-flavour", "coffee-addons"],
    "flat-white": ["coffee-addons"],
    "americano": ["coffee-addons"],
    "poke-shrimp": ["poke-sauce", "poke-remove", "poke-addons"],
    "poke-salmon": ["poke-sauce", "poke-remove", "poke-addons"],
    "salad-arugula-shrimp": ["salad-remove", "salad-addons"],
    "salad-uzbek-tomato-stracciatella": ["tomato-salad-remove", "tomato-salad-addons"],
    "roll-salmon": ["roll-remove", "roll-addons"],
    "okinawa-unagi-crab": ["sandwich-remove", "sandwich-addons"],
    "scramble-shrimp-avocado": ["scramble-remove", "scramble-addons"],
}

# EXAMPLE promo code from the cart mockup.
PROMO_CODES = [
    {"code": "BRIGHT10", "kind": "percent", "value": 10, "min_order_amount": 500, "note": "Пример: −10% от 500 ₽"},
]
