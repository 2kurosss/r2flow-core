from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from r2flow_core.database import get_db
from r2flow_core.models import Run, RunStatus, Worker, WorkerStatus
from r2flow_core.schemas import RunCreate, WorkerRegister

router = APIRouter(prefix="/workers", tags=["workers"])


def _caps_ok(needs: list[str], caps: list[str]) -> bool:
    return all(n in caps for n in needs)


def _is_pg(db: AsyncSession) -> bool:
    """SKIP LOCKED только для Postgres. SQLite его не понимает — там обычный select."""
    try:
        bind = db.bind
        return bind is not None and bind.dialect.name == "postgresql"
    except Exception:
        return False


@router.post("", status_code=201)
async def register(body: WorkerRegister, db: AsyncSession = Depends(get_db)) -> dict:
    """Регистрация курьера. Перерегистрация по имени обновляет capabilities."""
    row = (await db.execute(select(Worker).where(Worker.name == body.name))).scalar_one_or_none()
    if row is None:
        row = Worker(
            name=body.name, capabilities=body.capabilities, status=WorkerStatus.ONLINE.value
        )
        db.add(row)
    else:
        row.capabilities = body.capabilities
        row.status = WorkerStatus.ONLINE.value
    row.last_heartbeat = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "name": row.name, "capabilities": row.capabilities}


@router.get("")
async def list_workers(db: AsyncSession = Depends(get_db)) -> dict:
    """Список курьеров для пульта: статус и capabilities."""
    rows = (
        (await db.execute(select(Worker).order_by(Worker.name))).scalars().all()
    )
    return {
        "workers": [
            {
                "id": w.id,
                "name": w.name,
                "capabilities": w.capabilities or [],
                "status": w.status,
                "last_heartbeat": w.last_heartbeat.isoformat() if w.last_heartbeat else None,
            }
            for w in rows
        ]
    }


@router.post("/{worker_id}/heartbeat")
async def heartbeat(worker_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    worker = await db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status_code=404, detail="worker not found")
    worker.status = WorkerStatus.ONLINE.value
    worker.last_heartbeat = datetime.now(UTC)
    await db.commit()
    return {"status": "ok"}


@router.get("/{worker_id}/poll")
async def poll(worker_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Курьер спрашивает работу. Отдаем pending runs под его capabilities.

    Как в cloud routes/agents.py:321: выдача PENDING->DISPATCHED в одной
    транзакции, на Postgres со SKIP LOCKED чтобы два poll не забрали то же.
    """
    worker = await db.get(Worker, worker_id)
    if worker is None:
        raise HTTPException(status_code=404, detail="worker not found")
    now = datetime.now(UTC)
    worker.last_heartbeat = now
    worker.status = WorkerStatus.ONLINE.value

    stmt = (
        select(Run)
        .where(Run.status == RunStatus.PENDING.value)
        .order_by(Run.created_at, Run.id)
        .limit(50)
    )
    if _is_pg(db):
        stmt = stmt.with_for_update(skip_locked=True)
    rows = (await db.execute(stmt)).scalars().all()
    taken: list[dict] = []
    for run in rows:
        if _caps_ok(run.needs or [], worker.capabilities or []):
            run.status = RunStatus.DISPATCHED.value
            run.worker_id = worker.id
            run.dispatched_at = now
            taken.append({"run_id": run.id, "needs": run.needs, "payload": run.payload})
            if len(taken) >= 5:
                break
    await db.commit()
    return {"runs": taken}


@router.post("/runs", status_code=201)
async def create_run(body: RunCreate, db: AsyncSession = Depends(get_db)) -> dict:
    run = Run(needs=body.needs, payload=body.payload, status=RunStatus.PENDING.value)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return {"run_id": run.id, "status": run.status}
