import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base


class AuditTrail(Base):
    __tablename__ = "audit_trail"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action_type = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=True)
    sw_id = Column(String(20), nullable=True)
    before_values_json = Column(JSONB, nullable=True)
    after_values_json = Column(JSONB, nullable=True)
    reason_for_change = Column(Text, nullable=True)
    file_hash = Column(String(64), nullable=True)
    is_gxp = Column(Boolean, default=False)
    session_id = Column(String(100), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at_utc = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_archived = Column(Boolean, default=False)
    archived_path = Column(String(500), nullable=True)
