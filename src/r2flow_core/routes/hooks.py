from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from r2flow_core.database import get_db
from r2flow_core.models import Queue, QueueItem, Run, RunStatus, Trigger
from r2flow_core.schemas import TriggerCreate

router = APIRouter(tags=["triggers"])


@router.get("/triggers")
async def list_triggers(db: AsyncSession = Depends(get_db)) -> dict:
    """Список будильников для пульта. hook_url виден оператору для копирования."""
    rows = (
        (await db.execute(select(Trigger).order_by(Trigger.created_at, Trigger.id)))
        .scalars()
        .all()
    )
    return {
        "triggers": [
            {
                "id": t.id,
                "name": t.name,
                "kind": t.kind,
                "queue_name": t.queue_name,
                "needs": t.needs or [],
                "enabled": t.enabled,
                "interval_seconds": t.interval_seconds,
                "next_run_at": t.next_run_at.isoformat() if t.next_run_at else None,
                "hook_url": f"/hooks/{t.id}/{t.secret}" if t.kind == "webhook" else None,
            }
            for t in rows
        ]
    }


@router.post("/triggers", status_code=201)
async def create_trigger(body: TriggerCreate, db: AsyncSession = Depends(get_db)) -> dict:
    """Создать будильник. Webhook сразу возвращает секретный URL."""
    now = datetime.now(UTC)
    nxt = None
    if body.kind == "interval" and body.interval_seconds:
        nxt = now + timedelta(seconds=body.interval_seconds)
    trig = Trigger(
        name=body.name,
        kind=body.kind,
        secret=secrets.token_urlsafe(16),
        interval_seconds=body.interval_seconds,
        queue_name=body.queue_name,
        needs=body.needs,
        next_run_at=nxt,
    )
    db.add(trig)
    await db.commit()
    await db.refresh(trig)
    return {"id": trig.id, "kind": trig.kind, "hook_url": f"/hooks/{trig.id}/{trig.secret}"}


@router.post("/hooks/{trigger_id}/{secret}", status_code=201)
async def fire_webhook(
    trigger_id: str, secret: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)
) -> dict:
    """Внешний мир дернул URL -> создали run или положили item в очередь."""
    trig = await db.get(Trigger, trigger_id)
    if trig is None or trig.secret != secret or not trig.enabled:
        raise HTTPException(status_code=404, detail="hook not found")
    payload = payload or {}
    if trig.queue_name:
        queue = (
            await db.execute(select(Queue).where(Queue.name == trig.queue_name))
        ).scalar_one_or_none()
        if queue is None:
            queue = Queue(name=trig.queue_name)
            db.add(queue)
            await db.flush()
        item = QueueItem(queue_id=queue.id, payload=payload)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return {"type": "queue_item", "item_id": item.id, "queue": queue.name}
    run = Run(needs=trig.needs or [], payload=payload, status=RunStatus.PENDING.value)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return {"type": "run", "run_id": run.id}
