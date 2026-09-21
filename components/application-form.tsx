"use client";

import { useState } from "react";
import { completeAction } from "@/lib/client-navigation";
import { createApplicationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

export function ApplicationForm({ clients }: { clients: { id: string; name: string; binIin: string }[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (pending) return;
      const data = new FormData(event.currentTarget);
      setPending(true);
      setError(null);
      try {
        const result = await createApplicationAction(null, data);
        if (result.redirectTo) completeAction(undefined, result.redirectTo);
        else setError(result.error ?? "Не удалось сохранить данные");
      } catch { setError("Не удалось сохранить данные. Повторите попытку."); }
      finally { setPending(false); }
    }} className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Клиент">
          <Select name="clientId" required defaultValue="">
            <option value="" disabled>Выберите клиента</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name} · {client.binIin}</option>
            ))}
          </Select>
        </Field>
        <Field label="Продукт (предмет лизинга)">
          <Select name="product" defaultValue="Грузовой транспорт">
            <option>Автобус</option>
            <option>Грузовой транспорт</option>
            <option>Седельный тягач</option>
            <option>Экскаватор</option>
            <option>Станки</option>
            <option>Медицинское оборудование</option>
          </Select>
        </Field>
        <Field label="Стоимость предмета, ₸">
          <Input name="assetCost" required inputMode="numeric" placeholder="например 120000000" />
        </Field>
        <Field label="Первоначальный взнос, ₸">
          <Input name="downPayment" required inputMode="numeric" placeholder="например 24000000" />
        </Field>
        <Field label="Срок, мес.">
          <Select name="termMonths" defaultValue="36">
            {[12, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m} мес.</option>)}
          </Select>
        </Field>
        <Field label="Годовая ставка, %">
          <Input name="annualRate" required defaultValue="20" inputMode="decimal" />
        </Field>
        <Field label="Тип графика">
          <Select name="scheduleType" defaultValue="ANNUITY">
            <option value="ANNUITY">Аннуитет</option>
            <option value="DIFFERENTIATED">Дифференцированный</option>
          </Select>
        </Field>
      </div>
      <div className="text-xs text-slate-500">
        Сумма финансирования = стоимость − взнос. График считается ядром decimal.js (фактические дни, база 365, НДС 12%).
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Создаю..." : "Создать заявку (черновик)"}</Button>
    </form>
  );
}