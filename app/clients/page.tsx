import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const role = await requireRole();
  if (!can(role.code, "clients", "view")) return <div className="text-sm text-slate-500">Нет доступа к разделу «Клиенты».</div>;
  const { q } = await searchParams;
  const clients = await prisma.client.findMany({
    where: q
      ? { OR: [{ name: { contains: q } }, { binIin: { contains: q } }, { oked: { contains: q } }] }
      : undefined,
    include: { _count: { select: { applications: true, contracts: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const typeLabel: Record<string, string> = { LEGAL: "ТОО/АО", IE: "ИП", INDIVIDUAL: "Физлицо" };
  const ewsLabel: Record<string, { label: string; variant: "green" | "amber" | "red" | "default" }> = {
    GREEN: { label: "GREEN", variant: "green" },
    YELLOW: { label: "YELLOW", variant: "amber" },
    ORANGE: { label: "ORANGE", variant: "amber" },
    RED: { label: "RED", variant: "red" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Клиенты</h1>
          <p className="text-sm text-slate-500">БИН/ИИН с контрольной суммой · группы связанных лиц · EWS-цвет</p>
        </div>
        {can(role.code, "clients", "create") ? (
          <Link href="/clients/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Новый клиент
          </Link>
        ) : null}
      </div>

      <form action="/clients" className="flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Фильтр: наименование, БИН/ИИН, ОКЭД" className="h-9 w-72 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button className="rounded-md bg-slate-100 px-4 text-sm text-slate-700 hover:bg-slate-200">Фильтровать</button>
      </form>

      <Card>
        <CardHeader title={`Клиентская база · ${clients.length}`} />
        <Table headers={["Наименование", "Тип", "БИН/ИИН", "ОКЭД", "Город", "Заявки", "Договоры", "EWS", "Рейтинг"]}>
          {clients.map((client) => {
            const ews = ewsLabel[client.ewsColor] ?? ewsLabel.GREEN;
            return (
              <tr key={client.id}>
                <Td>
                  <Link href={`/clients/${client.id}`} className="font-medium text-blue-700 hover:underline">
                    {client.name}
                  </Link>
                  {client.groupId ? <span className="ml-2 text-[10px] text-violet-600">группа</span> : null}
                </Td>
                <Td>{typeLabel[client.clientType] ?? client.clientType}</Td>
                <Td className="font-mono text-xs">{client.binIin}</Td>
                <Td className="text-xs">{client.oked}</Td>
                <Td className="max-w-[160px] truncate text-xs">{client.address}</Td>
                <Td className="text-center">{client._count.applications}</Td>
                <Td className="text-center">{client._count.contracts}</Td>
                <Td>
                  <Badge variant={ews.variant}>{ews.label}</Badge>
                </Td>
                <Td>
                  <Badge variant={client.riskRating === "A" || client.riskRating === "B" ? "green" : client.riskRating === "C" ? "default" : "red"}>
                    {client.riskRating}
                  </Badge>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}