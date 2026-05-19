"""schema_fixes

Gap resolutions from DATABASE_SCHEMA.md review:
  - Gap 1: Drop canonical_name UNIQUE constraint (breaks contract renewal)
  - Gap 3: Add vendor_id to entitlements
  - Gap 7: Add is_current + superseded_at to discovery_records
  - Gap 8: Add clm_url to contracts
  - Gap 9: Add secondary_owner_id to software_catalog

Revision ID: 003
Revises: 002
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    # Gap 1 — drop canonical_name UNIQUE constraint so contract renewal can create
    # a new SW entry with the same canonical name (different sw_id + onboarded_date).
    op.drop_constraint("uq_software_catalog_canonical_name", "software_catalog", type_="unique")

    # Gap 3 — vendor_id on entitlements for direct vendor filtering
    op.add_column(
        "entitlements",
        sa.Column("vendor_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("vendors.id"), nullable=True),
    )

    # Gap 7 — is_current + superseded_at on discovery_records for stale tracking
    op.add_column("discovery_records", sa.Column("is_current", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("discovery_records", sa.Column("superseded_at", sa.DateTime(), nullable=True))

    # Gap 8 — clm_url on contracts for deep-linking to the CLM system
    op.add_column("contracts", sa.Column("clm_url", sa.String(500), nullable=True))

    # Gap 9 — secondary_owner_id on software_catalog
    op.add_column(
        "software_catalog",
        sa.Column("secondary_owner_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade():
    op.drop_column("software_catalog", "secondary_owner_id")
    op.drop_column("contracts", "clm_url")
    op.drop_column("discovery_records", "superseded_at")
    op.drop_column("discovery_records", "is_current")
    op.drop_column("entitlements", "vendor_id")
    op.create_unique_constraint(
        "uq_software_catalog_canonical_name", "software_catalog", ["canonical_name"]
    )
