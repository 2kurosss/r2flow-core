# r2flow-core — PLAN (ready to flow)

> `r2flow = routine to flow` (история), `ready to flow` (слоган ядра).
> Ядро — 5 таблиц + auth. Всё остальное — плагины.

## 0. Принципы (не нарушать)

1. Ядро максимально простое: `runs, queues, triggers, assets, logs/steps/artifacts + auth/audit`. Ничего про Windows, ИИ, 1С внутри ядра.
2. Плагин = всё остальное: `executor` (руки), `tool` (умение, MCP), `trigger` (будильник), `ui-panel` (глаза). Общение с ядром только по HTTP.
3. Один юзер — один сценарий: solo (ноут/VPS), team (5 воркеров + approve), enterprise (on-prem + Windows + SSO). Один код, три сборки.

## 1. Архитектура

```
[r2flow-core: 1 бинарник + Postgres]
  core/api: runs, queues, triggers(cron+webhook), assets, logs/steps
  core/auth: JWT + ApiToken + AgentJoinToken + RBAC viewer/operator/admin

[workers — снаружи, poll-модель]
  python-worker (ноут/VPS) capabilities=[python:3.11]
  windows-worker capabilities=[windows-gui,1c]
  ai-worker capabilities=[llm,mcp]

[tools — MCP]
  http, postgres, telegram -> потом 1c, browser, s3

[triggers]
  cron (перенести scheduling.py как есть) + webhook POST /hooks/{id}
```

Контракт воркера (уже проверен в r2flow-cloud `routes/agents.py:321`):
`GET /api/workers/{id}/poll -> POST /status -> POST /logs -> repeat`
Роутинг по `capabilities/needs` + `SELECT ... FOR UPDATE SKIP LOCKED`.

Гибрид детерминизм+ИИ:
`детерминированный граф главный, ai-executor возвращает JSON, опасное -> QueueItem.waiting_approval -> человек жмет Approve -> детерминированный executor выполняет`.

## 2. Что переносим из r2flow-cloud (не переписываем)

- `models.py`: Queue/QueueItem (lease, heartbeat, idempotency_key, business_failed/system_failed), ProcessRun статусы + переходы 409, Asset Fernet+allowlist, AuditLog.
- `routes/queues.py`: claim/heartbeat/complete как есть.
- `routes/agents.py:321 poll`: логика dispatch + SKIP LOCKED.
- `scheduling.py`: wall-clock математика cron.
- `licensing.py`: идея community-лимитов -> позже team/enterprise флаги.
- НЕ переносим: landing, leads, drafts, packs-религию, windows_tools из ядра.

## 3. Фазы

**Фаза 0 — скелет (эта итерация):**
- [x] git init, LICENSE Apache-2.0, README, pyproject
- [x] `src/r2flow_core` скелет: config, models (5 таблиц), main (health/ready)
- [x] `sdk/python/r2flow_worker` скелет клиента poll/logs/claim
- [x] `plugins/official` заглушки: executors/python, triggers/webhook, tools/http
- [x] `compose/solo.yml` для локального старта
- [ ] `pytest` зеленый на импортах

**Фаза 1 — ядро живое (следующая):**
- перенести QueueItem claim/heartbeat/complete + waiting_approval
- worker poll по capabilities/needs
- webhook trigger POST /hooks/{id} -> run/item
- assets Vault + allowlist
- WS логи /ws/runs/{id} (минимум)

**Фаза 2 — Team-pack (закрытый аддон):**
- approvals UI + TG кнопки
- steps/traces с tokens/cost
- budgets max_steps/max_cost
- retention + audit export

**Фаза 3 — Enterprise-pack:**
- windows executor + pack vault sha256
- SSO/OIDC, on-prem compose, SLA

## 4. Репозитории

- `r2flow-core` (этот, open Apache-2.0): ядро + sdk + official plugins.
- `r2flow-cloud` (старый, legacy-v1): склад идей, не развивать.
- `r2flow-enterprise` (потом, closed): team/enterprise плагины + биллинг.
- Публичные примеры — в `sdk/` чтобы люди писали плагины не видя enterprise.

## 5. Метрики готовности

- solo за 2 мин: `docker compose -f compose/solo.yml up + r2flow worker --caps python` -> webhook -> run -> логи в UI.
- Team: 10к items через очередь без дублей (idempotency), 1 approve-кнопка работает.
- Ядро < 30 файлов, установка без Redis.
