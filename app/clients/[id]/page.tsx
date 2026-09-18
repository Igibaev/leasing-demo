import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, STATUS_LABEL, statusColor } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { formatDate } from "@/lib/datetime";
import { moneyKzt } from "@/lib/money";
import { calculateRatios, DEFAULT_RATIOS } from "@/lib/rules";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Общее" },
  { key: "finance", label: "Финансы и рейтинг" },
  { key: "applications", label: "Заявки" },
  { key: "contracts", label: "Договоры" },
  { key: "ews", label: "EWS и ПОД/ФТ" },
];

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const role = await requireRole();
  const { id } = await params;
  const { tab } = await searchParams;
  if (!can(role.code, "clients", "view")) return <div className="text-sm text-slate-500">Нет доступа.</div>;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      applications: { orderBy: { createdAt: "desc" }, include: { contract: true } },
      contracts: { include: { paymentSchedules: { where: { isActive: true }, include: { lines: true } }, asset: { include: { insurance: true } } } },
    },
  });
  if (!client) notFound();
  const finance = JSON.parse(client.financeJson || "{}") as Record<string, number>;
  const ctx: Record<string, string> = {
    revenue: String(finance.revenue ?? 0),
    ebitda: String(finance.ebitda ?? 0),
    debt: String(finance.debt ?? 0),
    cash: String(finance.cash ?? 0),
    equity: String(finance.equity ?? 0),
    netIncome: String(finance.netIncome ?? 0),
    averageAssets: String(finance.assets ?? 0),
    averageEquity: String(finance.equity ?? 0),
    operatingCashFlow: String((finance.ebitda ?? 0) * 0.7),
    debtService: String(((finance.debt ?? 0) / 12) + (finance.debt ?? 0) * 0.2),
    costOfSales: String((finance.revenue ?? 0) * 0.7),
    averageReceivables: String(finance.receivables ?? 0),
    averagePayables: String(finance.payables ?? 0),
    averageInventory: String(finance.inventory ?? 0),
  };
  let ratios: Record<string, string> = {};
  try {
    ratios = calculateRatios(ctx);
  } catch {
    ratios = {};
  }

  const typeLabel: Record<string, string> = { LEGAL: "ТОО/АО", IE: "ИП", INDIVIDUAL: "Физлицо" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
          <p className="text-sm text-slate-500">
            {typeLabel[client.clientType]} · БИН/ИИН {client.binIin} · ОКЭД {client.oked} · рег. {formatDate(client.registrationDate)}
          </p>
        </div>
        <Badge variant={client.ewsColor === "GREEN" ? "green" : client.ewsColor === "RED" ? "red" : "amber"}>{client.ewsColor}</Badge>
      </div>

      <div className="flex gap-1 border-b border-slate-200 text-sm">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/clients/${client.id}?tab=${item.key}`}
            className={`rounded-t-md px-4 py-2 font-medium ${tab === item.key ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {!tab || tab === "overview" ? (
        <Card>
          <CardHeader title="Реквизиты и связанные лица" />
          <CardBody className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div><span className="text-slate-400">Адрес: </span>{client.address}</div>
            <div><span className="text-slate-400">Телефон: </span>{client.phone}</div>
            <div><span className="text-slate-400">Email: </span>{client.email || "—"}</div>
            <div><span className="text-slate-400">Группа: </span>{client.groupId || "нет"}</div>
            <div><span className="text-slate-400">Статус: </span>{client.status}</div>
            <div><span className="text-slate-400">Оценка риска: </span><Badge variant="outline">{client.riskRating}</Badge></div>
          </CardBody>
        </Card>
      ) : null}

      {tab === "finance" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Финансовая отчётность" subtitle="условный период · коэффициенты из безопасного интерпретатора (без eval)" />
            <CardBody className="text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-xs text-slate-400">Выручка</span><div className="font-semibold">{moneyKzt(finance.revenue ?? 0)}</div></div>
                <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-xs text-slate-400">EBITDA</span><div className="font-semibold">{moneyKzt(finance.ebitda ?? 0)}</div></div>
                <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-xs text-slate-400">Долг</span><div className="font-semibold">{moneyKzt(finance.debt ?? 0)}</div></div>
                <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-xs text-slate-400">Капитал</span><div className="font-semibold">{moneyKzt(finance.equity ?? 0)}</div></div>
                <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-xs text-slate-400">Активы</span><div className="font-semibold">{moneyKzt(finance.assets ?? 0)}</div></div>
                <div className="rounded-md bg-slate-50 px-3 py-2"><span className="text-xs text-slate-400">Чистая прибыль</span><div className="font-semibold">{moneyKzt(finance.netIncome ?? 0)}</div></div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Коэффициенты" subtitle="Формулы хранятся строками и вычисляются интерпретатором" />
            <Table headers={["Показатель", "Значение"]}>
              {DEFAULT_RATIOS.map((ratio) => (
                <tr key={ratio.code}>
                  <Td className="text-xs">{ratio.name}</Td>
                  <Td className="font-mono text-xs">{ratios[ratio.code] ? Number(ratios[ratio.code]).toFixed(2) : "—"}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      ) : null}

      {tab === "applications" || !tab ? (
        <Card>
          <CardHeader title={`Заявки · ${client.applications.length}`} />
          <Table headers={["Номер", "Продукт", "Сумма сделки", "Статус", "Рейтинг", ""]}>
            {client.applications.map((app) => (
              <tr key={app.id}>
                <Td>
                  <Link href={`/applications/${app.id}`} className="font-medium text-blue-700 hover:underline">{app.number}</Link>
                </Td>
                <Td>{app.product}</Td>
                <Td>{moneyKzt(app.assetCost)}</Td>
                <Td><Badge variant={statusColor(app.status)}>{STATUS_LABEL[app.status] ?? app.status}</Badge></Td>
                <Td><Badge variant="outline">{app.riskRating}</Badge></Td>
                <Td><Link href={`/applications/${app.id}`} className="text-xs text-blue-700">→</Link></Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {tab === "contracts" ? (
        <Card>
          <CardHeader title={`Договоры · ${client.contracts.length}`} />
          <Table headers={["Номер", "Дата", "Сумма", "Срок", "Ставка", ""]}>
            {client.contracts.map((contract) => (
              <tr key={contract.id}>
                <Td>
                  <Link href={`/contracts/${contract.id}`} className="font-medium text-blue-700 hover:underline">{contract.number}</Link>
                </Td>
                <Td>{formatDate(contract.signDate)}</Td>
                <Td>{moneyKzt(contract.amount)}</Td>
                <Td>{contract.termMonths} мес.</Td>
                <Td>{contract.annualRate}%</Td>
                <Td><Link href={`/contracts/${contract.id}`} className="text-xs text-blue-700">→</Link></Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {tab === "ews" ? (
        <Card>
          <CardHeader title="EWS и мониторинг клиента" />
          <CardBody className="space-y-3 text-sm">
            <div>Цвет EWS: <Badge variant={client.ewsColor === "GREEN" ? "green" : client.ewsColor === "RED" ? "red" : "amber"}>{client.ewsColor}</Badge> {client.ewsReason ? <span className="text-xs text-slate-500">— {client.ewsReason}</span> : null}</div>
            <div className="text-xs text-slate-500">Рейтинг автоматически пересчитывается на каждом этапе заявки и пишется в журнал аудита. История не затирается.</div>
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Красный цвет EWS — жёсткий стоп-фактор: новые сделки блокируются до выяснения.</div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}