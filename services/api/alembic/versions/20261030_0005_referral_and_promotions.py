"""welcome bonus and invite-a-friend (customers), promotions on the home screen"""

revision = '20261030_0005'
down_revision = '20261029_0004'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('customers', sa.Column('referral_code', sa.String(length=12), nullable=True))
    op.add_column('customers', sa.Column('referred_by_id', sa.UUID(), nullable=True))
    op.add_column('customers', sa.Column('referral_rewarded_at', sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint('customers_referral_code_key', 'customers', ['referral_code'])
    op.create_foreign_key('customers_referred_by_id_fkey', 'customers', 'customers', ['referred_by_id'], ['id'], ondelete='SET NULL')
    op.create_index(op.f('ix_customers_referred_by_id'), 'customers', ['referred_by_id'], unique=False)
    op.create_index('uq_bonus_welcome', 'bonus_transactions', ['customer_id'], unique=True, postgresql_where=sa.text("kind = 'welcome'"))
    op.create_table('promotions',
    sa.Column('title', sa.String(length=80), nullable=False),
    sa.Column('text', sa.String(length=240), nullable=False),
    sa.Column('accent', sa.String(length=12), nullable=False),
    sa.Column('action', sa.String(length=12), nullable=False),
    sa.Column('promo_code', sa.String(length=40), nullable=True),
    sa.Column('sort', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('promotions')
    op.drop_index('uq_bonus_welcome', table_name='bonus_transactions')
    op.drop_index(op.f('ix_customers_referred_by_id'), table_name='customers')
    op.drop_constraint('customers_referred_by_id_fkey', 'customers', type_='foreignkey')
    op.drop_constraint('customers_referral_code_key', 'customers', type_='unique')
    op.drop_column('customers', 'referral_rewarded_at')
    op.drop_column('customers', 'referred_by_id')
    op.drop_column('customers', 'referral_code')
