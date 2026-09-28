import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_phase1.db"
os.environ["AUTO_CREATE_TABLES"] = "false"

import pytest
from httpx import ASGITransport, AsyncClient

from r2flow_core import database
from r2flow_core.database import reset_engine
from r2flow_core.models import Base

database.reset_engine()


@pytest.fixture()
async def client():
    reset_engine()
    # чистая БД на каждый тест
    from r2flow_core.database import get_engine

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    from r2flow_core.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def test_poll_routing_by_capabilities(client):
    w_py = (
        await client.post("/api/workers", json={"name": "py", "capabilities": ["python:3.11"]})
    ).json()
    w_win = (
        await client.post("/api/workers", json={"name": "win", "capabilities": ["windows-gui"]})
    ).json()
    await client.post("/api/workers/runs", json={"needs": ["python:3.11"], "payload": {"a": 1}})
    py_poll = (await client.get(f"/api/workers/{w_py['id']}/poll")).json()
    win_poll = (await client.get(f"/api/workers/{w_win['id']}/poll")).json()
    assert len(py_poll["runs"]) == 1
    assert win_poll["runs"] == []


async def test_queue_idempotency_claim_complete(client):
    await client.post("/api/queues", json={"name": "invoices"})
    r1 = (
        await client.post(
            "/api/queues/invoices/items", json={"payload": {"n": 1}, "idempotency_key": "k1"}
        )
    ).json()
    r2 = (
        await client.post(
            "/api/queues/invoices/items", json={"payload": {"n": 1}, "idempotency_key": "k1"}
        )
    ).json()
    assert r1["item_id"] == r2["item_id"] and r2["deduped"] is True
    run = (await client.post("/api/workers/runs", json={"needs": [], "payload": {}})).json()
    claimed = (
        await client.post("/api/queues/invoices/claim", json={"run_id": run["run_id"]})
    ).json()
    assert claimed["item"] is not None
    done = (
        await client.post(
            f"/api/queues/invoices/items/{claimed['item']['item_id']}/complete",
            json={"run_id": run["run_id"], "status": "success"},
        )
    ).json()
    assert done["status"] == "success"


async def test_system_failed_retries(client):
    await client.post("/api/queues", json={"name": "q", "max_attempts": 2})
    await client.post("/api/queues/q/items", json={"payload": {}})
    run = (await client.post("/api/workers/runs", json={"needs": []})).json()
    c1 = (await client.post("/api/queues/q/claim", json={"run_id": run["run_id"]})).json()
    # attempts=1 < max=2 -> вернулся в NEW
    back = (
        await client.post(
            f"/api/queues/q/items/{c1['item']['item_id']}/complete",
            json={"run_id": run["run_id"], "status": "system_failed", "error": "boom"},
        )
    ).json()
    assert back["status"] == "new"
    c2 = (await client.post("/api/queues/q/claim", json={"run_id": run["run_id"]})).json()
    # attempts=2 == max -> терминал
    end = (
        await client.post(
            f"/api/queues/q/items/{c2['item']['item_id']}/complete",
            json={"run_id": run["run_id"], "status": "system_failed", "error": "boom"},
        )
    ).json()
    assert end["status"] == "system_failed"


async def test_webhook_run_and_queue(client):
    t1 = (await client.post("/api/triggers", json={"name": "h1", "kind": "webhook"})).json()
    fired = (await client.post(f"/api{t1['hook_url']}", json={"hello": "world"})).json()
    assert fired["type"] == "run"
    t2 = (
        await client.post(
            "/api/triggers", json={"name": "h2", "kind": "webhook", "queue_name": "leads"}
        )
    ).json()
    fired2 = (await client.post(f"/api{t2['hook_url']}", json={"lead": 1})).json()
    assert fired2["type"] == "queue_item"


async def test_assets_runs_logs_steps(client):
    await client.post("/api/assets", json={"name": "tg", "value": "secret"})
    got = (await client.get("/api/assets/tg")).json()
    assert got["value"] == "secret"
    run = (await client.post("/api/workers/runs", json={"needs": []})).json()
    rid = run["run_id"]
    await client.post(f"/api/runs/{rid}/status", json={"status": "running"})
    await client.post(f"/api/runs/{rid}/logs", json=[{"message": "hello"}])
    logs = (await client.get(f"/api/runs/{rid}/logs")).json()
    assert logs["logs"][0]["message"] == "hello"
    ok = (
        await client.post(
            f"/api/runs/{rid}/steps", json={"tool": "llm", "tokens": 100, "cost_cents": 5}
        )
    ).json()
    assert ok["status"] == "ok"
    await client.post(f"/api/runs/{rid}/status", json={"status": "completed"})


async def test_lists_for_console(client):
    await client.post("/api/workers", json={"name": "w1", "capabilities": ["python:3.11"]})
    await client.post("/api/queues", json={"name": "leads"})
    await client.post("/api/triggers", json={"name": "h", "kind": "webhook"})
    workers = (await client.get("/api/workers")).json()
    assert [w["name"] for w in workers["workers"]] == ["w1"]
    queues = (await client.get("/api/queues")).json()
    assert [q["name"] for q in queues["queues"]] == ["leads"]
    trigs = (await client.get("/api/triggers")).json()
    assert len(trigs["triggers"]) == 1
    assert trigs["triggers"][0]["hook_url"].startswith("/hooks/")


async def test_dashboard_aggregate(client):
    await client.post("/api/workers", json={"name": "w1", "capabilities": []})
    await client.post("/api/queues", json={"name": "leads"})
    await client.post("/api/queues/leads/items", json={"payload": {"a": 1}})
    await client.post("/api/workers/runs", json={"needs": [], "payload": {}})
    await client.post("/api/triggers", json={"name": "t", "kind": "interval", "interval_seconds": 60})
    d = (await client.get("/api/dashboard")).json()
    assert d["workers"]["total"] == 1 and d["workers"]["online"] == 1
    assert d["runs"]["total"] == 1
    assert d["queues"]["total"] == 1 and d["queues"]["items"]["new"] == 1
    assert d["triggers"]["enabled"] == 1
    assert len(d["recent_runs"]) == 1
