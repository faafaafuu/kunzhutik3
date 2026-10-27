"""initial schema: operator users and storefront orders"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260703_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operator_users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("username", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=40), nullable=False, server_default="operator"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_operator_users_username", "operator_users", ["username"], unique=True)

    op.create_table(
        "store_orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("customer_name", sa.String(length=160), nullable=False),
        sa.Column("customer_phone", sa.String(length=40), nullable=False),
        sa.Column("delivery_address", sa.String(length=400), nullable=False),
        sa.Column("delivery_slot", sa.String(length=120), nullable=True),
        sa.Column("payment_method", sa.String(length=40), nullable=False, server_default="card_on_delivery"),
        sa.Column("comment", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="new"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="RUB"),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("items_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("source_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("store_orders")
    op.drop_index("ix_operator_users_username", table_name="operator_users")
    op.drop_table("operator_users")
