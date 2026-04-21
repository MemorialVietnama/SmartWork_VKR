"""Move runtime ALTER TABLE statements into Alembic migration.

Revision ID: 20260421_01
Revises:
Create Date: 2026-04-21 12:00:00
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260421_01"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100)")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS avatar_data_url VARCHAR(4000)")
    op.execute("ALTER TABLE IF EXISTS users ALTER COLUMN avatar_data_url TYPE TEXT")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS birth_date DATE")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS position VARCHAR(120)")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS note VARCHAR(500)")
    op.execute("ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)")
    op.execute("ALTER TABLE IF EXISTS tables ADD COLUMN IF NOT EXISTS preset VARCHAR(50)")
    op.execute("ALTER TABLE IF EXISTS tables ADD COLUMN IF NOT EXISTS custom_preset_name VARCHAR(80)")
    op.execute("ALTER TABLE IF EXISTS tables ADD COLUMN IF NOT EXISTS time_format VARCHAR(10)")
    op.execute("ALTER TABLE IF EXISTS tables ADD COLUMN IF NOT EXISTS week_start_day VARCHAR(20)")
    op.execute("ALTER TABLE IF EXISTS tables ADD COLUMN IF NOT EXISTS work_hours VARCHAR(30)")
    op.execute("ALTER TABLE IF EXISTS table_directories ADD COLUMN IF NOT EXISTS kind VARCHAR(40)")
    op.execute("ALTER TABLE IF EXISTS table_directories ADD COLUMN IF NOT EXISTS description VARCHAR(500)")
    op.execute("ALTER TABLE IF EXISTS table_directories ADD COLUMN IF NOT EXISTS schema_fields JSONB")
    op.execute("ALTER TABLE IF EXISTS table_directory_items ADD COLUMN IF NOT EXISTS payload JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS table_directory_items DROP COLUMN IF EXISTS payload")
    op.execute("ALTER TABLE IF EXISTS table_directories DROP COLUMN IF EXISTS schema_fields")
    op.execute("ALTER TABLE IF EXISTS table_directories DROP COLUMN IF EXISTS description")
    op.execute("ALTER TABLE IF EXISTS table_directories DROP COLUMN IF EXISTS kind")
    op.execute("ALTER TABLE IF EXISTS tables DROP COLUMN IF EXISTS work_hours")
    op.execute("ALTER TABLE IF EXISTS tables DROP COLUMN IF EXISTS week_start_day")
    op.execute("ALTER TABLE IF EXISTS tables DROP COLUMN IF EXISTS time_format")
    op.execute("ALTER TABLE IF EXISTS tables DROP COLUMN IF EXISTS custom_preset_name")
    op.execute("ALTER TABLE IF EXISTS tables DROP COLUMN IF EXISTS preset")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS owner_id")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS note")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS position")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS birth_date")
    op.execute("ALTER TABLE IF EXISTS users ALTER COLUMN avatar_data_url TYPE VARCHAR(4000)")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS avatar_data_url")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS phone")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS is_active")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS middle_name")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS last_name")
    op.execute("ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS first_name")
