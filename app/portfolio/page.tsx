import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { moneyKzt } from "@/lib/money";
import { PortfolioByEws, NewBusinessChart, ApprovalByRoute } from "@/components/portfolio-charts";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const role = await requireRole();
  if (!can(role.code, "portfolio", "view")) return <div className="text-sm text-slate-500">Нет доступа к BI-дашборду.</div>;

  const [contracts, applications, clients] = await Promise.all([
    prisma.contract.findMany({ where: { status: "ACTIVE" }, include: { application: { include: { client: true } }, paymentSchedules: { where: { isActive: true }, include: { lines: true } } } }),
    prisma.application.findMany({ select: { createdAt: true, status: true, financedAmount: true }, orderBy: { createdAt: "asc" } }),
    prisma.client.findMany({ select: { ewsColor: true } }),
  ]);

  const totalPortfolio = contracts.reduce((sum, contract) => sum + Number(contract.amount), 0);
  const totalFinanced = applications.filter((app) => ["APPROVED", "FUNDED", "ACTIVE", "CONTRACT"].includes(app.status)).reduce((sum, app) => sum + Number(app.financedAmount), 0);

  const byEws = (["GREEN", "YELLOW", "ORANGE", "RED"] as const).map((color) => ({
    name: color,
    value: contracts.filter((contract) => contract.application.client.ewsColor === color).length,
    color: { GREEN: "#10b981", YELLOW: "#f59e0b", ORANGE: "#f97316", RED: "#ef4444" }[color],
  }));

  const monthMap = new Map<string, number>();
  for (const app of applications) {
    const key = app.createdAt.toISOString().slice(0, 7);
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  const monthly = [...monthMap.entries()].slice(-9).map(([month, count]) => ({ month, count }));

  const approved = applications.filter((app) => ["APPROVED", "FUNDED", "ACTIVE", "CONTRACT"].includes(app.status)).length;
  const rejected = applications.filter((app) => app.status === "REJECTED").length;
  const pipeline = applications.length - approved - rejected;

  const buckets = [
    { name: "Одобрено", count: approved, color: "#10b981" },
    { name: "Отклонено", count: rejected, color: "#ef4444" },
    { name: "В работе", count: pipeline, color: "#2563eb" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Дашборд руководства</h1>
        <p className="text-sm text-slate-500">живая агрегация по базе — не статические цифры из отчёта</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-[10px] uppercase text-slate-400">Портфель</div><div className="mt-1 text-2xl font-bold text-slate-900">{moneyKzt(totalPortfolio)}</div><div className="text-xs text-slate-400">{contracts.length} активных договоров</div></div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-[10px] uppercase text-slate-400">Одобрено с начала года</div><div className="mt-1 text-2xl font-bold text-slate-900">{moneyKzt(totalFinanced)}</div><div className="text-xs text-slate-400">{approved} сделок</div></div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-[10px] uppercase text-slate-400">В работе</div><div className="mt-1 text-2xl font-bold text-slate-900">{pipeline}</div><div className="text-xs text-slate-400">заявок в конвейере</div></div>
        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-[10px] uppercase text-slate-400">Клиентов</div><div className="mt-1 text-2xl font-bold text-slate-900">{clients.length}</div><div className="text-xs text-slate-400">в базе, EWS рассчитан</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Портфель по EWS" subtitle="распределение активных договоров по цвету клиента" />
          <CardBody><PortfolioByEws data={byEws} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Новый бизнес по месяцам" subtitle="заявки за последние 9 месяцев" />
          <CardBody><NewBusinessChart data={monthly} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Итог по заявкам" subtitle="всего в базе, по статус-группам" />
          <CardBody><ApprovalByRoute data={buckets} /></CardBody>
        </Card>
      </div>
    </div>
  );
}