from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from r2flow_core.database import get_db
from r2flow_core.models import Queue, QueueItem, Run, RunStatus, Trigger, Worker, WorkerStatus

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db)) -> dict:
    """Агрегат для пульта за один запрос. Порт идеи cloud GET /dashboard."""
    workers = (await db.execute(select(Worker))).scalars().all()
    online = sum(1 for w in workers if w.status == WorkerStatus.ONLINE.value)

    run_counts = dict(
        (
            await db.execute(
                select(Run.status, func.count(Run.id)).group_by(Run.status)
            )
        ).all()
    )
    runs_total = sum(run_counts.values())
    active = sum(
        run_counts.get(s, 0)
        for s in (
            RunStatus.PENDING.value,
            RunStatus.DISPATCHED.value,
            RunStatus.RUNNING.value,
        )
    )

    recent = (
        (await db.execute(select(Run).order_by(Run.created_at.desc()).limit(8)))
        .scalars()
        .all()
    )
    failures = (
        (
            await db.execute(
                select(Run)
                .where(Run.status == RunStatus.FAILED.value)
                .order_by(Run.created_at.desc())
                .limit(8)
            )
        )
        .scalars()
        .all()
    )

    queues = (await db.execute(select(Queue))).scalars().all()
    item_counts: dict[str, int] = {}
    if queues:
        rows = (
            await db.execute(
                select(QueueItem.status, func.count(QueueItem.id))
                .where(QueueItem.queue_id.in_([q.id for q in queues]))
                .group_by(QueueItem.status)
            )
        ).all()
        item_counts = dict(rows)

    triggers = (await db.execute(select(Trigger))).scalars().all()
    enabled = sum(1 for t in triggers if t.enabled)
    upcoming = sorted(
        [t for t in triggers if t.enabled and t.kind == "interval" and t.next_run_at],
        key=lambda t: t.next_run_at,  # type: ignore[union-attr]
    )[:5]

    def run_row(r: Run) -> dict:
        return {
            "run_id": r.id,
            "status": r.status,
            "needs": r.needs or [],
            "error": r.error,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }

    return {
        "workers": {
            "total": len(workers),
            "online": online,
            "offline": len(workers) - online,
            "list": [
                {"id": w.id, "name": w.name, "status": w.status} for w in workers[:20]
            ],
        },
        "runs": {
            "total": runs_total,
            "active": active,
            "by_status": run_counts,
        },
        "recent_runs": [run_row(r) for r in recent],
        "recent_failures": [run_row(r) for r in failures],
        "queues": {"total": len(queues), "items": item_counts},
        "triggers": {
            "enabled": enabled,
            "disabled": len(triggers) - enabled,
            "upcoming": [
                {
                    "id": t.id,
                    "name": t.name,
                    "queue_name": t.queue_name,
                    "next_run_at": t.next_run_at.isoformat() if t.next_run_at else None,
                }
                for t in upcoming
            ],
        },
    }
