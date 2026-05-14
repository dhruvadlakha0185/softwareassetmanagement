from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.deps import require_role
from app.core.security import get_password_hash
from app.models.users import User, DOAHierarchy
from app.schemas.owners import (
    AppOwnerCreate, AppOwnerUpdate, AppOwnerOut,
    DOACreate, DOAUpdate, DOAOut,
)

router = APIRouter(prefix="/owners", tags=["owners"])
admin_only = Depends(require_role(["COE_ADMIN"]))


# ── App Owners ────────────────────────────────────────────────────────────────
@router.get("", response_model=list[AppOwnerOut])
async def list_owners(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.role == "APP_OWNER", User.is_active == True)
    )
    return [AppOwnerOut.model_validate(u) for u in result.scalars().all()]


@router.post("", response_model=AppOwnerOut, status_code=201, dependencies=[admin_only])
async def create_owner(body: AppOwnerCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=get_password_hash(body.password),
        role="APP_OWNER",
        bu=body.bu,
        region_id=body.region_id,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return AppOwnerOut.model_validate(user)


@router.put("/{uid}", response_model=AppOwnerOut, dependencies=[admin_only])
async def update_owner(uid: UUID, body: AppOwnerUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return AppOwnerOut.model_validate(user)


@router.delete("/{uid}", status_code=204, dependencies=[admin_only])
async def deactivate_owner(uid: UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False   # soft delete — preserves FK references in entitlements
    await db.commit()


# ── DOA Hierarchy ─────────────────────────────────────────────────────────────
@router.get("/doa", response_model=list[DOAOut])
async def list_doa(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DOAHierarchy))
    rows = result.scalars().all()
    out = []
    for row in rows:
        user = await db.get(User, row.user_id)
        if not user:
            continue
        out.append(DOAOut(
            id=row.id, user_id=row.user_id, tier=row.tier,
            role_label=row.role_label, alert_scope=row.alert_scope,
            software_categories_json=row.software_categories_json,
            user=AppOwnerOut.model_validate(user),
        ))
    return out


@router.post("/doa", response_model=DOAOut, status_code=201, dependencies=[admin_only])
async def create_doa(body: DOACreate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, body.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found — create the user first via POST /owners")
    doa = DOAHierarchy(**body.model_dump())
    db.add(doa)
    await db.commit()
    await db.refresh(doa)
    return DOAOut(
        id=doa.id, user_id=doa.user_id, tier=doa.tier,
        role_label=doa.role_label, alert_scope=doa.alert_scope,
        software_categories_json=doa.software_categories_json,
        user=AppOwnerOut.model_validate(user),
    )


@router.put("/doa/{did}", response_model=DOAOut, dependencies=[admin_only])
async def update_doa(did: UUID, body: DOAUpdate, db: AsyncSession = Depends(get_db)):
    doa = await db.get(DOAHierarchy, did)
    if not doa:
        raise HTTPException(status_code=404, detail="DOA record not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(doa, k, v)
    await db.commit()
    await db.refresh(doa)
    user = await db.get(User, doa.user_id)
    return DOAOut(
        id=doa.id, user_id=doa.user_id, tier=doa.tier,
        role_label=doa.role_label, alert_scope=doa.alert_scope,
        software_categories_json=doa.software_categories_json,
        user=AppOwnerOut.model_validate(user),
    )


@router.delete("/doa/{did}", status_code=204, dependencies=[admin_only])
async def delete_doa(did: UUID, db: AsyncSession = Depends(get_db)):
    doa = await db.get(DOAHierarchy, did)
    if not doa:
        raise HTTPException(status_code=404, detail="DOA record not found")
    await db.delete(doa)
    await db.commit()
