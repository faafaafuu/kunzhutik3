"""online payment: the ЮKassa payment id of an order"""

revision = '20261029_0004'
down_revision = '20261028_0003'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('orders', sa.Column('payment_id', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_orders_payment_id'), 'orders', ['payment_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_orders_payment_id'), table_name='orders')
    op.drop_column('orders', 'payment_id')
