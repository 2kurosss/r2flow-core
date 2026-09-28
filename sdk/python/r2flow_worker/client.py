from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class WorkerClient:
    """Нервная система курьера. Руки (python/1c/llm) пишешь ты, остальное — тут.

    Использование:
        w = WorkerClient("http://localhost:8000", "my-laptop", ["python:3.11"])
        await w.register()
        while True:
            for run in (await w.poll())["runs"]:
                ... твоя работа ...
                await w.set_status(run["run_id"], "completed")
            await asyncio.sleep(2)
    """

    core_url: str
    name: str = "worker"
    capabilities: list[str] = field(default_factory=lambda: ["python:3.11"])
    worker_id: str = ""
    timeout: float = 10.0

    async def register(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.post(
                f"{self.core_url}/api/workers",
                json={"name": self.name, "capabilities": self.capabilities},
            )
            r.raise_for_status()
            data = r.json()
            self.worker_id = data["id"]
            return data

    async def poll(self) -> dict[str, Any]:
        if not self.worker_id:
            await self.register()
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.get(f"{self.core_url}/api/workers/{self.worker_id}/poll")
            r.raise_for_status()
            return r.json()

    async def set_status(self, run_id: str, status: str, error: str | None = None) -> None:
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.post(
                f"{self.core_url}/api/runs/{run_id}/status",
                json={"status": status, "error": error},
            )
            r.raise_for_status()

    async def push_logs(self, run_id: str, lines: list[str]) -> None:
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.post(
                f"{self.core_url}/api/runs/{run_id}/logs",
                json=[{"message": m} for m in lines],
            )
            r.raise_for_status()

    async def claim(self, queue: str, run_id: str, lease_seconds: int = 120) -> dict[str, Any] | None:
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.post(
                f"{self.core_url}/api/queues/{queue}/claim",
                json={"run_id": run_id, "lease_seconds": lease_seconds},
            )
            r.raise_for_status()
            return r.json().get("item")

    async def heartbeat_item(
        self, queue: str, item_id: str, run_id: str, lease_seconds: int = 120
    ) -> None:
        """Продлить лизу долгой задачи, иначе claim вернет ее другому (см. cloud heartbeat)."""
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.post(
                f"{self.core_url}/api/queues/{queue}/items/{item_id}/heartbeat",
                json={"run_id": run_id, "lease_seconds": lease_seconds},
            )
            r.raise_for_status()

    async def loop(self, handler, poll_seconds: float = 2.0) -> None:
        """Вечный цикл курьера. handler(run, client) — твои руки.

        Старый формат handler(run) тоже работает для совместимости.
        """
        import inspect

        await self.register()
        takes_client = len(inspect.signature(handler).parameters) >= 2
        while True:
            data = await self.poll()
            for run in data.get("runs", []):
                if takes_client:
                    await handler(run, self)
                else:
                    await handler(run)
            await asyncio.sleep(poll_seconds)
