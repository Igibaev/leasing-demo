import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/auth";
import { can, getRole } from "@/lib/roles";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, STATUS_LABEL, statusColor } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/datetime";
import { moneyKzt } from "@/lib/money";
import { slaLabel } from "@/lib/workflow";
import { calculateProfitability, type ScheduleLine } from "@/lib/calc";
import { evaluateRisk } from "@/lib/scoring";
import { buildScheduleForApplication } from "@/lib/schedule";
import { getSystemDate } from "@/lib/audit";
import { StepActions } from "@/components/step-actions";
import { OverrideForm } from "@/components/override-form";
import { SubmitApplicationButton } from "@/components/submit-application-button";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole();
  const user = await requireUser();
  const { id } = await params;
  const systemDate = await getSystemDate();

  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: { select: { name: true, role: { select: { name: true } } } },
      workflowSteps: { orderBy: { seq: "asc" } },
      statusHistory: { orderBy: { at: "desc" } },
      contract: true,
    },
  });
  if (!app) notFound();

  const actorIds: string[] = Array.from(new Set<string>(app.statusHistory.map((entry) => String(entry.userId))));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));

  const activeContracts = await prisma.contract.findMany({ where: { status: "ACTIVE", application: { clientId: app.clientId } }, select: { amount: true } });
  const clientExposure = activeContracts.reduce((sum, contract) => sum + Number(contract.amount), 0);
  const exposureGroup = app.client.groupId
    ? (await prisma.application.findMany({ where: { client: { groupId: app.client.groupId }, status: "APPROVED" }, select: { financedAmount: true } })).reduce((s, a) => s + Number(a.financedAmount), 0)
    : 0;
  const exposureIndustry = (await prisma.application.findMany({ where: { client: { oked: { startsWith: app.client.oked.slice(0, 2) } }, status: "APPROVED" }, select: { financedAmount: true } })).reduce((s, a) => s + Number(a.financedAmount), 0);

  const risk = await evaluateRisk(app.client, app, [
    { scope: "CLIENT", key: app.clientId, amount: clientExposure.toFixed(2), currency: "KZT" },
    { scope: "GROUP", key: (app.client.groupId ?? app.clientId).toUpperCase(), amount: exposureGroup.toFixed(2), currency: "KZT" },
    { scope: "INDUSTRY", key: app.client.oked.slice(0, 2), amount: exposureIndustry.toFixed(2), currency: "KZT" },
  ]);

  let lines: ScheduleLine[] = [];
  try {
    if (app.scheduleJson) lines = JSON.parse(app.scheduleJson) as ScheduleLine[];
  } catch {
    lines = [];
  }
  if (lines.length === 0 && app.assetCost) {
    try {
      lines = buildScheduleForApplication(app);
    } catch {
      lines = [];
    }
  }
  let profitability: ReturnType<typeof calculateProfitability> | null = null;
  try {
    if (lines.length) profitability = calculateProfitability(lines, app.financedAmount);
  } catch {
    profitability = null;
  }

  const pendingStep = app.workflowSteps.find((step) => step.status === "PENDING") ?? null;
  const stopHits = risk.stopFactors.hits.filter((factor) => !factor.overridden);

  const canDecide = pendingStep !== null && pendingStep.roleCode === session.code && app.createdById !== user.id && can(session.code, "applications", "approve");
  const isCreator = app.createdById === user.id;
  const hardHits = stopHits.filter((factor) => factor.type === "HARD");
  const softHits = stopHits.filter((factor) => factor.type === "SOFT");
  const isExtended = risk.limits.route === "EXTENDED" || softHits.length > 0;
  const overriddenCodes = (() => {
    try {
      return new Set(JSON.parse(app.stopFlags || "[]") as string[]);
    } catch {
      return new Set<string>();
    }
  })();
  const overridableSoft = softHits.filter((factor) => !overriddenCodes.has(factor.code));
  const firstOverrideCode = overridableSoft[0]?.code ?? null;

  const docs = [
    { name: "Договор лизинга (проект)", id: "DL-1" },
    { name: "Заявка на лизинг", id: "Z-1" },
    { name: "Финансовая отчётность за 2 периода", id: "FIN-1" },
    { name: "Акт осмотра предмета лизинга", id: "ACT-1" },
    { name: "Страховой полис КАСКО", id: "INS-1" },
    { name: "Справка об отсутствии задолженности", id: "SPR-1" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{app.number}</h1>
            <Badge variant={statusColor(app.status)}>{STATUS_LABEL[app.status] ?? app.status}</Badge>
            <Badge variant="outline">{app.product}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Клиент: <Link href={`/clients/${app.clientId}`} className="text-blue-700 hover:underline">{app.client.name}</Link> · БИН/ИИН {app.client.binIin} · сделка {moneyKzt(app.assetCost)} · финансируем не более {moneyKzt(app.financedAmount)} · {app.termMonths} мес. · {app.annualRate}% годовых
          </p>
          <p className="mt-1 text-xs text-slate-400">Создал: {app.createdBy.name} ({app.createdBy.role.name}) · {formatDate(app.createdAt)}</p>
        </div>
        {app.status === "APPROVED" && can(session.code, "contracts", "create") ? (
          <form action="/contracts/new" method="get">
            <input type="hidden" name="application" value={app.id} />
            <Button>Сформировать договор</Button>
          </form>
        ) : null}
      </div>

      {app.workflowSteps.length > 0 ? (
        <Card>
          <CardHeader title="Маршрут согласования" subtitle={isExtended ? "расширенный маршрут (лимит/стоп-фактор)" : "стандартный маршрут"} />
          <CardBody>
            <ol className="flex flex-wrap items-center gap-y-3 text-xs">
              {app.workflowSteps.map((step, index) => {
                const stateVariant = step.status === "DONE" ? "done" : step.status === "PENDING" ? "pending" : step.status === "ACTIVE" ? "active" : "void";
                const sla = slaLabel(step.deadline, new Date(systemDate));
                return (
                  <li key={step.id} className="flex items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                          stateVariant === "done" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : stateVariant === "pending" ? "border-amber-500 bg-amber-50 text-amber-700" : stateVariant === "active" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-400"
                        }`}
                      >
                        {stateVariant === "done" ? "✓" : index + 1}
                      </div>
                      <span className="whitespace-nowrap font-medium text-slate-700">{step.name}</span>
                      <span className="whitespace-nowrap text-[10px] text-slate-400">{getRole(step.roleCode).name}</span>
                      <span className={`whitespace-nowrap text-[10px] ${sla.overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>{formatDate(step.deadline)} · {sla.label}</span>
                    </div>
                    {index < app.workflowSteps.length - 1 ? <div className="mx-1 mb-6 h-px w-8 bg-slate-300" /> : null}
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Оценка риска (автоматический скоринг)" subtitle="факты из карточки клиента + формульный интерпретатор" />
            <CardBody className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900">{risk.scoring.score}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">балл</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900">{risk.scoring.rating}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">рейтинг</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900">{risk.stopFactors.hits.length}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">стоп-факторов задето</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900">{isExtended ? "EXT" : "STD"}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">маршрут</div>
              </div>
            </CardBody>
          </Card>

          {hardHits.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Жёсткий стоп-фактор: сделка не может быть согласована, пока не изменится факт.
              <ul className="mt-2 list-disc pl-5">
                {hardHits.map((factor) => <li key={factor.code}>{factor.name}</li>)}
              </ul>
            </div>
          ) : null}

          <Card>
            <CardHeader title="Стоп-факторы и лимиты" subtitle="пройдены автоматически на каждом решении" />
            <Table headers={["Проверка", "Тип", "Результат", "Оверрайд"]}>
              {risk.stopFactors.hits.map((factor) => (
                <tr key={factor.code}>
                  <Td>{factor.name}</Td>
                  <Td className="text-xs">{factor.type === "HARD" ? "жёсткий" : "мягкий"}</Td>
                  <Td>{factor.overridden ? <Badge variant="amber">оверрайд</Badge> : factor.type === "HARD" ? <Badge variant="red">задет</Badge> : <Badge variant="red">задет</Badge>}</Td>
                  <Td className="text-xs">{factor.type === "SOFT" && overriddenCodes.has(factor.code) ? "снят руководителем рисков" : "—"}</Td>
                </tr>
              ))}
              {risk.limits.checks.map((check) => (
                <tr key={`${check.scope}-${check.key}`}>
                  <Td>Лимит {check.scope === "CLIENT" ? "на клиента" : check.scope === "GROUP" ? "на группу связанных лиц" : "по отрасли"}</Td>
                  <Td className="text-xs">лимит</Td>
                  <Td>{check.exceeded ? <Badge variant="red">превышен</Badge> : <Badge variant="green">в норме</Badge>}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(check.projectedExposure)} / {moneyKzt(check.limit)}</Td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card>
            <CardHeader title={`График платежей · ${lines.length} периодов`} subtitle="расчёт ядром decimal.js: фактические дни, база 365, НДС 12%" />
            <Table headers={["№", "Дата", "Основной долг", "Проценты", "Комиссия", "НДС", "Платёж", "Остаток"]}>
              {lines.slice(0, 24).map((line) => (
                <tr key={`${line.seq}-${line.dueDate}`}>
                  <Td className="text-center">{line.seq}</Td>
                  <Td className="text-xs">{formatDate(line.dueDate)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.principal)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.interest)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.commission)}</Td>
                  <Td className="font-mono text-xs">{moneyKzt(line.vat)}</Td>
                  <Td className="font-mono text-xs font-semibold">{moneyKzt(line.total)}</Td>
                  <Td className="font-mono text-xs text-slate-500">{moneyKzt(line.balance)}</Td>
                </tr>
              ))}
              {lines.length > 24 ? <tr><td colSpan={99} className="px-3 py-2 text-center text-xs text-slate-400">… ещё {lines.length - 24} периодов · всего график {lines.length} строк</td></tr> : null}
            </Table>
            {profitability ? (
              <CardBody className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-slate-900">{(Number(profitability.irr) * 100).toFixed(2)}%</div>
                  <div className="text-[10px] uppercase text-slate-400">IRR годовых</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-slate-900">{moneyKzt(profitability.totalInterest)}</div>
                  <div className="text-[10px] uppercase text-slate-400">проценты по сделке</div>
                </div>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-slate-900">{moneyKzt(profitability.overpayment)}</div>
                  <div className="text-[10px] uppercase text-slate-400">переплата (в т.ч. НДС/комиссия)</div>
                </div>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Пакет документов" subtitle="для демонстрации — перечень, фактические файлы в продукте подключает DMS" />
            <ul className="divide-y divide-slate-100 text-sm">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between px-4 py-2">
                  <span className="text-slate-700">{doc.name}</span>
                  <div className="flex gap-2 text-xs">
                    <Button type="submit" variant="outline" size="sm">Открыть</Button>
                    <Button type="submit" variant="ghost" size="sm">Загрузить</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          {app.status === "DRAFT" && isCreator ? (
            <Card className="border-blue-200">
              <CardHeader title="Действия" />
              <CardBody>
                <SubmitApplicationButton applicationId={app.id} />
                <p className="mt-2 text-xs text-slate-400">После отправки маршрут сгенерируется автоматически, SLA считается в рабочих часах.</p>
              </CardBody>
            </Card>
          ) : null}

          {pendingStep && canDecide ? (
            <Card className="border-blue-200">
              <CardHeader title={pendingStep.name} subtitle={`Ваша роль: ${session.name}. Создатель заявки не согласует собственный объект (Maker-Checker).`} />
              <CardBody>
                <StepActions applicationId={app.id} stepId={pendingStep.id} />
              </CardBody>
            </Card>
          ) : null}

          {pendingStep && pendingStep.roleCode === session.code && app.createdById !== user.id && hardHits.length === 0 && firstOverrideCode && session.code === "ROLE-05" ? (
            <Card className="border-amber-200">
              <CardHeader title="Руководитель рисков: оверрайд" subtitle="мягкие стоп-факторы блокируют передачу следующих шагов" />
              <CardBody>
                <div className="mb-2 text-xs text-slate-500">Задето: {overridableSoft.map((factor) => factor.name).join("; ")}</div>
                <OverrideForm applicationId={app.id} code={firstOverrideCode} />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Статусная история" subtitle="append-only журнал бизнес-процесса" />
            <ul className="space-y-2 px-4 py-2 text-xs">
              {app.statusHistory.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  <div>
                    <span className="text-slate-700">{STATUS_LABEL[entry.toStatus] ?? entry.toStatus}</span> · {formatDate(entry.at)}
                    <div className="text-slate-400">{entry.comment || "без комментария"} — {actorNameById.get(entry.userId) ?? "—"}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}