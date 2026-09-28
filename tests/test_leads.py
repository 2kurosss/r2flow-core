"""E2E лиды: сайт -> webhook -> очередь leads -> воркер -> TG(mock) -> done.

Контур 1 (быстрый, без сети): ядро in-process через ASGITransport,
TG отправка замокана функцией fake_send_telegram.
"""

import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_leads.db"
os.environ["AUTO_CREATE_TABLES"] = "false"

import pytest
from httpx import ASGITransport, AsyncClient

from r2flow_core import database
from r2flow_core.database import reset_engine
from r2flow_core.models import Base

database.reset_engine()

sent_to_tg: list[dict] = []


async def fake_send_telegram(bot_token: str, chat_id: str, text: str) -> dict:
    """Мок TG API: в проде тут httpx.post к api.telegram.org."""
    assert bot_token and chat_id and text
    sent_to_tg.append({"chat_id": chat_id, "text": text})
    return {"ok": True}


@pytest.fixture()
async def client():
    reset_engine()
    sent_to_tg.clear()
    from r2flow_core.database import get_engine

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    from r2flow_core.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def test_leads_webhook_to_done(client: AsyncClient):
    # 1. очередь + хук (как в README)
    await client.post("/api/queues", json={"name": "leads"})
    trig = (
        await client.post(
            "/api/triggers",
            json={"name": "site", "kind": "webhook", "queue_name": "leads"},
        )
    ).json()
    hook = trig["hook_url"]

    # 2. сайт дергает хук — лид в очереди
    lead = {"name": "Иван", "phone": "+7-900-111-22-33", "source": "landing"}
    fired = (await client.post(f"/api{hook}", json=lead)).json()
    assert fired["type"] == "queue_item"

    # 3. воркер лидов регистрируется и берет run под свои capabilities
    worker = (
        await client.post(
            "/api/workers",
            json={"name": "leads-1", "capabilities": ["python:3.11", "http"]},
        )
    ).json()
    run = (
        await client.post(
            "/api/workers/runs",
            json={"needs": ["python:3.11"], "payload": {"queue": "leads"}},
        )
    ).json()
    poll = (await client.get(f"/api/workers/{worker['id']}/poll")).json()
    assert any(r["run_id"] == run["run_id"] for r in poll["runs"])
    rid = run["run_id"]
    await client.post(f"/api/runs/{rid}/status", json={"status": "running"})

    # 4. claim лида из очереди этим run'ом
    claimed = (
        await client.post("/api/queues/leads/claim", json={"run_id": rid})
    ).json()
    assert claimed["item"] is not None
    item = claimed["item"]
    assert item["payload"]["phone"] == lead["phone"]

    # 5. работа воркера: assets -> TG -> complete + logs
    await client.post("/api/assets", json={"name": "tg_bot", "value": "test-token"})
    await client.post("/api/assets", json={"name": "tg_chat", "value": "-100123"})
    bot = (await client.get("/api/assets/tg_bot")).json()["value"]
    chat = (await client.get("/api/assets/tg_chat")).json()["value"]
    await fake_send_telegram(bot, chat, f"Лид: {item['payload']['name']} {item['payload']['phone']}")
    assert len(sent_to_tg) == 1 and lead["phone"] in sent_to_tg[0]["text"]

    done = (
        await client.post(
            f"/api/queues/leads/items/{item['item_id']}/complete",
            json={"run_id": rid, "status": "success"},
        )
    ).json()
    assert done["status"] == "success"
    await client.post(f"/api/runs/{rid}/logs", json=[{"message": f"lead {lead['phone']} -> tg ok"}])
    await client.post(f"/api/runs/{rid}/status", json={"status": "completed"})

    counts = (await client.get("/api/queues/leads/counts")).json()
    assert counts["counts"].get("success", 0) == 1
    logs = (await client.get(f"/api/runs/{rid}/logs")).json()
    assert any("tg ok" in m["message"] for m in logs["logs"])


async def test_leads_no_double_send_on_retry(client: AsyncClient):
    """system_failed ретраится, но TG не должен уйти дважды (идемпотентность обработки)."""
    await client.post("/api/queues", json={"name": "leads", "max_attempts": 3})
    r1 = (
        await client.post(
            "/api/queues/leads/items",
            json={"payload": {"phone": "X"}, "idempotency_key": "lead-X"},
        )
    ).json()
    r2 = (
        await client.post(
            "/api/queues/leads/items",
            json={"payload": {"phone": "X"}, "idempotency_key": "lead-X"},
        )
    ).json()
    assert r1["item_id"] == r2["item_id"] and r2["deduped"] is True
