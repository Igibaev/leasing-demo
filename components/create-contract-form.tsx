"use client";

import { useState, useTransition } from "react";
import { createContractAction } from "@/app/actions";
import { completeAction } from "@/lib/client-navigation";
import { Button } from "@/components/ui/button";

export function CreateContractForm({ applicationId }: { applicationId: string }) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <p className="text-sm text-slate-500">Будут созданы договор, активный график из заявки и карточка предмета лизинга. Подпись — отдельное демонстрационное действие. Страховой полис не создаётся.</p>
      <Button
        disabled={busy}
        onClick={() => startTransition(async () => {
          setBusy(true);
          setError(null);
          const result = await createContractAction(applicationId);
          if (result && "redirectTo" in result && result.redirectTo) completeAction("Договор сформирован.", result.redirectTo);
          if (result && "error" in result && result.error) setError(result.error);
          setBusy(false);
        })}
      >
        {busy ? "Создаю..." : "Сформировать договор"}
      </Button>
    </div>
  );
}