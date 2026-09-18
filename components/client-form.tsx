"use client";

import { useActionState } from "react";
import { createClientAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";

export function ClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, null);
  const error = state && "error" in state && state.error ? state.error : null;
  return (
    <form action={formAction} className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Тип клиента">
          <Select name="clientType" defaultValue="LEGAL">
            <option value="LEGAL">Юридическое лицо (ТОО/АО)</option>
            <option value="IE">Индивидуальный предприниматель</option>
            <option value="INDIVIDUAL">Физическое лицо</option>
          </Select>
        </Field>
        <Field label="БИН / ИИН (12 знаков)" hint="проверка контрольной суммы и дублей">
          <Input name="binIin" required maxLength={12} minLength={12} pattern="\d{12}" />
        </Field>
        <Field label="Наименование / ФИО">
          <Input name="name" required />
        </Field>
        <Field label="ОКЭД">
          <Input name="oked" required placeholder="например 49410" />
        </Field>
        <Field label="Дата регистрации">
          <Input name="registrationDate" type="date" required />
        </Field>
        <Field label="Группа связанных лиц">
          <Input name="groupId" placeholder="необязательно / GRP-###" />
        </Field>
        <Field label="Адрес">
          <Input name="address" required />
        </Field>
        <Field label="Телефон">
          <Input name="phone" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Создаю..." : "Создать клиента"}
        </Button>
        <Button type="reset" variant="outline">
          Сбросить
        </Button>
      </div>
    </form>
  );
}