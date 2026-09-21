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
import { AddDossierDocument, AmlCheckButton } from "@/components/client-dossier-actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Общее" },
  { key: "related", label: "Связанные лица" },
  { key: "dossier", label: "Досье" },
  { key: "finance", label: "Финансы" },
  { key: "rating", label: "Рейтинг" },
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
      relatedParties: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      financialPeriods: { orderBy: { period: "desc" } },
      amlChecks: { orderBy: { checkedAt: "desc" } },
      ratingHistory: { orderBy: { createdAt: "desc" } },
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

      {tab === "related" ? <Card><CardHeader title={`Связанные лица · ${client.relatedParties.length}`} subtitle="Руководители, учредители и бенефициарные собственники" /><Table headers={["Тип", "ФИО / наименование", "ИИН/БИН", "Доля", "PEP"]}>{client.relatedParties.map((party) => <tr key={party.id}><Td>{party.type}</Td><Td className="font-medium">{party.name}</Td><Td className="font-mono text-xs">{party.binIin ?? "—"}</Td><Td>{party.ownership ?? "—"}</Td><Td>{party.isPep ? <Badge variant="red">Да</Badge> : <Badge variant="green">Нет</Badge>}</Td></tr>)}</Table></Card> : null}

      {tab === "dossier" ? <div className="space-y-4"><Card><CardHeader title="Добавить документ в электронное досье" subtitle="Мок-файл получает SHA-256; операция фиксируется в аудите" /><CardBody><AddDossierDocument clientId={client.id} /></CardBody></Card><Card><CardHeader title={`Документы · ${client.documents.length}`} /><Table headers={["Категория", "Документ", "Версия", "Статус", "Действует до", "SHA-256"]}>{client.documents.map((document) => <tr key={document.id}><Td>{document.category}</Td><Td className="font-medium">{document.name}</Td><Td>v{document.version}</Td><Td><Badge variant={document.status === "APPROVED" ? "green" : "amber"}>{document.status}</Badge></Td><Td>{document.validUntil ? formatDate(document.validUntil) : "—"}</Td><Td className="max-w-40 truncate font-mono text-[10px]">{document.contentHash}</Td></tr>)}</Table></Card></div> : null}

      {tab === "finance" ? (
        <div className="space-y-4"><Card><CardHeader title="Финансовая отчётность · 3 периода" subtitle="Сравнительная динамика на детерминированных моковых данных" /><Table headers={["Период", "Выручка", "EBITDA", "Чистая прибыль", "Активы", "Капитал", "Долг"]}>{client.financialPeriods.map((period) => <tr key={period.id}><Td className="font-semibold">{period.period}</Td><Td>{moneyKzt(period.revenue)}</Td><Td>{moneyKzt(period.ebitda)}</Td><Td>{moneyKzt(period.netIncome)}</Td><Td>{moneyKzt(period.assets)}</Td><Td>{moneyKzt(period.equity)}</Td><Td>{moneyKzt(period.debt)}</Td></tr>)}</Table></Card><div className="grid gap-4 lg:grid-cols-2">
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
        </div></div>
      ) : null}

      {tab === "rating" ? <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader title="Текущий риск-профиль" /><CardBody className="space-y-2"><div className="text-4xl font-bold text-slate-900">{client.riskRating ?? "—"}</div><p className="text-sm text-slate-500">Рейтинг не перезаписывает историю: каждый автоматический или экспертный пересчёт сохраняется отдельно.</p></CardBody></Card><Card><CardHeader title="История рейтинга" /><Table headers={["Дата", "Рейтинг", "Балл", "Причина", "Источник"]}>{client.ratingHistory.map((entry) => <tr key={entry.id}><Td>{formatDate(entry.createdAt)}</Td><Td><Badge variant="outline">{entry.rating}</Badge></Td><Td>{entry.score}</Td><Td className="text-xs">{entry.reason}</Td><Td className="text-xs">{entry.source}</Td></tr>)}</Table></Card></div> : null}

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
        <div className="space-y-4"><Card>
          <CardHeader title="EWS и мониторинг клиента" />
          <CardBody className="space-y-3 text-sm">
            <div>Цвет EWS: <Badge variant={client.ewsColor === "GREEN" ? "green" : client.ewsColor === "RED" ? "red" : "amber"}>{client.ewsColor}</Badge> {client.ewsReason ? <span className="text-xs text-slate-500">— {client.ewsReason}</span> : null}</div>
            <div className="text-xs text-slate-500">Рейтинг автоматически пересчитывается на каждом этапе заявки и пишется в журнал аудита. История не затирается.</div>
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Красный цвет EWS — жёсткий стоп-фактор: новые сделки блокируются до выяснения.</div>
          </CardBody>
        </Card><Card><CardHeader title="История проверок ПОД/ФТ" action={["ROLE-07", "ROLE-17"].includes(role.code) ? <AmlCheckButton key="aml" clientId={client.id} /> : undefined} /><Table headers={["Дата", "Результат", "Риск", "Источник", "Следующая проверка", "Детали"]}>{client.amlChecks.map((check) => <tr key={check.id}><Td>{formatDate(check.checkedAt)}</Td><Td><Badge variant={check.result === "CLEAR" ? "green" : "amber"}>{check.result}</Badge></Td><Td><Badge variant={check.riskLevel === "HIGH" ? "red" : "green"}>{check.riskLevel}</Badge></Td><Td>{check.source}</Td><Td>{formatDate(check.nextReviewDate)}</Td><Td className="text-xs">{check.details}</Td></tr>)}</Table></Card></div>
      ) : null}
    </div>
  );
}
