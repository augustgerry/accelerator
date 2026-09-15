"""add Drive source modified time

Revision ID: e4f5a6b7c8d9
Revises: d3b4c5d6e7f8
Create Date: 2026-09-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "d3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_modified_at", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "source_modified_at")