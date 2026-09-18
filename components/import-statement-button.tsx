"use client";

import { useState } from "react";
import { importBankStatementAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function ImportStatementButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; allocated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {result ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Импортировано: {result.imported}, зачислено по графикам: {result.allocated}</div> : null}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setResult(null);
          const response = await importBankStatementAction();
          if (response && "error" in response && response.error) setError(response.error);
          if (response && "ok" in response) setResult({ imported: response.imported ?? 0, allocated: response.allocated ?? 0 });
          setBusy(false);
        }}
      >
        {busy ? "Импортирую..." : "Импортировать выписку (mocks/bank-statement.csv)"}
      </Button>
    </div>
  );
}