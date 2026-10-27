STORE_CURRENCY = "RUB"

# Menu as published on Yandex Maps for «Брайт», Солнечногорск (marked there as not updated for a while).
# Photos are the ones the venue published on Yandex Maps, cropped to 800×800.
# "extras" are drink add-ons and "modifiers" are dish add-ons: both are EXAMPLE values set while
# designing the storefront. Replace them with the venue's real list and prices.

BUSINESS_PROFILE = {
    "brand_name": "Кунжут",
    "address": "ул. Дзержинского, 18",
    "city": "Солнечногорск",
    "phone": "+7 (916) 498-39-09",
    "hours": "ежедневно с 10:00 до 22:00",
    "map_url": "https://yandex.ru/navi/org/kunzhut/164627838144?si=h642xhuqxfhvq70ru31nkj80c4",
    "instagram_url": "https://www.instagram.com/kunzhut.food?igsh=dXVtODRxOXhrZmow",
    "vk_url": "https://vk.ru/kunzhutfood",
    "menu_source_url": "https://yandex.ru/maps/org/brayt/56159815629/menu/",
    "menu_source_note": "Позиции и цены — из карточки «Брайт» на Яндекс Картах.",
}

CATEGORIES = [
    {
        "id": "coffee",
        "title": "Кофе"
    },
    {
        "id": "poke",
        "title": "Поке"
    },
    {
        "id": "salads",
        "title": "Салаты"
    },
    {
        "id": "sandwiches",
        "title": "Окинавские сэндвичи"
    },
    {
        "id": "rolls",
        "title": "Ролл"
    },
    {
        "id": "scramble",
        "title": "Скрембл"
    },
    {
        "id": "desserts",
        "title": "Десерты"
    },
    {
        "id": "extras",
        "title": "Дополнительно"
    },
    {
        "id": "modifiers",
        "title": "Добавки к блюдам"
    }
]

ADDON_CATEGORY_ID = "extras"
MODIFIER_CATEGORY_ID = "modifiers"

MENU_ITEMS = [
    {"id": "latte", "category_id": "coffee", "title": "Латте", "tag": "Кофе", "description": "Нежный латте с бархатной пенкой.", "price": 270, "weight": "300 мл", "accent": "#ff6900", "image_url": "/static/assets/photos/latte.jpg"},
    {"id": "raf", "category_id": "coffee", "title": "Раф", "tag": "Кофе", "description": "Нежный кремовый кофе с ванильной ноткой, взбитый до идеальной консистенции.", "price": 300, "weight": "300 мл", "accent": "#ff6900", "image_url": "/static/assets/photos/raf.jpg"},
    {"id": "flat-white", "category_id": "coffee", "title": "Флэт Уайт", "tag": "Кофе", "description": "Мягкий флэт уайт с бархатной текстурой!", "price": 270, "weight": "200 мл", "accent": "#ff6900", "image_url": "/static/assets/photos/flat-white.jpg"},
    {"id": "espresso", "category_id": "coffee", "title": "Эспрессо", "tag": "Кофе", "description": "Интенсивный эспрессо, который подарит вам заряд бодрости на весь день!", "price": 200, "weight": "200 мл", "accent": "#ff6900", "image_url": "/static/assets/photos/espresso.jpg"},
    {"id": "americano", "category_id": "coffee", "title": "Американо", "tag": "Кофе", "description": "Легкий и крепкий американо для тех, кто предпочитает классический кофе.", "price": 200, "weight": "200 мл", "accent": "#ff6900", "image_url": "/static/assets/photos/americano.jpg"},
    {"id": "poke-shrimp", "category_id": "poke", "title": "Поке с креветкой", "tag": "Поке", "description": "Освежающий поке с сочными креветками и яркими овощами.", "price": 630, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/poke-shrimp.jpg"},
    {"id": "poke-salmon", "category_id": "poke", "title": "Поке с лососем", "tag": "Поке", "description": "Нежный лосось, свежие ингредиенты и ароматный соус.", "price": 650, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/poke-salmon.jpg"},
    {"id": "salad-arugula-shrimp", "category_id": "salads", "title": "Салат с рукколой и креветками", "tag": "Салат", "description": "Свежая руккола, нежные креветки и легкая заправка.", "price": 450, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/salad-arugula-shrimp.jpg"},
    {"id": "salad-uzbek-tomato-stracciatella", "category_id": "salads", "title": "Салат с узбекскими томатами, страчателлой и креветкой", "tag": "Салат", "description": "Легкий салат с яркими вкусами и морским акцентом.", "price": 650, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/salad-uzbek-tomato-stracciatella.jpg"},
    {"id": "okinawa-unagi-crab", "category_id": "sandwiches", "title": "Окинавский сэндвич с крабом унаги", "tag": "Сэндвич", "description": "Изысканный сендвич с крабом унаги.", "price": 350, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/okinawa-unagi-crab.jpg"},
    {"id": "roll-salmon", "category_id": "rolls", "title": "Ролл с лососем", "tag": "Ролл", "description": "Свежий ролл с нежным лососем.", "price": 400, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/roll-salmon.jpg"},
    {"id": "scramble-shrimp-avocado", "category_id": "scramble", "title": "Скрембл с креветкой и авокадо", "tag": "Завтрак", "description": "Нежный скрембл, дополненный креветками и авокадо.", "price": 400, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/scramble-shrimp-avocado.jpg"},
    {"id": "cheesecake", "category_id": "desserts", "title": "Чизкейк", "tag": "Десерт", "description": "Нежный чизкейк с хрустящей основой и сливочным вкусом!", "price": 220, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/cheesecake.jpg"},
    {"id": "eclair", "category_id": "desserts", "title": "Эклер", "tag": "Десерт", "description": "Сладкое удовольствие для настоящих сладкоежек!", "price": 180, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/eclair.jpg"},
    {"id": "choux", "category_id": "desserts", "title": "Пирожное Шу", "tag": "Десерт", "description": "Хрустящее пирожное Шу, наполненное нежным кремом.", "price": 180, "weight": "", "accent": "#ff6900", "image_url": "/static/assets/photos/choux.jpg"},
    # Drink add-ons. EXAMPLE.
    {"id": "syrup", "category_id": "extras", "title": "Сироп", "tag": "Добавка", "description": "Ванильный, карамельный или ореховый.", "price": 50, "weight": "", "accent": "#ff6900", "image_url": None},
    {"id": "oat-milk", "category_id": "extras", "title": "Альтернативное молоко", "tag": "Добавка", "description": "Овсяное или кокосовое.", "price": 60, "weight": "", "accent": "#ff6900", "image_url": None},
    {"id": "espresso-shot", "category_id": "extras", "title": "Шот эспрессо", "tag": "Добавка", "description": "Дополнительная порция эспрессо.", "price": 90, "weight": "", "accent": "#ff6900", "image_url": None},
    # Dish add-ons. EXAMPLE.
    {"id": "mod-double-protein", "category_id": "modifiers", "title": "Двойная порция", "tag": "Добавка", "description": "Ещё порция креветок или лосося.", "price": 250, "weight": "+70 г", "accent": "#ff6900", "image_url": None},
    {"id": "mod-avocado", "category_id": "modifiers", "title": "Авокадо", "tag": "Добавка", "description": "Половинка спелого авокадо.", "price": 120, "weight": "+50 г", "accent": "#ff6900", "image_url": None},
    {"id": "mod-egg", "category_id": "modifiers", "title": "Яйцо пашот", "tag": "Добавка", "description": "", "price": 60, "weight": "1 шт", "accent": "#ff6900", "image_url": None},
    {"id": "mod-sauce-spicy", "category_id": "modifiers", "title": "Соус спайси", "tag": "Добавка", "description": "", "price": 40, "weight": "30 г", "accent": "#ff6900", "image_url": None},
    {"id": "mod-sauce-unagi", "category_id": "modifiers", "title": "Соус унаги", "tag": "Добавка", "description": "", "price": 40, "weight": "30 г", "accent": "#ff6900", "image_url": None},
    {"id": "mod-sesame", "category_id": "modifiers", "title": "Кунжут", "tag": "Добавка", "description": "", "price": 20, "weight": "5 г", "accent": "#ff6900", "image_url": None},
]

# Which modifiers each dish offers. EXAMPLE set.
# "paid" are modifier item ids (priced on the server like any item); "remove" are free
# removals that travel in the order comment until the API gets real modifiers (roadmap, stage 1).
_BOWL = {
    "paid": ["mod-double-protein", "mod-avocado", "mod-egg", "mod-sauce-spicy", "mod-sauce-unagi", "mod-sesame"],
    "remove": ["Без лука", "Без огурца", "Без соуса", "Без кунжута"],
}
MODIFIER_SETS = {
    "poke-shrimp": _BOWL,
    "poke-salmon": _BOWL,
    "salad-arugula-shrimp": {"paid": ["mod-double-protein", "mod-avocado", "mod-egg", "mod-sesame"], "remove": ["Без соуса", "Без пармезана"]},
    "salad-uzbek-tomato-stracciatella": {"paid": ["mod-double-protein", "mod-avocado"], "remove": ["Без лука", "Без соуса"]},
    "roll-salmon": {"paid": ["mod-double-protein", "mod-avocado", "mod-sauce-spicy", "mod-sauce-unagi", "mod-sesame"], "remove": ["Без огурца", "Без соуса"]},
    "okinawa-unagi-crab": {"paid": ["mod-avocado", "mod-egg", "mod-sauce-spicy", "mod-sauce-unagi"], "remove": ["Без соуса", "Без огурца"]},
    "scramble-shrimp-avocado": {"paid": ["mod-double-protein", "mod-avocado", "mod-egg", "mod-sauce-spicy"], "remove": ["Без лука", "Без зелени"]},
}

# Shown on the product screen. EXAMPLE cooking times.
COOK_MINUTES = {"coffee": 4, "poke": 10, "salads": 8, "sandwiches": 7, "rolls": 7, "scramble": 10, "desserts": 1}

FEATURES = [
    {"title": "Поке, роллы и кофе", "text": "Свежие боулы, сэндвичи и кофе — в одном заказе."},
    {"title": "ул. Дзержинского, 18", "text": "Солнечногорск, ежедневно с 10:00 до 22:00."},
    {"title": "Без очереди", "text": "Закажите на сайте или в Telegram и заберите, когда будет готово."},
]

PROMOS = [
    {"title": "Поке с лососем", "text": "Нежный лосось, свежие ингредиенты и ароматный соус — 650 ₽."},
    {"title": "Кофе к завтраку", "text": "Скрембл с креветкой и авокадо и латте — 670 ₽."},
]
