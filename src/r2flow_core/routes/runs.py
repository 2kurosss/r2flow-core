from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from r2flow_core.database import get_db
from r2flow_core.hub import hub
from r2flow_core.models import Log, Run, RunStatus, Step
from r2flow_core.schemas import LogPush, StepPush

router = APIRouter(prefix="/runs", tags=["runs"])

ALLOWED = {
    RunStatus.RUNNING.value,
    RunStatus.COMPLETED.value,
    RunStatus.FAILED.value,
    RunStatus.STOPPED.value,
}


@router.get("")
async def list_runs(limit: int = 50, db: AsyncSession = Depends(get_db)) -> dict:
    """Список последних runs со статусами — для пульта."""
    rows = (
        (await db.execute(select(Run).order_by(Run.created_at.desc()).limit(min(limit, 200))))
        .scalars()
        .all()
    )
    return {
        "runs": [
            {"run_id": r.id, "status": r.status, "needs": r.needs, "payload": r.payload}
            for r in rows
        ]
    }


@router.post("/{run_id}/status")
async def set_status(run_id: str, body: dict, db: AsyncSession = Depends(get_db)) -> dict:
    run = await db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    status = str(body.get("status", ""))
    if status not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"unknown status {status}")
    run.status = status
    now = datetime.now(UTC)
    if status == RunStatus.RUNNING.value and run.started_at is None:
        run.started_at = now
    if status in (RunStatus.COMPLETED.value, RunStatus.FAILED.value, RunStatus.STOPPED.value):
        run.finished_at = now
    if body.get("error") is not None:
        run.error = str(body["error"])
    await db.commit()
    return {"run_id": run.id, "status": run.status}


@router.post("/{run_id}/logs", status_code=201)
async def push_logs(run_id: str, body: list[LogPush], db: AsyncSession = Depends(get_db)) -> dict:
    run = await db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    for entry in body:
        db.add(Log(run_id=run_id, message=entry.message))
    await db.commit()
    for entry in body:
        await hub.send(run_id, {"type": "log", "message": entry.message})
    return {"stored": len(body)}


@router.get("/{run_id}/logs")
async def list_logs(run_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        (
            await db.execute(
                select(Log).where(Log.run_id == run_id).order_by(Log.created_at).limit(500)
            )
        )
        .scalars()
        .all()
    )
    return {"logs": [{"message": r.message, "at": r.created_at.isoformat()} for r in rows]}


@router.post("/{run_id}/steps", status_code=201)
async def push_step(run_id: str, body: StepPush, db: AsyncSession = Depends(get_db)) -> dict:
    """Трейс для ИИ: tool, tokens, cost. Потом посчитаем $ по run."""
    run = await db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    db.add(Step(run_id=run_id, tool=body.tool, tokens=body.tokens, cost_cents=body.cost_cents))
    await db.commit()
    return {"status": "ok"}


@router.websocket("/ws/runs/{run_id}")
async def ws_logs(websocket: WebSocket, run_id: str) -> None:
    await hub.join(run_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        pass
    finally:
        hub.leave(run_id, websocket)
