"use client";

import { useActionState, useState } from "react";
import { createMockDocumentAction, runAmlCheckAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

export function AddDossierDocument({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(createMockDocumentAction, null);
  return <form action={action} className="grid gap-3 md:grid-cols-4">
    <input type="hidden" name="clientId" value={clientId} />
    <Field label="Категория"><Select name="category" defaultValue="CORPORATE"><option value="CORPORATE">Учредительные</option><option value="FINANCIAL">Финансовые</option><option value="LEGAL">Заключения</option><option value="CONTRACT">Договорные</option><option value="INSURANCE">Страхование</option><option value="OTHER">Прочее</option></Select></Field>
    <Field label="Название"><Input name="name" required placeholder="Название документа" /></Field>
    <Field label="Действует до"><Input name="validUntil" type="date" /></Field>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Добавление..." : "Добавить мок-документ"}</Button></div>
    {state?.error ? <p className="text-xs text-red-600 md:col-span-4">{state.error}</p> : null}
    {state?.ok ? <p className="text-xs text-emerald-600 md:col-span-4">Документ добавлен в досье и аудит.</p> : null}
  </form>;
}

export function AmlCheckButton({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <div className="space-y-2"><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); const result = await runAmlCheckAction(clientId); setMessage(result.error ?? "Проверка завершена и сохранена в истории"); setBusy(false); }}>{busy ? "Проверяем..." : "Запустить мок-проверку ПОД/ФТ"}</Button>{message ? <p className="text-xs text-slate-500">{message}</p> : null}</div>;
}
