"""add proposal sessions

Revision ID: d3b4c5d6e7f8
Revises: 998949cb5ed9
Create Date: 2026-09-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "998949cb5ed9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "proposal_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workspace_id", sa.String(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("file_name", sa.String(), nullable=False, server_default=""),
        sa.Column("tor_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("items_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_proposal_sessions_workspace_id", "proposal_sessions", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_proposal_sessions_workspace_id", table_name="proposal_sessions")
    op.drop_table("proposal_sessions")