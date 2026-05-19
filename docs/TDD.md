# Technical Design Document
## DRL SAM Platform v3.0

---

## 1. System Overview

The DRL SAM Platform is a single-page application (SPA) backed by a REST API, with PostgreSQL as the primary data store and AWS S3/Supabase Storage for file archival. The system runs as two independently deployable services: a React frontend and a FastAPI backend.

---

## 2. Authentication & Session Management

### Token Flow
```
POST /api/v1/auth/login
  body: {email, password}
  response: {access_token, refresh_token, user: {id, email, role, full_name}}

POST /api/v1/auth/refresh
  body: {refresh_token}
  response: {access_token, refresh_token}
```

### Token Handling (Frontend)
- `access_token` stored in `localStorage` — expires 60 minutes
- `refresh_token` stored in `localStorage` — expires 7 days
- Axios request interceptor attaches `Authorization: Bearer {token}` to every request
- Axios response interceptor catches 401 → silently refreshes → retries original request
- On refresh failure → clears storage → redirects to `/login`

### Password Hashing
- `argon2-cffi` library, argon2id variant
- Separate argon2 exception import: `from argon2.exceptions import InvalidHash as InvalidHashError`

### Role Guards (Backend)
```python
# Dependency factory
def require_role(allowed: list[str]):
    async def _inner(user = Depends(get_current_user)):
        if user.role not in allowed:
            raise HTTPException(403)
        return user
    return _inner

# Usage
@router.post("/run", dependencies=[Depends(require_role(["COE_ADMIN"]))])
```

---

## 3. Database Access Patterns

### Async SQLAlchemy Setup
```python
engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

### Avoiding N+1 Queries
All list endpoints use bulk `IN` queries rather than per-row lookups:
```python
# Pattern used in list_entitlements, list_discovery, list_reconciliation_results
sw_ids = list({e.sw_id for e in ents})
sw_rows = await db.execute(
    select(SoftwareCatalog).where(SoftwareCatalog.sw_id.in_(sw_ids))
)
sw_map = {sw.sw_id: sw for sw in sw_rows.scalars()}
```

### Pydantic Model Enrichment
After ORM → Pydantic validation, resolved fields are added via `model_copy`:
```python
base = EntitlementOut.model_validate(ent)  # ORM → Pydantic (no resolved fields)
enriched = base.model_copy(update={       # Add resolved fields without duplicate key error
    "canonical_name": sw_map.get(ent.sw_id),
    "publisher": ...,
})
```
**Note:** Using `model_dump() + **spread + extra_kwargs` causes `TypeError: multiple values for keyword argument` since all Optional fields are already None in the dump.

---

## 4. Auto-Increment ID Generation

Both SW_IDs and ENT_IDs use sequential string IDs with collision avoidance:
```python
async def _next_sw_id(db):
    max_id = await db.scalar(
        select(func.max(SoftwareCatalog.sw_id)).where(SoftwareCatalog.sw_id.like("SW-%"))
    )
    n = int(max_id.split("-")[1]) + 1 if max_id else 1
    # Collision-safe loop (handles gaps from deleted records)
    while True:
        candidate = f"SW-{n:03d}"
        if not await db.get(SoftwareCatalog, candidate):
            return candidate
        n += 1
```

---

## 5. File Upload & Storage

### Upload Flow
```
1. Frontend selects file → FormData POST to /api/v1/entitlements/upload
2. Backend reads file bytes → computes SHA-256 hash
3. Check for duplicate hash (deduplication)
4. Archive previous upload to S3 (best-effort, non-blocking)
5. Upload new file to S3 path: uploads/{user_id}/{timestamp}_{filename}
6. Parse XLSX (Tab A + Tab B)
7. Apply updates to DB
8. Create UsageUpload record with file_hash, file_path, status
```

### StorageBackend Factory
```python
def get_storage_backend() -> StorageBackend:
    if settings.storage_backend == "s3":
        return S3StorageBackend(...)
    return SupabaseStorageBackend(settings.supabase_url, settings.supabase_service_key)
```
Storage failures are caught and stored as `local/{timestamp}_{filename}` — upload processing continues regardless.

### XLS → XLSX Conversion
Legacy `.xls` files are converted in-memory before parsing:
```python
def xls_to_xlsx(data: bytes) -> bytes:
    wb_src = xlrd.open_workbook(file_contents=data)
    wb_dst = Workbook()
    # Copy sheet by sheet
    ...
    return buf.getvalue()
```

---

## 6. XLSX Template System

### Tab A Parser (Entitlement Update)
Column layout (0-indexed):
- 0: ENT_ID (lookup key)
- 1: SW_ID (validation)
- 2–5: Locked reference columns
- 6: Contract Name (editable)
- 7: License Type (normalised to lowercase; invalid values → None)
- 8: Entitled Count
- 9: In-Use Count
- 10: Unit Cost INR
- 11: Annual Cost INR (auto-calc if blank: col 8 × col 10)
- 12: Notes

### Tab B Parser (License Discovery)
Column layout (0-indexed):
- 0: ENT_ID (reference)
- 1: SW_ID (reference)
- 2: Contract Software Name (→ discovery.contract_name)
- 3: Application Tagged
- 4: Data Source
- 5: Device Type (normalised: endpoint/server only)
- 6: Device ID
- 7: OS
- 8: Version
- 9: Last Seen (YYYY-MM-DD, handles datetime objects too)
- 10: Site ← **NEW (003)**
- 11: Region ← **NEW (003)**

### Lookup Resolution (Upload Route)
```python
async def _find_ent(ent_id, sw_id, ctx):
    if ent_id:
        ent = await db.get(Entitlement, ent_id)
        if ent and sw_id and ent.sw_id != sw_id:
            errors.append(f"{ctx}: ENT_ID {ent_id} belongs to {ent.sw_id}, not {sw_id}")
            return None
        return ent
    if sw_id:
        matches = (await db.execute(select(Entitlement).where(...))).scalars().all()
        if len(matches) > 1:
            errors.append(f"{ctx}: SW_ID {sw_id} has {len(matches)} entitlements — provide ENT_ID")
            return None
        return matches[0] if matches else None
    return None  # blank row
```

---

## 7. AI Integration Design

### Contract Extraction
```python
SCHEMA = """JSON schema with fields:
  vendor_name, po_number, clm_id, reseller,
  start_date (YYYY-MM-DD), end_date (YYYY-MM-DD),
  total_value_inr, auto_renewal_clause,
  line_items: [{contract_name, license_type, entitled_count,
                unit_cost_inr, annual_cost_inr, metric}]
"""

response = await client.chat.completions.create(
    model="gpt-4o",
    response_format={"type": "json_object"},
    messages=[system_prompt, user_content],
    temperature=0,
    timeout=60,
)
```

### Reconciliation Advisor Fallback Logic
```python
async def get_recommendations(contexts):
    if settings.openai_api_key and settings.openai_api_key != "dummy":
        try:
            result = await call_openai(contexts)
            if result:
                return result
        except Exception:
            pass  # fall through to rule-based
    return {ctx["ent_id"]: _rule_based(ctx) for ctx in contexts}
```

---

## 8. Reconciliation Engine

### Status Assignment Logic
```python
def _compute_recon_status(entitled, in_use):
    if not entitled or entitled == 0:
        return "OK"
    util = (in_use or 0) / entitled
    if util > 1.0:   return "OVER_DEPLOYED"
    if util > 0.9:   return "WATCH"
    if util < 0.3:   return "UNDER_UTILISED"
    return "OK"
```

### Contract Expiry Override
If a contract's `end_date < today`, the entitlement status is set to `EXPIRED` regardless of utilisation.

### Scheduler Wiring
```python
# app/main.py — lifespan context manager
@asynccontextmanager
async def lifespan(app):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(daily_recon, "cron", hour=0, minute=0, timezone="UTC")
    scheduler.start()
    yield
    scheduler.shutdown()
```

---

## 9. Audit Trail Implementation

### Logger Function
```python
async def log_event(db, user_id, action_type, entity_type, entity_id,
                    sw_id=None, before=None, after=None, is_gxp=False):
    db.add(AuditTrail(
        user_id=user_id,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=entity_id,
        sw_id=sw_id,
        before_values_json=before,
        after_values_json=after,
        is_gxp=is_gxp,
        created_at_utc=datetime.utcnow(),
    ))
    # Note: caller must commit — log_event only adds to session
```

### Immutability Enforcement
- No `UPDATE` or `DELETE` routes exist for `audit_trail`
- Database-level: INSERT-only role should be enforced in production via `GRANT INSERT ON audit_trail TO app_user`

---

## 10. Multi-Line-Item Onboarding

### Problem
A single enterprise contract (e.g., Microsoft EA) can cover multiple distinct software products. Each must have its own SW_ID, ENT_ID, and catalog entry.

### Solution: `POST /onboarding/multi-publish`
```
Input: one contract header + N line items
For each line item:
  1. Resolve SW_ID (existing canonical match) or create new catalog entry
  2. Create Contract record (linked to this SW_ID)
  3. Create Entitlement (with vendor_id from contract)
  4. Return {sw_id, ent_id, contract_id, canonical_name, is_new_sw}
```

### Canonical Name Resolution
- Exact case-insensitive match against `software_catalog.canonical_name`
- No longer blocked by UNIQUE constraint (migration 003)
- Match → use existing SW_ID
- No match → create new SW entry with metadata from line item

---

## 11. Contract Renewal Design

### Data Model
```
ENT-001 (status: EXPIRED) ←── renewal_of ──── ENT-025 (status: ACTIVE)
    └── SW-001                                      └── SW-025 (new, same canonical_name)
    └── Contract A (expired)                        └── Contract B (renewed)
```

### Renewal Endpoint
`POST /entitlements/{ent_id}/renew` — accepts `multipart/form-data`:
- Form fields: contract_name, po_number, clm_id, dates, entitled_count, unit/annual cost
- Optional file: contract_file (PDF/DOCX) → uploaded to `contracts/renewals/{ent_id}/...`

---

## 12. Known Design Decisions & Tradeoffs

| Decision | Rationale | Tradeoff |
|---|---|---|
| Sequential string IDs (SW-001) | Human-readable, used in audit docs and templates | Requires collision-safe generation logic (while loop) |
| `canonical_name` not unique | Required for contract renewal versioning | Deduplication must be handled at application layer |
| One Contract per line item | Clean data model; each software has its own contract record | Same PO number appears on N contracts (cosmetically redundant) |
| Annual cost stored explicitly | Faster aggregation; apps can override AI-extracted value | Must be kept in sync with unit_cost × entitled |
| Rule-based AI fallback | Zero downtime when OpenAI key is missing/invalid | Recommendations are less nuanced than GPT-4o output |
| Frontend-side search in some pages | Avoids extra DB round-trips for small datasets | Large catalogs (500+ entries) may need server-side pagination |
