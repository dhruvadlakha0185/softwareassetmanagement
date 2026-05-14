import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Date, ForeignKey, Text, BigInteger, Integer, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sw_id = Column(String(20), ForeignKey("software_catalog.sw_id"), nullable=False)
    po_number = Column(String(100), nullable=True)
    clm_id = Column(String(100), nullable=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=True)
    reseller = Column(String(200), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    total_value_inr = Column(BigInteger, nullable=True)
    auto_renewal_clause = Column(SAEnum("yes", "no", "opt_in", name="auto_renewal_enum"), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    storage_backend = Column(
        SAEnum("local", "supabase", "s3", name="storage_backend_enum"),
        nullable=False,
        default="local",
    )
    is_archived = Column(Boolean, default=False)
    archived_at = Column(DateTime, nullable=True)
    archived_path = Column(String(500), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Entitlement(Base):
    __tablename__ = "entitlements"

    ent_id = Column(String(20), primary_key=True)
    sw_id = Column(String(20), ForeignKey("software_catalog.sw_id"), nullable=False)
    contract_id = Column(UUID(as_uuid=True), ForeignKey("contracts.id"), nullable=True)
    contract_name = Column(String(255), nullable=True)
    metric_id = Column(UUID(as_uuid=True), ForeignKey("license_metrics.id"), nullable=True)
    license_type = Column(
        SAEnum("subscription", "perpetual", name="license_type_enum"),
        nullable=False,
        default="subscription",
    )
    entitled_count = Column(BigInteger, nullable=True)
    in_use_count = Column(BigInteger, nullable=True)
    unit_cost_inr = Column(BigInteger, nullable=True)
    annual_cost_inr = Column(BigInteger, nullable=True)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id"), nullable=True)
    discovery_source_id = Column(UUID(as_uuid=True), ForeignKey("discovery_sources.id"), nullable=True)
    usage_method_id = Column(UUID(as_uuid=True), ForeignKey("usage_update_methods.id"), nullable=True)
    app_owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    status = Column(
        SAEnum("ACTIVE", "EXPIRED", "WATCH", "OVER_DEPLOYED", "UNDER_UTILISED", "OK", name="entitlement_status_enum"),
        nullable=False,
        default="ACTIVE",
    )
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OnboardingDraft(Base):
    __tablename__ = "onboarding_drafts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    po_number = Column(String(100), nullable=True)
    form_data_json = Column(JSONB, nullable=True)
    current_step = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
