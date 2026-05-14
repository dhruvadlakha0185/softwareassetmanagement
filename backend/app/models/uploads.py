import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class UsageUpload(Base):
    __tablename__ = "usage_uploads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    ent_id = Column(String(20), ForeignKey("entitlements.ent_id"), nullable=True)
    file_name = Column(String(255), nullable=False)
    file_hash = Column(String(64), nullable=False)
    file_path = Column(String(500), nullable=False)
    storage_backend = Column(
        SAEnum("local", "supabase", "s3", name="upload_storage_enum"),
        nullable=False,
        default="local",
    )
    reporting_period = Column(String(50), nullable=True)
    reason = Column(Text, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    status = Column(
        SAEnum("pending", "processing", "completed", "failed", name="upload_status_enum"),
        nullable=False,
        default="pending",
    )
    error_details = Column(Text, nullable=True)
    previous_upload_archived_to = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
