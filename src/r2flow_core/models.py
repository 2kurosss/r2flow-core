from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_id() -> str:
    return str(uuid.uuid4())


class RunStatus(StrEnum):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class QueueItemStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    BUSINESS_FAILED = "business_failed"
    SYSTEM_FAILED = "system_failed"


class WorkerStatus(StrEnum):
    OFFLINE = "offline"
    ONLINE = "online"


class Worker(Base):
    """Курьер. Сам ходит в poll, заявляет capabilities: python, windows-gui, llm, gpu."""

    __tablename__ = "workers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=WorkerStatus.OFFLINE.value
    )
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class Run(Base):
    """Единица работы. Создается напрямую, по cron или через webhook."""

    __tablename__ = "runs"
    __table_args__ = (Index("ix_runs_status", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    worker_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True
    )
    needs: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=RunStatus.PENDING.value)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Queue(Base):
    __tablename__ = "queues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class QueueItem(Base):
    __tablename__ = "queue_items"
    __table_args__ = (
        Index("ix_items_queue_status", "queue_id", "status"),
        UniqueConstraint("queue_id", "idempotency_key", name="uq_items_queue_idem"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    queue_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("queues.id", ondelete="CASCADE"), nullable=False
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=QueueItemStatus.NEW.value
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True
    )
    lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class Trigger(Base):
    """Будильник. cron (Фаза 1: только интервал) или webhook."""

    __tablename__ = "triggers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="webhook")
    # webhook: секретная часть URL. cron: интервал в секундах.
    secret: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    interval_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    queue_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    needs: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class Asset(Base):
    """Секрет или текст. Воркеру выдается только по имени, без листинга всего волта."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class Log(Base):
    __tablename__ = "logs"
    __table_args__ = (Index("ix_logs_run", "run_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    level: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


class Step(Base):
    """Трейс для ИИ: каждый вызов tool/LLM с токенами и ценой."""

    __tablename__ = "steps"
    __table_args__ = (Index("ix_steps_run", "run_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    tool: Mapped[str] = mapped_column(String(255), nullable=False)
    tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
