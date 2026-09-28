const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text}`);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type RunEntry = {
  run_id: string;
  status: string;
  needs?: string[];
  payload: unknown;
};

export type WorkerEntry = {
  id: string;
  name: string;
  capabilities: string[];
  status: string;
  last_heartbeat: string | null;
};

export type QueueEntry = { name: string; max_attempts: number };

export type TriggerEntry = {
  id: string;
  name: string;
  kind: string;
  queue_name: string | null;
  needs: string[];
  enabled: boolean;
  interval_seconds: number | null;
  next_run_at: string | null;
  hook_url: string | null;
};

export type DashboardData = {
  workers: {
    total: number;
    online: number;
    offline: number;
    list: Array<{ id: string; name: string; status: string }>;
  };
  runs: { total: number; active: number; by_status: Record<string, number> };
  recent_runs: Array<{
    run_id: string;
    status: string;
    needs: string[];
    error: string | null;
    created_at: string | null;
  }>;
  recent_failures: Array<{
    run_id: string;
    status: string;
    needs: string[];
    error: string | null;
    created_at: string | null;
  }>;
  queues: { total: number; items: Record<string, number> };
  triggers: {
    enabled: number;
    disabled: number;
    upcoming: Array<{
      id: string;
      name: string;
      queue_name: string | null;
      next_run_at: string | null;
    }>;
  };
};

export const api = {
  registerWorker: (name: string, capabilities: string[]) =>
    req<{ id: string; name: string; capabilities: string[] }>("/workers", {
      method: "POST",
      body: JSON.stringify({ name, capabilities }),
    }),
  listWorkers: () => req<{ workers: WorkerEntry[] }>("/workers"),
  createRun: (needs: string[], payload: Record<string, unknown> = {}) =>
    req<{ run_id: string; status: string }>("/workers/runs", {
      method: "POST",
      body: JSON.stringify({ needs, payload }),
    }),
  listRuns: () => req<{ runs: RunEntry[] }>("/runs"),
  setRunStatus: (runId: string, status: string) =>
    req(`/runs/${runId}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  runLogs: (runId: string) =>
    req<{ logs: Array<{ message: string; at: string }> }>(`/runs/${runId}/logs`),

  createQueue: (name: string, max_attempts = 3) =>
    req("/queues", { method: "POST", body: JSON.stringify({ name, max_attempts }) }),
  listQueues: () => req<{ queues: QueueEntry[] }>("/queues"),
  queueCounts: (name: string) =>
    req<{ queue: string; counts: Record<string, number> }>(`/queues/${name}/counts`),
  addItem: (name: string, payload: Record<string, unknown>, idempotency_key?: string) =>
    req<{ item_id: string; deduped?: boolean }>(`/queues/${name}/items`, {
      method: "POST",
      body: JSON.stringify(
        idempotency_key ? { payload, idempotency_key } : { payload },
      ),
    }),

  listTriggers: () => req<{ triggers: TriggerEntry[] }>("/triggers"),
  createTrigger: (
    name: string,
    opts: { queue_name?: string; needs?: string[]; kind?: string; interval_seconds?: number } = {},
  ) =>
    req<{ id: string; hook_url: string }>("/triggers", {
      method: "POST",
      body: JSON.stringify({ name, ...opts }),
    }),
  saveAsset: (name: string, value: string) =>
    req("/assets", { method: "POST", body: JSON.stringify({ name, value }) }),
  getAsset: (name: string) => req<{ name: string; value: string }>(`/assets/${name}`),
  health: () => fetch("/health").then((r) => r.json() as Promise<{ status: string }>),
  dashboard: () => req<DashboardData>("/dashboard"),
};

export function shortId(id: string, n = 8) {
  return id.length > n ? `${id.slice(0, n)}…` : id;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return "только что";
  if (s < 60) return `${s} c назад`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}
