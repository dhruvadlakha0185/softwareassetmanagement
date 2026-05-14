"""initial_schema

Revision ID: 001
Revises:
Create Date: 2026-05-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Master tables ──────────────────────────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("gxp_applicable", sa.Enum("no", "yes", "mixed", name="gxp_applicable_enum"), nullable=False, server_default="no"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("name", name=op.f("uq_categories_name")),
    )
    op.create_table(
        "sub_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name=op.f("fk_sub_categories_category_id_categories")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sub_categories")),
    )
    op.create_table(
        "vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("audit_risk", sa.Enum("LOW", "MEDIUM", "HIGH", name="audit_risk_enum"), nullable=False, server_default="LOW"),
        sa.Column("last_audit_date", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vendors")),
        sa.UniqueConstraint("name", name=op.f("uq_vendors_name")),
    )
    op.create_table(
        "license_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("how_to_count", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_license_metrics")),
        sa.UniqueConstraint("name", name=op.f("uq_license_metrics_name")),
    )
    op.create_table(
        "discovery_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("type", sa.Enum("agent", "cmdb", "edr", "network", "manual", "casb", "api", name="discovery_source_type_enum"), nullable=False, server_default="manual"),
        sa.Column("coverage", sa.Text(), nullable=True),
        sa.Column("frequency", sa.String(50), nullable=True),
        sa.Column("contact", sa.String(200), nullable=True),
        sa.Column("status", sa.Enum("active", "inactive", "stale", name="discovery_source_status_enum"), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_discovery_sources")),
        sa.UniqueConstraint("name", name=op.f("uq_discovery_sources_name")),
    )
    op.create_table(
        "usage_update_methods",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_required", sa.Enum("none", "tab_a", "tab_a_and_b", name="template_required_enum"), nullable=False, server_default="none"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usage_update_methods")),
        sa.UniqueConstraint("name", name=op.f("uq_usage_update_methods_name")),
    )
    op.create_table(
        "regions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sites_json", sa.Text(), nullable=True),
        sa.Column("regulatory_zone", sa.String(200), nullable=True),
        sa.Column("data_residency", sa.String(100), nullable=True),
        sa.Column("aws_region", sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_regions")),
        sa.UniqueConstraint("name", name=op.f("uq_regions_name")),
    )

    # ── Users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("role", sa.Enum("COE_ADMIN", "APP_OWNER", "READ_ONLY", name="user_role_enum"), nullable=False, server_default="APP_OWNER"),
        sa.Column("bu", sa.String(100), nullable=True),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sso_sub", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], name=op.f("fk_users_region_id_regions")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("sso_sub", name=op.f("uq_users_sso_sub")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "doa_hierarchy",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tier", sa.Enum("1", "2", name="doa_tier_enum"), nullable=False, server_default="2"),
        sa.Column("role_label", sa.String(100), nullable=True),
        sa.Column("alert_scope", sa.String(100), nullable=True),
        sa.Column("software_categories_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_doa_hierarchy_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_doa_hierarchy")),
    )

    # ── Software catalog ───────────────────────────────────────────────────────
    op.create_table(
        "software_catalog",
        sa.Column("sw_id", sa.String(20), nullable=False),
        sa.Column("canonical_name", sa.String(255), nullable=False),
        sa.Column("publisher", sa.String(200), nullable=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sub_category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("gxp_flag", sa.Enum("no", "yes_21cfr", "yes_annex11", "yes_both", name="gxp_flag_enum"), nullable=False, server_default="no"),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("vendor_risk", sa.Enum("LOW", "MEDIUM", "HIGH", name="sw_vendor_risk_enum"), nullable=False, server_default="LOW"),
        sa.Column("deployment", sa.Enum("cloud", "on_premise", "desktop_cloud", "hybrid", name="deployment_enum"), nullable=False, server_default="cloud"),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("app_owner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("onboarded_date", sa.Date(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["app_owner_id"], ["users.id"], name=op.f("fk_software_catalog_app_owner_id_users")),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name=op.f("fk_software_catalog_category_id_categories")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_software_catalog_created_by_users")),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], name=op.f("fk_software_catalog_region_id_regions")),
        sa.ForeignKeyConstraint(["sub_category_id"], ["sub_categories.id"], name=op.f("fk_software_catalog_sub_category_id_sub_categories")),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], name=op.f("fk_software_catalog_vendor_id_vendors")),
        sa.PrimaryKeyConstraint("sw_id", name=op.f("pk_software_catalog")),
        sa.UniqueConstraint("canonical_name", name=op.f("uq_software_catalog_canonical_name")),
    )
    op.create_table(
        "software_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sw_id", sa.String(20), nullable=False),
        sa.Column("alias_name", sa.String(255), nullable=False),
        sa.Column("source_name", sa.String(100), nullable=True),
        sa.ForeignKeyConstraint(["sw_id"], ["software_catalog.sw_id"], name=op.f("fk_software_aliases_sw_id_software_catalog")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_software_aliases")),
    )

    # ── Contracts + Entitlements ───────────────────────────────────────────────
    op.create_table(
        "contracts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sw_id", sa.String(20), nullable=False),
        sa.Column("po_number", sa.String(100), nullable=True),
        sa.Column("clm_id", sa.String(100), nullable=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reseller", sa.String(200), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("total_value_inr", sa.BigInteger(), nullable=True),
        sa.Column("auto_renewal_clause", sa.Enum("yes", "no", "opt_in", name="auto_renewal_enum"), nullable=True),
        sa.Column("file_name", sa.String(255), nullable=True),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("storage_backend", sa.Enum("local", "supabase", "s3", name="storage_backend_enum"), nullable=False, server_default="local"),
        sa.Column("is_archived", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.Column("archived_path", sa.String(500), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name=op.f("fk_contracts_created_by_users")),
        sa.ForeignKeyConstraint(["sw_id"], ["software_catalog.sw_id"], name=op.f("fk_contracts_sw_id_software_catalog")),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], name=op.f("fk_contracts_vendor_id_vendors")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contracts")),
    )
    op.create_table(
        "entitlements",
        sa.Column("ent_id", sa.String(20), nullable=False),
        sa.Column("sw_id", sa.String(20), nullable=False),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("contract_name", sa.String(255), nullable=True),
        sa.Column("metric_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("license_type", sa.Enum("subscription", "perpetual", name="license_type_enum"), nullable=False, server_default="subscription"),
        sa.Column("entitled_count", sa.BigInteger(), nullable=True),
        sa.Column("in_use_count", sa.BigInteger(), nullable=True),
        sa.Column("unit_cost_inr", sa.BigInteger(), nullable=True),
        sa.Column("annual_cost_inr", sa.BigInteger(), nullable=True),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("discovery_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("usage_method_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("app_owner_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.Enum("ACTIVE", "EXPIRED", "WATCH", "OVER_DEPLOYED", "UNDER_UTILISED", "OK", name="entitlement_status_enum"), nullable=False, server_default="ACTIVE"),
        sa.Column("last_updated", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["app_owner_id"], ["users.id"], name=op.f("fk_entitlements_app_owner_id_users")),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], name=op.f("fk_entitlements_contract_id_contracts")),
        sa.ForeignKeyConstraint(["discovery_source_id"], ["discovery_sources.id"], name=op.f("fk_entitlements_discovery_source_id_discovery_sources")),
        sa.ForeignKeyConstraint(["metric_id"], ["license_metrics.id"], name=op.f("fk_entitlements_metric_id_license_metrics")),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], name=op.f("fk_entitlements_region_id_regions")),
        sa.ForeignKeyConstraint(["sw_id"], ["software_catalog.sw_id"], name=op.f("fk_entitlements_sw_id_software_catalog")),
        sa.ForeignKeyConstraint(["usage_method_id"], ["usage_update_methods.id"], name=op.f("fk_entitlements_usage_method_id_usage_update_methods")),
        sa.PrimaryKeyConstraint("ent_id", name=op.f("pk_entitlements")),
    )
    op.create_table(
        "onboarding_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("po_number", sa.String(100), nullable=True),
        sa.Column("form_data_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("current_step", sa.Integer(), nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_onboarding_drafts_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_onboarding_drafts")),
    )

    # ── Discovery ──────────────────────────────────────────────────────────────
    op.create_table(
        "discovery_records",
        sa.Column("disc_id", sa.String(20), nullable=False),
        sa.Column("contract_name", sa.String(255), nullable=False),
        sa.Column("sw_id", sa.String(20), nullable=True),
        sa.Column("canonical_name", sa.String(255), nullable=True),
        sa.Column("application_tagged", sa.String(255), nullable=True),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("device_id", sa.String(100), nullable=True),
        sa.Column("device_type", sa.Enum("endpoint", "server", name="device_type_enum"), nullable=True),
        sa.Column("os", sa.String(100), nullable=True),
        sa.Column("version", sa.String(50), nullable=True),
        sa.Column("last_seen", sa.Date(), nullable=True),
        sa.Column("site", sa.String(100), nullable=True),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("upload_date", sa.Date(), nullable=True),
        sa.Column("upload_batch_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], name=op.f("fk_discovery_records_region_id_regions")),
        sa.ForeignKeyConstraint(["source_id"], ["discovery_sources.id"], name=op.f("fk_discovery_records_source_id_discovery_sources")),
        sa.ForeignKeyConstraint(["sw_id"], ["software_catalog.sw_id"], name=op.f("fk_discovery_records_sw_id_software_catalog")),
        sa.PrimaryKeyConstraint("disc_id", name=op.f("pk_discovery_records")),
    )

    # ── Reconciliation ─────────────────────────────────────────────────────────
    op.create_table(
        "reconciliation_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_date", sa.DateTime(), nullable=True),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entitlements_processed", sa.Integer(), nullable=True, server_default="0"),
        sa.ForeignKeyConstraint(["triggered_by"], ["users.id"], name=op.f("fk_reconciliation_runs_triggered_by_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reconciliation_runs")),
    )
    op.create_table(
        "reconciliation_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ent_id", sa.String(20), nullable=False),
        sa.Column("entitled", sa.Numeric(), nullable=True),
        sa.Column("in_use", sa.Numeric(), nullable=True),
        sa.Column("util_pct", sa.Numeric(), nullable=True),
        sa.Column("status", sa.Enum("OVER_DEPLOYED", "WATCH", "OK", "UNDER_UTILISED", name="recon_status_enum"), nullable=True),
        sa.Column("ai_recommendation", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["ent_id"], ["entitlements.ent_id"], name=op.f("fk_reconciliation_results_ent_id_entitlements")),
        sa.ForeignKeyConstraint(["run_id"], ["reconciliation_runs.id"], name=op.f("fk_reconciliation_results_run_id_reconciliation_runs")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reconciliation_results")),
    )

    # ── Alerts ─────────────────────────────────────────────────────────────────
    op.create_table(
        "alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alert_type", sa.Enum("RENEWAL", "UTILISATION", name="alert_type_enum"), nullable=False),
        sa.Column("ent_id", sa.String(20), nullable=True),
        sa.Column("severity", sa.Enum("CRITICAL", "HIGH", "MEDIUM", "INFO", name="alert_severity_enum"), nullable=False, server_default="INFO"),
        sa.Column("days_to_expiry", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_gxp", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["ent_id"], ["entitlements.ent_id"], name=op.f("fk_alerts_ent_id_entitlements")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_alerts")),
    )
    op.create_table(
        "alert_reads",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alert_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], name=op.f("fk_alert_reads_alert_id_alerts")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_alert_reads_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_alert_reads")),
    )

    # ── Audit trail ────────────────────────────────────────────────────────────
    op.create_table(
        "audit_trail",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(100), nullable=True),
        sa.Column("sw_id", sa.String(20), nullable=True),
        sa.Column("before_values_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_values_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("reason_for_change", sa.Text(), nullable=True),
        sa.Column("file_hash", sa.String(64), nullable=True),
        sa.Column("is_gxp", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("session_id", sa.String(100), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at_utc", sa.DateTime(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("archived_path", sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_audit_trail_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_trail")),
    )

    # ── Usage uploads ──────────────────────────────────────────────────────────
    op.create_table(
        "usage_uploads",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ent_id", sa.String(20), nullable=True),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_hash", sa.String(64), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("storage_backend", sa.Enum("local", "supabase", "s3", name="upload_storage_enum"), nullable=False, server_default="local"),
        sa.Column("reporting_period", sa.String(50), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.Enum("pending", "processing", "completed", "failed", name="upload_status_enum"), nullable=False, server_default="pending"),
        sa.Column("error_details", sa.Text(), nullable=True),
        sa.Column("previous_upload_archived_to", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["ent_id"], ["entitlements.ent_id"], name=op.f("fk_usage_uploads_ent_id_entitlements")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_usage_uploads_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_usage_uploads")),
    )


def downgrade() -> None:
    op.drop_table("usage_uploads")
    op.drop_table("audit_trail")
    op.drop_table("alert_reads")
    op.drop_table("alerts")
    op.drop_table("reconciliation_results")
    op.drop_table("reconciliation_runs")
    op.drop_table("discovery_records")
    op.drop_table("onboarding_drafts")
    op.drop_table("entitlements")
    op.drop_table("contracts")
    op.drop_table("software_aliases")
    op.drop_table("software_catalog")
    op.drop_table("doa_hierarchy")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    op.drop_table("regions")
    op.drop_table("usage_update_methods")
    op.drop_table("discovery_sources")
    op.drop_table("license_metrics")
    op.drop_table("vendors")
    op.drop_table("sub_categories")
    op.drop_table("categories")
    # Drop enums
    for enum_name in [
        "gxp_applicable_enum", "audit_risk_enum", "discovery_source_type_enum",
        "discovery_source_status_enum", "template_required_enum", "user_role_enum",
        "doa_tier_enum", "gxp_flag_enum", "sw_vendor_risk_enum", "deployment_enum",
        "auto_renewal_enum", "storage_backend_enum", "license_type_enum",
        "entitlement_status_enum", "device_type_enum", "recon_status_enum",
        "alert_type_enum", "alert_severity_enum", "upload_storage_enum", "upload_status_enum",
    ]:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
