import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { getSystemDate } from "@/lib/audit";
import { formatDate } from "@/lib/datetime";
import { TimeSimulator } from "@/components/time-simulator";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const role = await requireRole();
  if (!can(role.code, "admin", "view")) return <div className="text-sm text-slate-500">Нет доступа к разделу «Администрирование».</div>;
  const [systemDate, users, roles, counts] = await Promise.all([
    getSystemDate(),
    prisma.user.findMany({ include: { role: { select: { name: true } } }, orderBy: { roleCode: "asc" } }),
    prisma.role.findMany({ orderBy: { roleCode: "asc" } }),
    prisma.auditLog.count(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Администрирование</h1>
        <p className="text-sm text-slate-500">роли и права берутся из единой матрицы доступа, время — отдельная подсистема симуляции.</p>
      </div>

      <Card className="border-amber-200">
        <CardHeader title="Симуляция времени" subtitle={`системная дата сейчас: ${formatDate(systemDate)} · перемотка записывается в аудит`} />
        <CardBody>
          <TimeSimulator />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Пользователи · ${users.length}`} />
          <Table headers={["ФИО", "Роль", "Доступ"]}>
            {users.map((user) => (
              <tr key={user.id}>
                <Td className="max-w-[200px] truncate">{user.name}</Td>
                <Td className="text-xs">{user.role.name}</Td>
                <Td className="text-xs"><Badge variant="outline">{user.roleCode}</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title={`Роли · ${roles.length}`} subtitle="матрица прав в lib/roles.ts — каждая форма проверяет права на сервере" />
          <Table headers={["Код", "Название", "Модулей"]}>
            {roles.map((item) => (
              <tr key={item.id}>
                <Td className="font-mono text-xs">{item.roleCode}</Td>
                <Td className="text-xs">{item.name}</Td>
                <Td className="text-xs">—</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader title="Состояние системы" />
        <CardBody className="text-sm text-slate-600">Записей в журнале аудита: {counts} · база SQLite ./prisma/dev.db · миграция /20260918085030_init_schema</CardBody>
      </Card>
    </div>
  );
}
