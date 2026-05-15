"""entitlement_renewal

Adds renewal_of column to entitlements so that a renewed entitlement can
reference the previous ENT_ID it supersedes. Also adds is_renewal flag for
quick filtering.

Revision ID: 002
Revises: 001
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "entitlements",
        sa.Column(
            "renewal_of",
            sa.String(20),
            sa.ForeignKey("entitlements.ent_id"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("entitlements", "renewal_of")
