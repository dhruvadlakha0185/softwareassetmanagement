import uuid
from sqlalchemy import Column, String, Date, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class DiscoveryRecord(Base):
    __tablename__ = "discovery_records"

    disc_id = Column(String(20), primary_key=True)
    contract_name = Column(String(255), nullable=False)
    sw_id = Column(String(20), ForeignKey("software_catalog.sw_id"), nullable=True)
    canonical_name = Column(String(255), nullable=True)
    application_tagged = Column(String(255), nullable=True)
    source_id = Column(UUID(as_uuid=True), ForeignKey("discovery_sources.id"), nullable=True)
    device_id = Column(String(100), nullable=True)
    device_type = Column(SAEnum("endpoint", "server", name="device_type_enum"), nullable=True)
    os = Column(String(100), nullable=True)
    version = Column(String(50), nullable=True)
    last_seen = Column(Date, nullable=True)
    site = Column(String(100), nullable=True)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id"), nullable=True)
    upload_date = Column(Date, nullable=True)
    upload_batch_id = Column(UUID(as_uuid=True), nullable=True)
