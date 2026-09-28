import { useCallback, useEffect, useState } from "react";
import { Inbox, Plus, RefreshCw } from "lucide-react";
import { api, type QueueEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { Modal } from "@/components/Modal";

const COUNT_ORDER = ["new", "in_progress", "success", "business_failed", "system_failed"];

function PushItemModal({
  queue,
  onClose,
  onPushed,
}: {
  queue: string;
  onClose: () => void;
  onPushed: () => void;
}) {
  const [payload, setPayload] = useState('{\n  "lead": 1\n}');
  const [idem, setIdem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deduped, setDeduped] = useState(false);

  async function save() {
    setError(null);
    setDeduped(false);
    let data: Record<string, unknown> = {};
    try {
      data = payload.trim() ? (JSON.parse(payload) as Record<string, unknown>) : {};
    } catch {
      setError("payload — невалидный JSON");
      return;
    }
    setSaving(true);
    try {
      const res = await api.addItem(queue, data, idem.trim() || undefined);
      if (res.deduped) setDeduped(true);
      onPushed();
      if (!res.deduped) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "не удалось положить item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`+ Item в ${queue}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="item-payload">Payload (JSON)</FieldLabel>
          <Textarea
            id="item-payload"
            rows={6}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-idem">Idempotency key (необязательно)</FieldLabel>
          <Input
            id="item-idem"
            value={idem}
            onChange={(e) => setIdem(e.target.value)}
            placeholder="lead-123 — дубли вернутся как deduped"
            className="font-mono"
          />
        </Field>
        {deduped && (
          <p className="text-sm text-tag-yellow-tx">
            Такой ключ уже есть — дубликат отклонен, старая задача на месте.
          </p>
        )}
        {error && <FieldError>{error}</FieldError>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Кладем…" : "Положить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function QueuesPage() {
  const [queues, setQueues] = useState<QueueEntry[]>([]);
  const [selected, setSelected] = useState("leads");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [showPush, setShowPush] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [qs, c] = await Promise.all([
        api.listQueues(),
        api.queueCounts(selected).catch(() => ({ counts: {} as Record<string, number> })),
      ]);
      setQueues(qs.queues);
      setCounts(c.counts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ядро недоступно");
    }
  }, [selected]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    await api.createQueue(name);
    setNewName("");
    setSelected(name);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Queues</h1>
          <p className="text-sm text-muted-foreground">
            транзакции: claim → complete, дубли по idempotency_key режутся
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="новая очередь…"
            className="w-44"
          />
          <Button variant="outline" onClick={create} disabled={!newName.trim()}>
            <Inbox className="h-4 w-4" />
            Create
          </Button>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Очереди</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {queues.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                очередей пока нет
              </p>
            )}
            {queues.map((q) => (
              <button
                key={q.name}
                type="button"
                onClick={() => setSelected(q.name)}
                className={
                  q.name === selected
                    ? "rounded-lg bg-secondary px-3 py-2 text-left text-sm font-semibold"
                    : "rounded-lg px-3 py-2 text-left text-sm text-foreground/75 transition-colors hover:bg-muted"
                }
              >
                <span className="block truncate font-mono">{q.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  max attempts: {q.max_attempts}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="font-mono text-base">{selected}</CardTitle>
                <CardDescription>
                  {total} задач всего · лиза и ретраи настраиваются очередью
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setShowPush(true)}>
                <Plus className="h-4 w-4" />
                Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {total === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                пусто — положи первый item
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Штук</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COUNT_ORDER.filter((s) => counts[s]).map((s) => (
                    <TableRow key={s}>
                      <TableCell>
                        <StatusBadge status={s} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{counts[s]}</TableCell>
                    </TableRow>
                  ))}
                  {Object.keys(counts)
                    .filter((s) => !COUNT_ORDER.includes(s))
                    .map((s) => (
                      <TableRow key={s}>
                        <TableCell>
                          <StatusBadge status={s} />
                        </TableCell>
                        <TableCell className="text-right font-mono">{counts[s]}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {showPush && (
        <PushItemModal queue={selected} onClose={() => setShowPush(false)} onPushed={refresh} />
      )}
    </div>
  );
}
