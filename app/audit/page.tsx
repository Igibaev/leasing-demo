import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { formatDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const OPERATION_LABEL: Record<string, string> = {
  CLIENT_CREATE: "Создание клиента",
  APPLICATION_CREATE: "Создание заявки",
  SUBMIT: "Отправка на маршрут",
  DECISION: "Решение по заявке",
  RATING: "Пересчёт рейтинга",
  VOTE: "Голосование комитета",
  CONTRACT_CREATE: "Создание договора",
  PAYMENT_CREATE: "Приём платежа",
  IMPORT_BANK: "Импорт выписки",
  SIMULATE_TIME: "Симуляция времени",
  SIGN_ECP: "Подпись ЭЦП",
  OVERRIDE: "Оверрайд стоп-фактора",
  SEED: "Загрузка демо-данных",
};

export default async function AuditPage() {
  const role = await requireRole();
  if (!can(role.code, "audit", "view")) return <div className="text-sm text-slate-500">Нет доступа к журналу аудита.</div>;
  const logs = await prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 120 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Журнал аудита</h1>
        <p className="text-sm text-slate-500">append-only: журнал нельзя удалить или изменить — это контрольная точка для надёжной ЭЦП и ПОД/ФТ.</p>
      </div>
      <Card>
        <CardHeader title={`Последние ${logs.length} записей`} />
        <Table headers={["Время", "Пользователь", "Роль", "Объект", "Операция", "Старое", "Новое"]}>
          {logs.map((log) => (
            <tr key={log.id}>
              <Td className="whitespace-nowrap text-xs">{formatDate(log.at)}</Td>
              <Td className="max-w-[160px] truncate text-xs">{log.userId.slice(0, 12)}</Td>
              <Td className="text-xs"><Badge variant="outline">{log.roleCode}</Badge></Td>
              <Td className="text-xs">{log.object} / {log.objectId?.slice(0, 12)}</Td>
              <Td className="text-xs font-medium">{OPERATION_LABEL[log.operation] ?? log.operation}</Td>
              <Td className="max-w-[180px] truncate font-mono text-[10px] text-slate-400">{log.oldValue ?? "—"}</Td>
              <Td className="max-w-[240px] truncate font-mono text-[10px] text-slate-600">{log.newValue ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}