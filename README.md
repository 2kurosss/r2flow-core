# r2flow-core — ready to flow

> **ready to flow** — поставил воркер, кинул задачу, она течет.

Легкий открытый рантайм для задач и ИИ-агентов. Solo, team, enterprise — один код, три сборки.

**Ядро (5 таблиц + auth, больше ничего):** `runs, queues, triggers, assets, logs/steps` + RBAC.
**Всё остальное — плагины:** `executors` (руки), `tools` (умения, MCP), `triggers` (будильники), `ui-panel` (глаза).

## Быстрый старт (solo, 2 минуты, без Docker)

Порт 8000 занят другим API (у тебя там 2koin)? Бери 8100 — всё настраивается одним числом.

```powershell
# вариант А — одним запуском (3 окна: ядро + пульт + курьер):
.\scripts\dev.ps1 -CorePort 8100
```

```powershell
# вариант Б — вручную:
pip install -e ".[dev]"
copy .env.example .env  # .env и *.db в git не коммитятся (см. .gitignore)
python -m uvicorn r2flow_core.main:app --reload --port 8100  # sqlite, таблицы сами
cd web; $env:CORE_PORT='8100'; npm run dev  # http://localhost:5173 -> proxy на :8100
# курьер:
$env:PYTHONPATH='src;sdk/python'
python plugins/official/executors/python/runner.py --core http://localhost:8100
```

## Конфигурация и безопасность

```powershell
copy .env.example .env
# заполни SECRET_KEY длинной случайной строкой для продакшена
```

* Локально: `DATABASE_URL=sqlite+aiosqlite:///./r2flow.db`, `AUTH_ENABLED=false` — нормально.
* В интернет так нельзя: включи `AUTH_ENABLED=true`, задай `SECRET_KEY`, смени пароль в `compose/solo.yml` (`r2flow_dev_password` — только для локальной разработки), закрой порт БД на `127.0.0.1`, наружу — только через HTTPS reverse proxy.
* В репозиторий никогда не коммитятся: `.env`, `*.db`, `__pycache__/`, `node_modules/`, `web/dist/`.

Сценарий целиком:

```bash
# 1. очередь + хук
curl -X POST localhost:8000/api/queues -H "Content-Type: application/json" -d '{"name":"leads"}'
curl -X POST localhost:8000/api/triggers -H "Content-Type: application/json" -d '{"name":"site","queue_name":"leads"}'
# -> {"hook_url": "/hooks/<id>/<secret>"}
# 2. сайт дергает хук -> item в очереди
curl -X POST localhost:8000/api/hooks/<id>/<secret> -H "Content-Type: application/json" -d '{"lead":1}'
# 3. воркер claim -> complete (success / business_failed / system_failed)
```

API docs: `http://localhost:8000/docs`

## Web-пульт (Vite + React + TS + Tailwind + shadcn-стиль на base-ui + lucide, палитра из r2flow-cloud)

```
web/  Runs / Queues / Workers / Triggers / Assets
```

```bash
cd web && npm install && npm run dev  # http://localhost:5173, /api проксируется на :8000
npm run build  # -> web/dist, бэк отдает сам ("/" + SPA-fallback, "/assets")
```

## Структура

```
src/r2flow_core/      ядро: config, models, database, main (+раздача web/dist)
sdk/python/r2flow_worker/  SDK воркера: poll -> execute -> logs/status
plugins/official/     примеры: executors/python, triggers/webhook, tools/http
web/                  пульт: Runs/Queues/Workers/Triggers/Assets
compose/              solo.yml / team.yml / enterprise.yml (потом)
tests/                pytest
PLAN.md               полный план
```

## Контракт воркера

Воркер — курьер. Сам спрашивает работу, ядро только раздает:

1. `GET /api/workers/{id}/poll` — забрать задачи под свои `capabilities`
2. выполнить (`python / docker / windows-gui / llm`)
3. `POST /status`, `POST /logs` — отчитаться

Роутинг по `capabilities/needs`, защита от двойной выдачи `SKIP LOCKED`.

## Статус

Фаза 1 — готово: poll по capabilities, очереди с лизами/идемпотентностью/ретраями,
webhook-хуки, assets, runs/logs/steps,
WS live-логи. Тесты: `pytest -q` зеленые.
Дальше по `PLAN.md`: Team-pack (трейсы/бюджеты) и Enterprise-pack.
