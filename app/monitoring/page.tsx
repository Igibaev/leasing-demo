import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { Badge, STATUS_LABEL, statusColor } from "@/components/ui/badge";
import { moneyKzt } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { getSystemDate } from "@/lib/audit";
import { slaLabel } from "@/lib/workflow";
import { overdueForLines, BUCKET_LABEL } from "@/lib/overdue";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const role = await requireRole();
  if (!can(role.code, "monitoring", "view")) return <div className="text-sm text-slate-500">Нет доступа к мониторингу.</div>;
  const systemDate = await getSystemDate();
  const now = new Date(systemDate);
  const today = systemDate.slice(0, 10);

  const [pendingSteps, applicationsInProcess, activeContracts] = await Promise.all([
    prisma.workflowStep.findMany({
      where: { status: "PENDING" },
      include: { application: { select: { id: true, number: true, status: true } } },
      orderBy: { deadline: "asc" },
      take: 50,
    }),
    prisma.application.findMany({ where: { status: { in: ["REGISTERED", "DOCUMENTS", "ANALYSIS", "RISK", "APPROVAL", "COMMITTEE"] } }, select: { id: true, number: true, status: true, client: { select: { name: true } }, createdAt: true } }),
    prisma.contract.findMany({ where: { status: "ACTIVE" }, select: { id: true, number: true, clientId: true, client: { select: { name: true } }, paymentSchedules: { where: { isActive: true }, include: { lines: true } } } }),
  ]);

  const overdueSla = pendingSteps.filter((step) => new Date(step.deadline) < now);
  const overdueContracts = activeContracts
    .map((contract) => {
      const lines = contract.paymentSchedules[0]?.lines ?? [];
      const overdue = overdueForLines(lines, today);
      return { contract, lines, overdue, overdueCount: lines.filter((line) => line.dueDate < today && line.status !== "PAID").length };
    })
    .filter((entry) => entry.overdueCount > 0)
    .sort((a, b) => b.overdue.dpd - a.overdue.dpd);

  const byStatus = (statuses: string[]) => applicationsInProcess.filter((application) => statuses.includes(application.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Операционный мониторинг</h1>
        <p className="mt-1 text-sm text-slate-500">Системная дата {formatDate(systemDate)} · очередь согласования, SLA, просрочка по портфелю</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Заявок в работе", value: applicationsInProcess.length, color: "text-blue-700" },
          { label: "Шагов, ожидающих решения", value: pendingSteps.length, color: "text-amber-700" },
          { label: "Просрочено по SLA", value: overdueSla.length, color: overdueSla.length ? "text-red-600" : "text-emerald-600" },
          { label: "Договоров с просрочкой", value: overdueContracts.length, color: overdueContracts.length ? "text-red-600" : "text-emerald-600" },
          { label: "Ожидают комитет", value: byStatus(["COMMITTEE"]), color: "text-slate-700" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{stat.label}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title="Очередь согласования (все этапы)" subtitle="просроченные по SLA выделены знаком ⚠" />
        <Table headers={["Заявка", "Статус", "Этап", "Роль", "Дедлайн", "SLA"]}>
          {pendingSteps.map((step) => {
            const sla = slaLabel(step.deadline, now);
            return (
              <tr key={step.id}>
                <Td>
                  <Link href={`/applications/${step.application.id}`} className="font-medium text-blue-700 hover:underline">{step.application.number}</Link>
                </Td>
                <Td><Badge variant={statusColor(step.application.status)}>{STATUS_LABEL[step.application.status] ?? step.application.status}</Badge></Td>
                <Td>{sla.overdue ? `⚠ ` : ""}{step.name}</Td>
                <Td className="text-xs text-slate-500">{step.roleCode}</Td>
                <Td className="text-xs">{formatDate(step.deadline)}</Td>
                <Td><span className={`text-xs ${sla.overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>{sla.label}</span></Td>
              </tr>
            );
          })}
          {pendingSteps.length === 0 ? <tr><Td className="text-sm text-slate-400" >Нет шагов, ожидающих решения</Td></tr> : null}
        </Table>
      </Card>

      <Card>
        <CardHeader title="Просрочка по активным договорам" subtitle="бакеты по системной дате" />
        <Table headers={["Договор", "Клиент", "DPD", "Бакет", "Основной долг", "Проценты", "Просрочено строк"]}>
          {overdueContracts.map(({ contract, overdue, overdueCount }) => (
            <tr key={contract.id}>
              <Td><Link href={`/contracts/${contract.id}`} className="font-medium text-blue-700 hover:underline">{contract.number}</Link></Td>
              <Td className="max-w-[220px] truncate">{contract.client.name}</Td>
              <Td className="font-semibold text-red-600">{overdue.dpd}</Td>
              <Td><Badge variant={overdue.dpd > 30 ? "red" : "amber"}>{BUCKET_LABEL[overdue.bucket] ?? overdue.bucket}</Badge></Td>
              <Td className="font-mono text-xs">{moneyKzt(overdue.principalOverdue)}</Td>
              <Td className="font-mono text-xs">{moneyKzt(overdue.interestOverdue)}</Td>
              <Td className="text-center">{overdueCount}</Td>
            </tr>
          ))}
          {overdueContracts.length === 0 ? <tr><Td className="text-sm text-slate-400">Просрочек по портфелю нет</Td></tr> : null}
        </Table>
      </Card>
    </div>
  );
}