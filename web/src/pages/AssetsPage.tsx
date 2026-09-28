import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

export function AssetsPage() {
  const [name, setName] = useState("tg_bot");
  const [value, setValue] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("имя обязательно");
      return;
    }
    setBusy(true);
    try {
      await api.saveAsset(name.trim(), value);
      setOut(`сохранено: ${name.trim()}`);
      setRevealed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    setError(null);
    if (!name.trim()) {
      setError("имя обязательно");
      return;
    }
    setBusy(true);
    try {
      const a = await api.getAsset(name.trim());
      setValue(a.value);
      setOut(`загружено: ${a.name}`);
      setRevealed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "не найдено");
      setOut(null);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-3xl">Assets</h1>
        <p className="text-sm text-muted-foreground">
          волт: воркер забирает секрет по имени, листинга всего нет — так задумано
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Секрет</CardTitle>
          <CardDescription>
            токены ботов, ключи CRM — в коде и логах не светятся
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="asset-name">Имя</FieldLabel>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="tg_bot"
              className="font-mono"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset-value">Значение</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="asset-value"
                type={revealed ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="••••••"
                className="font-mono"
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRevealed((v) => !v)}
                aria-label={revealed ? "Скрыть" : "Показать"}
              >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={copy} aria-label="Скопировать">
                {copied ? (
                  <Check className="h-4 w-4 text-tag-green-tx" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Field>
          {error && <FieldError>{error}</FieldError>}
          {out && !error && <p className="text-sm text-tag-green-tx">{out}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={load} disabled={busy}>
              Загрузить
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "…" : "Сохранить"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
