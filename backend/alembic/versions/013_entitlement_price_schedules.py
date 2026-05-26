"""Add entitlement_price_schedules table and PRICE_YEAR_CHANGE alert type

Revision ID: 013
Revises: 012
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    # Extend alert_type_enum (PostgreSQL supports ADD VALUE without full recreate)
    op.execute("ALTER TYPE alert_type_enum ADD VALUE IF NOT EXISTS 'PRICE_YEAR_CHANGE'")

    op.create_table(
        "entitlement_price_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ent_id", sa.String(20), sa.ForeignKey("entitlements.ent_id", ondelete="CASCADE"), nullable=False),
        sa.Column("year_number", sa.Integer, nullable=False),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("effective_to", sa.Date, nullable=False),
        sa.Column("entitled_count", sa.BigInteger, nullable=False),
        sa.Column("unit_cost", sa.BigInteger, nullable=False),
        sa.Column("annual_cost", sa.BigInteger, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("ent_id", "year_number", name="uq_ent_year"),
    )
    op.create_index(
        "ix_eps_ent_dates",
        "entitlement_price_schedules",
        ["ent_id", "effective_from", "effective_to"],
    )


def downgrade():
    op.drop_index("ix_eps_ent_dates", table_name="entitlement_price_schedules")
    op.drop_table("entitlement_price_schedules")
    # Note: PostgreSQL does not support removing enum values; downgrade leaves the enum value in place
