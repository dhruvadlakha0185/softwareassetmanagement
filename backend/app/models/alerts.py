import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_type = Column(SAEnum("RENEWAL", "UTILISATION", "PRICE_YEAR_CHANGE", name="alert_type_enum"), nullable=False)
    ent_id = Column(String(20), ForeignKey("entitlements.ent_id"), nullable=True)
    severity = Column(
        SAEnum("CRITICAL", "HIGH", "MEDIUM", "INFO", name="alert_severity_enum"),
        nullable=False,
        default="INFO",
    )
    days_to_expiry = Column(Integer, nullable=True)
    title = Column(String(500), nullable=False)
    body_json = Column(JSONB, nullable=True)
    is_gxp = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertRead(Base):
    __tablename__ = "alert_reads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id = Column(UUID(as_uuid=True), ForeignKey("alerts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    read_at = Column(DateTime, default=datetime.utcnow)
