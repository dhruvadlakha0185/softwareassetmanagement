# DRL SAM Platform v3.0 — Architecture Design Spec

**Date:** 2026-05-14  
**Status:** Approved — ready for implementation planning  
**Project:** Dr. Reddy's Laboratories · Software Asset Management Platform  
**Working directory:** `/Users/dhruvadlakha/Documents/Projects/Software Asset Management`

---

## 1. Overview

The DRL SAM Platform v3.0 is an enterprise-grade Software Asset Management system for Dr. Reddy's Laboratories. It consolidates the full license lifecycle — contract onboarding, entitlement management, discovery reconciliation, cost optimisation, and GxP-compliant audit trail — into a single governed platform.

**Tech stack:**
- Frontend: React + Vite (custom DRL CSS design system, matched to HTML prototype)
- Backend: FastAPI (Python 3.12)
- Local DB + storage: Supabase (PostgreSQL + Supabase Storage)
- Production DB: AWS RDS PostgreSQL 16
- Production storage: AWS S3
- Containers: Docker / docker-compose
- Production hosting: AWS ECS Fargate
- AI: OpenAI GPT-4o (contract extraction + reconciliation recommendations)
- Auth: JWT (local) with SSO/SAML production upgrade path

**Reference documents:**
- `DRL_SAM_Platform_v3.html` — fully functional browser prototype (11 modules, seed data)
- `DRL_SAM_PRD_v1.pdf` — Product Requirements Document (29 pages, FR-001 to FR-027)

---

## 2. Repository Structure

```
drl-sam/                              (monorepo)
├── frontend/                         Vite + React
│   ├── src/
│   │   ├── styles/
│   │   │   └── drl-design-system.css  CSS vars + all prototype classes
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── TopBar.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   └── AppLayout.jsx
│   │   │   └── shared/               DataTable, Drawer, Modal, Tag, MetricCard, etc.
│   │   ├── pages/                    One directory per module (11 total)
│   │   │   ├── Dashboard/
│   │   │   ├── Catalog/
│   │   │   ├── Entitlements/
│   │   │   ├── Discovery/
│   │   │   ├── Onboarding/
│   │   │   ├── Reconciliation/
│   │   │   ├── CostOpt/
│   │   │   ├── AuditTrail/
│   │   │   ├── Alerts/
│   │   │   ├── AppOwners/
│   │   │   └── Masters/
│   │   ├── api/                      Axios instance + one file per API domain
│   │   ├── store/                    Zustand stores: auth, alerts, ui
│   │   ├── hooks/                    useAuth, useAlerts, usePagination
│   │   └── App.jsx                   React Router v6 + PrivateRoute
│   ├── Dockerfile
│   └── package.json
│
├── backend/                          FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/v1/routes/            One router per module
│   │   │   ├── auth.py
│   │   │   ├── catalog.py
│   │   │   ├── entitlements.py
│   │   │   ├── discovery.py
│   │   │   ├── onboarding.py
│   │   │   ├── reconciliation.py
│   │   │   ├── alerts.py
│   │   │   ├── audit.py
│   │   │   ├── owners.py
│   │   │   ├── masters.py
│   │   │   └── cost_opt.py
│   │   ├── core/
│   │   │   ├── config.py             Pydantic Settings (reads .env)
│   │   │   ├── database.py           SQLAlchemy async engine + session factory
│   │   │   └── security.py           JWT creation/validation, bcrypt password hashing
│   │   ├── models/                   SQLAlchemy ORM models (grouped by domain)
│   │   ├── schemas/                  Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   │   ├── contract_extractor.py   OpenAI: PDF text → structured JSON
│   │   │   │   └── recon_advisor.py         OpenAI: batch entitlement → recommendations
│   │   │   ├── storage/
│   │   │   │   ├── base.py                  StorageBackend ABC
│   │   │   │   ├── supabase_storage.py      Local implementation
│   │   │   │   └── s3_storage.py            Production implementation
│   │   │   ├── reconciliation.py            Entitled vs. discovered comparison logic
│   │   │   ├── alerts_generator.py          Alert firing logic (T-90, T-60, etc.)
│   │   │   ├── xlsx_processor.py            Tab A + Tab B processing (openpyxl)
│   │   │   └── audit_logger.py              Append-only audit entry creator
│   │   └── main.py                   FastAPI app, CORS, routers, startup hooks
│   ├── alembic/                      DB migrations
│   ├── tests/
│   ├── scripts/
│   │   └── seed.py                   Creates 3 test users + master data for local dev
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker/
│   ├── docker-compose.yml            Local dev (Supabase + both apps)
│   └── docker-compose.prod.yml       Production reference (RDS + S3)
│
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-14-drl-sam-platform-design.md   (this file)
│
└── .env.example
```

---

## 3. Database Schema

### 3.1 Master / Reference Tables (7)

```sql
categories(id, name, gxp_applicable ENUM[no,yes,mixed], created_at)
sub_categories(id, category_id FK, name)
vendors(id, name, audit_risk ENUM[LOW,MEDIUM,HIGH], last_audit_date, notes)
license_metrics(id, name, description, how_to_count)
discovery_sources(id, name, type ENUM[agent,cmdb,edr,network,manual,casb,api],
                  coverage, frequency, contact, status ENUM[active,inactive,stale], notes)
usage_update_methods(id, name, description, template_required ENUM[none,tab_a,tab_a_and_b])
regions(id, name, sites_json, regulatory_zone, data_residency, aws_region)
```

### 3.2 User & Auth Tables (2)

```sql
users(id UUID PK, email UNIQUE, full_name, hashed_password,
      role ENUM[COE_ADMIN,APP_OWNER,READ_ONLY],
      bu, region_id FK, is_active BOOL, sso_sub,
      created_at, updated_at)

doa_hierarchy(id, user_id FK→users, tier ENUM[1,2],
              role_label, alert_scope, software_categories_json,
              created_at, updated_at)
```

### 3.3 Software Catalog Tables (2)

```sql
software_catalog(sw_id VARCHAR PK,          -- e.g. "MS-001"
                 canonical_name,
                 publisher,
                 category_id FK,
                 sub_category_id FK,
                 gxp_flag ENUM[no,yes_21cfr,yes_annex11,yes_both],
                 vendor_id FK,
                 vendor_risk ENUM[LOW,MEDIUM,HIGH],
                 deployment ENUM[cloud,on_premise,desktop_cloud,hybrid],
                 region_id FK,
                 app_owner_id FK→users,
                 notes TEXT,
                 onboarded_date DATE,
                 created_by FK→users)

software_aliases(id, sw_id FK→software_catalog,
                 alias_name,              -- contract name variant / discovery tool name
                 source_name)             -- e.g. "SCCM", "contract", "manual"
```

### 3.4 Contract & Entitlement Tables (3)

```sql
contracts(id UUID PK,
          sw_id FK→software_catalog,
          po_number,
          clm_id,
          vendor_id FK,
          reseller,
          start_date DATE,
          end_date DATE,
          total_value_inr BIGINT,
          auto_renewal_clause ENUM[yes,no,opt_in],
          file_name,
          file_path,
          storage_backend ENUM[supabase,s3],
          is_archived BOOL DEFAULT false,
          archived_at TIMESTAMP,
          archived_path,
          created_by FK→users,
          created_at)

entitlements(ent_id VARCHAR PK,             -- e.g. "ENT-001"
             sw_id FK→software_catalog,
             contract_id FK→contracts,
             contract_name,                 -- name as written in contract
             metric_id FK→license_metrics,
             license_type ENUM[subscription,perpetual],
             entitled_count NUMERIC,
             in_use_count NUMERIC,
             unit_cost_inr BIGINT,
             annual_cost_inr BIGINT,
             region_id FK,
             discovery_source_id FK,
             usage_method_id FK,
             app_owner_id FK→users,
             status ENUM[ACTIVE,EXPIRED,WATCH,OVER_DEPLOYED,UNDER_UTILISED,OK],
             last_updated TIMESTAMP)

onboarding_drafts(id UUID PK,
                  user_id FK→users,
                  po_number,
                  form_data_json JSONB,     -- all wizard steps serialized
                  current_step INT,
                  created_at, updated_at)
```

### 3.5 Discovery Table (1)

```sql
discovery_records(disc_id VARCHAR PK,       -- e.g. "D-0001"
                  contract_name,
                  sw_id FK→software_catalog NULLABLE,    -- null if UNMATCHED
                  canonical_name NULLABLE,
                  application_tagged NULLABLE,
                  source_id FK→discovery_sources,
                  device_id,
                  device_type ENUM[endpoint,server],
                  os,
                  version,
                  last_seen DATE,
                  site,
                  region_id FK,
                  upload_date DATE,
                  upload_batch_id UUID)     -- groups records from one upload
```

### 3.6 Reconciliation Tables (2)

```sql
reconciliation_runs(id UUID PK,
                    run_date TIMESTAMP,
                    triggered_by FK→users,
                    entitlements_processed INT)

reconciliation_results(id UUID PK,
                       run_id FK→reconciliation_runs,
                       ent_id FK→entitlements,
                       entitled NUMERIC,
                       in_use NUMERIC,
                       util_pct NUMERIC,
                       status ENUM[OVER_DEPLOYED,WATCH,OK,UNDER_UTILISED],
                       ai_recommendation TEXT,
                       generated_at TIMESTAMP)
```

### 3.7 Alert Tables (2)

```sql
alerts(id UUID PK,
       alert_type ENUM[RENEWAL,UTILISATION],
       ent_id FK→entitlements,
       severity ENUM[CRITICAL,HIGH,MEDIUM,INFO],
       days_to_expiry INT NULLABLE,         -- null for utilisation alerts
       title,
       body_json JSONB,                     -- structured content for drawer
       is_gxp BOOL,
       created_at TIMESTAMP)

alert_reads(id UUID PK, alert_id FK, user_id FK, read_at TIMESTAMP)
```

### 3.8 Audit Trail Table (1) — GxP Compliant

```sql
audit_trail(id UUID PK,
            user_id FK→users,
            action_type VARCHAR,            -- e.g. "ENTITLEMENT_UPDATED", "CONTRACT_ADDED"
            entity_type VARCHAR,            -- e.g. "entitlement", "software_catalog"
            entity_id VARCHAR,
            sw_id VARCHAR NULLABLE,
            before_values_json JSONB,
            after_values_json JSONB,
            reason_for_change TEXT,         -- mandatory when is_gxp=true
            file_hash VARCHAR NULLABLE,     -- SHA-256 of uploaded file
            is_gxp BOOL,
            session_id VARCHAR,
            ip_address INET,
            created_at_utc TIMESTAMP,       -- UTC, never mutable
            is_archived BOOL DEFAULT false,
            archived_path VARCHAR)
```

**GxP compliance invariants:**
- The DB role used by the app has `INSERT` only on `audit_trail` — no `UPDATE` or `DELETE` permissions
- A DB trigger enforces `created_at_utc` is set by the DB server clock (not the application)
- Entries older than 90 days are moved to S3 archive by a nightly background job; the `is_archived` flag is set to `true` and `archived_path` records the S3 key

### 3.9 Usage Upload Table (1)

```sql
usage_uploads(id UUID PK,
              user_id FK→users,
              ent_id FK→entitlements NULLABLE,   -- null for bulk uploads
              file_name,
              file_hash VARCHAR,
              file_path,
              storage_backend ENUM[supabase,s3],
              reporting_period VARCHAR,           -- e.g. "May 2026"
              reason TEXT,
              processed_at TIMESTAMP,
              status ENUM[pending,processing,completed,failed],
              error_details TEXT,
              previous_upload_archived_to VARCHAR)
```

---

## 4. Backend Architecture

### 4.1 FastAPI App Structure

- **Async throughout:** SQLAlchemy with `asyncpg`, async route handlers, `httpx` for OpenAI calls
- **Dependency injection:** `get_db()` yields an async session; `get_current_user()` validates JWT and returns user; `require_role(roles)` enforces RBAC
- **CORS:** Configured for `http://localhost:3000` (local) and the production domain
- **Background jobs:** APScheduler runs two tasks:
  - Daily midnight UTC: `alerts_generator.run()` — checks all active entitlements for expiry windows (T-90, T-60, T-30, T-15, T-7, T-1) and utilisation thresholds (>90%, 100%)
  - Daily 2am UTC: `audit_archiver.run()` — moves audit entries >90 days to S3/Supabase Storage

### 4.2 Storage Abstraction

```python
class StorageBackend(ABC):
    async def upload(self, file: bytes, path: str, content_type: str) -> str: ...
    async def move(self, src_path: str, dest_path: str) -> str: ...
    async def get_signed_url(self, path: str, expires_in: int = 3600) -> str: ...
```

`STORAGE_BACKEND=supabase` (local) or `STORAGE_BACKEND=s3` (production). Selected at startup via `config.py`.

### 4.3 AI Services

**Contract extraction (`contract_extractor.py`):**
1. Extract text from PDF (pypdf2) or DOCX (python-docx)
2. Truncate to 8000 tokens if needed (contracts rarely exceed this)
3. Call `gpt-4o` with `response_format: {"type": "json_object"}` and a structured system prompt listing all expected fields
4. Each extracted field includes a `confidence` score; fields with `confidence < 0.85` are marked `amber: true` in the response
5. Return: `{header: {...}, line_items: [{contract_name, canonical_name_suggestion, license_type, metric, seat_count, unit_cost, amber_fields: []}]}`

**Reconciliation advisor (`recon_advisor.py`):**
1. After reconciliation computation, collect all entitlement contexts (sw_name, util_pct, status, license_type, unit_cost, entitled, in_use, renewal_date, is_gxp)
2. Batch all 113 in a single prompt to minimize API calls
3. Prompt instructs GPT-4o to return a JSON array of `{ent_id, recommendation}` with specific, actionable text (not generic labels)
4. Store each recommendation in `reconciliation_results`

### 4.4 Audit Logger

`audit_logger.py` exposes a single function `log_event(session, user, action_type, entity_type, entity_id, sw_id=None, before=None, after=None, reason=None, file_hash=None)`. GxP entries (flagged by sw_id's `gxp_flag`) require `reason` to be non-null — a `ValueError` is raised if missing. Called explicitly in every service function that mutates data.

---

## 5. Frontend Architecture

### 5.1 Design System

The prototype's CSS custom properties and utility classes are extracted verbatim into `drl-design-system.css`:
- Color tokens: `--navy`, `--accent`, `--teal-m`, `--amber-m`, `--red-m`, `--blue-m`, `--purple-m`, `--green-m`, `--surf`, `--card`, `--bdr`, etc.
- Utility classes: `btn`, `btn-p`, `btn-o`, `btn-teal`, `tag`, `tr2`, `ta2`, `tg2`, `tb3`, `met`, `card`, `card-sm`, `tw`, `tw-body`, `sr`, `si`, `fi2`, `fg`, etc.
- All 11 module pages are built to visually match the prototype exactly

### 5.2 State Management (Zustand)

```
useAuthStore     — { user, token, role, login(), logout(), refreshToken() }
useAlertStore    — { unreadCount, fetchUnreadCount() }
useUIStore       — { drawerOpen, drawerContent, modalOpen, openDrawer(), closeDrawer() }
```

### 5.3 API Client

Axios instance with:
- `baseURL = import.meta.env.VITE_API_URL`
- Request interceptor: attaches `Authorization: Bearer {token}` header
- Response interceptor: handles 401 → calls `refreshToken()`, retries once; handles 403 → shows permission error

### 5.4 Routing

React Router v6. `PrivateRoute` component:
- Checks `useAuthStore.token` — redirects to `/login` if not present
- Checks role against required roles for the route
- COE_ADMIN: all routes
- APP_OWNER: Catalog (own), Entitlements (own), Discovery, Reconciliation (own), Alerts (own), Dashboard
- READ_ONLY: Dashboard, Cost Optimisation

---

## 6. Authentication

### 6.1 Local (Phase 1)

- `POST /auth/login` — takes `{email, password}`, returns `{access_token, refresh_token, user}`
- Access token: 1 hour expiry; Refresh token: 7 days
- `POST /auth/refresh` — exchanges refresh token for new access token
- `GET /auth/me` — returns current user from token

**Test users (created by `scripts/seed.py`):**
| Email | Password | Role |
|---|---|---|
| admin@drl.local | Admin123! | COE_ADMIN |
| appowner@drl.local | Owner123! | APP_OWNER |
| cio@drl.local | Read123! | READ_ONLY |

### 6.2 Production Upgrade Path (SAML/SSO)

When `AUTH_PROVIDER=saml` env var is set:
- `POST /auth/login` redirects to IdP (Azure AD or Okta)
- SAML assertion callback at `POST /auth/saml/callback` creates or updates user, sets `sso_sub`, issues JWT
- Rest of the app is unchanged — still uses the same JWT

---

## 7. Docker Setup

### 7.1 Local `docker-compose.yml`

```yaml
services:
  db:
    image: supabase/postgres:15.1.0.117
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: drl_sam

  storage:
    image: supabase/storage-api:v0.43.11
    ports: ["5000:5000"]
    environment:
      ANON_KEY: ...
      SERVICE_KEY: ...
      POSTGREST_URL: http://db:3000
      PGRST_JWT_SECRET: ...
      DATABASE_URL: postgresql://postgres:postgres@db:5432/drl_sam
      FILE_SIZE_LIMIT: 26214400     # 25 MB
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
    volumes:
      - supabase_storage:/var/lib/storage

  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [db, storage]
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db:5432/drl_sam
      STORAGE_BACKEND: supabase
      SUPABASE_STORAGE_URL: http://storage:5000
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
    environment:
      VITE_API_URL: http://localhost:8000/api/v1
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev

volumes:
  supabase_storage:
```

### 7.2 Production (AWS ECS Fargate)

- **Frontend:** ECS Fargate service (`sam-frontend`), nginx serving built React bundle, ALB target group
- **Backend:** ECS Fargate service (`sam-backend`), uvicorn, ALB target group
- **Database:** RDS PostgreSQL 16 Multi-AZ, private subnet, security group allowing only ECS tasks
- **Storage:** S3 buckets `drl-sam-active` and `drl-sam-archive` with bucket policies
- **Environment:** AWS SSM Parameter Store for secrets (OPENAI_API_KEY, JWT_SECRET, DB password)
- **CI/CD:** GitHub Actions → build → push to ECR → update ECS service

---

## 8. Module API Surface

| Module | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` |
| Masters | `GET/POST /masters/categories`, `GET/POST/PUT/DELETE /masters/categories/{id}` · same pattern for vendors, metrics, sources, methods, regions, doa |
| App Owners | `GET/POST/PUT/DELETE /owners` · `GET/POST/PUT/DELETE /owners/doa` |
| Catalog | `GET /catalog` (paginated, filtered), `POST /catalog`, `GET/PUT /catalog/{sw_id}`, `GET /catalog/{sw_id}/aliases`, `POST /catalog/{sw_id}/aliases`, `GET /catalog/export` (XLSX) |
| Onboarding | `POST /onboarding/extract` (PDF → JSON), `GET/POST /onboarding/drafts`, `GET/PUT/DELETE /onboarding/drafts/{id}`, `POST /onboarding/publish` |
| Entitlements | `GET /entitlements` (paginated, filtered), `GET /entitlements/{ent_id}`, `PUT /entitlements/{ent_id}`, `GET /entitlements/template` (XLSX download), `POST /entitlements/upload` (Tab A + Tab B) |
| Discovery | `GET /discovery` (paginated, filtered), `POST /discovery/ingest` (CSV/XLSX upload) |
| Reconciliation | `POST /reconciliation/run`, `GET /reconciliation/results`, `GET /reconciliation/results/latest` |
| Alerts | `GET /alerts` (paginated, filtered by type/severity), `POST /alerts/{id}/read`, `GET /alerts/counts` (for notification bell) |
| Audit Trail | `GET /audit` (paginated, filtered by software/action/date), `GET /audit/export` (XLSX/PDF generation) |
| Cost Opt | `GET /cost-optimisation/scorecard` (ranked by est. annual saving) |
| Dashboard | `GET /dashboard/summary` (all metric cards in one call) |

---

## 9. Sub-project Build Order

| # | Sub-project | Deliverable |
|---|---|---|
| 1 | Foundation | docker-compose up, both containers healthy, DB schema migrated, 3 test users, login working, app shell with nav |
| 2 | Masters & App Owners | All 7 master tables with CRUD UI + API, App Owners + DOA hierarchy, all dropdowns populated from DB |
| 3 | Catalog + Onboarding | Software Catalog table + CRUD, 7-step wizard with AI contract extraction, alias management, draft save/resume |
| 4 | Entitlements + Discovery | Entitlement register, XLSX template download/upload (Tab A + Tab B), discovery records, S3/Supabase archival |
| 5 | Reconciliation + Alerts | Entitled vs. discovered logic, LLM recommendations, alert scheduler, alert pages + bell counter |
| 6 | Audit + Dashboard + Cost Opt | GxP audit trail + 90-day archival, audit export, cost scorecard, dashboard summary |

---

## 10. Key Constraints & Non-Functional Notes

- **GxP audit trail:** `audit_trail` table is INSERT-only at DB level. `created_at_utc` is set by DB server clock via trigger. GxP entries must include `reason_for_change`.
- **AI contract data security:** OpenAI API calls from backend only — contract text never leaves the server to the client before extraction. In production, consider Azure OpenAI (same API) for data residency compliance.
- **Storage abstraction:** `STORAGE_BACKEND` env var selects the implementation at startup. No code changes needed to switch local → production.
- **Performance targets (from PRD NFRs):** Page load < 2s, table render < 1s for 500 rows, LLM reconciliation run < 2 min for 113 titles, contract extraction < 30s.
- **Scalability:** Schema supports up to 1,000 software titles and 50,000 discovery records per cycle without index changes (index on `sw_id`, `ent_id`, `disc_id`, `created_at_utc`).
