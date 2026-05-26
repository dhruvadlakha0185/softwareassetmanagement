"""add index on entitlement_doa_contacts.doa_contact_id

Revision ID: 015
Revises: 014
Create Date: 2026-05-26
"""
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_ent_doa_contacts_doa_contact_id",
        "entitlement_doa_contacts",
        ["doa_contact_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ent_doa_contacts_doa_contact_id",
        table_name="entitlement_doa_contacts",
    )
