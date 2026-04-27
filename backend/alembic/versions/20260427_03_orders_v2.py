"""Expand workspace orders and table order config.

Revision ID: 20260427_03
Revises: 20260427_02
Create Date: 2026-04-27 15:30:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260427_03"
down_revision: Union[str, None] = "20260427_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE tables ADD COLUMN IF NOT EXISTS order_enabled_directory_ids JSON")

    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS order_uuid VARCHAR(36)")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(40)")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS client_directory_item_id INTEGER REFERENCES table_directory_items(id)")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS assignee_user_id INTEGER REFERENCES users(id)")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS service_item_ids JSON")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS custom_directory_links JSON")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS price_base DOUBLE PRECISION NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS price_adjustment DOUBLE PRECISION NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS price_total DOUBLE PRECISION NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS parent_order_id INTEGER REFERENCES table_orders(id)")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS child_type VARCHAR(20)")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS metadata_json JSON")
    op.execute("ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")

    op.execute("UPDATE table_orders SET order_uuid = CONCAT('legacy-', id) WHERE order_uuid IS NULL")
    op.execute("UPDATE table_orders SET order_number = CONCAT('ORD-LEGACY-', id) WHERE order_number IS NULL")
    op.execute("UPDATE table_orders SET starts_at = created_at WHERE starts_at IS NULL")
    op.execute(
        """
        UPDATE table_orders
        SET ends_at = COALESCE(completed_at, created_at + INTERVAL '1 hour')
        WHERE ends_at IS NULL
        """,
    )
    op.execute("ALTER TABLE table_orders ALTER COLUMN order_uuid SET NOT NULL")
    op.execute("ALTER TABLE table_orders ALTER COLUMN order_number SET NOT NULL")
    op.execute("ALTER TABLE table_orders ALTER COLUMN starts_at SET NOT NULL")
    op.execute("ALTER TABLE table_orders ALTER COLUMN ends_at SET NOT NULL")

    op.execute("CREATE INDEX IF NOT EXISTS ix_table_orders_order_uuid ON table_orders(order_uuid)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_orders_order_number ON table_orders(order_number)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_orders_starts_at ON table_orders(starts_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_orders_ends_at ON table_orders(ends_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_orders_assignee_user_id ON table_orders(assignee_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_orders_parent_order_id ON table_orders(parent_order_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_table_orders_parent_order_id")
    op.execute("DROP INDEX IF EXISTS ix_table_orders_assignee_user_id")
    op.execute("DROP INDEX IF EXISTS ix_table_orders_ends_at")
    op.execute("DROP INDEX IF EXISTS ix_table_orders_starts_at")
    op.execute("DROP INDEX IF EXISTS ix_table_orders_order_number")
    op.execute("DROP INDEX IF EXISTS ix_table_orders_order_uuid")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS updated_at")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS metadata_json")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS child_type")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS parent_order_id")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS price_total")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS price_adjustment")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS price_base")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS custom_directory_links")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS service_item_ids")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS assignee_user_id")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS client_directory_item_id")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS ends_at")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS starts_at")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS order_number")
    op.execute("ALTER TABLE table_orders DROP COLUMN IF EXISTS order_uuid")
    op.execute("ALTER TABLE tables DROP COLUMN IF EXISTS order_enabled_directory_ids")
