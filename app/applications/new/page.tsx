import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ApplicationForm } from "@/components/application-form";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage() {
  const role = await requireRole();
  if (!can(role.code, "applications", "create")) return <div className="text-sm text-slate-500">Нет доступа к созданию заявок.</div>;
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, take: 80, select: { id: true, name: true, binIin: true } });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Новая заявка</h1>
        <p className="text-sm text-slate-500">Дальше заявку посчитает калькулятор, а отправить на маршрут — только создатель.</p>
      </div>
      <Card>
        <CardHeader title="Параметры сделки" />
        <CardBody>
          <ApplicationForm clients={clients} />
        </CardBody>
      </Card>
    </div>
  );
}