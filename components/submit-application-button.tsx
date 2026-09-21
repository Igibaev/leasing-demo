"use client";

import { useState, useTransition } from "react";
import { completeAction } from "@/lib/client-navigation";
import { submitApplicationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function SubmitApplicationButton({ applicationId }: { applicationId: string }) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <Button className="w-full" disabled={busy}
        onClick={() => startTransition(async () => {
          setBusy(true);
          setError(null);
          try {
            const result = await submitApplicationAction(applicationId);
    if (result && "ok" in result) completeAction("Заявка передана на согласование.");
            if (result && "error" in result && result.error) setError(result.error);
          } catch {
            setError("Не удалось выполнить действие. Проверьте соединение и повторите.");
          } finally {
            setBusy(false);
          }
        })}>
        {busy ? "Отправляю..." : "Отправить на рассмотрение"}
      </Button>
    </div>
  );
}