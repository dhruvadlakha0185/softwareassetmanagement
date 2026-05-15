from fastapi import APIRouter, Depends
from app.api.deps import require_role

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/seed-mock", status_code=200)
async def seed_mock_data(
    current_user=Depends(require_role(["COE_ADMIN"])),
):
    """
    Load comprehensive mock dataset into the database.
    Idempotent — safe to call multiple times.
    COE_ADMIN only.
    """
    from scripts.seed_mock import seed_mock
    await seed_mock()
    return {"message": "Mock dataset seeded successfully. Refresh any page to see updated data."}
