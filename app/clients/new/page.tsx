import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ClientForm } from "@/components/client-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const role = await requireRole();
  if (!can(role.code, "clients", "create")) return <div className="text-sm text-slate-500">Нет доступа.</div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Новый клиент</h1>
        <p className="text-sm text-slate-500">При вводе существующего БИН/ИИН система покажет предупреждение о дубле.</p>
      </div>
      <Card>
        <CardHeader title="Реквизиты клиента" />
        <CardBody>
          <ClientForm />
        </CardBody>
      </Card>
    </div>
  );
}