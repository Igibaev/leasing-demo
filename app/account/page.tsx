import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { moneyKzt } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const role = await requireRole();
  if (!can(role.code, "clients", "crm")) return <div className="text-sm text-slate-500">Нет доступа к кабинету клиента.</div>;

  const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" }, take: 6 });
  const contracts = await prisma.contract.findMany({ where: { status: "ACTIVE" }, include: { application: { include: { client: true } }, paymentSchedules: { where: { isActive: true }, include: { lines: true } } }, take: 6 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Кабинет клиента (демо)</h1>
        <p className="text-sm text-slate-500">портал лизингополучателя: график, документы и заявления в одном окне.</p>
      </div>

      {clients.map((client) => {
        const clientContracts = contracts.filter((contract) => contract.application.clientId === client.id);
        return (
          <Card key={client.id}>
            <CardHeader
              title={client.name}
              subtitle={`БИН/ИИН ${client.binIin} · ${clientContracts.length} активных договоров`}
              action={
                <div className="flex gap-2">
                  <Link href={`/clients/${client.id}`} className="text-xs text-blue-700 hover:underline">Карточка →</Link>
                </div>
              }
            />
            {clientContracts.length === 0 ? (
              <CardBody className="text-sm text-slate-400">Договоров нет. Лизингополучатель может подать заявку на новый предмет лизинга.</CardBody>
            ) : (
              <Table headers={["Договор", "Срок", "Ставка", "Остаток графика", "Следующий платёж"]}>
                {clientContracts.map((contract) => {
                  const schedule = contract.paymentSchedules[0];
                  const lines = schedule?.lines ?? [];
                  const next = lines.find((line) => line.status === "OPEN" || line.status === "PARTIAL");
                  return (
                    <tr key={contract.id}>
                      <Td>
                        <Link href={`/contracts/${contract.id}`} className="font-medium text-blue-700 hover:underline">{contract.number}</Link>
                      </Td>
                      <Td className="text-xs">{contract.termMonths} мес.</Td>
                      <Td className="text-xs">{contract.annualRate}%</Td>
                      <Td>{moneyKzt(next?.balance ?? 0)}</Td>
                      <Td className="text-xs">{next ? `${next.dueDate} · ${moneyKzt(next.total)}` : "график погашен"}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        );
      })}
    </div>
  );
}