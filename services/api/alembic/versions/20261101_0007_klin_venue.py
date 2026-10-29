"""second venue: «Брайт на Мира» in Клин, with its own menu

Data from the cafe's card on Yandex Maps (org 237661153074): address, phone, hours, dishes, prices and photos.
The menu stays one for the chain (menu_items); what differs between the two cafes lives in venue_menu_items:
  - a dish only Клин sells is new here and is on the stop-list of every other venue;
  - a dish only Дзержинского sells (espresso, roll, the tomato salad, choux) is on Клин's stop-list;
  - a dish both sell keeps its base price, Клин gets its own price as price_override.
The zone is an EXAMPLE 3 km circle like the first venue's: redraw it in the panel.

Runs only on a database that already has the first venue (seeded from app/store/catalog.py) and no Клин yet,
so a fresh install or a re-run changes nothing. Once applied, everything here is edited in the panel.
"""

revision = '20261101_0007'
down_revision = '20261031_0006'
branch_labels = None
depends_on = None

import json
import uuid

from alembic import op
import sqlalchemy as sa

from app.services.geo import circle_polygon

CODE = 'KL'
VENUE = {
    'code': CODE,
    'title': 'Брайт на Мира',
    'address': 'ул. Мира, 58/25',
    'city': 'Клин',
    'phone': '+7 (926) 576-06-00',
    'latitude': 56.323183,
    'longitude': 36.729992,
    'working_hours': {day: [['09:00', '21:00']] for day in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')},
}
ZONE = {'title': 'Клин', 'radius_km': 3.0, 'delivery_fee': 150, 'free_delivery_from': 1500, 'min_order_amount': 700, 'eta_minutes': 35}

# Food first, drinks at the end. New categories are created; the sort of existing ones is set to fit them in.
CATEGORY_ORDER = [
    ('poke', 'Поке'),
    ('salads', 'Салаты'),
    ('sandwiches', 'Окинавские сэндвичи'),
    ('breakfast', 'Завтраки'),
    ('rolls', 'Ролл'),
    ('scramble', 'Скрембл'),
    ('desserts', 'Десерты'),
    ('coffee', 'Горячие напитки'),  # was «Кофе»: tea and cocoa live here now
    ('signature', 'Авторские напитки'),
    ('iced', 'Напитки со льдом'),
    ('seasonal', 'Сезонное меню'),
]
COOK_MINUTES = {'breakfast': 7, 'signature': 4, 'iced': 4, 'seasonal': 3}

# Dishes both cafes sell: Клин's price.
KLIN_PRICES = {
    'latte': 310,
    'raf': 370,
    'flat-white': 290,
    'americano': 220,
    'poke-shrimp': 750,
    'poke-salmon': 750,
    'salad-arugula-shrimp': 470,
    'okinawa-unagi-crab': 450,
    'scramble-shrimp-avocado': 470,
    'cheesecake': 220,
    'eclair': 180,
}
NOT_IN_KLIN = ['espresso', 'roll-salmon', 'salad-uzbek-tomato-stracciatella', 'choux']

# Only in Клин. slug, category, title, description, price, weight, has photo, modifier groups
NEW_ITEMS = [
    ('scramble-salmon-avocado', 'scramble', 'Скрембл с лососем и авокадо', '', 470, '400 г', True, ['scramble-remove', 'scramble-addons']),
    ('syrniki', 'breakfast', 'Сырники', '', 180, '100 г', True, []),
    ('sandwich-ham-cheese', 'breakfast', 'Сэндвич с ветчиной и сыром', '', 260, '180 г', True, []),
    ('sandwich-chicken-pesto', 'breakfast', 'Сэндвич с курицей, моцареллой и песто', '', 350, '200 г', True, []),
    ('sandwich-tuna', 'breakfast', 'Сэндвич с тунцом', '', 350, '180 г', True, []),
    ('okinawa-shrimp-tom-yam', 'sandwiches', 'Окинавский сэндвич с креветкой том ям', '', 480, '180 г', True, ['sandwich-remove', 'sandwich-addons']),
    ('tartlet', 'desserts', 'Тарталетка', 'Гармоничное сочетание песочной основы с начинками.', 200, '100 г', False, []),
    ('cappuccino', 'coffee', 'Капучино', '', 290, '300 мл', True, ['syrup-flavour', 'coffee-addons']),
    ('cocoa', 'coffee', 'Какао', '', 290, '300 мл', True, []),
    ('matcha-latte', 'coffee', 'Матча латте', '', 320, '300 мл', True, []),
    ('tea-black', 'coffee', 'Чай чёрный', '', 150, '400 мл', True, []),
    ('tea-green', 'coffee', 'Чай зелёный', '', 150, '400 мл', True, []),
    ('cappuccino-snickers', 'signature', 'Капучино сникерс', '', 320, '300 мл', True, []),
    ('latte-caramel-popcorn', 'signature', 'Латте Карамельный попкорн', '', 330, '400 мл', True, []),
    ('latte-kuala-lumpur', 'signature', 'Латте Куала-Лумпур', '', 330, '400 мл', True, []),
    ('iced-latte', 'iced', 'Айс латте', '', 320, '500 мл', True, ['syrup-flavour', 'coffee-addons']),
    ('bumble-coffee', 'iced', 'Бамбл-кофе', '', 400, '500 мл', True, []),
    ('bumble-pomegranate', 'iced', 'Гранатовый бамбл-кофе', '', 320, '500 мл', True, []),
    ('espresso-tonic', 'iced', 'Эспрессо-тоник', '', 320, '500 мл', True, []),
    ('matcha-tonic', 'iced', 'Матча-тоник', '', 320, '500 мл', False, []),
    ('orange-fresh', 'iced', 'Апельсиновый фреш', '', 350, '500 мл', True, []),
    ('lemonade-cucumber-mojito', 'seasonal', 'Лимонад огуречный мохито', '', 280, '500 мл', True, []),
    ('lemonade-grapefruit-elderflower', 'seasonal', 'Лимонад грейпфрут — бузина', '', 280, '500 мл', False, []),
    ('iced-cocoa-palo-santo', 'seasonal', 'Айс-какао пало санто', '', 350, '500 мл', False, []),
]
COMPOSITION = {
    'latte-caramel-popcorn': 'эспрессо (2 шота), молоко, сироп карамельный, сироп попкорн',
    'latte-kuala-lumpur': 'молоко, эспрессо (2 шота), сироп карамельный, сироп лемонграсс',
}


def upgrade() -> None:
    db = op.get_bind()
    first = db.execute(sa.text("SELECT id FROM venues ORDER BY created_at LIMIT 1")).scalar()
    if first is None or db.execute(sa.text("SELECT 1 FROM venues WHERE code = :code"), {'code': CODE}).scalar():
        return
    if not db.execute(sa.text("SELECT 1 FROM menu_items LIMIT 1")).scalar():
        return

    venue_id = uuid.uuid4()
    db.execute(
        sa.text(
            "INSERT INTO venues (id, code, title, address, city, phone, latitude, longitude, timezone, working_hours, special_days,"
            " cook_minutes, pickup_enabled, is_active)"
            " VALUES (:id, :code, :title, :address, :city, :phone, :latitude, :longitude, 'Europe/Moscow', CAST(:hours AS jsonb), '{}',"
            " 15, true, true)"
        ),
        {**{k: v for k, v in VENUE.items() if k != 'working_hours'}, 'id': venue_id, 'hours': json.dumps(VENUE['working_hours'])},
    )
    db.execute(
        sa.text(
            "INSERT INTO delivery_zones (id, venue_id, title, color, polygon, delivery_fee, free_delivery_from, min_order_amount,"
            " eta_minutes, priority, is_active)"
            " VALUES (:id, :venue_id, :title, '#ff6900', CAST(:polygon AS jsonb), :fee, :free_from, :min_amount, :eta, 0, true)"
        ),
        {
            'id': uuid.uuid4(),
            'venue_id': venue_id,
            'title': ZONE['title'],
            'polygon': json.dumps(circle_polygon(VENUE['latitude'], VENUE['longitude'], ZONE['radius_km'])),
            'fee': ZONE['delivery_fee'],
            'free_from': ZONE['free_delivery_from'],
            'min_amount': ZONE['min_order_amount'],
            'eta': ZONE['eta_minutes'],
        },
    )

    categories = {}
    for sort, (slug, title) in enumerate(CATEGORY_ORDER):
        found = db.execute(sa.text("SELECT id, title FROM menu_categories WHERE slug = :slug"), {'slug': slug}).first()
        if found:
            categories[slug] = found.id
            new_title = title if slug == 'coffee' and found.title == 'Кофе' else found.title
            db.execute(sa.text("UPDATE menu_categories SET sort = :sort, title = :title WHERE id = :id"), {'sort': sort * 10, 'title': new_title, 'id': found.id})
        else:
            categories[slug] = uuid.uuid4()
            db.execute(
                sa.text("INSERT INTO menu_categories (id, slug, title, sort, is_active) VALUES (:id, :slug, :title, :sort, true)"),
                {'id': categories[slug], 'slug': slug, 'title': title, 'sort': sort * 10},
            )

    items = {row.slug: row.id for row in db.execute(sa.text("SELECT id, slug FROM menu_items"))}
    groups = {row.code: row.id for row in db.execute(sa.text("SELECT id, code FROM modifier_groups"))}
    other_venues = [row.id for row in db.execute(sa.text("SELECT id FROM venues WHERE id <> :id"), {'id': venue_id})]

    def stop(venue, item) -> None:
        db.execute(sa.text("INSERT INTO venue_menu_items (venue_id, item_id, is_available) VALUES (:v, :i, false) ON CONFLICT DO NOTHING"), {'v': venue, 'i': item})

    for sort, (slug, category, title, description, price, weight, photo, item_groups) in enumerate(NEW_ITEMS):
        if slug in items:
            continue
        item_id = uuid.uuid4()
        db.execute(
            sa.text(
                "INSERT INTO menu_items (id, slug, category_id, title, description, composition, weight, price, image_url, badges,"
                " cook_minutes, sort, is_active)"
                " VALUES (:id, :slug, :category, :title, :description, :composition, :weight, :price, :image, CAST(:badges AS jsonb),"
                " :cook, :sort, true)"
            ),
            {
                'id': item_id,
                'slug': slug,
                'category': categories[category],
                'title': title,
                'description': description,
                'composition': COMPOSITION.get(slug, ''),
                'weight': weight,
                'price': price,
                'image': f'/static/assets/photos/{slug}.jpg' if photo else None,
                'badges': json.dumps(['new']),
                'cook': COOK_MINUTES.get(category),
                'sort': 100 + sort,
            },
        )
        for group_sort, code in enumerate(item_groups):
            if code in groups:
                db.execute(
                    sa.text("INSERT INTO menu_item_modifier_groups (item_id, group_id, sort) VALUES (:i, :g, :s)"),
                    {'i': item_id, 'g': groups[code], 's': group_sort},
                )
        for other in other_venues:
            stop(other, item_id)

    for slug, price in KLIN_PRICES.items():
        if slug in items:
            db.execute(
                sa.text("INSERT INTO venue_menu_items (venue_id, item_id, price_override, is_available) VALUES (:v, :i, :p, true) ON CONFLICT DO NOTHING"),
                {'v': venue_id, 'i': items[slug], 'p': price},
            )
    for slug in NOT_IN_KLIN:
        if slug in items:
            stop(venue_id, items[slug])


def downgrade() -> None:
    # Removes the venue (its zone and per-venue rows go with it by ON DELETE CASCADE) and the dishes only it sold,
    # unless orders already reference them. The category renames and sort stay.
    db = op.get_bind()
    venue_id = db.execute(sa.text("SELECT id FROM venues WHERE code = :code"), {'code': CODE}).scalar()
    if venue_id is None or db.execute(sa.text("SELECT 1 FROM orders WHERE venue_id = :id LIMIT 1"), {'id': venue_id}).scalar():
        return
    db.execute(sa.text("DELETE FROM venues WHERE id = :id"), {'id': venue_id})
    db.execute(
        sa.text("DELETE FROM menu_items WHERE slug = ANY(:slugs) AND id NOT IN (SELECT menu_item_id FROM order_items WHERE menu_item_id IS NOT NULL)"),
        {'slugs': [item[0] for item in NEW_ITEMS]},
    )
    db.execute(sa.text("DELETE FROM menu_categories c WHERE slug IN ('breakfast', 'signature', 'iced', 'seasonal') AND NOT EXISTS (SELECT 1 FROM menu_items i WHERE i.category_id = c.id)"))
