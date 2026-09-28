from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from r2flow_core.database import get_db
from r2flow_core.models import Queue, QueueItem, QueueItemStatus
from r2flow_core.schemas import ClaimRequest, CompleteRequest, ItemAdd, QueueCreate

router = APIRouter(prefix="/queues", tags=["queues"])

TERMINAL = {
    QueueItemStatus.SUCCESS.value,
    QueueItemStatus.BUSINESS_FAILED.value,
    QueueItemStatus.SYSTEM_FAILED.value,
}


def _is_pg(db: AsyncSession) -> bool:
    try:
        bind = db.bind
        return bind is not None and bind.dialect.name == "postgresql"
    except Exception:
        return False


async def _queue_or_404(name: str, db: AsyncSession) -> Queue:
    row = (await db.execute(select(Queue).where(Queue.name == name))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="queue not found")
    return row


@router.get("")
async def list_queues(db: AsyncSession = Depends(get_db)) -> dict:
    """Список очередей для пульта."""
    rows = (await db.execute(select(Queue).order_by(Queue.name))).scalars().all()
    return {"queues": [{"name": q.name, "max_attempts": q.max_attempts} for q in rows]}


@router.post("", status_code=201)
async def create_queue(body: QueueCreate, db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(Queue).where(Queue.name == body.name))).scalar_one_or_none()
    if row is not None:
        return {"id": row.id, "name": row.name}
    row = Queue(name=body.name, max_attempts=body.max_attempts)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "name": row.name}


@router.post("/{name}/items", status_code=201)
async def add_item(name: str, body: ItemAdd, db: AsyncSession = Depends(get_db)) -> dict:
    """Положить задачу. Дубли по idempotency_key возвращают старую строку.

    Как в cloud: сначала быстрый select, потом insert под UniqueConstraint
    (queue_id, idempotency_key). Гонку закрывает IntegrityError -> winner.
    """
    queue = await _queue_or_404(name, db)
    if body.idempotency_key:
        dup = (
            await db.execute(
                select(QueueItem).where(
                    QueueItem.queue_id == queue.id,
                    QueueItem.idempotency_key == body.idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            return {"item_id": dup.id, "deduped": True}
    item = QueueItem(queue_id=queue.id, payload=body.payload, idempotency_key=body.idempotency_key)
    db.add(item)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        winner = (
            await db.execute(
                select(QueueItem).where(
                    QueueItem.queue_id == queue.id,
                    QueueItem.idempotency_key == body.idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if winner is not None:
            return {"item_id": winner.id, "deduped": True}
        raise
    await db.refresh(item)
    return {"item_id": item.id, "deduped": False}


@router.post("/{name}/claim")
async def claim(name: str, body: ClaimRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Забрать одну NEW-задачу. Как в cloud routes/queues.py:261.

    1. bulk-expire просроченных лиз IN_PROGRESS->NEW,
    2. взять первую NEW со SKIP LOCKED (на Postgres).
    """
    queue = await _queue_or_404(name, db)
    now = datetime.now(UTC)
    # 1. вернуть просроченные в NEW одним update (атомарно, без гонок)
    await db.execute(
        update(QueueItem)
        .where(
            QueueItem.queue_id == queue.id,
            QueueItem.status == QueueItemStatus.IN_PROGRESS.value,
            QueueItem.lease_expires_at.is_not(None),
            QueueItem.lease_expires_at < now,
        )
        .values(status=QueueItemStatus.NEW.value, run_id=None, lease_expires_at=None)
    )
    # 2. взять первую NEW
    stmt = (
        select(QueueItem)
        .where(QueueItem.queue_id == queue.id, QueueItem.status == QueueItemStatus.NEW.value)
        .order_by(QueueItem.created_at, QueueItem.id)
        .limit(1)
    )
    if _is_pg(db):
        stmt = stmt.with_for_update(skip_locked=True)
    item = (await db.execute(stmt)).scalar_one_or_none()
    if item is None:
        await db.commit()
        return {"item": None}
    item.status = QueueItemStatus.IN_PROGRESS.value
    item.run_id = body.run_id
    item.attempts += 1
    item.lease_expires_at = now + timedelta(seconds=body.lease_seconds)
    await db.commit()
    await db.refresh(item)
    return {
        "item": {
            "item_id": item.id,
            "payload": item.payload,
            "attempts": item.attempts,
        }
    }


@router.post("/{name}/items/{item_id}/heartbeat")
async def heartbeat(
    name: str, item_id: str, body: ClaimRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    """Продлить лизу долгой задачи. Как в cloud: только IN_PROGRESS + свой run_id, иначе 409."""
    queue = await _queue_or_404(name, db)
    item = await db.get(QueueItem, item_id)
    if item is None or item.queue_id != queue.id:
        raise HTTPException(status_code=404, detail="item not found")
    if item.status != QueueItemStatus.IN_PROGRESS.value or item.run_id != body.run_id:
        raise HTTPException(status_code=409, detail="item is not in_progress for this run")
    item.lease_expires_at = datetime.now(UTC) + timedelta(seconds=body.lease_seconds)
    await db.commit()
    return {"item_id": item.id, "lease_expires_at": item.lease_expires_at.isoformat()}


@router.post("/{name}/items/{item_id}/complete")
async def complete(
    name: str, item_id: str, body: CompleteRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    """Завершить. system_failed ретраится пока attempts < max_attempts."""
    queue = await _queue_or_404(name, db)
    item = await db.get(QueueItem, item_id)
    if item is None or item.queue_id != queue.id:
        raise HTTPException(status_code=404, detail="item not found")
    if item.status != QueueItemStatus.IN_PROGRESS.value or item.run_id != body.run_id:
        raise HTTPException(status_code=409, detail="item is not in_progress for this run")
    if body.status == QueueItemStatus.SYSTEM_FAILED.value and item.attempts < queue.max_attempts:
        item.status = QueueItemStatus.NEW.value
        item.run_id = None
        item.lease_expires_at = None
        item.error = body.error
    elif body.status in TERMINAL:
        item.status = body.status
        item.error = body.error
        item.lease_expires_at = None
    else:
        raise HTTPException(status_code=400, detail=f"unknown status {body.status}")
    await db.commit()
    return {"item_id": item.id, "status": item.status}


@router.get("/{name}/counts")
async def counts(name: str, db: AsyncSession = Depends(get_db)) -> dict:
    queue = await _queue_or_404(name, db)
    rows = (
        await db.execute(
            select(QueueItem.status, func.count(QueueItem.id))
            .where(QueueItem.queue_id == queue.id)
            .group_by(QueueItem.status)
        )
    ).all()
    return {"queue": queue.name, "counts": dict(rows)}
