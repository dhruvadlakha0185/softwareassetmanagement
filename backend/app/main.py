from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.masters import router as masters_router
from app.api.v1.routes.owners import router as owners_router
from app.api.v1.routes.catalog import router as catalog_router
from app.api.v1.routes.onboarding import router as onboarding_router
from app.api.v1.routes.entitlements import router as entitlements_router
from app.api.v1.routes.discovery import router as discovery_router
from app.api.v1.routes.reconciliation import router as reconciliation_router
from app.api.v1.routes.alerts import router as alerts_router
from app.api.v1.routes.audit import router as audit_router
from app.api.v1.routes.cost_opt import router as cost_opt_router
from app.api.v1.routes.dashboard import router as dashboard_router
from app.core.config import settings


async def _run_scheduled_alerts():
    from app.core.database import AsyncSessionLocal
    from app.services.alert_generator import generate_alerts
    async with AsyncSessionLocal() as db:
        count = await generate_alerts(db)
        print(f"[scheduler] Alert generator: {count} new alerts created")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.storage_backend in ("supabase", "local"):
        try:
            from scripts.seed import seed
            await seed()
        except Exception as e:
            print(f"Seed skipped: {e}")

    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(_run_scheduled_alerts, "cron", hour=0, minute=0, id="daily_alerts")
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="DRL SAM Platform API",
    version="3.0.0",
    description="Software Asset Management — Dr. Reddy's Laboratories",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(masters_router, prefix="/api/v1")
app.include_router(owners_router, prefix="/api/v1")
app.include_router(catalog_router, prefix="/api/v1")
app.include_router(onboarding_router, prefix="/api/v1")
app.include_router(entitlements_router, prefix="/api/v1")
app.include_router(discovery_router, prefix="/api/v1")
app.include_router(reconciliation_router, prefix="/api/v1")
app.include_router(alerts_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(cost_opt_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "drl-sam-backend"}
