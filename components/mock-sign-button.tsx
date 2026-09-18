"use client";

import { useState } from "react";
import { signContractMockAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function MockSignButton({ contractId }: { contractId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <Button
        variant="success"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await signContractMockAction(contractId);
          if (result && "error" in result && result.error) setError(result.error);
          setBusy(false);
        }}
      >
        {busy ? "Подписываю..." : "Подписать ЭЦП"}
      </Button>
      <p className="text-[11px] text-slate-400">Мок: в продукте — интеграция с НУЦ РК (GOST), здесь фиксируется запись аудита с хешем.</p>
    </div>
  );
}