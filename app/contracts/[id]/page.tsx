import Decimal from "decimal.js";
import { remainingLine } from "@/lib/payment-balance";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, STATUS_LABEL, statusColor } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { moneyKzt } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { overdueForLines, BUCKET_LABEL } from "@/lib/overdue";
import { getSystemDate } from "@/lib/audit";
import { PaymentForm } from "@/components/payment-form";
import { MockSignButton } from "@/components/mock-sign-button";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

type Allocation = { scheduleLineId: string; principal: string; interest: string; vat: string; commission: string; penalty: string };

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await requireRole();
  const { id } = await params;
  const systemDate = await getSystemDate();

  const [contract, signatureAudit] = await Promise.all([prisma.contract.findUnique({
    where: { id },
    include: {
      application: { include: { client: true } },
      paymentSchedules: { include: { lines: true } },
      asset: { include: { insurance: true } },
      payments: { orderBy: { date: "desc" } },
    },
  }), prisma.auditLog.findFirst({ where: { object: "contract", objectId: id, operation: "SIGN_ECP" }, orderBy: { at: "desc" } })]);
  if (!contract) notFound();
  if (!can(role.code, "contracts", "view")) return <div className="text-sm text-slate-500">Нет доступа.</div>;
  const activeSchedule = contract.paymentSchedules.find((schedule) => schedule.isActive);
  const allSchedules = contract.paymentSchedules.sort((a, b) => b.version - a.version);
  const lines = activeSchedule?.lines ?? [];
  const overdue = overdueForLines(lines, systemDate.slice(0, 10));
  const paidLines = lines.filter((line) => line.status === "PAID").length;
  const remainingPrincipal = lines
    .filter((line) => line.status === "OPEN" || line.status === "PARTIAL")
    .reduce((sum, line) => sum.plus(remainingLine(line).principal), new Decimal(0)).toFixed(2);
  const signature = signatureAudit?.newValue ? JSON.parse(signatureAudit.newValue) as { signer: string; certificate: string; certificateFingerprint: string; hash: string } : null;
  const signedContent = JSON.stringify({ number: contract.number, applicationId: contract.applicationId, clientId: contract.clientId, amount: contract.amount, annualRate: contract.annualRate, termMonths: contract.termMonths, schedule: contract.scheduleJson });
  const currentHash = `sha256:${createHash("sha256").update(signedContent).digest("hex")}`;
  const signatureValid = signature?.hash === currentHash;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{contract.number}</h1>
            <Badge variant={statusColor(contract.status)}>{STATUS_LABEL[contract.status] ?? contract.status}</Badge>
            <Badge variant="outline">{activeSchedule?.version ?? allSchedules[0]?.version ?? "-"}. версия графика</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {contract.application.client.name} · {contract.application.product} · сумма {moneyKzt(contract.amount)} · {contract.termMonths} мес. · {contract.annualRate}% годовых · создан {formatDate(contract.signDate)}
          </p>
        </div>
      </div>

      {overdue.dpd > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <div className="font-semibold text-red-700">Просрочка: DPD {overdue.dpd} · {BUCKET_LABEL[overdue.bucket] ?? overdue.bucket}</div>
          <div className="mt-1 text-xs text-red-600">Неоплаченная основная часть: {moneyKzt(overdue.principalOverdue)} · проценты: {moneyKzt(overdue.interestOverdue)}</div>
          <div className="mt-1 text-xs text-slate-500">Пересчитывается от системной даты, которая сейчас {formatDate(systemDate)}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">Просрочки нет</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={`График платежей · ${lines.length} периодов`} subtitle={allSchedules.length > 1 ? `показана версия ${activeSchedule?.version ?? allSchedules[0]?.version ?? "-"}; все версии хранятся, история не стирается` : undefined} />
            <Table headers={["№", "Дата", "Основной долг", "Проценты", "Комиссия", "НДС", "Платёж", "Остаток", "Оплачено", "Статус"]}>
              {lines.map((line) => (
                <tr key={line.id}>
                  <Td className="text-center">{line.seq}</Td>
                  <Td className="text-xs">{formatDate(line.dueDate)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.principal)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.interest)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.commission)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.vat)}</Td>
                  <Td className="font-mono text-xs font-semibold">{moneyKzt(line.total)}</Td>
                  <Td className="font-mono text-xs text-slate-500">{moneyKzt(line.balance)}</Td>
                  <Td className="font-mono text-xs text-slate-500">{moneyKzt(line.paidTotal ?? "0")}</Td>
                  <Td>
                    <Badge variant={line.status === "PAID" ? "green" : line.status === "PARTIAL" ? "amber" : "default"}>{line.status}</Badge>
                  </Td>
                </tr>
              ))}
            </Table>
            <CardBody className="flex flex-wrap gap-4 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <div>оплачено строк: {paidLines}/{lines.length}</div>
              <div>остаток основного долга: {moneyKzt(remainingPrincipal)}</div>
              <div>процентов начислено: {moneyKzt(lines.reduce((sum, line) => sum + Number(line.interest), 0))}</div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="История платежей (аллокации)" />
            {contract.payments.length === 0 ? (
              <CardBody className="text-sm text-slate-400">Платежей пока нет</CardBody>
            ) : (
              <Table headers={["Дата", "Сумма", "Источник", "Аллокация"]}>
                {contract.payments.map((payment) => {
                  const allocs = JSON.parse(payment.allocations) as Allocation[];
                  return (
                    <tr key={payment.id}>
                      <Td className="text-xs">{formatDate(payment.date)}</Td>
                      <Td className="font-semibold">{moneyKzt(payment.amount)}</Td>
                      <Td className="text-xs">{payment.source}</Td>
                      <Td className="max-w-[300px] text-[11px] text-slate-500">
                        {allocs
                          .filter((a) => a.scheduleLineId !== "ADVANCE")
                          .map((a) => `строка #${a.scheduleLineId.slice(-4)}: ${moneyKzt(Number(a.principal) + Number(a.interest) + Number(a.vat) + Number(a.commission) + Number(a.penalty ?? 0))}`)
                          .join("; ")}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Актив" />
            <CardBody className="space-y-2 text-sm">
              <div><span className="text-slate-400">Тип: </span>{contract.asset?.type ?? "—"}</div>
              <div><span className="text-slate-400">Наименование: </span>{contract.asset?.name ?? contract.application.product}</div>
              <div className="font-mono text-xs"><span className="text-slate-400">VIN/номер: </span>{contract.asset?.vin ?? "—"}</div>
              <div><span className="text-slate-400">Стоимость: </span>{moneyKzt(contract.asset?.cost ?? contract.amount)}</div>
              <div><span className="text-slate-400">Статус: </span>{contract.asset?.status ?? "—"}</div>
            </CardBody>
          </Card>

          {contract.asset?.insurance ? (
            <Card>
              <CardHeader title="Страхование КАСКО" />
              <CardBody className="space-y-2 text-sm">
                <div><span className="text-slate-400">Страховщик: </span>{contract.asset.insurance.insurer}</div>
                <div className="font-mono text-xs"><span className="text-slate-400">Полис: </span>{contract.asset.insurance.policyNumber}</div>
                <div><span className="text-slate-400">Период: </span>{contract.asset.insurance.startDate} — {contract.asset.insurance.endDate}</div>
                <div><span className="text-slate-400">Премия: </span>{moneyKzt(contract.asset.insurance.premium)}</div>
              </CardBody>
            </Card>
          ) : null}

          {contract.status === "ACTIVE" ? (
            <>
              {can(role.code, "payments", "create") ? (
                <Card className="border-blue-200">
                  <CardHeader title="Принять платёж" />
                  <CardBody>
                    <PaymentForm contractId={contract.id} />
                  </CardBody>
                </Card>
              ) : null}
              {can(role.code, "contracts", "sign") ? (
                <Card className="border-emerald-200">
                  <CardHeader title="Электронная подпись" subtitle="мок: в продукте — НУЦ РК (GOST)" />
                  <CardBody>
                    <MockSignButton contractId={contract.id} />
                  </CardBody>
                </Card>
              ) : null}
              {signature && signatureAudit ? (
                <Card className={signatureValid ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}>
                  <CardHeader title={signatureValid ? "Подпись проверена" : "Целостность подписи нарушена"} subtitle={formatDate(signatureAudit.at)} />
                  <CardBody className={`space-y-1 break-all font-mono text-[10px] ${signatureValid ? "text-emerald-800" : "text-red-800"}`}>
                    <div>Подписант: {signature.signer}</div><div>Сертификат: {signature.certificate}</div><div>Отпечаток: {signature.certificateFingerprint}</div><div>{signature.hash}</div>
                  </CardBody>
                </Card>
              ) : null}
            </>
          ) : null}

          <Card>
            <CardHeader title="Корпоративная нота" subtitle="для комитета" />
            <CardBody className="text-xs text-slate-500">
              Лизингодатель: ТОО «LeaseCo» · юр. адрес: г. Астана · учредитель: 100% ТОО «Holding» · лицензия АНКР: ЛС-2025-001.
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
