"""
Idempotent seed — creates 3 local dev users if they don't exist.
Called automatically on startup when STORAGE_BACKEND=supabase|local.
Run manually: python -m scripts.seed
"""
import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.users import User
import app.models  # noqa — registers all models

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
            if result.scalar_one_or_none():
                print(f"  skip   {user_data['email']}")
                continue
            session.add(
                User(
                    email=user_data["email"],
                    full_name=user_data["full_name"],
                    hashed_password=get_password_hash(user_data["password"]),
                    role=user_data["role"],
                    bu=user_data["bu"],
                    is_active=True,
                )
            )
            print(f"  create {user_data['email']} [{user_data['role']}]")
        await session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
