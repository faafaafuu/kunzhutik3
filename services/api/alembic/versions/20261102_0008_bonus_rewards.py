"""dishes for bonuses: the wheel at checkout

menu_items.bonus_price — how many bonuses a dish costs when taken free (empty: not offered);
orders.bonus_rewards — bonuses spent on such dishes; order_items.bonus_price marks the line.
A starting set of drinks and desserts is offered at their base price (1 бонус = 1 ₽); change it in the panel.
"""

revision = '20261102_0008'
down_revision = '20261101_0007'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa

OFFERED = ['americano', 'espresso', 'tea-black', 'tea-green', 'cocoa', 'cappuccino', 'flat-white', 'latte', 'eclair', 'cheesecake', 'choux', 'tartlet', 'syrniki']


def upgrade() -> None:
    op.add_column('menu_items', sa.Column('bonus_price', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('bonus_rewards', sa.Numeric(precision=10, scale=2), server_default='0', nullable=False))
    op.add_column('order_items', sa.Column('bonus_price', sa.Integer(), nullable=True))
    op.get_bind().execute(sa.text("UPDATE menu_items SET bonus_price = price::int WHERE slug = ANY(:slugs)"), {'slugs': OFFERED})


def downgrade() -> None:
    op.drop_column('order_items', 'bonus_price')
    op.drop_column('orders', 'bonus_rewards')
    op.drop_column('menu_items', 'bonus_price')
