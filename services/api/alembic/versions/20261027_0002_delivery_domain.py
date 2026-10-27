"""delivery domain: venues, zones, menu in the database, customers, orders with items, bonuses, promo codes

store_orders is dropped: it held no real orders when the platform moved to the new model.
"""

revision = '20261027_0002'
down_revision = '20260703_0001'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def upgrade() -> None:
    op.create_table('customers',
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('telegram_id', sa.String(length=40), nullable=True),
    sa.Column('telegram_username', sa.String(length=80), nullable=True),
    sa.Column('is_registered', sa.Boolean(), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('is_blocked', sa.Boolean(), nullable=False),
    sa.Column('notify_status', sa.Boolean(), nullable=False),
    sa.Column('notify_bonus', sa.Boolean(), nullable=False),
    sa.Column('notify_promo', sa.Boolean(), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('phone'),
    sa.UniqueConstraint('telegram_id')
    )
    op.create_table('menu_categories',
    sa.Column('slug', sa.String(length=80), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('sort', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_table('modifier_groups',
    sa.Column('code', sa.String(length=80), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('subtitle', sa.String(length=120), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('required', sa.Boolean(), nullable=False),
    sa.Column('max_quantity', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('otp_codes',
    sa.Column('phone', sa.String(length=20), nullable=False),
    sa.Column('code_hash', sa.String(length=128), nullable=False),
    sa.Column('ip', sa.String(length=64), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_otp_codes_created_at'), 'otp_codes', ['created_at'], unique=False)
    op.create_index(op.f('ix_otp_codes_phone'), 'otp_codes', ['phone'], unique=False)
    op.create_table('promo_codes',
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('value', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('min_order_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('max_uses', sa.Integer(), nullable=True),
    sa.Column('once_per_customer', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('note', sa.String(length=200), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('venues',
    sa.Column('code', sa.String(length=16), nullable=False),
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('address', sa.String(length=300), nullable=False),
    sa.Column('city', sa.String(length=120), nullable=False),
    sa.Column('phone', sa.String(length=40), nullable=False),
    sa.Column('latitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('longitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('working_hours', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('special_days', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('cook_minutes', sa.Integer(), nullable=False),
    sa.Column('pickup_enabled', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('customer_addresses',
    sa.Column('customer_id', sa.UUID(), nullable=False),
    sa.Column('label', sa.String(length=60), nullable=False),
    sa.Column('text', sa.String(length=300), nullable=False),
    sa.Column('latitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('longitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('entrance', sa.String(length=20), nullable=False),
    sa.Column('floor', sa.String(length=20), nullable=False),
    sa.Column('apartment', sa.String(length=20), nullable=False),
    sa.Column('intercom', sa.String(length=20), nullable=False),
    sa.Column('comment', sa.String(length=300), nullable=False),
    sa.Column('is_default', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customer_addresses_customer_id'), 'customer_addresses', ['customer_id'], unique=False)
    op.create_table('customer_sessions',
    sa.Column('customer_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.String(length=128), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_customer_sessions_customer_id'), 'customer_sessions', ['customer_id'], unique=False)
    op.create_table('delivery_zones',
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('color', sa.String(length=16), nullable=False),
    sa.Column('polygon', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('delivery_fee', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('free_delivery_from', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('min_order_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('eta_minutes', sa.Integer(), nullable=False),
    sa.Column('priority', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_delivery_zones_venue_id'), 'delivery_zones', ['venue_id'], unique=False)
    op.create_table('devices',
    sa.Column('customer_id', sa.UUID(), nullable=False),
    sa.Column('platform', sa.String(length=16), nullable=False),
    sa.Column('token', sa.String(length=255), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token')
    )
    op.create_index(op.f('ix_devices_customer_id'), 'devices', ['customer_id'], unique=False)
    op.create_table('menu_items',
    sa.Column('slug', sa.String(length=120), nullable=False),
    sa.Column('category_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('composition', sa.Text(), nullable=False),
    sa.Column('weight', sa.String(length=40), nullable=False),
    sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('image_url', sa.String(length=400), nullable=True),
    sa.Column('badges', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('cook_minutes', sa.Integer(), nullable=True),
    sa.Column('sort', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['menu_categories.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_menu_items_category_id'), 'menu_items', ['category_id'], unique=False)
    op.create_table('modifiers',
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=80), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('price_delta', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('weight', sa.String(length=40), nullable=False),
    sa.Column('sort', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['group_id'], ['modifier_groups.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_modifiers_group_id'), 'modifiers', ['group_id'], unique=False)
    op.create_table('menu_item_modifier_groups',
    sa.Column('item_id', sa.UUID(), nullable=False),
    sa.Column('group_id', sa.UUID(), nullable=False),
    sa.Column('sort', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['group_id'], ['modifier_groups.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['item_id'], ['menu_items.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('item_id', 'group_id')
    )
    op.create_table('orders',
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('customer_id', sa.UUID(), nullable=True),
    sa.Column('zone_id', sa.UUID(), nullable=True),
    sa.Column('business_date', sa.Date(), nullable=False),
    sa.Column('daily_seq', sa.Integer(), nullable=False),
    sa.Column('number', sa.String(length=20), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('fulfillment', sa.String(length=16), nullable=False),
    sa.Column('source', sa.String(length=16), nullable=False),
    sa.Column('customer_name', sa.String(length=160), nullable=False),
    sa.Column('customer_phone', sa.String(length=20), nullable=False),
    sa.Column('telegram_user_id', sa.String(length=40), nullable=True),
    sa.Column('address_text', sa.String(length=300), nullable=False),
    sa.Column('address_lat', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('address_lon', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('address_details', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('payment_method', sa.String(length=24), nullable=False),
    sa.Column('payment_status', sa.String(length=16), nullable=False),
    sa.Column('currency', sa.String(length=8), nullable=False),
    sa.Column('items_total', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('discount_total', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('bonus_spent', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('delivery_fee', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('promo_code', sa.String(length=40), nullable=True),
    sa.Column('comment', sa.Text(), nullable=False),
    sa.Column('cancel_reason', sa.String(length=300), nullable=False),
    sa.Column('scheduled_for', sa.DateTime(timezone=True), nullable=True),
    sa.Column('promised_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ready_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('picked_up_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], ),
    sa.ForeignKeyConstraint(['zone_id'], ['delivery_zones.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('venue_id', 'business_date', 'daily_seq')
    )
    op.create_index(op.f('ix_orders_customer_id'), 'orders', ['customer_id'], unique=False)
    op.create_index(op.f('ix_orders_status'), 'orders', ['status'], unique=False)
    op.create_index(op.f('ix_orders_venue_id'), 'orders', ['venue_id'], unique=False)
    op.create_table('venue_menu_items',
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('item_id', sa.UUID(), nullable=False),
    sa.Column('price_override', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('is_available', sa.Boolean(), nullable=False),
    sa.Column('unavailable_until', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['item_id'], ['menu_items.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('venue_id', 'item_id'),
    sa.UniqueConstraint('venue_id', 'item_id')
    )
    op.create_table('bonus_transactions',
    sa.Column('customer_id', sa.UUID(), nullable=False),
    sa.Column('order_id', sa.UUID(), nullable=True),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('comment', sa.String(length=200), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_bonus_transactions_customer_id'), 'bonus_transactions', ['customer_id'], unique=False)
    op.create_index(op.f('ix_bonus_transactions_order_id'), 'bonus_transactions', ['order_id'], unique=False)
    op.create_table('order_items',
    sa.Column('order_id', sa.UUID(), nullable=False),
    sa.Column('menu_item_id', sa.UUID(), nullable=True),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('image_url', sa.String(length=400), nullable=True),
    sa.Column('unit_price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('line_total', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('modifiers', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['menu_item_id'], ['menu_items.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_order_items_menu_item_id'), 'order_items', ['menu_item_id'], unique=False)
    op.create_index(op.f('ix_order_items_order_id'), 'order_items', ['order_id'], unique=False)
    op.create_table('order_status_events',
    sa.Column('order_id', sa.UUID(), nullable=False),
    sa.Column('from_status', sa.String(length=24), nullable=True),
    sa.Column('to_status', sa.String(length=24), nullable=False),
    sa.Column('actor', sa.String(length=80), nullable=False),
    sa.Column('comment', sa.String(length=300), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_order_status_events_order_id'), 'order_status_events', ['order_id'], unique=False)
    op.drop_table('store_orders')


def downgrade() -> None:
    op.create_table('store_orders',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('customer_name', sa.VARCHAR(length=160), autoincrement=False, nullable=False),
    sa.Column('customer_phone', sa.VARCHAR(length=40), autoincrement=False, nullable=False),
    sa.Column('delivery_address', sa.VARCHAR(length=400), autoincrement=False, nullable=False),
    sa.Column('delivery_slot', sa.VARCHAR(length=120), autoincrement=False, nullable=True),
    sa.Column('payment_method', sa.VARCHAR(length=40), server_default=sa.text("'card_on_delivery'::character varying"), autoincrement=False, nullable=False),
    sa.Column('comment', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('status', sa.VARCHAR(length=40), server_default=sa.text("'new'::character varying"), autoincrement=False, nullable=False),
    sa.Column('currency', sa.VARCHAR(length=8), server_default=sa.text("'RUB'::character varying"), autoincrement=False, nullable=False),
    sa.Column('total_amount', sa.NUMERIC(precision=10, scale=2), autoincrement=False, nullable=False),
    sa.Column('items_json', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), autoincrement=False, nullable=False),
    sa.Column('source_json', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), autoincrement=False, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.PrimaryKeyConstraint('id', name='store_orders_pkey')
    )
    op.drop_index(op.f('ix_order_status_events_order_id'), table_name='order_status_events')
    op.drop_table('order_status_events')
    op.drop_index(op.f('ix_order_items_order_id'), table_name='order_items')
    op.drop_index(op.f('ix_order_items_menu_item_id'), table_name='order_items')
    op.drop_table('order_items')
    op.drop_index(op.f('ix_bonus_transactions_order_id'), table_name='bonus_transactions')
    op.drop_index(op.f('ix_bonus_transactions_customer_id'), table_name='bonus_transactions')
    op.drop_table('bonus_transactions')
    op.drop_table('venue_menu_items')
    op.drop_index(op.f('ix_orders_venue_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_status'), table_name='orders')
    op.drop_index(op.f('ix_orders_customer_id'), table_name='orders')
    op.drop_table('orders')
    op.drop_table('menu_item_modifier_groups')
    op.drop_index(op.f('ix_modifiers_group_id'), table_name='modifiers')
    op.drop_table('modifiers')
    op.drop_index(op.f('ix_menu_items_category_id'), table_name='menu_items')
    op.drop_table('menu_items')
    op.drop_index(op.f('ix_devices_customer_id'), table_name='devices')
    op.drop_table('devices')
    op.drop_index(op.f('ix_delivery_zones_venue_id'), table_name='delivery_zones')
    op.drop_table('delivery_zones')
    op.drop_index(op.f('ix_customer_sessions_customer_id'), table_name='customer_sessions')
    op.drop_table('customer_sessions')
    op.drop_index(op.f('ix_customer_addresses_customer_id'), table_name='customer_addresses')
    op.drop_table('customer_addresses')
    op.drop_table('venues')
    op.drop_table('promo_codes')
    op.drop_index(op.f('ix_otp_codes_phone'), table_name='otp_codes')
    op.drop_index(op.f('ix_otp_codes_created_at'), table_name='otp_codes')
    op.drop_table('otp_codes')
    op.drop_table('modifier_groups')
    op.drop_table('menu_categories')
    op.drop_table('customers')

