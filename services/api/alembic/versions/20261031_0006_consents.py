"""consents: evidence of the consent to personal data processing and to marketing"""

revision = '20261031_0006'
down_revision = '20261030_0005'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table('consents',
    sa.Column('kind', sa.String(length=24), nullable=False),
    sa.Column('version', sa.String(length=16), nullable=False),
    sa.Column('context', sa.String(length=16), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('customer_id', sa.UUID(), nullable=True),
    sa.Column('order_id', sa.UUID(), nullable=True),
    sa.Column('ip', sa.String(length=64), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_consents_phone'), 'consents', ['phone'], unique=False)
    op.create_index(op.f('ix_consents_customer_id'), 'consents', ['customer_id'], unique=False)
    op.create_index(op.f('ix_consents_created_at'), 'consents', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_consents_created_at'), table_name='consents')
    op.drop_index(op.f('ix_consents_customer_id'), table_name='consents')
    op.drop_index(op.f('ix_consents_phone'), table_name='consents')
    op.drop_table('consents')
