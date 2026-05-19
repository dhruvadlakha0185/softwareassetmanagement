# DRL SAM Platform v3.0
### Software Asset Management — Dr. Reddy's Laboratories

A full-stack SAM platform purpose-built for pharmaceutical GxP compliance, license optimisation, and contract lifecycle management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite 5 · React Router 6 · Zustand · Axios |
| Backend | FastAPI · SQLAlchemy 2.0 (async) · asyncpg · Alembic |
| Database | PostgreSQL (Supabase local dev / AWS RDS production) |
| Storage | Supabase Storage (dev) / AWS S3 (production) |
| AI | OpenAI GPT-4o — contract extraction + reconciliation advisor |
| Scheduler | APScheduler — daily midnight alert generation |
| Auth | JWT (dev) / SAML SSO (production) |

---

## Modules

| Module | Description |
|---|---|
| **Dashboard** | Executive KPI cards — total SW titles, annual cost, potential savings, expiring contracts, utilisation chart, spend by category, GxP summary |
| **Software Catalog** | Canonical master list of all software. 15-column table with detail drawer. Category / GxP / App Owner filters. Alias management. |
| **Entitlements** | License register with 10-column table and rich side drawer. Bulk update via XLSX template (Tab A: metadata, Tab B: License Discovery). Contract renewal flow creates new SW_ID + ENT_ID. |
| **License Discovery** | Device-level software usage records. Upload via CSV/XLSX or via Tab B of the Entitlement template. 12-column table. |
| **Onboarding** | Two modes: (1) **Manual** — 6-step wizard with AI contract extraction, multi-line-item support (each line item = own SW_ID + ENT_ID); (2) **Bulk Upload** — XLSX master template creates multiple SW/ENT records in one pass. |
| **Reconciliation** | Computes entitled vs in-use, assigns statuses (OK / WATCH / OVER_DEPLOYED / UNDER_UTILISED). GPT-4o generates per-entitlement recommendations. Sorted by priority. |
| **Cost Optimisation** | Scorecard ranking right-size opportunities (UNDER_UTILISED) and risk exposure (OVER_DEPLOYED). Total Identifiable Savings + Risk Exposure hero cards. |
| **Audit Trail** | Append-only GxP 21 CFR Part 11 compliant audit log. Filters by entity type, action, SW_ID. XLSX export. |
| **Alerts & Notifications** | Renewal and utilisation alerts with severity levels (CRITICAL / HIGH / MEDIUM / INFO). Mark-read tracking per user. Daily APScheduler job. |
| **App Owners** | Owner master with DOA (Delegation of Authority) escalation hierarchy. |
| **Masters & Config** | Categories · Sub-categories · Regions · Vendors · License Metrics · Discovery Sources · Usage Update Methods |

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/v1/routes/    # FastAPI route handlers (one file per module)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── ai/           # GPT-4o contract extractor + recon advisor
│   │   │   ├── storage/      # StorageBackend ABC (Supabase + S3 implementations)
│   │   │   └── uploads/      # XLSX template generator + Tab A/B parsers
│   │   └── core/             # Config (pydantic-settings), database session, JWT auth
│   ├── alembic/              # Database migrations
│   └── scripts/              # seed.py (users/masters), seed_mock.py (24 SW + full dataset)
├── frontend/
│   └── src/
│       ├── api/              # Axios client + per-module API functions
│       ├── components/       # Layout (Sidebar, TopBar), shared UI
│       ├── pages/            # One folder per module
│       └── store/            # Zustand stores (auth, alerts)
├── supabase/                 # Supabase local config + migrations
└── docs/superpowers/         # Architecture specs and implementation plans
```

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker Desktop

### 1 — Start Supabase

```bash
supabase start
# Postgres runs on localhost:54322
# API gateway on localhost:54321
```

### 2 — Create the database

```bash
psql -h localhost -p 54322 -U postgres -c "CREATE DATABASE drl_sam;"
```

### 3 — Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Create .env (copy from project root .env.example and adjust)
cp ../.env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, SUPABASE_SERVICE_KEY

# Run migrations
alembic upgrade head

# Seed users + masters
python scripts/seed.py

# (Optional) Load mock dataset — 24 SW, 24 contracts, 24 entitlements
python scripts/seed_mock.py

# Start API server
uvicorn app.main:app --reload --port 8002
```

### 4 — Frontend

```bash
cd frontend
npm install
# Create .env
echo "VITE_API_URL=http://localhost:8002/api/v1" > .env
npm run dev
```

Open **http://localhost:3000**

---

## Default Credentials

| Role | Email | Password |
|---|---|---|
| COE Admin | admin@drl.local | Admin123! |
| App Owner | appowner@drl.local | Admin123! |
| Read Only (CIO) | cio@drl.local | Admin123! |

---

## Environment Variables (`backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `...@localhost:54322/drl_sam` |
| `JWT_SECRET` | Secret for signing JWT tokens | *(change in prod)* |
| `OPENAI_API_KEY` | GPT-4o API key for AI features | `dummy` (disables AI) |
| `STORAGE_BACKEND` | `supabase` or `s3` | `supabase` |
| `SUPABASE_URL` | Supabase gateway URL | `http://localhost:54321` |
| `SUPABASE_SERVICE_KEY` | Service role key from `supabase status` | — |
| `AWS_ACCESS_KEY_ID` | AWS credentials (prod only) | — |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials (prod only) | — |
| `AWS_S3_BUCKET_ACTIVE` | S3 bucket for active contracts | `drl-sam-active` |
| `AWS_S3_BUCKET_ARCHIVE` | S3 bucket for archived contracts | `drl-sam-archive` |

---

## Key Design Decisions

**GxP flag**: Stored internally as `no / yes_21cfr / yes_annex11 / yes_both`. Displayed everywhere as `GxP / Non-GxP` only. Framework detail is preserved for Phase 2.

**Contract renewal**: Creates a new SW_ID + ENT_ID + Contract record. Old entitlement is set to EXPIRED and preserved in the register with `renewal_of` FK linking the chain.

**Multi-line-item onboarding**: Each line item in a contract (e.g. Microsoft EA) gets its own SW_ID, ENT_ID, and catalog entry. The `POST /onboarding/multi-publish` endpoint handles this.

**Bulk upload**: Template Tab A = entitlement metadata update; Tab B = License Discovery data. Uploadable from both the Entitlements page and the Discovery page.

**AI reconciliation**: When `OPENAI_API_KEY` is set to a real key, GPT-4o generates per-entitlement recommendations. Falls back to deterministic rule-based text when the key is absent or `dummy`.

**Storage abstraction**: `StorageBackend` ABC with `SupabaseStorageBackend` and `S3StorageBackend` implementations. Factory selects at startup based on `STORAGE_BACKEND` env var.

---

## Running Tests

```bash
cd backend
# Requires: supabase start + database running
pytest tests/ -v
```

Tests cover: auth flows, catalog CRUD, entitlement operations (19+ tests).

---

## API Documentation

With the backend running, visit:
- **Swagger UI**: http://localhost:8002/docs
- **ReDoc**: http://localhost:8002/redoc

---

## Production Deployment

The application is designed for AWS:
- **Backend**: ECS Fargate (Docker container) behind an ALB
- **Database**: Amazon RDS PostgreSQL
- **Storage**: Amazon S3 (active contracts + archives)
- **Auth**: Switch `AUTH_PROVIDER=saml` for SSO integration
- **Secrets**: Store all env vars in AWS SSM Parameter Store / Secrets Manager

See `docker/` and `.env.example` (production section) for deployment configuration.
