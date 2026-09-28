import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Square, X } from "lucide-react";
import { api, shortId, type RunEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { StatusBadge } from "@/components/StatusBadge";
import { ColumnFilter } from "@/components/ColumnFilter";
import { Modal } from "@/components/Modal";

function distinct(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

function textMatch(hay: unknown, needle: string): boolean {
  if (!needle.trim()) return true;
  try {
    return JSON.stringify(hay ?? "")
      .toLowerCase()
      .includes(needle.trim().toLowerCase());
  } catch {
    return false;
  }
}

function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [needs, setNeeds] = useState("python:3.11");
  const [payload, setPayload] = useState('{\n  "hello": "world"\n}');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    let data: Record<string, unknown> = {};
    try {
      data = payload.trim() ? (JSON.parse(payload) as Record<string, unknown>) : {};
    } catch {
      setError("payload — невалидный JSON");
      return;
    }
    setSaving(true);
    try {
      await api.createRun(
        needs.split(",").map((s) => s.trim()).filter(Boolean),
        data,
      );
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "не удалось создать run");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Новый run" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="run-needs">Needs (capabilities через запятую)</FieldLabel>
          <Input id="run-needs" value={needs} onChange={(e) => setNeeds(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="run-payload">Payload (JSON)</FieldLabel>
          <Textarea
            id="run-payload"
            rows={6}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="font-mono"
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Создаем…" : "Создать"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LogsPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [live, setLive] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.runLogs(runId);
      setLines(data.logs.map((l) => l.message));
    } catch {
      /* ядро еще стартует */
    }
  }, [runId]);

  useEffect(() => {
    load();
    if (!live) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load, live]);

  return (
    <Card className="bg-spruce text-white">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="font-mono text-xs text-white/90">{runId}</CardTitle>
            <CardDescription className="text-white/50">
              {live ? "live — обновление каждые 2 c" : "пауза"}
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setLive((v) => !v)}>
              {live ? "Пауза" : "Live"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Закрыть логи">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="terminal-scroll max-h-72 overflow-y-auto font-mono text-xs whitespace-pre-wrap">
          {lines.length ? lines.join("\n") : "— пока пусто —"}
        </pre>
      </CardContent>
    </Card>
  );
}

export function RunsPage() {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [logsFor, setLogsFor] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [textFilter, setTextFilter] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api.listRuns();
      setRuns(data.runs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ядро недоступно");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const filtered = useMemo(
    () =>
      runs.filter(
        (r) =>
          (!statusFilter || r.status === statusFilter) &&
          textMatch({ id: r.run_id, needs: r.needs, payload: r.payload }, textFilter),
      ),
    [runs, statusFilter, textFilter],
  );

  async function stopRun(runId: string) {
    await api.setRunStatus(runId, "stopped");
    await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Runs</h1>
          <p className="text-sm text-muted-foreground">
            курьер забирает в poll и закрывает в completed
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Run
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Поиск по id / needs / payload…"
              className="max-w-xs"
            />
            {statusFilter && (
              <Badge variant="secondary" className="gap-1">
                {statusFilter}
                <button
                  type="button"
                  aria-label="Сбросить фильтр"
                  onClick={() => setStatusFilter("")}
                  className="ml-1 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} из {runs.length}
            </span>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Загружаем…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {runs.length === 0 ? "Пока пусто — жми + Run" : "Ничего не подошло под фильтры"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      Status
                      <ColumnFilter
                        label="Status"
                        value={statusFilter}
                        suggestions={distinct(runs.map((r) => r.status))}
                        onChange={setStatusFilter}
                      />
                    </span>
                  </TableHead>
                  <TableHead>Needs</TableHead>
                  <TableHead>Payload</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.run_id}>
                    <TableCell className="font-mono text-xs" title={r.run_id}>
                      {shortId(r.run_id)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {(r.needs ?? []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          (r.needs ?? []).map((n) => (
                            <Badge key={n} variant="secondary">
                              {n}
                            </Badge>
                          ))
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                      {JSON.stringify(r.payload)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setLogsFor(r.run_id)}>
                          Logs
                        </Button>
                        {(r.status === "running" || r.status === "dispatched") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => stopRun(r.run_id)}
                            aria-label="Остановить run"
                          >
                            <Square className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {logsFor && <LogsPanel runId={logsFor} onClose={() => setLogsFor("")} />}
      {showCreate && (
        <NewRunModal onClose={() => setShowCreate(false)} onCreated={refresh} />
      )}
    </div>
  );
}
