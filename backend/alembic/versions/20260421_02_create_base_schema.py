"""Create base schema from SQLAlchemy metadata.

Revision ID: 20260421_02
Revises: 20260421_01
Create Date: 2026-04-21 19:15:00
"""

from typing import Sequence, Union

from alembic import op

from app.db.base import Base
import app.models

revision: str = "20260421_02"
down_revision: Union[str, None] = "20260421_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
