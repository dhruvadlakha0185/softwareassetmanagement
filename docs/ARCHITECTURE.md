# Architecture Document
## DRL SAM Platform v3.0

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DRL SAM Platform                                   │
│                                                                               │
│  ┌──────────────┐     HTTPS/REST      ┌──────────────────────────────────┐  │
│  │   React SPA   │◄──────────────────►│         FastAPI Backend           │  │
│  │  (Vite 5)    │                     │      (Python 3.11, Uvicorn)       │  │
│  │  Port 3000   │                     │           Port 8002               │  │
│  └──────────────┘                     └──────────────┬───────────────────┘  │
│                                                       │                       │
│                              ┌────────────────────────┼───────────────────┐  │
│                              │                        │                   │  │
│                    ┌─────────▼──────┐      ┌─────────▼──────┐            │  │
│                    │  PostgreSQL 15  │      │  File Storage   │            │  │
│                    │  (Supabase CLI) │      │  Supabase / S3  │            │  │
│                    │  Port 54322    │      │                 │            │  │
│                    └────────────────┘      └─────────────────┘            │  │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  External Services                                                    │   │
│  │  OpenAI GPT-4o (contract extraction + reconciliation advisor)        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture

### Technology Stack
| Component | Technology | Version |
|---|---|---|
| Framework | React | 18 |
| Build tool | Vite | 5 |
| Routing | React Router | 6 |
| State management | Zustand | 4 |
| HTTP client | Axios | 1.x |
| Styling | CSS variables + inline styles | — |

### Component Structure
```
frontend/src/
├── api/                     # Per-module Axios API functions
│   ├── client.js            # Base Axios instance with JWT interceptor + refresh
│   ├── catalog.js
│   ├── entitlements.js
│   ├── onboarding.js
│   ├── reconciliation.js
│   ├── discovery.js
│   ├── alerts.js
│   ├── audit.js
│   ├── costOpt.js
│   ├── dashboard.js
│   ├── masters.js
│   └── owners.js
├── components/
│   └── layout/
│       ├── Sidebar.jsx      # Navigation with live badges (unread alerts, savings)
│       └── TopBar.jsx
├── pages/                   # One directory per module
│   ├── Dashboard/
│   ├── Catalog/
│   ├── Entitlements/
│   ├── Onboarding/
│   ├── Reconciliation/
│   ├── CostOpt/
│   ├── Discovery/
│   ├── Alerts/
│   ├── AuditTrail/
│   ├── Owners/
│   └── Masters/
└── store/
    ├── authStore.js         # JWT token + user role state
    └── alertStore.js        # Unread alert count (polled every 5 min)
```

### Auth Flow
```
Login → POST /auth/login → {access_token, refresh_token}
         ↓
     localStorage + Zustand
         ↓
Every request → Authorization: Bearer {access_token}
         ↓
401 response → auto-refresh via POST /auth/refresh
         ↓
Refresh fails → redirect to /login
```

### Page Layout Pattern
All data-heavy pages use viewport-fit layout:
```
height: calc(100vh - 52px)   // subtract top bar
overflow: hidden             // no page scroll
  ├── Header (flexShrink: 0)
  ├── Filter bar (flexShrink: 0)
  └── Scrollable data area (flex: 1, overflow: auto)
       └── Sticky column headers (position: sticky, top: 0, zIndex: 2)
```

---

## 3. Backend Architecture

### Technology Stack
| Component | Technology | Version |
|---|---|---|
| Framework | FastAPI | 0.115 |
| ASGI server | Uvicorn | 0.32 |
| ORM | SQLAlchemy (async) | 2.0 |
| DB driver | asyncpg | 0.30 |
| Migrations | Alembic | 1.14 |
| Auth | python-jose (JWT) + argon2-cffi | — |
| AI | OpenAI Python SDK | ≥1.54 |
| Scheduler | APScheduler (AsyncIOScheduler) | ≥3.10 |
| PDF parsing | PyPDF2 + python-docx | — |
| Excel | openpyxl + xlrd | — |
| Cloud storage | boto3 (S3) | ≥1.35 |
| Validation | Pydantic v2 | — |
| Settings | pydantic-settings | 2.6 |

### Application Structure
```
backend/app/
├── main.py                  # FastAPI app + router registration + lifespan (scheduler)
├── core/
│   ├── config.py            # Settings via pydantic-settings (.env)
│   ├── database.py          # Async SQLAlchemy engine + session factory
│   └── security.py          # JWT create/verify, password hash/verify
├── api/
│   ├── deps.py              # get_current_user, require_role dependencies
│   └── v1/routes/           # One file per module (14 route files)
├── models/                  # SQLAlchemy ORM models (8 files)
├── schemas/                 # Pydantic request/response schemas
└── services/
    ├── ai/
    │   ├── contract_extractor.py    # GPT-4o PDF/DOCX extraction
    │   └── recon_advisor.py         # GPT-4o reconciliation + rule-based fallback
    ├── storage/
    │   ├── base.py                  # StorageBackend ABC
    │   ├── supabase_backend.py      # Supabase Storage implementation
    │   └── s3_backend.py            # AWS S3 implementation
    ├── uploads/
    │   └── xlsx_processor.py        # Template gen + Tab A/B parsers
    ├── reconciliation_engine.py     # Core recon logic + status assignment
    └── audit_logger.py              # Append-only audit trail writer
```

### Request Lifecycle
```
HTTP Request
    ↓
FastAPI Router
    ↓
Dependency injection (get_db, get_current_user, require_role)
    ↓
Route handler (async)
    ↓
SQLAlchemy async session (asyncpg)
    ↓
Database query / mutation
    ↓
audit_logger (if mutating)
    ↓
Pydantic response model serialization
    ↓
HTTP Response
```

### Background Scheduler
APScheduler `AsyncIOScheduler` starts with the FastAPI lifespan:
- **Daily 00:00 UTC** — `run_reconciliation()` → computes statuses, calls GPT-4o, generates alerts
- Scheduler runs in the same event loop as the FastAPI app (no separate process needed)

---

## 4. API Design

### Base URL
- Development: `http://localhost:8002/api/v1`
- Production: `https://sam.drl.com/api/v1`

### Authentication
All endpoints (except `/auth/login`, `/auth/refresh`) require:
```
Authorization: Bearer <JWT access token>
```

### Route Structure
| Prefix | Module | Auth |
|---|---|---|
| `/auth` | Authentication | Public |
| `/dashboard` | Dashboard summary | Any role |
| `/catalog` | Software catalog | Any role (write: COE_ADMIN) |
| `/entitlements` | Entitlements | Any role (write: COE_ADMIN) |
| `/onboarding` | Onboarding wizard | COE_ADMIN |
| `/reconciliation` | Reconciliation | Any role (run: COE_ADMIN) |
| `/cost-optimisation` | Cost scorecard | Any role |
| `/discovery` | Discovery records | Any role (ingest: any) |
| `/alerts` | Alerts | Any role |
| `/audit` | Audit trail | COE_ADMIN |
| `/owners` | App owners + DOA | COE_ADMIN |
| `/masters` | Reference data | Any role (write: COE_ADMIN) |
| `/admin` | Seed / admin ops | COE_ADMIN |

### Key Design Patterns
- **Route ordering:** Static paths (`/rows`, `/template`, `/bulk`) MUST be registered before dynamic paths (`/{id}`) to avoid FastAPI matching literals as path parameters
- **Bulk enrichment:** List endpoints use bulk IN queries to avoid N+1 (e.g., `list_entitlements` does 7 bulk queries)
- **Pydantic `model_copy(update={...})`** used to add resolved fields to ORM-validated models without duplicate key errors

---

## 5. Storage Architecture

### StorageBackend Abstraction
```python
class StorageBackend(ABC):
    async def upload(data: bytes, path: str, content_type: str) -> None
    async def download(path: str) -> bytes
    async def delete(path: str) -> None
```

### Implementations
| Backend | Use | Config |
|---|---|---|
| `SupabaseStorageBackend` | Local dev + staging | `STORAGE_BACKEND=supabase` |
| `S3StorageBackend` | Production | `STORAGE_BACKEND=s3` |
| `local` (fallback) | When storage is unavailable | Path stored as `local/...` |

### Storage Layout
```
contracts/
  {sw_id}/{timestamp}_{filename}.pdf         # Onboarded contracts
  renewals/{ent_id}/{timestamp}_{filename}.pdf # Renewal contracts

uploads/
  {user_id}/{timestamp}_{filename}.xlsx       # Usage template uploads
```

---

## 6. AI Integration

### Contract Extraction (GPT-4o)
1. User uploads PDF or DOCX
2. Text extracted via PyPDF2 / python-docx
3. Text sent to GPT-4o with structured JSON schema prompt
4. Returns: vendor_name, po_number, clm_id, dates, total_value, auto_renewal, line_items[]
5. AI-extracted fields flagged amber in UI for human verification
6. If OpenAI unavailable: user enters all fields manually

### Reconciliation Advisor (GPT-4o)
1. All entitlement contexts sent in one GPT-4o call (batch)
2. Returns: `[{ent_id, recommendation}]` array
3. Rule-based fallback generates deterministic recommendations when key is `"dummy"`:
   - OVER_DEPLOYED: cost exposure + audit risk message
   - UNDER_UTILISED: idle count + estimated saving + renewal recommendation
   - WATCH: utilisation warning
   - OK: no action required

---

## 7. Security Architecture

### Authentication
- **Development:** JWT HS256 with argon2id password hashing
- **Production:** SAML 2.0 SSO (`AUTH_PROVIDER=saml`) via DRL identity provider
- Access tokens: 60-minute expiry with automatic refresh

### Authorisation (RBAC)
| Role | Permissions |
|---|---|
| `COE_ADMIN` | Full read/write; run reconciliation; manage masters; export audit trail |
| `APP_OWNER` | Read catalog; upload usage template; view own alerts |
| `READ_ONLY` | Read-only access to all modules (dashboard, catalog, entitlements) |

### GxP Compliance
- Audit trail: INSERT-only — no UPDATE/DELETE on `audit_trail` table
- File tamper evidence: SHA-256 hash stored on every upload
- Before/after JSONB snapshots on every catalog and entitlement mutation
- All audit entries carry: user ID, IP address, session ID, UTC timestamp, GxP flag

---

## 8. Production Deployment Architecture (AWS)

```
Route 53 (DNS)
    ↓
ALB (HTTPS, SSL termination)
    ↓
ECS Fargate — Backend Container (FastAPI + Uvicorn)
    ↓
RDS PostgreSQL (Multi-AZ, ap-south-1)
    ↓
S3 Buckets
  drl-sam-active   (active contracts + uploads)
  drl-sam-archive  (archived contracts)

CloudFront (CDN)
    ↓
S3 Static Website (React build artefacts)

Secrets Manager → ECS task (DATABASE_URL, JWT_SECRET, OPENAI_API_KEY)
```

### Environment Variables (Production)
| Variable | Source |
|---|---|
| `DATABASE_URL` | Secrets Manager |
| `JWT_SECRET` | Secrets Manager |
| `OPENAI_API_KEY` | Secrets Manager |
| `AWS_ACCESS_KEY_ID` | IAM Role (no explicit key needed with task role) |
| `STORAGE_BACKEND` | `s3` |
| `AUTH_PROVIDER` | `saml` |
