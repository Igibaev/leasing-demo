import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, STATUS_LABEL, statusColor } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { moneyKzt } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const role = await requireRole();
  if (!can(role.code, "applications", "view")) return <div className="text-sm text-slate-500">Нет доступа к разделу «Заявки».</div>;
  const { q } = await searchParams;
  const applications = await prisma.application.findMany({
    where: q ? { OR: [{ number: { contains: q } }, { client: { name: { contains: q } } }] } : undefined,
    include: { client: true, workflowSteps: { orderBy: { seq: "asc" } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Заявки</h1>
          <p className="text-sm text-slate-500">маршрут согласования Maker-Checker · SLA в рабочих часах РК</p>
        </div>
        {can(role.code, "applications", "create") ? (
          <Link href="/applications/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Новая заявка
          </Link>
        ) : null}
      </div>

      <form action="/applications" className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Номер заявки или наименование клиента" className="h-9 w-72 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button className="rounded-md bg-slate-100 px-4 text-sm text-slate-700 hover:bg-slate-200">Найти</button>
      </form>

      <Card>
        <CardHeader title={`Реестр заявок · ${applications.length}`} />
        <Table headers={["Номер", "Клиент", "Продукт", "Сделка", "Финансируемо", "Срок", "Ставка", "Рейтинг", "Статус", ""]}>
          {applications.map((app) => (
            <tr key={app.id}>
              <Td>
                <Link href={`/applications/${app.id}`} className="font-medium text-blue-700 hover:underline">{app.number}</Link>
              </Td>
              <Td className="max-w-[200px] truncate">
                <Link href={`/clients/${app.clientId}`} className="text-xs text-slate-600 hover:underline">{app.client.name}</Link>
              </Td>
              <Td className="text-xs">{app.product}</Td>
              <Td>{moneyKzt(app.assetCost)}</Td>
              <Td>{moneyKzt(app.financedAmount)}</Td>
              <Td className="text-xs">{app.termMonths} мес.</Td>
              <Td className="text-xs">{app.annualRate}%</Td>
              <Td><Badge variant={["A", "B"].includes(app.riskRating) ? "green" : app.riskRating === "C" ? "default" : "red"}>{app.riskRating}</Badge></Td>
              <Td><Badge variant={statusColor(app.status)}>{STATUS_LABEL[app.status] ?? app.status}</Badge></Td>
              <Td><Link href={`/applications/${app.id}`} className="text-xs text-blue-700">Открыть →</Link></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}