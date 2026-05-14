from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class DiscoveryRecordOut(BaseModel):
    disc_id: str
    contract_name: str
    sw_id: str | None = None
    canonical_name: str | None = None
    application_tagged: str | None = None
    source_id: UUID | None = None
    device_id: str | None = None
    device_type: str | None = None
    os: str | None = None
    version: str | None = None
    last_seen: date | None = None
    site: str | None = None
    region_id: UUID | None = None
    upload_date: date | None = None
    upload_batch_id: UUID | None = None
    model_config = {"from_attributes": True}


class IngestResultOut(BaseModel):
    batch_id: UUID
    inserted: int
    matched: int
    unmatched: int
    errors: list[str] = []
