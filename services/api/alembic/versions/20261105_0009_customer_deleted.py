"""account deletion: customers.deleted_at

A customer who deleted the account keeps the row (orders and the bonus ledger point at it), stripped of everything
that identifies the person; deleted_at marks it so the old tokens stop working and the panel can tell.
"""

revision = '20261105_0009'
down_revision = '20261102_0008'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('customers', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('customers', 'deleted_at')
