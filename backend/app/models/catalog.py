import uuid
from datetime import date
from sqlalchemy import Column, String, Text, Date, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base


class SoftwareCatalog(Base):
    __tablename__ = "software_catalog"

    sw_id = Column(String(20), primary_key=True)
    canonical_name = Column(String(255), nullable=False)   # unique constraint dropped — renewal creates same name with new sw_id
    publisher = Column(String(200), nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    sub_category_id = Column(UUID(as_uuid=True), ForeignKey("sub_categories.id"), nullable=True)
    gxp_flag = Column(
        SAEnum("no", "yes_21cfr", "yes_annex11", "yes_both", name="gxp_flag_enum"),
        nullable=False,
        default="no",
    )
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=True)
    vendor_risk = Column(SAEnum("LOW", "MEDIUM", "HIGH", name="sw_vendor_risk_enum"), nullable=False, default="LOW")
    deployment = Column(
        SAEnum("cloud", "on_premise", "desktop_cloud", "hybrid", name="deployment_enum"),
        nullable=False,
        default="cloud",
    )
    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id"), nullable=True)
    app_owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    secondary_owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    onboarded_date = Column(Date, default=date.today)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    aliases = relationship("SoftwareAlias", back_populates="software", cascade="all, delete-orphan")


class SoftwareAlias(Base):
    __tablename__ = "software_aliases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sw_id = Column(String(20), ForeignKey("software_catalog.sw_id"), nullable=False)
    alias_name = Column(String(255), nullable=False)
    source_name = Column(String(100), nullable=True)

    software = relationship("SoftwareCatalog", back_populates="aliases")
