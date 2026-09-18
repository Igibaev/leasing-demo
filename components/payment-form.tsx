"use client";

import { useState } from "react";
import { createPaymentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

export function PaymentForm({ contractId }: { contractId: string }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <div className="flex gap-2">
        <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Сумма, ₸" inputMode="numeric" />
        <Button
          size="sm"
          disabled={busy || !amount}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await createPaymentAction(contractId, amount);
            if (result && "error" in result && result.error) setError(result.error);
            setBusy(false);
          }}
        >
          {busy ? "Зачисляю..." : "Зачислить"}
        </Button>
      </div>
      <p className="text-[11px] text-slate-400">Аллокация по приоритету: пени → комиссия → НДС → проценты → основной долг; обгчные сроки.</p>
    </div>
  );
}