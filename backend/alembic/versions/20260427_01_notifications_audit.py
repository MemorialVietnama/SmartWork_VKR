"""Add notifications and audit tables.

Revision ID: 20260427_01
Revises: 20260421_02
Create Date: 2026-04-27 09:05:00
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260427_01"
down_revision: Union[str, None] = "20260421_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_events (
          id SERIAL PRIMARY KEY,
          actor_user_id INTEGER REFERENCES users(id),
          actor_role VARCHAR(50),
          owner_id INTEGER REFERENCES users(id),
          action VARCHAR(120) NOT NULL,
          entity_type VARCHAR(60) NOT NULL,
          entity_id VARCHAR(120),
          status VARCHAR(30) NOT NULL DEFAULT 'success',
          metadata_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_events_action ON audit_events(action)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_events_entity_type ON audit_events(entity_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_events_status ON audit_events(status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_events_created_at ON audit_events(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_events_actor_user_id ON audit_events(actor_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_events_owner_id ON audit_events(owner_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          kind VARCHAR(60) NOT NULL,
          title VARCHAR(180) NOT NULL,
          message TEXT NOT NULL,
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          payload JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          read_at TIMESTAMPTZ
        )
        """,
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_user_id ON user_notifications(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_kind ON user_notifications(kind)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_priority ON user_notifications(priority)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_is_read ON user_notifications(is_read)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_notifications_created_at ON user_notifications(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_notifications")
    op.execute("DROP TABLE IF EXISTS audit_events")
