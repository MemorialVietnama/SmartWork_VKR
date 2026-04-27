"""Add table detach requests table.

Revision ID: 20260427_02
Revises: 20260427_01
Create Date: 2026-04-27 10:05:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260427_02"
down_revision: Union[str, None] = "20260427_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS table_detach_requests (
          id SERIAL PRIMARY KEY,
          table_id INTEGER NOT NULL REFERENCES tables(id),
          owner_user_id INTEGER NOT NULL REFERENCES users(id),
          staff_user_id INTEGER NOT NULL REFERENCES users(id),
          reason TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          resolved_at TIMESTAMPTZ
        )
        """,
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_detach_requests_table_id ON table_detach_requests(table_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_detach_requests_owner_user_id ON table_detach_requests(owner_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_detach_requests_staff_user_id ON table_detach_requests(staff_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_table_detach_requests_status ON table_detach_requests(status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS table_detach_requests")
