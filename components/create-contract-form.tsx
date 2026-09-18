"use client";

import { useState } from "react";
import { createContractAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function CreateContractForm({ applicationId }: { applicationId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <p className="text-sm text-slate-500">Будет создан договор «ДЛ-2025-*», активный график из заявки, предмет лизинга и полис КАСКО.</p>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await createContractAction(applicationId);
          if (result && "error" in result && result.error) setError(result.error);
          setBusy(false);
        }}
      >
        {busy ? "Создаю..." : "Сформировать договор"}
      </Button>
    </div>
  );
}