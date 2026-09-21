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
import { allocatePayment, type ScheduleLine, type OpenScheduleLine } from "@/lib/calc";
import { buildScheduleForApplication } from "@/lib/schedule";
import { evaluateRiskFor, riskProfileToDto } from "@/lib/risk";
import Decimal from "decimal.js";
import { addDays } from "@/lib/datetime";
import { readFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";

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

const mockDocumentSchema = z.object({
  clientId: z.string().min(1),
  category: z.enum(["APPLICATION", "CORPORATE", "FINANCIAL", "LEGAL", "DECISION", "CONTRACT", "INSURANCE", "OTHER"]),
  name: z.string().trim().min(3).max(120),
  validUntil: z.string().optional(),
});

export async function createMockDocumentAction(_prev: unknown, formData: FormData) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "clients", "edit")) return { error: "Нет права изменять досье клиента" };
  const parsed = mockDocumentSchema.safeParse({ clientId: formData.get("clientId"), category: formData.get("category"), name: formData.get("name"), validUntil: formData.get("validUntil") || undefined });
  if (!parsed.success) return { error: zodError(parsed.error) };
  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId }, select: { id: true } });
  if (!client) return { error: "Клиент не найден" };
  const createdAt = new Date();
  const contentHash = createHash("sha256").update(JSON.stringify({ ...parsed.data, createdAt: createdAt.toISOString(), createdById: user.id })).digest("hex");
  const document = await prisma.clientDocument.create({ data: { ...parsed.data, validUntil: parsed.data.validUntil || null, contentHash, createdById: user.id, createdAt } });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "client_document", objectId: document.id, operation: "CREATE", newValue: JSON.stringify({ clientId: client.id, category: document.category, name: document.name, hash: contentHash }) });
  revalidatePath(`/clients/${client.id}`);
  return { ok: true };
}

export async function runAmlCheckAction(clientId: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (!["ROLE-07", "ROLE-17"].includes(role.code)) return { error: "Проверку ПОД/ФТ выполняет только уполномоченная роль" };
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { relatedParties: true } });
  if (!client) return { error: "Клиент не найден" };
  const hasPep = client.relatedParties.some((party) => party.isPep);
  const result = hasPep ? "REVIEW_REQUIRED" : "CLEAR";
  const riskLevel = hasPep ? "HIGH" : client.ewsColor === "RED" ? "HIGH" : "LOW";
  const checkedAt = new Date();
  const nextReviewDate = new Date(Date.UTC(checkedAt.getUTCFullYear() + (riskLevel === "HIGH" ? 1 : 3), checkedAt.getUTCMonth(), checkedAt.getUTCDate())).toISOString().slice(0, 10);
  const check = await prisma.amlCheck.create({ data: { clientId, result, riskLevel, source: "DEMO_KZ_AML", details: hasPep ? "Обнаружен PEP-признак у связанного лица; требуется ручная проверка" : "Совпадений в демонстрационных перечнях не найдено", checkedById: user.id, checkedAt, nextReviewDate } });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "aml_check", objectId: check.id, operation: "CHECK", newValue: JSON.stringify({ clientId, result, riskLevel, nextReviewDate }) });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
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
      scheduleJson: JSON.stringify(buildScheduleForApplication(data)),
    },
    select: { id: true },
  });
  const created = await prisma.application.findUnique({ where: { id: application.id }, include: { client: true } });
  if (created) {
    const risk = await evaluateRiskFor(created.client, created);
    const dto = riskProfileToDto(risk);
    await prisma.application.update({ where: { id: application.id }, data: { riskScore: dto.riskScore, riskRating: dto.riskRating } });
  }
  await writeAudit({ userId: user.id, roleCode: role.code, object: "application", objectId: application.id, operation: "CREATE", newValue: JSON.stringify({ number, clientId: data.clientId, financedAmount: financed }) });
  revalidatePath("/applications");
  redirect(`/applications/${application.id}`);
}

export async function submitApplicationAction(applicationId: string) {
  const role = await requireRole();
  const user = await requireUser();
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { workflowSteps: true, client: true } });
  if (!application) return { error: "Заявка не найдена" };
  if (application.createdById !== user.id) return { error: "Создатель заявки должен передать её на рассмотрение" };
  if (application.status !== "DRAFT" && application.status !== "REGISTERED") return { error: "Заявка уже в работе" };
  const lessons: string[] = [];
  const existing = application.workflowSteps;
  let routeLength = existing.length;
  if (existing.length === 0) {
    const risk = await evaluateRiskFor(application.client, application);
    const overridden = new Set<string>();
    try {
      JSON.parse(application.stopFlags || "[]").forEach((code: unknown) => { if (typeof code === "string") overridden.add(code); });
    } catch { /* сохраняем пустой набор */ }
    const limitExceeded = risk.limits.checks.some((check) => check.exceeded);
    const softHits = risk.stopFactors.hits.filter((factor) => factor.type === "SOFT" && !overridden.has(factor.code));
    const hardHits = risk.stopFactors.hits.filter((factor) => factor.type === "HARD");
    if (hardHits.length) lessons.push(`Жёсткий стоп-фактор блокирует сделку: ${hardHits.map((factor) => factor.name).join("; ")}`);
    const route = routeFor(limitExceeded, softHits.length > 0);
    await createWorkflowForApplication(application.id, route, user.id);
    routeLength = route.length;
    lessons.push(`Маршрут построен: ${route.length} шагов${route === BASE_ROUTE ? "" : " (расширенный — лимит или мягкий стоп-фактор)"}`);
  }
  await prisma.application.update({ where: { id: application.id }, data: { status: "REGISTERED" } });
  await prisma.applicationStatusHistory.create({ data: { applicationId: application.id, fromStatus: "DRAFT", toStatus: "REGISTERED", userId: user.id, comment: "Заявка отправлена на рассмотрение" } });
  await writeAudit({ userId: user.id, roleCode: role.code, object: "application", objectId: application.id, operation: "SUBMIT", newValue: String(routeLength) });
  await prisma.notification.create({ data: { userId: application.createdById, channel: "INAPP", subject: "Заявка в работе", body: `Заявка ${application.number} отправлена на маршрут согласования (${routeLength} шагов)` } });
  revalidatePath("/");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true, lessons };
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

type ActiveSchedule = { lines: (ScheduleLine & { id: string; paidTotal: string; status: string })[] };

function openLinesFor(schedule: ActiveSchedule): OpenScheduleLine[] {
  return schedule.lines
    .filter((line) => line.status === "OPEN" || line.status === "PARTIAL")
    .map((line) => ({ id: line.id, seq: line.seq, dueDate: line.dueDate, principal: line.principal, interest: line.interest, vat: line.vat, commission: line.commission, total: line.total, balance: line.balance }));
}

function lineRemaining(line: { total: string; paidTotal?: string }): number {
  return Number(line.total) - Number(line.paidTotal ?? 0);
}

async function allocateToScheduleLines(schedule: ActiveSchedule, allocations: { scheduleLineId: string; principal: string; interest: string; vat: string; commission: string; penalty?: string }[]): Promise<void> {
  for (const allocation of allocations) {
    if (allocation.scheduleLineId === "ADVANCE") continue;
    const line = schedule.lines.find((entry) => entry.id === allocation.scheduleLineId);
    if (!line) continue;
    const added = Number(allocation.principal) + Number(allocation.interest) + Number(allocation.vat) + Number(allocation.commission) + Number(allocation.penalty ?? 0);
    const cumulative = Number(line.paidTotal ?? 0) + added;
    const fullyPaid = cumulative >= Number(line.total) - 0.01;
    await prisma.scheduleLine.update({ where: { id: line.id }, data: { paidTotal: cumulative.toFixed(2), status: fullyPaid ? "PAID" : "PARTIAL" } });
  }
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
    select: { id: true, amount: true },
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
  const contracts = await prisma.contract.findMany({
    where: { status: "ACTIVE" },
    include: { paymentSchedules: { where: { isActive: true }, include: { lines: true } } },
    orderBy: { signDate: "asc" },
  });
  let imported = 0;
  let allocated = 0;
  for (const row of rows) {
    const [externalId, dateStr, amountStr] = row.split(",").map((cell) => cell.trim());
    if (!externalId || !dateStr || !amountStr) continue;
    const existing = await prisma.payment.findFirst({ where: { externalId } });
    if (existing) continue;
    const candidate = contracts.find((contract) => {
      const schedule = contract.paymentSchedules[0];
      if (!schedule) return false;
      const open = openLinesFor(schedule);
      return open.reduce((sum, line) => sum + lineRemaining(line), 0) >= Number(amountStr);
    });
    const contract = candidate ?? contracts.find((entry) => entry.paymentSchedules[0]?.lines.some((line) => line.status === "OPEN" || line.status === "PARTIAL")) ?? contracts[0];
    if (!contract) continue;
    const schedule = contract.paymentSchedules[0];
    if (!schedule) continue;
    const openLines = openLinesFor(schedule);
    const allocations = openLines.length ? allocatePayment(amountStr, openLines) : [];
    const payment = await prisma.payment.create({
      data: {
        contractId: contract.id,
        date: new Date(dateStr),
        amount: amountStr,
        source: "BANK",
        externalId,
        allocations: JSON.stringify(allocations),
      },
      select: { id: true },
    });
    await allocateToScheduleLines(schedule, allocations);
    if (allocations.length) allocated += 1;
    await writeAudit({ userId: user.id, roleCode: role.code, object: "contract", objectId: contract.id, operation: "PAYMENT_IMPORT", newValue: JSON.stringify({ amount: amountStr, externalId, reference: payment.id }) });
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
  if (!can(role.code, "contracts", "sign")) return { error: "Нет права подписывать договор" };
  const signedAt = new Date().toISOString();
  const content = JSON.stringify({ number: contract.number, applicationId: contract.applicationId, clientId: contract.clientId, amount: contract.amount, annualRate: contract.annualRate, termMonths: contract.termMonths, schedule: contract.scheduleJson });
  const hash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const certificateFingerprint = createHash("sha256").update(`DEMO-NUC-RK:${user.id}`).digest("hex").match(/.{1,2}/g)?.join(":").toUpperCase() ?? "";
  await writeAudit({ userId: user.id, roleCode: role.code, object: "contract", objectId: contractId, operation: "SIGN_ECP", newValue: JSON.stringify({ signedAt, signer: user.name, role: role.name, certificate: "НУЦ РК DEMO RSA", certificateFingerprint, hash }) });
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
  const openLines = openLinesFor(schedule);
  const allocations = allocatePayment(parsed.toFixed(2), openLines);
  const payment = await prisma.payment.create({ data: { contractId, date: new Date(await getSystemDate()), amount: parsed.toFixed(2), source: "MANUAL", externalId: null, allocations: JSON.stringify(allocations) } });
  await allocateToScheduleLines(schedule, allocations);
  const allocatedTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.principal) + Number(allocation.interest) + Number(allocation.vat) + Number(allocation.commission) + Number(allocation.penalty ?? 0), 0);
  await writeAudit({ userId: user.id, roleCode: role.code, object: "contract", objectId: contractId, operation: "PAYMENT_CREATE", newValue: JSON.stringify({ amount: parsed.toFixed(2), allocated: allocatedTotal.toFixed(2), reference: payment.id }) });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}
