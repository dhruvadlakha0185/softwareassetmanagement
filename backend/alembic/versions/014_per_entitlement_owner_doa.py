"""per entitlement owner doa

Revision ID: 014
Revises: 013
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entitlements",
        sa.Column(
            "secondary_owner_id",
            UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_entitlements_secondary_owner_id_users",
        "entitlements",
        "users",
        ["secondary_owner_id"],
        ["id"],
    )
    op.create_table(
        "entitlement_doa_contacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ent_id", sa.String(20), sa.ForeignKey("entitlements.ent_id", ondelete="CASCADE"), nullable=False),
        sa.Column("doa_contact_id", UUID(as_uuid=True), sa.ForeignKey("doa_hierarchy.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("ent_id", "doa_contact_id", name="uq_ent_doa_contact"),
    )
    op.create_index("ix_ent_doa_contacts_ent_id", "entitlement_doa_contacts", ["ent_id"])


def downgrade() -> None:
    op.drop_index("ix_ent_doa_contacts_ent_id", table_name="entitlement_doa_contacts")
    op.drop_table("entitlement_doa_contacts")
    op.drop_constraint(
        "fk_entitlements_secondary_owner_id_users",
        "entitlements",
        type_="foreignkey",
    )
    op.drop_column("entitlements", "secondary_owner_id")
