"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, requireRole, requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { writeAudit, getSystemDate } from "@/lib/audit";
import { BASE_ROUTE, createWorkflowForApplication, routeFor } from "@/lib/workflow";
import { calculateSchedule, allocatePayment, type ScheduleLine, type OpenScheduleLine } from "@/lib/calc";
import Decimal from "decimal.js";
import { addDays, dateParam, addMonths } from "@/lib/datetime";
import { readFileSync } from "fs";
import path from "path";

function zodError(error: z.ZodError): string {
  return error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
}

export async function switchRoleAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, roleCode: true } });
  if (!user) return { error: "Пользователь не найден" };
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, `${user.id}:${user.roleCode}`, { path: "/", maxAge: 60 * 60 * 24 * 7 });
  redirect("/");
}

const clientSchema = z.object({
  clientType: z.enum(["LEGAL", "IE", "INDIVIDUAL"]),
  binIin: z.string().min(12).max(12),
  name: z.string().min(2),
  oked: z.string().min(2),
  registrationDate: z.string().min(4),
  address: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().or(z.literal("")),
  groupId: z.string().optional(),
});

export async function createClientAction(_prev: unknown, formData: FormData) {
  const role = await requireRole();
  if (!can(role.code, "clients", "create")) return { error: "Недостаточно прав для создания клиента" };
  const parsed = clientSchema.safeParse({
    clientType: formData.get("clientType"),
    binIin: formData.get("binIin"),
    name: formData.get("name"),
    oked: formData.get("oked"),
    registrationDate: formData.get("registrationDate"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    groupId: formData.get("groupId") || undefined,
  });
  if (!parsed.success) return { error: zodError(parsed.error) };
  const data = parsed.data;
  const duplicate = await prisma.client.findUnique({ where: { binIin: data.binIin } });
  if (duplicate) return { error: `Дубль клиента: БИН/ИИН ${data.binIin} уже существует («${duplicate.name}»). Обратитесь в службу безопасности.` };
  const user = await requireUser();
  const client = await prisma.client.create({
    data: {
      clientType: data.clientType,
      binIin: data.binIin,
      name: data.name,
      oked: data.oked,
      registrationDate: data.registrationDate,
      address: data.address,
      phone: data.phone,
      email: data.email,
      groupId: data.groupId,
      financeJson: JSON.stringify({ revenue: 0, ebitda: 0, debtEbitda: 1, currentRatio: 1 }),
    },
    select: { id: true },
  });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "client", objectId: client.id, operation: "CREATE", newValue: JSON.stringify({ name: data.name, binIin: data.binIin }) });
  await prisma.client.update({ where: { id: client.id }, data: { ewsColor: "GREEN", riskRating: "C" } });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

const applicationSchema = z.object({
  clientId: z.string().min(1),
  product: z.string().min(2),
  assetCost: z.string().regex(/^\d+(\.\d+)?$/),
  downPayment: z.string().regex(/^\d+(\.\d+)?$/),
  termMonths: z.coerce.number().int().min(6).max(120),
  annualRate: z.string().regex(/^\d+(\.\d+)?$/),
  scheduleType: z.enum(["ANNUITY", "DIFFERENTIATED"]),
});

export async function createApplicationAction(_prev: unknown, formData: FormData) {
  const role = await requireRole();
  if (!can(role.code, "applications", "create")) return { error: "Недостаточно прав для создания заявки" };
  const parsed = applicationSchema.safeParse({
    clientId: formData.get("clientId"),
    product: formData.get("product"),
    assetCost: formData.get("assetCost"),
    downPayment: formData.get("downPayment"),
    termMonths: formData.get("termMonths"),
    annualRate: formData.get("annualRate"),
    scheduleType: formData.get("scheduleType"),
  });
  if (!parsed.success) return { error: zodError(parsed.error) };
  const data = parsed.data;
  const down = new (await import("decimal.js")).Decimal(data.downPayment);
  const cost = new (await import("decimal.js")).Decimal(data.assetCost);
  if (down.gte(cost)) return { error: "Первоначальный взнос должен быть меньше стоимости предмета" };
  const financed = cost.minus(down).toFixed(2);
  const user = await requireUser();
  const number = `Z-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
  const application = await prisma.application.create({
    data: {
      number,
      clientId: data.clientId,
      product: data.product,
      assetCost: cost.toFixed(2),
      downPayment: down.toFixed(2),
      financedAmount: financed,
      termMonths: data.termMonths,
      annualRate: data.annualRate,
      scheduleType: data.scheduleType,
      status: "DRAFT",
      createdById: user.id,
      riskScore: 0,
      riskRating: "C",
    },
    select: { id: true },
  });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "application", objectId: application.id, operation: "CREATE", newValue: JSON.stringify({ number, clientId: data.clientId, financedAmount: financed }) });
  revalidatePath("/applications");
  redirect(`/applications/${application.id}`);
}

export async function submitApplicationAction(applicationId: string) {
  const role = await requireRole();
  const user = await requireUser();
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { workflowSteps: true } });
  if (!application) return { error: "Заявка не найдена" };
  if (application.createdById !== user.id) return { error: "Создатель заявки должен передать её на рассмотрение" };
  if (application.status !== "DRAFT" && application.status !== "REGISTERED") return { error: "Заявка уже в работе" };
  const existing = application.workflowSteps;
  let route = BASE_ROUTE;
  if (existing.length === 0) {
    const soft = String(application.stopFlags).includes("HIGH_EXPOSURE") || String(application.stopFlags).includes("NEW_CLIENT");
    route = routeFor(false, soft);
    await createWorkflowForApplication(application.id, route, user.id);
  }
  await prisma.application.update({ where: { id: application.id }, data: { status: "REGISTERED" } });
  await prisma.applicationStatusHistory.create({ data: { applicationId: application.id, fromStatus: "DRAFT", toStatus: "REGISTERED", userId: user.id, comment: "Заявка отправлена на рассмотрение" } });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "application", objectId: application.id, operation: "SUBMIT", newValue: String(route.length) });
  await prisma.notification.create({ data: { userId: application.createdById, channel: "INAPP", subject: "Заявка в работе", body: `Заявка ${application.number} отправлена на маршрут согласования (${route.length} шагов)` } });
  revalidatePath("/");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true };
}

export async function saveScheduleToApplicationAction(applicationId: string) {
  const user = await requireUser();
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) return { error: "Заявка не найдена" };
  const scheduleInput = {
    assetCost: application.assetCost,
    downPayment: application.downPayment,
    termMonths: application.termMonths,
    annualRate: application.annualRate,
    commission: String(Number(application.assetCost) * 0.006),
    commissionType: "IN_SCHEDULE" as const,
    vatRate: "12",
    firstPaymentDate: dateParam(addMonths(new Date(), 1)),
    scheduleType: application.scheduleType as "ANNUITY" | "DIFFERENTIATED",
  };
  const lines = calculateSchedule(scheduleInput);
  await prisma.application.update({ where: { id: application.id }, data: { scheduleJson: JSON.stringify(lines) } });
  await writeAudit({ userId: user.id, roleCode: (await requireRole()).code, object: "application", objectId: application.id, operation: "SCHEDULE_SAVED", newValue: JSON.stringify({ lines: lines.length }) });
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true };
}

export async function decideStepAction(applicationId: string, stepId: string, decision: "APPROVE" | "REWORK" | "REJECT", comment: string) {
  const role = await requireRole();
  const user = await requireUser();
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { workflowSteps: { orderBy: { seq: "asc" } } } });
  if (!application) return { error: "Заявка не найдена" };
  const step = application.workflowSteps.find((s) => s.id === stepId);
  if (!step) return { error: "Шаг не найден" };
  if (step.status !== "PENDING") return { error: "Шаг уже решён" };
  if (step.roleCode !== role.code) return { error: `Решение по шагу «${step.name}» принимает роль ${step.roleCode}, а не ${role.code}` };
  if (application.createdById === user.id) return { error: "Maker-Checker: создатель заявки не может согласовывать свой объект" };
  if (decision !== "APPROVE" && !comment.trim()) return { error: "Для доработки или отклонения нужен комментарий" };

  const historyComment = comment.trim();
  if (decision === "APPROVE") {
    await prisma.workflowStep.update({ where: { id: step.id }, data: { status: "APPROVED", decision, comment: historyComment, decidedById: user.id, decidedAt: new Date() } });
    const nextIndex = application.workflowSteps.findIndex((s) => s.id === step.id) + 1;
    const next = application.workflowSteps[nextIndex];
    if (next) {
      await prisma.workflowStep.update({ where: { id: next.id }, data: { status: "PENDING" } });
      await prisma.applicationStatusHistory.create({ data: { applicationId, fromStatus: application.status, toStatus: stepIsCommittee(nextIndex, application.workflowSteps.length) ? "COMMITTEE" : "ANALYSIS", userId: user.id, comment: `Шаг «${step.name}» одобрен, передано: «${next.name}»` } });
      await prisma.application.update({ where: { id: application.id }, data: { status: stepIsCommittee(nextIndex, application.workflowSteps.length) ? "COMMITTEE" : statusForIndex(nextIndex) } });
    } else {
      await prisma.application.update({ where: { id: application.id }, data: { status: "APPROVED" } });
      await prisma.applicationStatusHistory.create({ data: { applicationId, fromStatus: application.status, toStatus: "APPROVED", userId: user.id, comment: "Маршрут пройден полностью" } });
    }
  } else if (decision === "REWORK") {
    await prisma.workflowStep.update({ where: { id: step.id }, data: { status: "PENDING", comment: historyComment, decidedById: user.id, decidedAt: new Date(), deadline: addDays(new Date(), 1) } });
    await prisma.applicationStatusHistory.create({ data: { applicationId, fromStatus: application.status, toStatus: "DOCUMENTS", userId: user.id, comment: `Возврат на доработку: ${historyComment}` } });
    await prisma.application.update({ where: { id: application.id }, data: { status: "DOCUMENTS" } });
  } else {
    await prisma.workflowStep.update({ where: { id: step.id }, data: { status: "REJECTED", decision, comment: historyComment, decidedById: user.id, decidedAt: new Date() } });
    await prisma.application.update({ where: { id: application.id }, data: { status: "REJECTED" } });
    await prisma.applicationStatusHistory.create({ data: { applicationId, fromStatus: application.status, toStatus: "REJECTED", userId: user.id, comment: `Отклонено на шаге «${step.name}»: ${historyComment}` } });
  }
  await writeAudit({ userId: user.id, roleCode: role.code, object: "application", objectId: application.id, operation: `STEP_${decision}`, newValue: JSON.stringify({ stepId: step.id, stepName: step.name, comment: historyComment }) });
  revalidatePath("/");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true };
}

function stepIsCommittee(index: number, length: number): boolean {
  return index === length - 1;
}

function statusForIndex(index: number): string {
  if (index <= 0) return "DOCUMENTS";
  if (index === 1) return "ANALYSIS";
  if (index === 2) return "ANALYSIS";
  if (index === 3) return "RISK";
  return "APPROVAL";
}

export async function overrideStopAction(applicationId: string, code: string, comment: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (role.code !== "ROLE-05") return { error: "Оверрайд стоп-фактора доступен только руководителю риск-подразделения (ROLE-05)" };
  if (!comment.trim()) return { error: "Комментарий обязателен" };
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) return { error: "Заявка не найдена" };
  const flags = JSON.parse(application.stopFlags || "[]") as string[];
  if (!flags.includes(code)) flags.push(code);
  await prisma.application.update({ where: { id: applicationId }, data: { stopFlags: JSON.stringify(flags) } });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "application", objectId: applicationId, operation: "STOP_FACTOR_OVERRIDE", newValue: JSON.stringify({ code, comment: comment.trim() }) });
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true };
}

export async function createContractAction(applicationId: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "contracts", "create")) return { error: "Недостаточно прав" };
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) return { error: "Заявка не найдена" };
  if (application.status !== "APPROVED") return { error: "Договор можно сформировать только по одобренной заявке" };
  const schedule = JSON.parse(application.scheduleJson || "[]") as ScheduleLine[];
  if (!schedule.length) return { error: "В заявке нет графика платежей — сохраните его в калькуляторе" };
  const existing = await prisma.contract.findUnique({ where: { applicationId } });
  if (existing) return { error: "Договор по этой заявке уже сформирован" };
  const contractNumber = `ДЛ-${new Date().getFullYear()}-${1000 + Math.floor(Math.random() * 900)}`;
  const contract = await prisma.contract.create({
    data: {
      number: contractNumber,
      applicationId: application.id,
      clientId: application.clientId,
      signDate: new Date(),
      amount: schedule.reduce((sum, line) => sum + Number(line.total), 0).toFixed(2),
      annualRate: application.annualRate,
      termMonths: application.termMonths,
      status: "ACTIVE",
      scheduleJson: JSON.stringify(schedule),
    },
    select: { id: true },
  });
  const version = await prisma.paymentSchedule.create({ data: { contractId: contract.id, version: 1, isActive: true, reason: "Первичный график" }, select: { id: true } });
  for (const line of schedule) {
    await prisma.scheduleLine.create({
      data: { scheduleId: version.id, seq: line.seq, dueDate: line.dueDate, principal: line.principal, interest: line.interest, vat: line.vat, commission: line.commission, total: line.total, balance: line.balance, status: "OPEN", paidTotal: "0" },
    });
  }
  await prisma.asset.create({
    data: {
      contractId: contract.id,
      type: application.product === "Станки" || application.product === "Медицинское оборудование" ? "EQUIPMENT" : "VEHICLE",
      name: application.product,
      vin: "VIN-" + application.id.slice(0, 8).toUpperCase(),
      number: "",
      cost: application.assetCost,
      status: "ORDERED",
    },
  });
  await prisma.application.update({ where: { id: application.id }, data: { status: "CONTRACT" } });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "contract", objectId: contract.id, operation: "CREATE", newValue: JSON.stringify({ number: contractNumber, clientId: application.clientId, amount: contract.amount }) });
  await prisma.notification.create({ data: { userId: user.id, channel: "INAPP", subject: "Договор сформирован", body: `${contractNumber}: проверьте условия и подпишите` } });
  revalidatePath("/contracts");
  revalidatePath(`/applications/${applicationId}`);
  redirect(`/contracts/${contract.id}`);
}

export async function importBankStatementAction() {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "payments", "create")) return { error: "Недостаточно прав" };
  const filePath = path.join(process.cwd(), "mocks", "bank-statement.csv");
  const content = readFileSync(filePath, "utf8");
  const rows = content.split("\n").slice(1).filter((row) => row.trim().length > 0);
  let imported = 0;
  let allocated = 0;
  for (const row of rows) {
    const [externalId, dateStr, amountStr] = row.split(",").map((cell) => cell.trim());
    if (!externalId || !dateStr || !amountStr) continue;
    const contract = await prisma.contract.findFirst({
      where: { status: "ACTIVE" },
      include: { paymentSchedules: { where: { isActive: true }, include: { lines: true } } },
      orderBy: { signDate: "asc" },
    });
    if (!contract) continue;
    const existing = await prisma.payment.findFirst({ where: { externalId } });
    if (existing) continue;
    const schedule = contract.paymentSchedules[0];
    if (!schedule) continue;
    const openLines: OpenScheduleLine[] = schedule.lines
      .filter((line) => line.status === "OPEN")
      .map((line) => ({ id: line.id, seq: line.seq, dueDate: line.dueDate, principal: line.principal, interest: line.interest, vat: line.vat, commission: line.commission, total: line.total, balance: line.balance }));
    const payment = await prisma.payment.create({
      data: {
        contractId: contract.id,
        date: new Date(dateStr),
        amount: amountStr,
        source: "BANK",
        externalId,
        allocations: "[]",
      },
      select: { id: true },
    });
    if (openLines.length) {
      const allocation = allocatePayment(amountStr, openLines);
      await prisma.payment.update({ where: { id: payment.id }, data: { allocations: JSON.stringify(allocation) } });
      const paidIds = new Map(allocation.filter((a) => a.scheduleLineId !== "ADVANCE").map((a) => [a.scheduleLineId, a]));
      for (const line of schedule.lines) {
        const alloc = paidIds.get(line.id);
        if (!alloc) continue;
        const paid = String(Number(line.paidTotal) + Number(alloc.principal) + Number(alloc.interest) + Number(alloc.vat) + Number(alloc.commission));
        const full = Number(paid) >= Number(line.total) - 0.01;
        await prisma.scheduleLine.update({ where: { id: line.id }, data: { paidTotal: paid, status: full ? "PAID" : "OPEN" } });
      }
      allocated += 1;
    }
    imported += 1;
  }
  await writeAudit({ userId: user.id, roleCode: role.code, object: "payment", objectId: "statement", operation: "IMPORT_BANK", newValue: JSON.stringify({ imported, allocated }) });
  revalidatePath("/payments");
  return { ok: true, imported, allocated };
}

export async function simulateTimeAction(days: number) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "admin", "view")) return { error: "Симуляция времени доступна системному администратору" };
  if (!Number.isFinite(days) || days <= 0 || days > 3660) return { error: "Некорректное число дней (1–3660)" };
  const systemDate = await getSystemDate();
  const nextDate = addDays(new Date(systemDate), days);
  await prisma.config.update({ where: { id: "system" }, data: { systemDate: nextDate.toISOString() } });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "system", objectId: "time", operation: "SIMULATE_TIME", oldValue: systemDate, newValue: nextDate.toISOString() });
  revalidatePath("/");
  return { ok: true, next: nextDate.toISOString() };
}

export async function voteAction(applicationId: string, vote: "FOR" | "AGAINST" | "ABSTAIN", comment: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "committee", "approve")) return { error: "Голосовать может только член кредитного комитета" };
  const session = await prisma.committeeSession.findFirst({ where: { status: "PLANNED" }, orderBy: { createdAt: "desc" } });
  if (!session) return { error: "Активное заседание комитета не найдено" };
  const appIds = JSON.parse(session.sessionJson || "[]") as string[];
  if (!appIds.includes(applicationId)) return { error: "Заявка не в повестке заседания" };
  await prisma.committeeVote.upsert({
    where: { sessionId_applicationId_userId: { sessionId: session.id, applicationId, userId: user.id } },
    update: { vote, comment: comment.trim() },
    create: { sessionId: session.id, applicationId, userId: user.id, vote, comment: comment.trim() },
  });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "committee", objectId: session.id, operation: "VOTE", newValue: JSON.stringify({ applicationId, vote }) });
  revalidatePath("/committee");
  return { ok: true };
}

export async function signContractMockAction(contractId: string) {
  const role = await requireRole();
  const user = await requireUser();
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return { error: "Договор не найден" };
  const fakeHash = `sha256: ${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
  await writeAudit({ userId: user.id, roleCode: role.code, object: "contract", objectId: contractId, operation: "SIGN_ECP", newValue: JSON.stringify({ signedAt: new Date().toISOString(), signer: user.name, role: role.name, hash: fakeHash }) });
  await prisma.notification.create({ data: { userId: user.id, channel: "INAPP", subject: "ЭЦП подписана", body: `${contract.number}: мок-подпись фиксирована (SHA-256)` } });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}

export async function createPaymentAction(contractId: string, amount: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "payments", "create") && !can(role.code, "contracts", "create")) return { error: "Нет доступа к зачислению платежей" };
  const parsed = new Decimal(amount);
  if (!parsed.isFinite() || parsed.lte(0)) return { error: "Сумма платежа должна быть больше нуля" };
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { paymentSchedules: { where: { isActive: true }, include: { lines: true } } },
  });
  if (!contract) return { error: "Договор не найден" };
  const schedule = contract.paymentSchedules[0];
  if (!schedule) return { error: "У договора нет активного графика" };
  const openLines: OpenScheduleLine[] = schedule.lines
    .filter((line) => line.status === "OPEN" || line.status === "PARTIAL")
    .map((line) => ({ id: line.id, seq: line.seq, dueDate: line.dueDate, principal: line.principal, interest: line.interest, vat: line.vat, commission: line.commission, total: line.total, balance: line.balance }));
  const allocations = allocatePayment(parsed.toFixed(2), openLines);
  const now = new Date();
  const payment = await prisma.payment.create({ data: { contractId, date: now, amount: parsed.toFixed(2), source: "MANUAL", externalId: null, allocations: JSON.stringify(allocations) } });
  for (const allocation of allocations) {
    if (allocation.scheduleLineId === "ADVANCE") continue;
    const line = schedule.lines.find((entry) => entry.id === allocation.scheduleLineId);
    if (!line) continue;
    const added = Number(allocation.principal) + Number(allocation.interest) + Number(allocation.vat) + Number(allocation.commission) + Number(allocation.penalty ?? 0);
    const cumulative = Number(line.paidTotal ?? 0) + added;
    const fullyPaid = cumulative >= Number(line.total) - 0.01;
    await prisma.scheduleLine.update({ where: { id: line.id }, data: { paidTotal: cumulative.toFixed(2), status: fullyPaid ? "PAID" : "PARTIAL" } });
  }
  const allocatedTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.principal) + Number(allocation.interest) + Number(allocation.vat) + Number(allocation.commission) + Number(allocation.penalty ?? 0), 0);
  await writeAudit({ userId: user.id, roleCode: role.code, object: "contract", objectId: contractId, operation: "PAYMENT_CREATE", newValue: JSON.stringify({ amount: parsed.toFixed(2), allocated: allocatedTotal.toFixed(2), reference: payment.id }) });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}