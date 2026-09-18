import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { moneyKzt } from "@/lib/money";
import { getSystemDate } from "@/lib/audit";
import { overdueForLines } from "@/lib/overdue";

export const dynamic = "force-dynamic";

const BUCKET_ORDER = ["1–7", "8–30", "31–60", "61–90", "91–180", "180+"];

export default async function OverduePage() {
  const role = await requireRole();
  if (!can(role.code, "overdue", "view")) return <div className="text-sm text-slate-500">Нет доступа к реестру просрочки.</div>;
  const systemDate = await getSystemDate();
  const asOf = systemDate.slice(0, 10);

  const contracts = await prisma.contract.findMany({
    where: { status: "ACTIVE" },
    include: {
      paymentSchedules: { where: { isActive: true }, include: { lines: true } },
      application: { include: { client: { select: { name: true } } } },
    },
  });

  const rows = contracts.flatMap((contract) => {
    const schedule = contract.paymentSchedules[0];
    if (!schedule) return [];
    const state = overdueForLines(schedule.lines, asOf);
    return [{ contractId: contract.id, number: contract.number, clientName: contract.application.client.name, scheduledDate: schedule.lines.find((line) => line.status === "OPEN" || line.status === "PARTIAL")?.dueDate ?? null, ...state }];
  });
  const overdueRows = rows.filter((row) => row.dpd > 0).sort((a, b) => Number(b.overdueAmount) - Number(a.overdueAmount));
  const totalBook = overdueRows.reduce((sum, row) => sum + Number(row.overdueAmount), 0);

  const byBucket = BUCKET_ORDER.map((bucket) => ({
    bucket,
    count: overdueRows.filter((row) => row.bucket === bucket).length,
    amount: overdueRows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + Number(row.overdueAmount), 0),
  })).filter((item) => item.count > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Мониторинг просрочки</h1>
        <p className="text-sm text-slate-500">DPD пересчитывается от системной даты на каждом открытии реестра — не хранится «на доверии».</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        {byBucket.length === 0 ? <div className="text-sm text-slate-400">Просрочки нет.</div> : null}
        {byBucket.map((item) => (
          <div key={item.bucket} className="min-w-[150px] rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge variant={item.bucket === "91–180" || item.bucket === "180+" ? "red" : item.bucket === "31–60" || item.bucket === "61–90" ? "amber" : "default"}>{item.bucket}</Badge>
              <span className="text-[10px] uppercase text-slate-400">договоров {item.count}</span>
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900">{moneyKzt(item.amount)}</div>
          </div>
        ))}
        <div className="min-w-[150px] rounded-lg bg-red-50 px-4 py-3">
          <div className="text-[10px] uppercase text-red-400">итого книга</div>
          <div className="mt-1 text-lg font-bold text-red-700">{moneyKzt(totalBook)}</div>
        </div>
      </div>

      <Card>
        <CardHeader title={`Реестр · ${overdueRows.length} договоров`} subtitle={`системная дата ${asOf}`} />
        <Table headers={["Договор", "Клиент", "Ближайший платёж", "DPD", "Бакет", "Просрочено (осн.+проценты)", ""]}>
          {overdueRows.map((row) => (
            <tr key={row.contractId}>
              <Td>
                <Link href={`/contracts/${row.contractId}`} className="font-medium text-blue-700 hover:underline">{row.number}</Link>
              </Td>
              <Td className="max-w-[200px] truncate">{row.clientName}</Td>
              <Td className="text-xs">{row.scheduledDate ?? "—"}</Td>
              <Td className="font-mono">{row.dpd}</Td>
              <Td><Badge variant={row.dpd > 90 ? "red" : row.dpd > 30 ? "amber" : "default"}>{row.bucket}</Badge></Td>
              <Td className="font-semibold text-red-600">{moneyKzt(row.overdueAmount)}</Td>
              <Td><Link href={`/contracts/${row.contractId}`} className="text-xs text-blue-700">Открыть →</Link></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}