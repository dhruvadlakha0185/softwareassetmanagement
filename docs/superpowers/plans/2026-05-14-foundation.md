# DRL SAM Platform — Sub-project 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo running end-to-end: `docker-compose up` starts db + backend + frontend; login works with 3 pre-seeded users; React app shell matches the DRL prototype visually with TopBar, Sidebar, and routing between placeholder module pages.

**Architecture:** Monorepo (`frontend/` + `backend/` + `docker/`). FastAPI async backend with SQLAlchemy 2.0 + asyncpg, all 26 DB tables in one Alembic migration. JWT auth (HS256). React 18 + Vite 5 with the DRL prototype CSS design system ported verbatim.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0 (async), asyncpg, Alembic, python-jose, passlib[bcrypt], pydantic-settings, pytest, httpx; React 18, Vite 5, React Router 6, Zustand 4, Axios.

---

## Task 1: Monorepo skeleton + .gitignore + .env.example

**Files:**
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create .gitignore**

```
# Python
__pycache__/
*.py[cod]
.venv/
*.egg-info/
dist/
.pytest_cache/
.coverage

# Node
node_modules/
dist/
.vite/

# Env
.env
.env.local

# Docker volumes
postgres_data/
storage_data/

# IDE
.DS_Store
.idea/
.vscode/
```

- [ ] **Step 2: Create .env.example**

```
# Backend
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/drl_sam
JWT_SECRET=change-me-in-production-use-32-chars-min
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7
STORAGE_BACKEND=local
OPENAI_API_KEY=sk-...

# Frontend
VITE_API_URL=http://localhost:8000/api/v1
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: add gitignore and env example"
```

---

## Task 2: Docker Compose

**Files:**
- Create: `docker/docker-compose.yml`

- [ ] **Step 1: Create docker/docker-compose.yml**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: drl_sam
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db:5432/drl_sam
      JWT_SECRET: local-dev-secret-change-in-prod
      JWT_ALGORITHM: HS256
      ACCESS_TOKEN_EXPIRE_MINUTES: 60
      REFRESH_TOKEN_EXPIRE_DAYS: 7
      STORAGE_BACKEND: local
      OPENAI_API_KEY: ${OPENAI_API_KEY:-dummy}
    volumes:
      - ../backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "3000:3000"
    depends_on:
      - backend
    environment:
      VITE_API_URL: http://localhost:8000/api/v1
    volumes:
      - ../frontend:/app
      - /app/node_modules
    command: npm run dev -- --host 0.0.0.0

volumes:
  postgres_data:
```

- [ ] **Step 2: Commit**

```bash
git add docker/
git commit -m "chore: add docker-compose for local dev"
```

---

## Task 3: Backend — requirements.txt + Dockerfile + project skeleton

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/Dockerfile`
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/app/core/__init__.py` (empty)
- Create: `backend/app/models/__init__.py` (empty)
- Create: `backend/app/schemas/__init__.py` (empty)
- Create: `backend/app/api/__init__.py` (empty)
- Create: `backend/app/api/v1/__init__.py` (empty)
- Create: `backend/app/api/v1/routes/__init__.py` (empty)
- Create: `backend/tests/__init__.py` (empty)

- [ ] **Step 1: Create backend/requirements.txt**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.0
pydantic-settings==2.6.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.17
httpx==0.27.2
pytest==8.3.4
pytest-asyncio==0.24.0
anyio==4.6.2
```

- [ ] **Step 2: Create backend/Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Create all empty __init__.py files**

```bash
mkdir -p backend/app/core backend/app/models backend/app/schemas \
         backend/app/api/v1/routes backend/scripts backend/tests
touch backend/app/__init__.py backend/app/core/__init__.py \
      backend/app/models/__init__.py backend/app/schemas/__init__.py \
      backend/app/api/__init__.py backend/app/api/v1/__init__.py \
      backend/app/api/v1/routes/__init__.py backend/tests/__init__.py
```

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "chore: backend project skeleton and requirements"
```

---

## Task 4: Backend core — config.py + database.py

**Files:**
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`

- [ ] **Step 1: Create backend/app/core/config.py**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/drl_sam"
    jwt_secret: str = "local-dev-secret-change-in-prod"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    storage_backend: str = "local"
    openai_api_key: str = "dummy"


settings = Settings()
```

- [ ] **Step 2: Create backend/app/core/database.py**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from typing import AsyncGenerator
from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/
git commit -m "feat: backend core config and async database session"
```

---

## Task 5: SQLAlchemy models — base + masters + users

**Files:**
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/masters.py`
- Create: `backend/app/models/users.py`

- [ ] **Step 1: Create backend/app/models/base.py**

```python
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import MetaData

convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=convention)
```

- [ ] **Step 2: Create backend/app/models/masters.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, Enum as SAEnum
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
    status = Column(SAEnum("active", "inactive", "stale", name="discovery_source_status_enum"), nullable=False, default="active")
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
```

- [ ] **Step 3: Create backend/app/models/users.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=True)
    role = Column(
        SAEnum("COE_ADMIN", "APP_OWNER", "READ_ONLY", name="user_role_enum"),
        nullable=False,
        default="APP_OWNER",
    )
    bu = Column(String(100), nullable=True)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sso_sub = Column(String(255), nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DOAHierarchy(Base):
    __tablename__ = "doa_hierarchy"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tier = Column(SAEnum("1", "2", name="doa_tier_enum"), nullable=False, default="2")
    role_label = Column(String(100), nullable=True)
    alert_scope = Column(String(100), nullable=True)
    software_categories_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/
git commit -m "feat: SQLAlchemy models - base, masters, users"
```

---

## Task 6: SQLAlchemy models — catalog + contracts + discovery + reconciliation + alerts + audit + uploads

**Files:**
- Create: `backend/app/models/catalog.py`
- Create: `backend/app/models/contracts.py`
- Create: `backend/app/models/discovery.py`
- Create: `backend/app/models/reconciliation.py`
- Create: `backend/app/models/alerts.py`
- Create: `backend/app/models/audit.py`
- Create: `backend/app/models/uploads.py`

- [ ] **Step 1: Create backend/app/models/catalog.py**

```python
import uuid
from datetime import date
from sqlalchemy import Column, String, Text, Date, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base


class SoftwareCatalog(Base):
    __tablename__ = "software_catalog"

    sw_id = Column(String(20), primary_key=True)  # e.g. "MS-001"
    canonical_name = Column(String(255), nullable=False, unique=True)
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
```

- [ ] **Step 2: Create backend/app/models/contracts.py**

```python
import uuid
from datetime import datetime, date
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
    storage_backend = Column(SAEnum("local", "supabase", "s3", name="storage_backend_enum"), nullable=False, default="local")
    is_archived = Column(Boolean, default=False)
    archived_at = Column(DateTime, nullable=True)
    archived_path = Column(String(500), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Entitlement(Base):
    __tablename__ = "entitlements"

    ent_id = Column(String(20), primary_key=True)  # e.g. "ENT-001"
    sw_id = Column(String(20), ForeignKey("software_catalog.sw_id"), nullable=False)
    contract_id = Column(UUID(as_uuid=True), ForeignKey("contracts.id"), nullable=True)
    contract_name = Column(String(255), nullable=True)
    metric_id = Column(UUID(as_uuid=True), ForeignKey("license_metrics.id"), nullable=True)
    license_type = Column(SAEnum("subscription", "perpetual", name="license_type_enum"), nullable=False, default="subscription")
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
```

- [ ] **Step 3: Create backend/app/models/discovery.py**

```python
import uuid
from datetime import date, datetime
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class DiscoveryRecord(Base):
    __tablename__ = "discovery_records"

    disc_id = Column(String(20), primary_key=True)  # e.g. "D-0001"
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
```

- [ ] **Step 4: Create backend/app/models/reconciliation.py**

```python
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
```

- [ ] **Step 5: Create backend/app/models/alerts.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_type = Column(SAEnum("RENEWAL", "UTILISATION", name="alert_type_enum"), nullable=False)
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
```

- [ ] **Step 6: Create backend/app/models/audit.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
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
```

- [ ] **Step 7: Create backend/app/models/uploads.py**

```python
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
    storage_backend = Column(SAEnum("local", "supabase", "s3", name="upload_storage_enum"), nullable=False, default="local")
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
```

- [ ] **Step 8: Update backend/app/models/__init__.py to import all models (needed for Alembic autogenerate)**

```python
from app.models.base import Base
from app.models.masters import Category, SubCategory, Vendor, LicenseMetric, DiscoverySource, UsageUpdateMethod, Region
from app.models.users import User, DOAHierarchy
from app.models.catalog import SoftwareCatalog, SoftwareAlias
from app.models.contracts import Contract, Entitlement, OnboardingDraft
from app.models.discovery import DiscoveryRecord
from app.models.reconciliation import ReconciliationRun, ReconciliationResult
from app.models.alerts import Alert, AlertRead
from app.models.audit import AuditTrail
from app.models.uploads import UsageUpload

__all__ = [
    "Base",
    "Category", "SubCategory", "Vendor", "LicenseMetric",
    "DiscoverySource", "UsageUpdateMethod", "Region",
    "User", "DOAHierarchy",
    "SoftwareCatalog", "SoftwareAlias",
    "Contract", "Entitlement", "OnboardingDraft",
    "DiscoveryRecord",
    "ReconciliationRun", "ReconciliationResult",
    "Alert", "AlertRead",
    "AuditTrail",
    "UsageUpload",
]
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/
git commit -m "feat: complete SQLAlchemy models for all 26 tables"
```

---

## Task 7: Alembic setup + initial migration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`

- [ ] **Step 1: Install dependencies and init Alembic**

```bash
cd backend
pip install -r requirements.txt
alembic init alembic
```

- [ ] **Step 2: Replace backend/alembic.ini — change sqlalchemy.url line**

Find the line `sqlalchemy.url = ...` and replace with:
```ini
sqlalchemy.url = postgresql://postgres:postgres@localhost:5432/drl_sam
```

- [ ] **Step 3: Replace backend/alembic/env.py**

```python
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.core.config import settings
import app.models  # noqa: F401 — registers all models with Base.metadata
from app.models.base import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url.replace("+asyncpg", ""))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=settings.database_url,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Generate the initial migration (with db running)**

```bash
# From backend/ directory, with db container running:
docker-compose -f ../docker/docker-compose.yml up db -d
alembic revision --autogenerate -m "initial_schema"
```

Expected: A new file appears in `backend/alembic/versions/` named `xxxx_initial_schema.py` containing `op.create_table(...)` calls for all 26 tables.

- [ ] **Step 5: Run the migration**

```bash
alembic upgrade head
```

Expected output ends with: `Running upgrade  -> xxxx, initial_schema`

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/
git commit -m "feat: Alembic setup and initial schema migration (26 tables)"
```

---

## Task 8: Backend security — JWT + password hashing

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/schemas/auth.py`

- [ ] **Step 1: Write the failing tests first**

Create `backend/tests/test_security.py`:

```python
import pytest
from app.core.security import get_password_hash, verify_password, create_access_token, decode_token


def test_password_hash_and_verify():
    hashed = get_password_hash("Admin123!")
    assert verify_password("Admin123!", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_create_and_decode_access_token():
    token = create_access_token({"sub": "test@drl.local", "role": "COE_ADMIN"})
    payload = decode_token(token)
    assert payload["sub"] == "test@drl.local"
    assert payload["role"] == "COE_ADMIN"


def test_decode_invalid_token_returns_none():
    result = decode_token("not.a.valid.token")
    assert result is None
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend
pytest tests/test_security.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `security` module doesn't exist yet.

- [ ] **Step 3: Create backend/app/core/security.py**

```python
from datetime import datetime, timedelta
from typing import Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(data: dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        return None
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pytest tests/test_security.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Create backend/app/schemas/auth.py**

```python
from pydantic import BaseModel, EmailStr
from uuid import UUID


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    bu: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


TokenResponse.model_rebuild()
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/security.py backend/app/schemas/auth.py backend/tests/test_security.py
git commit -m "feat: JWT security and password hashing with passing tests"
```

---

## Task 9: Auth router + API dependencies + auth tests

**Files:**
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/v1/routes/auth.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Create backend/app/api/deps.py**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import decode_token
from app.models.users import User

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    email: str = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_role(roles: list[str]):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return role_checker
```

- [ ] **Step 2: Create backend/app/api/v1/routes/auth.py**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.models.users import User
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, UserOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled")

    token_data = {"sub": user.email, "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    email: str = payload.get("sub")
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_data = {"sub": user.email, "role": user.role}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
```

- [ ] **Step 3: Write failing auth tests first**

Create `backend/tests/conftest.py`:

```python
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.base import Base
import app.models  # noqa: registers all models
from app.core.security import get_password_hash
from app.models.users import User

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/drl_sam_test"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    _engine = create_async_engine(TEST_DB_URL, echo=False)
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture
async def db(engine):
    _session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with _session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db):
    from app.main import app
    from app.core.database import get_db

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(db):
    user = User(
        email="admin@drl.local",
        full_name="COE Admin",
        hashed_password=get_password_hash("Admin123!"),
        role="COE_ADMIN",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    yield user
    await db.delete(user)
    await db.commit()


@pytest_asyncio.fixture
async def admin_token(client, admin_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@drl.local", "password": "Admin123!"})
    return resp.json()["access_token"]
```

Create `backend/tests/test_auth.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_login_success(client, admin_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@drl.local", "password": "Admin123!"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["role"] == "COE_ADMIN"
    assert data["user"]["email"] == "admin@drl.local"


@pytest.mark.asyncio
async def test_login_wrong_password(client, admin_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@drl.local", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client):
    resp = await client.post("/api/v1/auth/login", json={"email": "nobody@drl.local", "password": "x"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated(client, admin_token):
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@drl.local"


@pytest.mark.asyncio
async def test_get_me_no_token(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 403  # HTTPBearer returns 403 when no credentials


@pytest.mark.asyncio
async def test_refresh_token(client, admin_user):
    login_resp = await client.post(
        "/api/v1/auth/login", json={"email": "admin@drl.local", "password": "Admin123!"}
    )
    refresh_token = login_resp.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
```

- [ ] **Step 4: Run tests — expect failures (app.main not created yet)**

```bash
cd backend
pytest tests/test_auth.py -v 2>&1 | head -20
```

Expected: ImportError on `app.main`

- [ ] **Step 5: Commit partial work**

```bash
git add backend/app/api/ backend/tests/
git commit -m "feat: auth router, deps, and failing test suite"
```

---

## Task 10: Backend main.py — wire app together

**Files:**
- Create: `backend/app/main.py`

- [ ] **Step 1: Create backend/app/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes.auth import router as auth_router

app = FastAPI(
    title="DRL SAM Platform API",
    version="3.0.0",
    description="Software Asset Management — Dr. Reddy's Laboratories",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
```

- [ ] **Step 2: Run the auth tests — they should now pass**

First create a `drl_sam_test` database:

```bash
docker exec -it $(docker ps -q --filter "name=db") psql -U postgres -c "CREATE DATABASE drl_sam_test;"
```

Then run the tests:

```bash
cd backend
pytest tests/test_auth.py tests/test_security.py -v
```

Expected: `9 passed`

- [ ] **Step 3: Verify the API is reachable manually**

```bash
cd backend
uvicorn app.main:app --reload &
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"drl-sam-backend"}`

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: FastAPI app wired and all auth tests passing"
```

---

## Task 11: Seed script — 3 test users

**Files:**
- Create: `backend/scripts/seed.py`

- [ ] **Step 1: Create backend/scripts/seed.py**

```python
"""
Run: python -m scripts.seed
Creates 3 test users if they don't already exist.
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.users import User
import app.models  # noqa


SEED_USERS = [
    {
        "email": "admin@drl.local",
        "full_name": "COE Admin",
        "password": "Admin123!",
        "role": "COE_ADMIN",
        "bu": "IT COE",
    },
    {
        "email": "appowner@drl.local",
        "full_name": "App Owner",
        "password": "Owner123!",
        "role": "APP_OWNER",
        "bu": "IT Ops",
    },
    {
        "email": "cio@drl.local",
        "full_name": "CIO Read Only",
        "password": "Read123!",
        "role": "READ_ONLY",
        "bu": "IT COE",
    },
]


async def seed():
    async with AsyncSessionLocal() as session:
        for user_data in SEED_USERS:
            result = await session.execute(select(User).where(User.email == user_data["email"]))
            existing = result.scalar_one_or_none()
            if existing:
                print(f"  skip  {user_data['email']} (already exists)")
                continue

            user = User(
                email=user_data["email"],
                full_name=user_data["full_name"],
                hashed_password=get_password_hash(user_data["password"]),
                role=user_data["role"],
                bu=user_data["bu"],
                is_active=True,
            )
            session.add(user)
            print(f"  create {user_data['email']} [{user_data['role']}]")

        await session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
```

- [ ] **Step 2: Run the seed against the dev database**

```bash
cd backend
# Ensure dev db is up and migrated first
alembic upgrade head
python -m scripts.seed
```

Expected output:
```
  create admin@drl.local [COE_ADMIN]
  create appowner@drl.local [APP_OWNER]
  create cio@drl.local [READ_ONLY]
Seed complete.
```

- [ ] **Step 3: Run seed again to verify idempotency**

```bash
python -m scripts.seed
```

Expected: All three lines show `skip` — no duplicates.

- [ ] **Step 4: Add startup hook to main.py to auto-seed in dev**

Add to `backend/app/main.py` after the imports:

```python
from app.core.config import settings


@app.on_event("startup")
async def on_startup():
    if settings.storage_backend == "local":  # only auto-seed in local dev
        from scripts.seed import seed
        await seed()
```

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/ backend/app/main.py
git commit -m "feat: seed script creates 3 test users, auto-runs in dev"
```

---

## Task 12: Frontend project setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/Dockerfile`
- Create: `frontend/.env.example`
- Create: `frontend/src/main.jsx`

- [ ] **Step 1: Create frontend/package.json**

```json
{
  "name": "drl-sam-frontend",
  "private": true,
  "version": "3.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.9",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.3"
  }
}
```

- [ ] **Step 2: Create frontend/vite.config.js**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create frontend/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SAM Platform · Dr. Reddy's Laboratories</title>
    <link
      href="https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create frontend/Dockerfile**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

- [ ] **Step 5: Create frontend/.env.example**

```
VITE_API_URL=http://localhost:8000/api/v1
```

- [ ] **Step 6: Create frontend/src/main.jsx**

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/drl-design-system.css";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Install dependencies**

```bash
cd frontend
npm install
```

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "chore: frontend Vite+React project setup"
```

---

## Task 13: DRL CSS design system

**Files:**
- Create: `frontend/src/styles/drl-design-system.css`

- [ ] **Step 1: Create frontend/src/styles/drl-design-system.css**

This is the complete DRL design system ported from the HTML prototype. Create the file with this exact content:

```css
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --navy:#0B1E3D;--navy-mid:#1F3A6E;--navy-light:#2E5A9C;
  --accent:#E8632A;--accent-l:#FFF0E8;
  --teal:#0F6E56;--teal-l:#E1F5EE;--teal-m:#1D9E75;
  --amber:#854F0B;--amber-l:#FAEEDA;--amber-m:#BA7517;
  --red:#791F1F;--red-l:#FCEBEB;--red-m:#A32D2D;
  --blue:#0C447C;--blue-l:#E6F1FB;--blue-m:#185FA5;
  --purple:#3C3489;--purple-l:#EEEDFE;--purple-m:#534AB7;
  --green:#27500A;--green-l:#EAF3DE;--green-m:#3B6D11;
  --surf:#F4F6FA;--card:#FFFFFF;
  --bdr:#E2E6EE;--bdr-s:#BCC5D8;
  --tx:#0B1E3D;--tx-m:#4A5568;--tx-q:#8899B4;
}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--surf);color:var(--tx);min-height:100vh;display:flex;flex-direction:column;font-size:13px}

/* TOP BAR */
.topbar{background:var(--navy);color:#fff;padding:0 18px;display:flex;align-items:center;height:52px;flex-shrink:0;position:sticky;top:0;z-index:200;gap:0}
.tb-brand{display:flex;align-items:center;gap:10px;padding-right:18px;border-right:1px solid rgba(255,255,255,.12);flex-shrink:0}
.tb-dot{width:30px;height:30px;background:var(--accent);border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0}
.tb-brand-text{font-size:13px;font-weight:600}.tb-brand-sub{font-size:10px;color:rgba(255,255,255,.4)}
.tb-nav{display:flex;gap:1px;padding:0 10px;flex:1;overflow-x:auto}
.tn{padding:5px 11px;font-size:11.5px;color:rgba(255,255,255,.5);cursor:pointer;border-radius:5px;white-space:nowrap;transition:all .15s;font-weight:500;background:none;border:none}
.tn:hover{background:rgba(255,255,255,.07);color:#fff}.tn.active{background:rgba(255,255,255,.12);color:#fff}
.tb-right{display:flex;align-items:center;gap:8px;padding-left:14px;border-left:1px solid rgba(255,255,255,.12);flex-shrink:0}
.role-badge{background:var(--accent);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px}
.nb{position:relative;width:30px;height:30px;background:rgba(255,255,255,.08);border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;color:#fff}
.nd{position:absolute;top:5px;right:5px;width:6px;height:6px;background:var(--accent);border-radius:50%}
.av{width:30px;height:30px;background:var(--navy-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff;border:2px solid rgba(255,255,255,.18)}

/* LAYOUT */
.app-body{display:flex;flex:1;overflow:hidden;height:calc(100vh - 52px)}
.sidebar{width:212px;background:var(--card);border-right:1px solid var(--bdr);flex-shrink:0;display:flex;flex-direction:column}
.sb-scroll{flex:1;overflow-y:auto;padding:10px 0}
.sb-footer{padding:10px;border-top:1px solid var(--bdr);flex-shrink:0}
.sb-help{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--navy);color:#fff;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;transition:background .12s;border:none;width:100%}
.sb-help:hover{background:var(--navy-mid)}
.sb-version{font-size:10px;color:var(--tx-q);text-align:center;margin-top:6px}
.main{flex:1;overflow-y:auto;min-width:0}
.page{padding:18px 22px;animation:fi .16s ease}
@keyframes fi{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}

/* SIDEBAR NAV */
.sb-sec{padding:3px 12px 5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--tx-q);margin-top:10px}
.sn{display:flex;align-items:center;gap:8px;padding:7px 14px;font-size:12.5px;color:var(--tx-m);cursor:pointer;border-left:3px solid transparent;transition:all .12s;font-weight:500;background:none;border-right:none;border-top:none;border-bottom:none;width:100%;text-align:left}
.sn:hover{background:var(--surf);color:var(--tx)}.sn.active{background:var(--blue-l);color:var(--blue-m);border-left-color:var(--blue-m)}
.sn-ic{width:14px;height:14px;flex-shrink:0}
.sb-badge{margin-left:auto;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px}
.sb-r{background:var(--red-l);color:var(--red-m)}.sb-a{background:var(--amber-l);color:var(--amber-m)}
.sb-g{background:var(--green-l);color:var(--green-m)}.sb-b{background:var(--blue-l);color:var(--blue-m)}

/* PAGE HEADER */
.ph{margin-bottom:18px}
.ph h1{font-size:18px;font-weight:600;color:var(--tx);margin-bottom:3px}
.ph p{font-size:12.5px;color:var(--tx-m)}
.bc{font-size:11px;color:var(--tx-q);margin-bottom:5px;display:flex;align-items:center;gap:3px}
.bc span{color:var(--tx-m)}

/* CARDS */
.card{background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:16px}
.card-sm{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:11px 14px}
.ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.ct{font-size:13px;font-weight:600;color:var(--tx)}.csub{font-size:11px;color:var(--tx-q);margin-top:1px}

/* METRICS */
.mg{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:18px}
.mg3{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-bottom:18px}
.met{background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:13px 15px}
.ml{font-size:10.5px;color:var(--tx-q);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.mv{font-size:22px;font-weight:700;line-height:1}.ms{font-size:11px;color:var(--tx-q);margin-top:3px}
.ms.red{color:var(--red-m)}.ms.grn{color:var(--teal-m)}.ms.amb{color:var(--amber-m)}
.ml-a{border-left:3px solid var(--accent)}.ml-r{border-left:3px solid var(--red-m)}
.ml-g{border-left:3px solid var(--teal-m)}.ml-b{border-left:3px solid var(--blue-m)}.ml-p{border-left:3px solid var(--purple-m)}

/* TAGS */
.tag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
.tr2{background:var(--red-l);color:var(--red-m)}.ta2{background:var(--amber-l);color:var(--amber-m)}
.tg2{background:var(--green-l);color:var(--green-m)}.tb3{background:var(--blue-l);color:var(--blue-m)}
.tp2{background:var(--purple-l);color:var(--purple-m)}.tgr2{background:#F1EFE8;color:#444}
.tt2{background:var(--teal-l);color:var(--teal-m)}
.pls{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:2px}
.pls.r{background:var(--red-m);animation:pulse 1.5s infinite}.pls.a{background:var(--amber-m)}.pls.g{background:var(--teal-m)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}

/* TABLES */
.tw{border-radius:8px;border:1px solid var(--bdr);margin-bottom:16px;overflow:hidden}
.tw-body{overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 260px)}
table{width:100%;border-collapse:collapse;background:var(--card);font-size:12px;min-width:100%}
thead th{background:#F2F4F9;color:var(--tx-q);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:9px 11px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--bdr);position:sticky;top:0;z-index:2}
tbody td{padding:8px 11px;border-bottom:1px solid var(--bdr);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#FAFBFD}
.trisk td{background:#FFF5F5}.trisk:hover td{background:#FFEAEA}
.twarn td{background:#FFFBEF}.twarn:hover td{background:#FFF4CC}
.num{text-align:right;font-variant-numeric:tabular-nums;font-family:monospace;font-size:11.5px}
.mono{font-family:monospace;font-size:11px}

/* SEARCH ROW */
.sr{display:flex;gap:7px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.si{padding:6px 11px;border:1px solid var(--bdr);border-radius:6px;font-size:12.5px;width:220px;outline:none;background:var(--card);color:var(--tx)}
.si:focus{border-color:var(--blue-m);box-shadow:0 0 0 3px rgba(24,95,165,.1)}
select.fs{padding:5px 8px;border:1px solid var(--bdr);border-radius:6px;font-size:12px;outline:none;background:var(--card);color:var(--tx);cursor:pointer}

/* BUTTONS */
.btn{padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:5px;transition:all .12s;white-space:nowrap}
.btn-p{background:var(--navy);color:#fff}.btn-p:hover{background:var(--navy-mid)}
.btn-a{background:var(--accent);color:#fff}.btn-a:hover{opacity:.9}
.btn-o{background:transparent;border:1.5px solid var(--bdr-s);color:var(--tx-m)}.btn-o:hover{background:var(--surf);border-color:var(--blue-m);color:var(--blue-m)}
.btn-sm{padding:4px 9px;font-size:11.5px}
.btn-teal{background:var(--teal-m);color:#fff}.btn-teal:hover{background:var(--teal)}
.btn-d{background:var(--red-l);color:var(--red-m);border:1px solid #F7C1C1}

/* GRIDS */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px}
.g4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px}

/* FORM */
.fg{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}
.fl{font-size:11.5px;font-weight:600;color:var(--tx-m)}.fl .req{color:var(--accent)}
.fi2{padding:7px 10px;border:1px solid var(--bdr);border-radius:6px;font-size:12.5px;outline:none;background:var(--card);color:var(--tx);transition:border-color .12s;width:100%}
.fi2:focus{border-color:var(--blue-m);box-shadow:0 0 0 3px rgba(24,95,165,.1)}
.fi2.ro{background:#F4F6FA}.fhint{font-size:11px;color:var(--tx-q)}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.fr3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px}

/* LOGIN */
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--surf)}
.login-box{background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:32px;width:380px;box-shadow:0 4px 24px rgba(11,30,61,.08)}
.login-logo{display:flex;align-items:center;gap:10px;margin-bottom:24px}
.login-title{font-size:18px;font-weight:700;color:var(--tx);margin-bottom:4px}
.login-sub{font-size:12.5px;color:var(--tx-q);margin-bottom:24px}
.login-error{background:var(--red-l);border:1px solid #F7C1C1;color:var(--red-m);border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:12px}

/* MISC */
.sdiv{font-size:11.5px;font-weight:700;color:var(--tx-m);text-transform:uppercase;letter-spacing:.5px;margin:18px 0 11px;display:flex;align-items:center;gap:8px}
.sdiv::after{content:'';flex:1;height:1px;background:var(--bdr)}
.dpos{color:var(--teal-m)}.dneg{color:var(--red-m)}.dzero{color:var(--amber-m)}
.rgn{display:inline-flex;align-items:center;gap:3px;background:var(--surf);border:1px solid var(--bdr);border-radius:4px;padding:1px 5px;font-size:11px;font-weight:600;color:var(--tx-m)}
.doa{background:var(--navy);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:.3px}

/* RISK BANNER */
.rb{background:linear-gradient(135deg,#3D0A0A,#6B1212);color:#fff;border-radius:9px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px}
.rb-ic{width:38px;height:38px;background:rgba(255,255,255,.1);border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.rb h3{font-size:13.5px;font-weight:700;margin-bottom:2px}.rb p{font-size:12px;opacity:.8}

/* SCROLLBAR */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#CBD5E0;border-radius:3px}

/* DRAWER */
.drawer{background:var(--card);border-left:1px solid var(--bdr);width:440px;position:fixed;top:52px;right:0;bottom:0;overflow-y:auto;z-index:150;transform:translateX(100%);transition:transform .22s cubic-bezier(.4,0,.2,1);box-shadow:-6px 0 24px rgba(0,0,0,.09)}
.drawer.open{transform:none}
.drawer-hd{padding:16px 18px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;background:var(--surf);position:sticky;top:0;z-index:2}
.drawer-body{padding:18px}
.ovl{position:fixed;inset:0;top:52px;background:rgba(11,30,61,.25);z-index:149;display:none}
.ovl.show{display:block}

/* SEC TABS */
.stabs{display:flex;gap:2px;background:var(--surf);border-radius:7px;padding:3px;margin-bottom:14px;border:1px solid var(--bdr);width:fit-content}
.stab{padding:5px 12px;font-size:12px;font-weight:500;color:var(--tx-q);border-radius:5px;cursor:pointer;transition:all .12s;background:none;border:none}
.stab.active{background:var(--card);color:var(--tx);box-shadow:0 1px 3px rgba(0,0,0,.07)}

/* NOTIFICATIONS */
.nc{background:var(--card);border:1px solid var(--bdr);border-radius:9px;padding:13px;display:flex;gap:12px;margin-bottom:9px}
.nc.urg{border-left:3px solid var(--red-m)}.nc.wrn{border-left:3px solid var(--amber-m)}.nc.inf{border-left:3px solid var(--blue-m)}
.nic{width:32px;height:32px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.nic.urg{background:var(--red-l)}.nic.wrn{background:var(--amber-l)}.nic.inf{background:var(--blue-l)}

/* COST CARD */
.cost-card{background:linear-gradient(135deg,var(--navy),var(--navy-mid));color:#fff;border-radius:10px;padding:16px;margin-bottom:12px}
.cost-card h3{font-size:13px;font-weight:600;margin-bottom:4px;opacity:.75}
.cost-card .big{font-size:28px;font-weight:700;margin-bottom:2px}

@media(max-width:900px){.sidebar{display:none}.mg{grid-template-columns:1fr 1fr}.g2,.g3{grid-template-columns:1fr}}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/
git commit -m "feat: DRL CSS design system ported from prototype"
```

---

## Task 14: Zustand stores + Axios client

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/auth.js`
- Create: `frontend/src/store/authStore.js`
- Create: `frontend/src/store/alertStore.js`
- Create: `frontend/src/store/uiStore.js`
- Create: `frontend/src/hooks/useAuth.js`

- [ ] **Step 1: Create frontend/src/api/client.js**

```js
import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1",
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const res = await axios.post(
            `${client.defaults.baseURL}/auth/refresh`,
            { refresh_token: refreshToken }
          );
          const { access_token, refresh_token } = res.data;
          localStorage.setItem("access_token", access_token);
          localStorage.setItem("refresh_token", refresh_token);
          original.headers.Authorization = `Bearer ${access_token}`;
          return client(original);
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
```

- [ ] **Step 2: Create frontend/src/api/auth.js**

```js
import client from "./client";

export const login = (email, password) =>
  client.post("/auth/login", { email, password }).then((r) => r.data);

export const getMe = () =>
  client.get("/auth/me").then((r) => r.data);

export const refresh = (refreshToken) =>
  client.post("/auth/refresh", { refresh_token: refreshToken }).then((r) => r.data);
```

- [ ] **Step 3: Create frontend/src/store/authStore.js**

```js
import { create } from "zustand";
import { login as apiLogin, getMe } from "../api/auth";

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem("access_token") || null,
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await apiLogin(email, password);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      set({ user: data.user, token: data.access_token, loading: false });
    } catch (err) {
      set({ error: err.response?.data?.detail || "Login failed", loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    try {
      const user = await getMe();
      set({ user });
    } catch {
      get().logout();
    }
  },
}));

export default useAuthStore;
```

- [ ] **Step 4: Create frontend/src/store/alertStore.js**

```js
import { create } from "zustand";

const useAlertStore = create((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
}));

export default useAlertStore;
```

- [ ] **Step 5: Create frontend/src/store/uiStore.js**

```js
import { create } from "zustand";

const useUIStore = create((set) => ({
  drawerOpen: false,
  drawerContent: null,
  modalOpen: false,

  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false, drawerContent: null }),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));

export default useUIStore;
```

- [ ] **Step 6: Create frontend/src/hooks/useAuth.js**

```js
import { useEffect } from "react";
import useAuthStore from "../store/authStore";

export function useAuth() {
  const { user, token, login, logout, fetchMe, loading, error } = useAuthStore();

  useEffect(() => {
    if (token && !user) {
      fetchMe();
    }
  }, [token, user, fetchMe]);

  return { user, token, login, logout, loading, error, isAuthenticated: !!token };
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/ frontend/src/store/ frontend/src/hooks/
git commit -m "feat: Zustand stores, Axios client, auth hook"
```

---

## Task 15: TopBar + Sidebar + AppLayout

**Files:**
- Create: `frontend/src/components/layout/TopBar.jsx`
- Create: `frontend/src/components/layout/Sidebar.jsx`
- Create: `frontend/src/components/layout/AppLayout.jsx`

- [ ] **Step 1: Create frontend/src/components/layout/TopBar.jsx**

```jsx
import { useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import useAlertStore from "../../store/alertStore";

const NAV_ITEMS = [
  { path: "/", label: "⬛ Dashboard" },
  { path: "/catalog", label: "📋 Catalog" },
  { path: "/entitlements", label: "📄 Entitlements" },
  { path: "/discovery", label: "🔍 Discovery" },
  { path: "/onboarding", label: "＋ Onboard" },
  { path: "/reconciliation", label: "✓ Reconciliation" },
  { path: "/cost-opt", label: "₹ Cost Opt." },
  { path: "/audit", label: "📋 Audit Trail" },
  { path: "/alerts", label: "🔔 Alerts" },
  { path: "/owners", label: "👤 App Owners" },
  { path: "/masters", label: "⚙ Masters" },
];

export default function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { unreadCount } = useAlertStore();

  const initials = user
    ? user.full_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "??";

  const roleBadge = user?.role === "COE_ADMIN"
    ? "COE ADMIN"
    : user?.role === "APP_OWNER"
    ? "APP OWNER"
    : "READ ONLY";

  return (
    <div className="topbar">
      <div className="tb-brand">
        <div className="tb-dot">DRL</div>
        <div>
          <div className="tb-brand-text">SAM Platform</div>
          <div className="tb-brand-sub">Software Asset Management · v3.0</div>
        </div>
      </div>

      <div className="tb-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`tn${location.pathname === item.path ? " active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="tb-right">
        <span className="role-badge">{roleBadge}</span>
        <button className="nb" onClick={() => navigate("/alerts")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 1.5a3.5 3.5 0 013.5 3.5v2.5l1.25 1.75H2.25L3.5 7.5V5A3.5 3.5 0 017 1.5z" />
            <path d="M5.5 11.5a1.5 1.5 0 003 0" />
          </svg>
          {unreadCount > 0 && <div className="nd" />}
        </button>
        <div className="av" title={user?.email} style={{ cursor: "pointer" }} onClick={logout}>
          {initials}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create frontend/src/components/layout/Sidebar.jsx**

```jsx
import { useNavigate, useLocation } from "react-router-dom";

const SECTIONS = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: "⊞" },
      { path: "/cost-opt", label: "Cost Optimisation", icon: "↕", badge: "₹2.4Cr", badgeCls: "sb-g" },
    ],
  },
  {
    label: "Catalog & Licensing",
    items: [
      { path: "/catalog", label: "Software Catalog", icon: "≡" },
      { path: "/entitlements", label: "Entitlements", icon: "☰", badge: "8 Exp.", badgeCls: "sb-a" },
      { path: "/discovery", label: "License Discovery", icon: "○" },
      { path: "/reconciliation", label: "Reconciliation", icon: "✓", badge: "3 Risk", badgeCls: "sb-r" },
      { path: "/onboarding", label: "Onboard Software", icon: "+" },
    ],
  },
  {
    label: "Governance",
    items: [
      { path: "/audit", label: "Audit Trail", icon: "☰" },
      { path: "/alerts", label: "Alerts & Nudges", icon: "🔔", badge: "7", badgeCls: "sb-r" },
      { path: "/owners", label: "App Owners", icon: "◯" },
    ],
  },
  {
    label: "Configuration",
    items: [{ path: "/masters", label: "Masters & Config", icon: "⚙" }],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="sidebar">
      <div className="sb-scroll">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="sb-sec">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.path}
                className={`sn${location.pathname === item.path ? " active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <span className="sn-ic">{item.icon}</span>
                {item.label}
                {item.badge && (
                  <span className={`sb-badge ${item.badgeCls}`}>{item.badge}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="sb-footer">
        <div className="sb-version">SAM Platform v3.0 · DRL IT COE · 2026</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create frontend/src/components/layout/AppLayout.jsx**

```jsx
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <div className="main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: TopBar, Sidebar, AppLayout matching DRL prototype"
```

---

## Task 16: Login page + PrivateRoute + placeholder pages

**Files:**
- Create: `frontend/src/components/shared/PrivateRoute.jsx`
- Create: `frontend/src/pages/Login/LoginPage.jsx`
- Create: `frontend/src/pages/Dashboard/DashboardPage.jsx`
- Create one placeholder for each remaining module (see step below)

- [ ] **Step 1: Create frontend/src/components/shared/PrivateRoute.jsx**

```jsx
import { Navigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";

export default function PrivateRoute({ children, roles }) {
  const { token, user } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) {
    return (
      <div className="page">
        <div className="ph">
          <h1>Access Denied</h1>
          <p>You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
```

- [ ] **Step 2: Create frontend/src/pages/Login/LoginPage.jsx**

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/");
    } catch {
      // error shown from store
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">
          <div className="tb-dot" style={{ width: 36, height: 36, fontSize: 15 }}>DRL</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tx)" }}>SAM Platform</div>
            <div style={{ fontSize: 11, color: "var(--tx-q)" }}>Software Asset Management</div>
          </div>
        </div>
        <div className="login-title">Sign in to SAM</div>
        <div className="login-sub">Dr. Reddy's Laboratories · IT COE</div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label className="fl">Email address</label>
            <input
              className="fi2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.name@drl.com"
              required
              autoFocus
            />
          </div>
          <div className="fg" style={{ marginBottom: 18 }}>
            <label className="fl">Password</label>
            <input
              className="fi2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-p"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", padding: "10px" }}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 11, color: "var(--tx-q)", textAlign: "center" }}>
          Local dev: admin@drl.local / Admin123!
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder pages for all 10 remaining modules**

Run this script to create them all at once:

```bash
cd frontend/src/pages

for module in "Dashboard" "Catalog" "Entitlements" "Discovery" "Onboarding" "Reconciliation" "CostOpt" "AuditTrail" "Alerts" "AppOwners" "Masters"; do
  mkdir -p $module
  label=$(echo $module | sed 's/CostOpt/Cost Optimisation/;s/AuditTrail/Audit Trail/;s/AppOwners/App Owners/')
  cat > $module/${module}Page.jsx << EOF
export default function ${module}Page() {
  return (
    <div className="page">
      <div className="ph">
        <div className="bc">SAM Platform <span>›</span> ${label}</div>
        <h1>${label}</h1>
        <p>Module coming in a future sub-project.</p>
      </div>
    </div>
  );
}
EOF
done
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ frontend/src/components/shared/
git commit -m "feat: Login page, PrivateRoute, 11 placeholder module pages"
```

---

## Task 17: App.jsx routing + main.jsx — wire everything together

**Files:**
- Create: `frontend/src/App.jsx`

- [ ] **Step 1: Create frontend/src/App.jsx**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import AppLayout from "./components/layout/AppLayout";
import PrivateRoute from "./components/shared/PrivateRoute";
import LoginPage from "./pages/Login/LoginPage";
import DashboardPage from "./pages/Dashboard/DashboardPage";
import CatalogPage from "./pages/Catalog/CatalogPage";
import EntitlementsPage from "./pages/Entitlements/EntitlementsPage";
import DiscoveryPage from "./pages/Discovery/DiscoveryPage";
import OnboardingPage from "./pages/Onboarding/OnboardingPage";
import ReconciliationPage from "./pages/Reconciliation/ReconciliationPage";
import CostOptPage from "./pages/CostOpt/CostOptPage";
import AuditTrailPage from "./pages/AuditTrail/AuditTrailPage";
import AlertsPage from "./pages/Alerts/AlertsPage";
import AppOwnersPage from "./pages/AppOwners/AppOwnersPage";
import MastersPage from "./pages/Masters/MastersPage";
import useAuthStore from "./store/authStore";

function AuthInit({ children }) {
  const { token, user, fetchMe } = useAuthStore();
  useEffect(() => {
    if (token && !user) fetchMe();
  }, [token, user, fetchMe]);
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="entitlements" element={<EntitlementsPage />} />
            <Route path="discovery" element={<DiscoveryPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="reconciliation" element={<ReconciliationPage />} />
            <Route path="cost-opt" element={<CostOptPage />} />
            <Route path="audit" element={<AuditTrailPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="owners" element={<AppOwnersPage />} />
            <Route path="masters" element={<MastersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Verify frontend starts without errors**

```bash
cd frontend
npm run dev
```

Expected: Server starts on `http://localhost:3000`. Open browser — see the login page with DRL styling.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: React Router v6 routing wiring all 11 module pages"
```

---

## Task 18: Full stack integration smoke test

- [ ] **Step 1: Start all services**

```bash
# From repo root
cd docker
docker-compose up --build
```

Wait until you see:
```
backend_1   | INFO:     Application startup complete.
frontend_1  | Local:   http://localhost:3000/
```

- [ ] **Step 2: Verify backend health**

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"drl-sam-backend"}`

- [ ] **Step 3: Verify seed ran (check logs)**

```bash
docker-compose logs backend | grep -E "create|skip|Seed"
```

Expected (first run):
```
  create admin@drl.local [COE_ADMIN]
  create appowner@drl.local [APP_OWNER]
  create cio@drl.local [READ_ONLY]
Seed complete.
```

- [ ] **Step 4: Test login via curl**

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@drl.local","password":"Admin123!"}'
```

Expected: JSON with `access_token`, `refresh_token`, and `user` object with `role: "COE_ADMIN"`.

- [ ] **Step 5: Test login via browser**

Open `http://localhost:3000`. You should see the DRL login page. Enter `admin@drl.local` / `Admin123!`. Should redirect to the Dashboard placeholder page with TopBar and Sidebar visible.

- [ ] **Step 6: Verify all sidebar navigation links work**

Click each item in the sidebar — each should render its placeholder page with the correct title.

- [ ] **Step 7: Verify logout**

Click the avatar in the top-right corner — should redirect to `/login`.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: Sub-project 1 Foundation complete - full stack running end-to-end"
```

---

## Self-Review Checklist

Verified against `docs/superpowers/specs/2026-05-14-drl-sam-platform-design.md`:

| Spec requirement | Covered in task |
|---|---|
| Monorepo with frontend/, backend/, docker/ | Task 1, 2, 3, 12 |
| docker-compose with db + backend + frontend | Task 2 |
| FastAPI async with asyncpg | Task 3, 4, 10 |
| All 26 DB tables | Task 5, 6 |
| Alembic migrations | Task 7 |
| JWT HS256 auth | Task 8 |
| login + refresh + me endpoints | Task 9 |
| 3 test users seeded | Task 11 |
| DRL CSS design system port | Task 13 |
| Zustand stores (auth, alert, ui) | Task 14 |
| Axios client with token interceptor | Task 14 |
| TopBar + Sidebar matching prototype | Task 15 |
| React Router v6 + PrivateRoute | Task 16, 17 |
| 11 placeholder pages | Task 16 |
| Login page | Task 16 |
| Full integration smoke test | Task 18 |
