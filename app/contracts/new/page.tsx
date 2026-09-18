import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { moneyKzt } from "@/lib/money";
import { CreateContractForm } from "@/components/create-contract-form";

export const dynamic = "force-dynamic";

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const role = await requireRole();
  if (!can(role.code, "contracts", "create")) return <div className="text-sm text-slate-500">Нет доступа к созданию договоров.</div>;
  const { application } = await searchParams;

  let selected: { id: string; number: string; product: string; financedAmount: string; assetCost: string; termMonths: number; annualRate: string; client: { name: string } } | null = null;
  if (application) {
    selected = await prisma.application.findFirst({
      where: { id: application, status: "APPROVED" },
      select: { id: true, number: true, product: true, financedAmount: true, assetCost: true, termMonths: true, annualRate: true, client: { select: { name: true } } },
    });
  }
  const approved = selected
    ? []
    : await prisma.application.findMany({ where: { status: "APPROVED", contract: { is: null } }, include: { client: true }, orderBy: { updatedAt: "desc" }, take: 30 });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Формирование договора</h1>
        <p className="text-sm text-slate-500">Только по согласованной заявке (статус APPROVED) и только один договор на заявку.</p>
      </div>
      {selected ? (
        <Card>
          <CardHeader title={selected.number} subtitle={`${selected.client.name} · ${selected.product} · ${moneyKzt(selected.financedAmount)} · ${selected.termMonths} мес.`} />
          <CardBody>
            <CreateContractForm applicationId={selected.id} />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Выберите согласованную заявку" />
          <ul className="divide-y divide-slate-100 text-sm">
            {approved.length === 0 ? <li className="px-4 py-4 text-slate-400">Согласованных заявок без договора нет.</li> : null}
            {approved.map((app) => (
              <li key={app.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <span className="font-medium text-slate-800">{app.number}</span> · {app.client.name}
                  <span className="ml-2 text-xs text-slate-400">{app.product} · {moneyKzt(app.financedAmount)}</span>
                </div>
                <Link href={`/contracts/new?application=${app.id}`} className="text-xs text-blue-700 hover:underline">Выбрать</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}