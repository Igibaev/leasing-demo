import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getRole, can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getSystemDate } from "@/lib/audit";
import { moneyKzt } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { slaLabel } from "@/lib/workflow";
import { overdueForLines } from "@/lib/overdue";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Badge, STATUS_LABEL, statusColor } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <div className="mx-auto mt-20 max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">АИС Лизинг</h1>
        <p className="mt-2 text-sm text-slate-500">
          Выберите роль в шапке справа — без паролей, для быстрой смены пользователя при демонстрации.
        </p>
        <ul className="mt-4 space-y-1 text-left text-xs text-slate-500">
          <li>• Менеджер по продажам — создаёт заявку и ведёт клиента</li>
          <li>• Аналитик, риск-менеджер, юрист, ПОД/ФТ — согласуют по маршруту</li>
          <li>• Руководитель рисков — оверрайдит стоп-факторы</li>
          <li>• Комитет и руководство — решения и BI-дашборды</li>
        </ul>
      </div>
    );
  }
  const role = getRole(session.roleCode);
  const systemDate = await getSystemDate();

  const [tasks, allContracts, clients, notifications] = await Promise.all([
    prisma.workflowStep.findMany({
      where: { roleCode: session.roleCode, status: "PENDING" },
      include: { application: { include: { client: true, createdBy: { select: { name: true } } } } },
      orderBy: { deadline: "asc" },
    }),
    prisma.contract.findMany({ where: { status: "ACTIVE" }, include: { paymentSchedules: { where: { isActive: true }, include: { lines: true } }, application: { include: { client: true } } } }),
    prisma.client.count(),
    prisma.notification.count({ where: { userId: session.id, readAt: null } }),
  ]);

  const portfolio = allContracts.reduce((sum, contract) => sum + Number(contract.amount), 0);
  const overdueContracts = allContracts
    .map((contract) => {
      const schedule = contract.paymentSchedules[0];
      if (!schedule) return null;
      const state = overdueForLines(schedule.lines, systemDate.slice(0, 10));
      return { contractId: contract.id, number: contract.number, clientName: contract.application.client.name, ...state };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null && Number(item.overdueAmount) > 0)
    .sort((a, b) => Number(b.overdueAmount) - Number(a.overdueAmount));

  const overdueTotal = overdueContracts.reduce((sum, item) => sum + Number(item.overdueAmount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Мои задачи</h1>
        <p className="text-sm text-slate-500">
          {role.name} · системная дата {formatDate(systemDate)} · непрочитанных уведомлений: {notifications}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Активные договоры" value={allContracts.length} hint="с действующим графиком" />
        <Stat label="Портфель" value={moneyKzt(portfolio)} hint="сумма активных договоров" />
        <Stat label="Просрочка (книга)" value={moneyKzt(overdueTotal)} hint={`${overdueContracts.length} договоров с DPD`} tone={overdueTotal > 0 ? "red" : "green"} />
        <Stat label="Клиенты в базе" value={clients} hint="группы связанных лиц выделены" />
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-slate-400">Новых задач для вашей роли нет.</CardBody>
        </Card>
      ) : null}

      {tasks.length > 0 ? (
        <Card>
          <CardHeader title="Задачи согласования" subtitle="Демо-SLA: укрупнённые рабочие дни, без праздничного календаря" />
          <Table headers={["Заявка", "Клиент", "Шаг маршрута", "Срок", "SLA", "Статус заявки", ""]}>
            {tasks.map((task) => {
              const sla = slaLabel(task.deadline, new Date(systemDate));
              return (
                <tr key={task.id}>
                  <Td>
                    <Link href={`/applications/${task.applicationId}`} className="font-medium text-blue-700 hover:underline">
                      {task.application.number}
                    </Link>
                  </Td>
                  <Td className="max-w-[220px] truncate">{task.application.client.name}</Td>
                  <Td>{task.name}</Td>
                  <Td>{formatDate(task.deadline)}</Td>
                  <Td>
                    <Badge variant={sla.overdue ? "red" : "blue"}>{sla.label}</Badge>
                  </Td>
                  <Td>
                    <Badge variant={statusColor(task.application.status)}>{STATUS_LABEL[task.application.status] ?? task.application.status}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/applications/${task.applicationId}`} className="text-xs text-blue-700 hover:underline">
                      Перейти →
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      ) : null}

      {can(session.roleCode, "overdue", "view") && overdueContracts.length > 0 ? (
        <Card>
          <CardHeader title="Договоры с просрочкой" subtitle="пересчитывается от системной даты" action={<Link href="/overdue" className="text-xs text-blue-700 hover:underline">Реестр →</Link>} />
          <Table headers={["Договор", "Клиент", "DPD", "Бакет", "Просрочено"]}>
            {overdueContracts.slice(0, 5).map((item) => (
              <tr key={item.contractId}>
                <Td>
                  <Link href={`/contracts/${item.contractId}`} className="font-medium text-blue-700 hover:underline">
                    {item.number}
                  </Link>
                </Td>
                <Td className="max-w-[220px] truncate">{item.clientName}</Td>
                <Td>{item.dpd}</Td>
                <Td>
                  <Badge variant={Number(item.dpd) > 90 ? "red" : Number(item.dpd) > 30 ? "amber" : "default"}>{item.bucket}</Badge>
                </Td>
                <Td className="font-semibold text-red-600">{moneyKzt(item.overdueAmount)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}