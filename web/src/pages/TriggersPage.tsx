import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, RefreshCw } from "lucide-react";
import { api, type TriggerEntry } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/components/Modal";

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<"webhook" | "interval">("webhook");
  const [name, setName] = useState("");
  const [queue, setQueue] = useState("leads");
  const [needs, setNeeds] = useState("");
  const [interval, setInterval] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("имя обязательно");
      return;
    }
    const needsList = needs.split(",").map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (kind === "webhook") {
        await api.createTrigger(name.trim(), {
          kind,
          queue_name: queue.trim() || undefined,
          needs: needsList,
        });
      } else {
        const secs = Number(interval);
        if (!Number.isFinite(secs) || secs <= 0) {
          setError("интервал — положительное число секунд");
          return;
        }
        await api.createTrigger(name.trim(), {
          kind,
          interval_seconds: secs,
          queue_name: queue.trim() || undefined,
          needs: needsList,
        });
      }
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "не удалось создать триггер");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Новый триггер" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {(["webhook", "interval"] as const).map((k) => (
            <Button
              key={k}
              variant={kind === k ? "default" : "outline"}
              size="sm"
              onClick={() => setKind(k)}
            >
              {k}
            </Button>
          ))}
        </div>
        <Field>
          <FieldLabel htmlFor="t-name">Имя</FieldLabel>
          <Input
            id="t-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="site"
          />
        </Field>
        {kind === "interval" && (
          <Field>
            <FieldLabel htmlFor="t-interval">Интервал, секунд</FieldLabel>
            <Input
              id="t-interval"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="t-queue">Очередь (пусто — создавать run напрямую)</FieldLabel>
          <Input
            id="t-queue"
            value={queue}
            onChange={(e) => setQueue(e.target.value)}
            placeholder="leads"
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="t-needs">Needs для run (через запятую)</FieldLabel>
          <Input
            id="t-needs"
            value={needs}
            onChange={(e) => setNeeds(e.target.value)}
            placeholder="python:3.11"
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

function CopyHook({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`/api${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен */
    }
  }

  return (
    <span className="inline-flex max-w-72 items-center gap-1.5">
      <code className="truncate font-mono text-xs text-muted-foreground" title={`/api${url}`}>
        POST /api{url}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Скопировать hook URL"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-tag-green-tx" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

export function TriggersPage() {
  const [triggers, setTriggers] = useState<TriggerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listTriggers();
      setTriggers(data.triggers);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Triggers</h1>
          <p className="text-sm text-muted-foreground">
            webhook: внешний мир дернул URL → run или item · interval: планировщик ядра
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Trigger
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Загружаем…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : triggers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              триггеров пока нет — создай webhook для сайта
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Назначение</TableHead>
                  <TableHead>Hook URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {triggers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant={t.kind === "webhook" ? "default" : "secondary"}>
                        {t.kind}
                        {t.kind === "interval" && t.interval_seconds
                          ? ` · ${t.interval_seconds}c`
                          : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.queue_name ? `queue: ${t.queue_name}` : "run напрямую"}
                    </TableCell>
                    <TableCell>
                      {t.hook_url ? (
                        <CopyHook url={t.hook_url} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t.next_run_at ? `следующий: ${t.next_run_at}` : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={refresh} />}
    </div>
  );
}
