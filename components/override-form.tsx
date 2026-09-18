"use client";

import { useState } from "react";
import { overrideStopAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function OverrideForm({ applicationId, code }: { applicationId: string; code: string }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      <Field label="Комментарий руководителя рисков" hint="обязателен — фиксируется в аудите">
        <Input value={comment} onChange={(event) => setComment(event.target.value)} required placeholder="Обоснование решения по стоп-фактору" />
      </Field>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await overrideStopAction(applicationId, code, comment);
          if (result && "error" in result && result.error) setError(result.error);
          setBusy(false);
        }}
      >
        {busy ? "Обрабатываю..." : `Оверрайд стоп-фактора ${code}`}
      </Button>
    </div>
  );
}