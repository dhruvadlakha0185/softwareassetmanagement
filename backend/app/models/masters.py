import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    gxp_applicable = Column(SAEnum("no", "yes", "mixed", name="gxp_applicable_enum"), nullable=False, default="no")
    created_at = Column(DateTime, default=datetime.utcnow)

    sub_categories = relationship("SubCategory", back_populates="category", cascade="all, delete-orphan")


class SubCategory(Base):
    __tablename__ = "sub_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False)
    name = Column(String(100), nullable=False)

    category = relationship("Category", back_populates="sub_categories")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False, unique=True)
    audit_risk = Column(SAEnum("LOW", "MEDIUM", "HIGH", name="audit_risk_enum"), nullable=False, default="LOW")
    last_audit_date = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)


class LicenseMetric(Base):
    __tablename__ = "license_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    how_to_count = Column(Text, nullable=True)


class DiscoverySource(Base):
    __tablename__ = "discovery_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    type = Column(
        SAEnum("agent", "cmdb", "edr", "network", "manual", "casb", "api", name="discovery_source_type_enum"),
        nullable=False,
        default="manual",
    )
    coverage = Column(Text, nullable=True)
    frequency = Column(String(50), nullable=True)
    contact = Column(String(200), nullable=True)
    status = Column(
        SAEnum("active", "inactive", "stale", name="discovery_source_status_enum"),
        nullable=False,
        default="active",
    )
    notes = Column(Text, nullable=True)


class UsageUpdateMethod(Base):
    __tablename__ = "usage_update_methods"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    template_required = Column(
        SAEnum("none", "tab_a", "tab_a_and_b", name="template_required_enum"),
        nullable=False,
        default="none",
    )


class Region(Base):
    __tablename__ = "regions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    sites_json = Column(Text, nullable=True)
    regulatory_zone = Column(String(200), nullable=True)
    data_residency = Column(String(100), nullable=True)
    aws_region = Column(String(50), nullable=True)
