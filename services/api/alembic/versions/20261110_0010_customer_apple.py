"""sign in with Apple: customers.apple_id"""

revision = '20261110_0010'
down_revision = '20261105_0009'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('customers', sa.Column('apple_id', sa.String(length=64), nullable=True))
    op.create_unique_constraint('customers_apple_id_key', 'customers', ['apple_id'])


def downgrade() -> None:
    op.drop_constraint('customers_apple_id_key', 'customers', type_='unique')
    op.drop_column('customers', 'apple_id')
