"use client";

import { useState } from "react";
import { simulateTimeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";

export function TimeSimulator() {
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {result ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Системная дата: {result}. Все DPD, SLA и EWS пересчитаны.</div> : null}
      <div className="flex items-end gap-2">
        <Field label="Сдвинуть время на">
          <Select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={1}>1 день</option>
            <option value={30}>30 дней (месяц)</option>
            <option value={60}>60 дней</option>
            <option value={90}>90 дней (квартал)</option>
            <option value={365}>365 дней (год)</option>
          </Select>
        </Field>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setResult(null);
            const response = await simulateTimeAction(days);
            if (response && "error" in response && response.error) setError(response.error);
            if (response && "ok" in response) setResult(response.next ?? "");
            setBusy(false);
          }}
        >
          {busy ? "Перематываю..." : "Симулировать время"}
        </Button>
      </div>
      <p className="text-[11px] text-slate-400">Демо-приём: заявки просрочки «созреют» на 30/60/90 дней, SLA задач покажет нарушение сроков — идеально для показа процесса ворк-аута.</p>
    </div>
  );
}