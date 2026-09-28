"""Пример executor-плагина python: руки на SDK.

Запуск:
    python runner.py --core http://localhost:8100 --name laptop-1 --caps python:3.11
"""

import argparse
import asyncio

from r2flow_worker import WorkerClient


async def my_hands(run: dict, w: WorkerClient) -> None:
    """Полный цикл курьера: running -> logs -> completed. Без этого run висит."""
    rid = run["run_id"]
    print(f"take {rid} payload={run['payload']}")
    try:
        await w.set_status(rid, "running")
        await w.push_logs(rid, [f"start {rid}", f"payload={run['payload']}"])
        # ТВОЯ работа тут. Сейчас демо: сразу успех.
        await w.push_logs(rid, ["done"])
        await w.set_status(rid, "completed")
        print(f"completed {rid}")
    except Exception as e:  # noqa: BLE001 — курьер обязан отчитаться даже при падении
        print(f"failed {rid}: {e}")
        try:
            await w.set_status(rid, "failed", error=str(e))
        except Exception:
            pass


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--core", default="http://localhost:8000")
    p.add_argument("--name", default="laptop-1")
    p.add_argument("--caps", default="python:3.11")
    a = p.parse_args()
    caps = [c.strip() for c in a.caps.split(",") if c.strip()]
    w = WorkerClient(a.core, a.name, caps)
    print(f"worker {a.name} caps={caps} -> {a.core}")
    await w.loop(my_hands)


if __name__ == "__main__":
    asyncio.run(main())
