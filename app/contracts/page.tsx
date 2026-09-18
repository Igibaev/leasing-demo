import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { moneyKzt } from "@/lib/money";
import { formatDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const role = await requireRole();
  if (!can(role.code, "contracts", "view")) return <div className="text-sm text-slate-500">Нет доступа к разделу «Договоры».</div>;
  const contracts = await prisma.contract.findMany({
    include: { application: { include: { client: true } }, paymentSchedules: { where: { isActive: true }, include: { lines: true } }, asset: true },
    orderBy: { signDate: "desc" },
    take: 60,
  });
  const statusVariant: Record<string, "green" | "default" | "amber" | "red" | "outline"> = { ACTIVE: "green", APPROVED: "default", PARTIALLY_PAID: "amber", RESTRUCTURED: "amber", DEFAULTED: "red", CLOSED: "outline" };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Договоры лизинга</h1>
        <p className="text-sm text-slate-500">графики с версионированием (реструктуризация создаёт новую версию, а не стирает историю)</p>
      </div>
      <Card>
        <CardHeader title={`Портфель договоров · ${contracts.length}`} />
        <Table headers={["Договор", "Клиент", "Предмет", "Дата", "Сумма", "Срок", "Ставка", "Статус", ""]}>
          {contracts.map((contract) => (
            <tr key={contract.id}>
              <Td>
                <Link href={`/contracts/${contract.id}`} className="font-medium text-blue-700 hover:underline">{contract.number}</Link>
              </Td>
              <Td className="max-w-[200px] truncate">{contract.application.client.name}</Td>
              <Td className="max-w-[160px] truncate text-xs">{contract.asset?.name ?? contract.application.product}</Td>
              <Td className="text-xs">{formatDate(contract.signDate)}</Td>
              <Td>{moneyKzt(contract.amount)}</Td>
              <Td className="text-xs">{contract.termMonths} мес.</Td>
              <Td className="text-xs">{contract.annualRate}%</Td>
              <Td><Badge variant={statusVariant[contract.status] ?? "default"}>{contract.status}</Badge></Td>
              <Td><Link href={`/contracts/${contract.id}`} className="text-xs text-blue-700">Открыть →</Link></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}