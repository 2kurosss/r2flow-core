import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api, timeAgo, type WorkerEntry } from "@/lib/api";
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
import { StatusBadge } from "@/components/StatusBadge";
import { Modal } from "@/components/Modal";

function RegisterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [caps, setCaps] = useState("python:3.11, http");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("имя обязательно");
      return;
    }
    setSaving(true);
    try {
      await api.registerWorker(
        name.trim(),
        caps.split(",").map((s) => s.trim()).filter(Boolean),
      );
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "не удалось зарегистрировать");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Новый воркер" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="w-name">Имя (уникальное, повторная регистрация обновит caps)</FieldLabel>
          <Input
            id="w-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="leads-1"
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="w-caps">Capabilities через запятую</FieldLabel>
          <Input
            id="w-caps"
            value={caps}
            onChange={(e) => setCaps(e.target.value)}
            placeholder="python:3.11, http"
            className="font-mono"
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Регистрируем…" : "Зарегистрировать"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReg, setShowReg] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listWorkers();
      setWorkers(data.workers);
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
          <h1 className="font-serif text-3xl">Workers</h1>
          <p className="text-sm text-muted-foreground">
            курьеры: заявляют capabilities, сами ходят в poll
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowReg(true)}>
            <Plus className="h-4 w-4" />
            Worker
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Загружаем…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : workers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              воркеров пока нет — зарегистрируй первого или запусти раннер
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead className="text-right">Heartbeat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-xs" title={w.id}>
                      {w.name}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={w.status} />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {w.capabilities.map((c) => (
                          <Badge key={c} variant="secondary">
                            {c}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {timeAgo(w.last_heartbeat)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showReg && <RegisterModal onClose={() => setShowReg(false)} onDone={refresh} />}
    </div>
  );
}
