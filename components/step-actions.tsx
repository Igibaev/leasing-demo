"use client";

import { useState, useTransition } from "react";
import { completeAction } from "@/lib/client-navigation";
import { decideStepAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function StepActions({ applicationId, stepId }: { applicationId: string; stepId: string }) {
  const [, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (decision: "APPROVE" | "REWORK" | "REJECT") => {
    setBusy(true);
    setError(null);
    try {
      const result = await decideStepAction(applicationId, stepId, decision, comment);
    if (result && "ok" in result) completeAction("Решение по шагу сохранено.");
      if (result && "error" in result && result.error) setError(result.error);
    } catch {
      setError("Не удалось выполнить действие. Проверьте соединение и повторите.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Комментарий (обязателен для отклонения)"
        className="h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex gap-2">
        <Button variant="success" size="sm" disabled={busy} onClick={() => startTransition(() => run("APPROVE"))}>Согласовать</Button>
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => startTransition(() => run("REJECT"))}>Отклонить</Button>
      </div>
    </div>
  );
}