import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.base import Base
import app.models  # noqa: F401 — registers all models so create_all sees them
from app.core.security import get_password_hash
from app.models.users import User

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:54322/drl_sam_test"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
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
    _factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with _factory() as session:
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
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@drl.local", "password": "Admin123!"},
    )
    return resp.json()["access_token"]
