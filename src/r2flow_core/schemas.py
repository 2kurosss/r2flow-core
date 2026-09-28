from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class WorkerRegister(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    capabilities: list[str] = Field(default_factory=list)


class RunCreate(BaseModel):
    needs: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class QueueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    max_attempts: int = Field(default=3, ge=1, le=10)


class ItemAdd(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None


class ClaimRequest(BaseModel):
    run_id: str
    lease_seconds: int = Field(default=120, ge=10, le=3600)


class CompleteRequest(BaseModel):
    run_id: str
    status: str  # success | business_failed | system_failed
    error: str | None = None


class TriggerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    kind: str = "webhook"  # webhook | interval
    interval_seconds: int | None = None
    queue_name: str | None = None
    needs: list[str] = Field(default_factory=list)


class AssetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    value: str = ""


class LogPush(BaseModel):
    message: str = Field(min_length=1, max_length=20000)


class StepPush(BaseModel):
    tool: str = Field(min_length=1, max_length=255)
    tokens: int = Field(default=0, ge=0)
    cost_cents: int = Field(default=0, ge=0)
