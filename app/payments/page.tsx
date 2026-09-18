import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { moneyKzt } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { ImportStatementButton } from "@/components/import-statement-button";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const role = await requireRole();
  if (!can(role.code, "payments", "view")) return <div className="text-sm text-slate-500">Нет доступа к разделу «Платежи».</div>;

  const payments = await prisma.payment.findMany({
    include: { contract: { include: { application: { include: { client: { select: { name: true } } } } } } },
    orderBy: { date: "desc" },
    take: 60,
  });
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Платежи и выписки</h1>
          <p className="text-sm text-slate-500">зачисление вручную и импорт банковской выписки с дедупликацией по externalId</p>
        </div>
        {can(role.code, "payments", "create") ? <ImportStatementButton /> : null}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-slate-50 px-4 py-3"><div className="text-lg font-bold text-slate-900">{payments.length}</div><div className="text-[10px] uppercase text-slate-400">операций за период</div></div>
        <div className="rounded-lg bg-slate-50 px-4 py-3"><div className="text-lg font-bold text-slate-900">{moneyKzt(total)}</div><div className="text-[10px] uppercase text-slate-400">сумма поступлений</div></div>
        <div className="rounded-lg bg-slate-50 px-4 py-3"><div className="text-lg font-bold text-slate-900">{payments.filter((payment) => payment.source === "BANK").length}</div><div className="text-[10px] uppercase text-slate-400">из банковских выписок</div></div>
      </div>

      <Card>
        <CardHeader title="Журнал платежей" />
        <Table headers={["Дата", "Договор", "Клиент", "Сумма", "Источник", "Аллокация"]}>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <Td className="text-xs">{formatDate(payment.date)}</Td>
              <Td>
                <Link href={`/contracts/${payment.contractId}`} className="font-medium text-blue-700 hover:underline">{payment.contract.number}</Link>
              </Td>
              <Td className="max-w-[180px] truncate text-xs">{payment.contract.application.client.name}</Td>
              <Td className="font-semibold">{moneyKzt(payment.amount)}</Td>
              <Td><Badge variant={payment.source === "BANK" ? "blue" : "default"}>{payment.source === "BANK" ? "выписка" : "вручную"}</Badge></Td>
              <Td className="max-w-[200px] truncate text-[11px] text-slate-500">{payment.externalId ?? payment.id.slice(-6)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}