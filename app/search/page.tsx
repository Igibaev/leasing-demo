import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { moneyKzt } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole();
  const { q = "" } = await searchParams;
  const query = q.trim();
  if (!query) return <div className="text-sm text-slate-500">Введите запрос в поле поиска.</div>;

  const [clients, applications, contracts] = await Promise.all([
    prisma.client.findMany({ where: { OR: [{ binIin: { contains: query } }, { name: { contains: query } }, { oked: { contains: query } }] }, take: 10 }),
    prisma.application.findMany({ where: { OR: [{ number: { contains: query } }, { client: { name: { contains: query } } }] }, include: { client: true }, take: 10 }),
    prisma.contract.findMany({ where: { OR: [{ number: { contains: query } }, { application: { client: { name: { contains: query } } } }] }, include: { application: { include: { client: true } } }, take: 10 }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Поиск: «{query}»</h1>
      {clients.length || applications.length || contracts.length ? null : <Card><CardBody className="py-6 text-center text-sm text-slate-400">Ничего не найдено.</CardBody></Card>}

      {clients.length > 0 ? (
        <Card>
          <CardHeader title={`Клиенты · ${clients.length}`} />
          <Table headers={["Наименование", "БИН/ИИН", "ОКЭД"]}>
            {clients.map((client) => (
              <tr key={client.id}>
                <Td><Link href={`/clients/${client.id}`} className="font-medium text-blue-700 hover:underline">{client.name}</Link></Td>
                <Td className="font-mono text-xs">{client.binIin}</Td>
                <Td className="text-xs">{client.oked}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {applications.length > 0 ? (
        <Card>
          <CardHeader title={`Заявки · ${applications.length}`} />
          <Table headers={["Номер", "Клиент", "Продукт", "Сумма", "Статус"]}>
            {applications.map((app) => (
              <tr key={app.id}>
                <Td><Link href={`/applications/${app.id}`} className="font-medium text-blue-700 hover:underline">{app.number}</Link></Td>
                <Td>{app.client.name}</Td>
                <Td className="text-xs">{app.product}</Td>
                <Td>{moneyKzt(app.financedAmount)}</Td>
                <Td>{app.status}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {contracts.length > 0 ? (
        <Card>
          <CardHeader title={`Договоры · ${contracts.length}`} />
          <Table headers={["Номер", "Клиент", "Сумма", "Статус"]}>
            {contracts.map((contract) => (
              <tr key={contract.id}>
                <Td><Link href={`/contracts/${contract.id}`} className="font-medium text-blue-700 hover:underline">{contract.number}</Link></Td>
                <Td>{contract.application.client.name}</Td>
                <Td>{moneyKzt(contract.amount)}</Td>
                <Td>{contract.status}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}