import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardHeader } from "@/components/ui/card";
import { ScheduleCalculator } from "@/components/schedule-calculator";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const role = await requireRole();
  if (!can(role.code, "calculator", "view")) return <div className="text-sm text-slate-500">Нет доступа к калькулятору.</div>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Лизинговый калькулятор</h1>
        <p className="text-sm text-slate-500">Тот же код, что считает заявки в системе: decimal.js, фактические дни, база 365, НДС 12%.</p>
      </div>
      <Card>
        <CardHeader title="Параметры" subtitle="пересчёт в реальном времени на клиенте, деньги — строки, внутри Decimal" />
        <ScheduleCalculator />
      </Card>
    </div>
  );
}