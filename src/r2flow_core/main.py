"""r2flow-core — ready to flow."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from r2flow_core.config import get_settings
from r2flow_core.database import get_engine
from r2flow_core.models import Base
from r2flow_core.routes import assets, dashboard, hooks, queues, runs, workers


@asynccontextmanager
async def lifespan(app: FastAPI):
    if get_settings().AUTO_CREATE_TABLES:
        async with get_engine().begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # легкая миграция старого r2flow.db (create_all колонки не добавляет)
            from sqlalchemy import text as _text

            async def _ensure(col_check: str, alter: str) -> None:
                try:
                    await conn.execute(_text(alter))
                except Exception:
                    pass

            # runs.dispatched_at, triggers.last_fired_at/next_run_at
            await _ensure("", "ALTER TABLE runs ADD COLUMN dispatched_at TIMESTAMP")
            await _ensure("", "ALTER TABLE triggers ADD COLUMN last_fired_at TIMESTAMP")
            await _ensure("", "ALTER TABLE triggers ADD COLUMN next_run_at TIMESTAMP")
            # уникальность (queue_id, idempotency_key) для дедупа как в cloud
            try:
                await conn.execute(
                    _text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS "
                        "uq_items_queue_idem ON queue_items (queue_id, idempotency_key)"
                    )
                )
            except Exception:
                pass
    # фоновый планировщик interval-триггеров + reaper (порт cloud _trigger_poller, минимум)
    import asyncio as _asyncio

    from r2flow_core.scheduler import scheduler_loop

    task = _asyncio.create_task(scheduler_loop())
    try:
        yield
    finally:
        task.cancel()
        from contextlib import suppress as _suppress

        with _suppress(_asyncio.CancelledError):
            await task


app = FastAPI(title="r2flow-core", version="0.1.0", description="ready to flow", lifespan=lifespan)

app.include_router(workers.router, prefix="/api")
app.include_router(queues.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(hooks.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", include_in_schema=False)
async def ready() -> dict[str, str]:
    return {"status": "ready", "core": "runs/queues/triggers/assets/logs"}


def _web_dir() -> Path | None:
    here = Path(__file__).resolve()
    candidates = (
        here.parents[3] / "web" / "dist",  # репо: <root>/web/dist
        Path("/app/static"),  # docker: COPY web/dist -> /app/static
    )
    for c in candidates:
        if (c / "index.html").is_file():
            return c
    return None


_web = _web_dir()
if _web is not None:
    from fastapi.staticfiles import StaticFiles

    if (_web / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_web / "assets"), name="web-assets")

    index_html = _web / "index.html"

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(index_html)

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        protected = ("api/", "docs", "redoc", "openapi.json", "health", "ready", "ws/")
        if path.startswith(protected):
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(index_html)
