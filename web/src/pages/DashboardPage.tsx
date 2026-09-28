import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Cpu, Inbox, Play, Timer } from "lucide-react";
import { api, shortId, type DashboardData } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const RUN_STATUSES = [
  { key: "pending", label: "pending", bar: "bg-tag-yellow-bg" },
  { key: "dispatched", label: "dispatched", bar: "bg-tag-blue-bg" },
  { key: "running", label: "running", bar: "bg-primary" },
  { key: "completed", label: "completed", bar: "bg-tag-green-bg" },
  { key: "failed", label: "failed", bar: "bg-tag-red-bg" },
  { key: "stopped", label: "stopped", bar: "bg-tag-gray-bg" },
];

const QUEUE_COUNTS = [
  { key: "new", cls: "bg-tag-gray-bg text-tag-gray-tx" },
  { key: "in_progress", cls: "bg-secondary text-primary" },
  { key: "success", cls: "bg-primary text-white" },
  { key: "business_failed", cls: "bg-tag-yellow-bg text-tag-yellow-tx" },
  { key: "system_failed", cls: "bg-tag-red-bg text-tag-red-tx" },
];

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl leading-tight font-bold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return api
      .dashboard()
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const runTotal = data ? Math.max(data.runs.total, 1) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          живой обзор: воркеры, раны, очереди и ближайшие срабатывания
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-tag-red-bg p-4 text-sm text-tag-red-tx">{error}</div>
      )}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Cpu}
              label="Воркеры"
              value={`${data.workers.online} / ${data.workers.total}`}
              hint={`${data.workers.offline} offline`}
            />
            <StatCard
              icon={Play}
              label="Активные раны"
              value={data.runs.active}
              hint={`${data.runs.by_status.pending ?? 0} pending`}
            />
            <StatCard
              icon={Timer}
              label="Триггеры"
              value={data.triggers.enabled}
              hint={`${data.triggers.disabled} выключено`}
            />
            <StatCard
              icon={Inbox}
              label="Очереди"
              value={data.queues.total}
              hint={`${data.queues.items.new ?? 0} новых задач`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card size="sm">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Воркеры</CardTitle>
                <Badge variant="secondary">
                  {data.workers.online}/{data.workers.total} online
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.workers.list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Воркеры не зарегистрированы.
                  </p>
                ) : (
                  data.workers.list.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-1 py-1"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            w.status === "online" ? "bg-tag-green-tx" : "bg-tag-gray-tx",
                          )}
                        />
                        <span className="truncate font-mono text-sm font-medium">{w.name}</span>
                      </span>
                      <StatusBadge status={w.status} />
                    </div>
                  ))
                )}
                <Link to="/workers" className="block pt-1 text-xs text-primary hover:underline">
                  Все воркеры
                </Link>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Раны по статусам</CardTitle>
                <Badge variant="secondary">{data.runs.total} всего</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  {RUN_STATUSES.map(({ key, bar }) => {
                    const count = data.runs.by_status[key] ?? 0;
                    if (!count) return null;
                    return (
                      <div
                        key={key}
                        className={bar}
                        style={{ width: `${(count / runTotal) * 100}%` }}
                        title={`${key}: ${count}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-col gap-1.5">
                  {RUN_STATUSES.map(({ key, bar }) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", bar)} />
                        <span className="text-muted-foreground">{key}</span>
                      </span>
                      <span className="font-semibold">{data.runs.by_status[key] ?? 0}</span>
                    </div>
                  ))}
                </div>
                <Link to="/runs" className="block text-xs text-primary hover:underline">
                  Все раны
                </Link>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Ближайшие срабатывания</CardTitle>
                <Badge variant="secondary">{data.triggers.upcoming.length}</Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.triggers.upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет interval-триггеров.</p>
                ) : (
                  data.triggers.upcoming.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {t.queue_name ? `queue: ${t.queue_name}` : "run напрямую"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {t.next_run_at ? new Date(t.next_run_at).toLocaleString() : "—"}
                      </span>
                    </div>
                  ))
                )}
                <Link to="/triggers" className="block pt-1 text-xs text-primary hover:underline">
                  Все триггеры
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card size="sm" className="overflow-hidden py-0">
              <CardHeader className="pt-4 pb-3">
                <CardTitle>Последние раны</CardTitle>
              </CardHeader>
              {data.recent_runs.length === 0 ? (
                <CardContent className="pb-4 text-sm text-muted-foreground">
                  Ранов пока нет.
                </CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Статус</TableHead>
                      <TableHead>Run</TableHead>
                      <TableHead>Needs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent_runs.map((r) => (
                      <TableRow key={r.run_id}>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="font-mono text-xs" title={r.run_id}>
                          {shortId(r.run_id)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {(r.needs ?? []).join(", ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card size="sm" className="overflow-hidden py-0">
              <CardHeader className="flex-row items-center gap-2 pt-4 pb-3">
                <CardTitle>Последние падения</CardTitle>
                {data.recent_failures.length > 0 && (
                  <Badge variant="secondary">{data.recent_failures.length}</Badge>
                )}
                {data.recent_failures.length > 0 && (
                  <AlertTriangle className="h-4 w-4 text-tag-red-tx" />
                )}
              </CardHeader>
              {data.recent_failures.length === 0 ? (
                <CardContent className="pb-4 text-sm text-muted-foreground">
                  Падений нет — так держать.
                </CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Ошибка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent_failures.map((r) => (
                      <TableRow key={r.run_id}>
                        <TableCell className="font-mono text-xs" title={r.run_id}>
                          {shortId(r.run_id)}
                        </TableCell>
                        <TableCell className="max-w-72 truncate text-xs text-tag-red-tx">
                          {r.error ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          <Card size="sm">
            <CardContent className="flex flex-wrap items-center gap-1.5">
              {QUEUE_COUNTS.map(({ key, cls }) => (
                <span
                  key={key}
                  className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cls)}
                >
                  {key}: {data.queues.items[key] ?? 0}
                </span>
              ))}
              <Link to="/queues" className="ml-auto text-xs text-primary hover:underline">
                Все очереди
              </Link>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
