"use client";

import { useState } from "react";
import { completeAction } from "@/lib/client-navigation";
import { importBankStatementAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function ImportStatementButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          const response = await importBankStatementAction();
          if ("ok" in response) {
            completeAction(`Импортировано: ${response.imported}, зачислено по графикам: ${response.allocated}, ранее учтено: ${response.skipped}${response.errors.length ? "\n" + response.errors.join("\n") : ""}`);
          } else setError(response.error);
        } catch { setError("Не удалось выполнить импорт. Повторите попытку."); }
        finally { setBusy(false); }
      }}>
        {busy ? "Импортирую..." : "Импортировать демо-выписку"}
      </Button>
    </div>
  );
}
