"""social sign-in: Google account on customers, login requests for the Telegram bot and Google"""

revision = '20261028_0003'
down_revision = '20261027_0002'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column('customers', sa.Column('google_id', sa.String(length=64), nullable=True))
    op.add_column('customers', sa.Column('email', sa.String(length=200), nullable=True))
    op.create_unique_constraint('customers_google_id_key', 'customers', ['google_id'])
    op.create_table('login_requests',
    sa.Column('provider', sa.String(length=16), nullable=False),
    sa.Column('token_hash', sa.String(length=128), nullable=False),
    sa.Column('secret_hash', sa.String(length=128), nullable=False),
    sa.Column('return_to', sa.String(length=300), nullable=False),
    sa.Column('ip', sa.String(length=64), nullable=False),
    sa.Column('telegram_id', sa.String(length=40), nullable=True),
    sa.Column('customer_id', sa.UUID(), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('secret_hash'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_login_requests_created_at'), 'login_requests', ['created_at'], unique=False)
    op.create_index(op.f('ix_login_requests_telegram_id'), 'login_requests', ['telegram_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_login_requests_telegram_id'), table_name='login_requests')
    op.drop_index(op.f('ix_login_requests_created_at'), table_name='login_requests')
    op.drop_table('login_requests')
    op.drop_constraint('customers_google_id_key', 'customers', type_='unique')
    op.drop_column('customers', 'email')
    op.drop_column('customers', 'google_id')
