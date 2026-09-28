"""Минимальный планировщик ядра. Порт идеи из cloud main.py:_trigger_poller.

Две задачи, без которых ядро не работает:
1. fire_due_intervals — kind=interval иначе никогда не стреляет.
2. reap_stuck_runs — упавший воркер иначе вешает run в dispatched навсегда.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from r2flow_core.database import session_factory
from r2flow_core.models import Queue, QueueItem, Run, RunStatus, Trigger

logger = logging.getLogger("r2flow_core.scheduler")

POLL_SECONDS = 5
STUCK_DISPATCHED_SECONDS = 300


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


async def fire_due_intervals(db: AsyncSession) -> int:
    """Создать Run/QueueItem по due interval-триггерам. Возвращает число выстрелов."""
    now = datetime.now(UTC)
    rows = (
        (
            await db.execute(
                select(Trigger)
                .where(
                    Trigger.enabled.is_(True),
                    Trigger.kind == "interval",
                    Trigger.interval_seconds.is_not(None),
                )
                .order_by(Trigger.created_at, Trigger.id)
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    fired = 0
    for trig in rows:
        interval = trig.interval_seconds or 0
        if interval <= 0:
            continue
        nxt = _aware(trig.next_run_at)
        if nxt is None:
            last = _aware(trig.last_fired_at)
            base = last if last is not None else _aware(trig.created_at)
            nxt = (base or now) + timedelta(seconds=interval)
            # первый тик после рестарта со старым триггером — сразу, не копим долг
            if nxt < now - timedelta(seconds=interval):
                nxt = now
        if nxt > now:
            # подтянуть пустой next_run_at чтобы не сканировать каждый тик вхолостую
            if trig.next_run_at is None:
                trig.next_run_at = nxt
            continue
        payload = {"trigger": trig.name, "at": now.isoformat()}
        if trig.queue_name:
            queue = (
                await db.execute(select(Queue).where(Queue.name == trig.queue_name))
            ).scalar_one_or_none()
            if queue is None:
                queue = Queue(name=trig.queue_name)
                db.add(queue)
                await db.flush()
            db.add(QueueItem(queue_id=queue.id, payload=payload))
        else:
            db.add(Run(needs=trig.needs or [], payload=payload, status=RunStatus.PENDING.value))
        trig.last_fired_at = now
        trig.next_run_at = now + timedelta(seconds=interval)
        fired += 1
    if fired:
        await db.commit()
    return fired


async def reap_stuck_runs(db: AsyncSession) -> int:
    """Вернуть в PENDING зависшие DISPATCHED (воркер забрал и умер)."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(seconds=STUCK_DISPATCHED_SECONDS)
    rows = (
        (
            await db.execute(
                select(Run)
                .where(Run.status == RunStatus.DISPATCHED.value)
                .order_by(Run.created_at, Run.id)
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    n = 0
    for run in rows:
        marker = _aware(run.dispatched_at) or _aware(run.created_at)
        if marker is not None and marker < cutoff:
            run.status = RunStatus.PENDING.value
            run.worker_id = None
            run.dispatched_at = None
            n += 1
    if n:
        await db.commit()
    return n


async def _tick() -> None:
    async with session_factory()() as db:
        try:
            fired = await fire_due_intervals(db)
            if fired:
                logger.info("scheduler fired %d interval trigger(s)", fired)
        except Exception:
            logger.exception("fire_due_intervals failed")
    async with session_factory()() as db:
        try:
            reaped = await reap_stuck_runs(db)
            if reaped:
                logger.info("reaped %d stuck run(s)", reaped)
        except Exception:
            logger.exception("reap_stuck_runs failed")


async def scheduler_loop() -> None:
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("scheduler tick failed")
        await asyncio.sleep(POLL_SECONDS + random.uniform(0, 1))
