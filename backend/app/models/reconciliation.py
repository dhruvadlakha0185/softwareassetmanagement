import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Numeric, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_date = Column(DateTime, default=datetime.utcnow)
    triggered_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    entitlements_processed = Column(Integer, default=0)


class ReconciliationResult(Base):
    __tablename__ = "reconciliation_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("reconciliation_runs.id"), nullable=False)
    ent_id = Column(String(20), ForeignKey("entitlements.ent_id"), nullable=False)
    entitled = Column(Numeric, nullable=True)
    in_use = Column(Numeric, nullable=True)
    util_pct = Column(Numeric, nullable=True)
    status = Column(
        SAEnum("OVER_DEPLOYED", "WATCH", "OK", "UNDER_UTILISED", name="recon_status_enum"),
        nullable=True,
    )
    ai_recommendation = Column(Text, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
