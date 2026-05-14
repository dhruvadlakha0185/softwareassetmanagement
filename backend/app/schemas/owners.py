from __future__ import annotations
from uuid import UUID
from pydantic import BaseModel


class AppOwnerCreate(BaseModel):
    email: str
    full_name: str
    password: str
    bu: str | None = None
    region_id: UUID | None = None


class AppOwnerUpdate(BaseModel):
    full_name: str | None = None
    bu: str | None = None
    region_id: UUID | None = None
    is_active: bool | None = None


class AppOwnerOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    bu: str | None = None
    is_active: bool
    model_config = {"from_attributes": True}


class DOACreate(BaseModel):
    user_id: UUID
    tier: str = "2"               # "1" | "2"
    role_label: str | None = None
    alert_scope: str | None = None
    software_categories_json: str | None = None


class DOAUpdate(BaseModel):
    tier: str | None = None
    role_label: str | None = None
    alert_scope: str | None = None
    software_categories_json: str | None = None


class DOAOut(BaseModel):
    id: UUID
    user_id: UUID
    tier: str
    role_label: str | None = None
    alert_scope: str | None = None
    software_categories_json: str | None = None
    user: AppOwnerOut
    model_config = {"from_attributes": True}
