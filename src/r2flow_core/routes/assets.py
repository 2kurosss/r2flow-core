from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from r2flow_core.database import get_db
from r2flow_core.models import Asset
from r2flow_core.schemas import AssetCreate

router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("", status_code=201)
async def upsert(body: AssetCreate, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(Asset).where(Asset.name == body.name))).scalar_one_or_none()
    if row is None:
        row = Asset(name=body.name, value=body.value)
        db.add(row)
    else:
        row.value = body.value
    await db.commit()
    return {"name": row.name}


@router.get("/{name}")
async def get_one(name: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Воркер забирает секрет по имени. Листинга всего волта нет специально."""
    row = (await db.execute(select(Asset).where(Asset.name == name))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return {"name": row.name, "value": row.value}
