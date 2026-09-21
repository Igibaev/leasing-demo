"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, requireRole, requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { writeAudit, getSystemDate } from "@/lib/audit";
import { BASE_ROUTE, routeFor } from "@/lib/workflow";
import { type ScheduleLine } from "@/lib/calc";
import { paymentAmount, recordPayment } from "@/lib/payments";
import { buildScheduleForApplication } from "@/lib/schedule";
import { evaluateRiskFor, riskProfileToDto } from "@/lib/risk";
import Decimal from "decimal.js";
import { addDays, addWorkingHours } from "@/lib/datetime";
import { readFileSync } from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";

function zodError(error: z.ZodError): string {
  return error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
}

export async function switchRoleAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, roleCode: true } });
  if (!user) return { error: "Пользователь не найден" };
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, `${user.id}:${user.roleCode}`, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 7 });
  const returnTo = String(formData.get("returnTo") || "/");
  return { redirectTo: /^\/(?![\/\\])/.test(returnTo) ? returnTo : "/" };
}

const clientSchema = z.object({
  clientType: z.enum(["LEGAL", "IE", "INDIVIDUAL"]),
  binIin: z.string().regex(/^\d{12}$/, "БИН/ИИН должен содержать 12 цифр"),
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
  return { ok: true, redirectTo: `/clients/${client.id}` };
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
  const checkedAt = new Date(await getSystemDate());
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
  annualRate: z.string().regex(/^\d+(\.\d+)?$/).refine(value => new Decimal(value).lte(1000), "Ставка не может превышать 1000%"),
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
  if (!await prisma.client.findUnique({ where: { id: data.clientId } })) return { error: "Клиент не найден" };
  const down = new (await import("decimal.js")).Decimal(data.downPayment);
  const cost = new (await import("decimal.js")).Decimal(data.assetCost);
  if (down.gte(cost)) return { error: "Первоначальный взнос должен быть меньше стоимости предмета" };
  const financed = cost.minus(down).toFixed(2);
  const user = await requireUser();
  const systemDate = new Date(await getSystemDate());
  const number = `Z-${systemDate.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
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
      scheduleJson: JSON.stringify(buildScheduleForApplication(data, addDays(systemDate, 30).toISOString().slice(0, 10))),
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
  return { ok: true, redirectTo: `/applications/${application.id}` };
}

export async function submitApplicationAction(applicationId: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "applications", "create")) return { error: "Недостаточно прав" };
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { client: true } });
  if (!app) return { error: "Заявка не найдена" };
  if (app.createdById !== user.id) return { error: "Создатель заявки должен передать её на рассмотрение" };
  const risk = await evaluateRiskFor(app.client, app);
  const hardHits = risk.stopFactors.hits.filter(hit => hit.type === "HARD");
  if (hardHits.length) return { error: `Жёсткий стоп-фактор блокирует сделку: ${hardHits.map(hit => hit.name).join("; ")}` };
  const route = routeFor(risk.limits.checks.some(check => check.exceeded), risk.stopFactors.hits.some(hit => hit.type === "SOFT"));
  const systemDate = new Date(await getSystemDate());
  const result = await prisma.$transaction(async tx => {
    const claimed = await tx.application.updateMany({ where: { id: applicationId, status: "DRAFT" }, data: { status: "REGISTERED" } });
    if (!claimed.count) return { error: "Заявка уже в работе" };
    let deadline = systemDate;
    for (const step of route) {
      deadline = addWorkingHours(deadline, step.slaHours);
      await tx.workflowStep.create({ data: { ...step, applicationId, deadline, status: step.seq === 1 ? "PENDING" : "WAITING" } });
    }
    await tx.applicationStatusHistory.create({ data: { applicationId, fromStatus: "DRAFT", toStatus: "REGISTERED", userId: user.id, comment: "Заявка отправлена на рассмотрение" } });
    await tx.auditLog.create({ data: { userId: user.id, roleCode: role.code, object: "application", objectId: applicationId, operation: "SUBMIT", newValue: String(route.length) } });
    await tx.notification.create({ data: { userId: user.id, subject: "Заявка в работе", body: `${app.number}: ${route.length} шагов согласования` } });
    return { ok: true, lessons: [`Маршрут построен: ${route.length} шагов${route === BASE_ROUTE ? "" : " (расширенный)"}`] };
  });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/committee");
  revalidatePath("/");
  return result;
}

export async function decideStepAction(applicationId: string, stepId: string, decision: "APPROVE" | "REWORK" | "REJECT", comment: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (!["APPROVE", "REWORK", "REJECT"].includes(decision)) return { error: "Неизвестное решение" };
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { client: true } });
  if (!application) return { error: "Заявка не найдена" };
  const risk = await evaluateRiskFor(application.client, application);
  if (decision === "APPROVE" && risk.stopFactors.hits.some(hit => hit.type === "HARD")) return { error: "Жёсткий стоп-фактор блокирует согласование" };
  if (decision !== "APPROVE" && !comment.trim()) return { error: "Для доработки или отклонения нужен комментарий" };
  const result = await prisma.$transaction(async tx => {
    const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId }, include: { workflowSteps: { orderBy: { seq: "asc" } } } });
    if (!["REGISTERED", "DOCUMENTS", "ANALYSIS", "RISK", "APPROVAL", "COMMITTEE"].includes(app.status)) return { error: "Заявка не находится на согласовании" };
    if (app.createdById === user.id) return { error: "Maker-Checker: создатель заявки не может согласовывать свой объект" };
    const step = app.workflowSteps.find(entry => entry.id === stepId);
    if (!step || step.status !== "PENDING") return { error: "Шаг не активен или уже решён" };
    if (app.workflowSteps.some(entry => entry.seq < step.seq && !["APPROVED", "DONE"].includes(entry.status))) return { error: "Сначала завершите предыдущие шаги" };
    if (step.roleCode !== role.code) return { error: `Решение по шагу принимает роль ${step.roleCode}` };
    if (step.roleCode === "ROLE-14") return { error: "Решение принимается голосованием в разделе «Комитет»" };
    const overrides = new Set(JSON.parse(app.stopFlags || "[]") as string[]);
    if (decision === "APPROVE" && step.roleCode === "ROLE-05" && risk.stopFactors.hits.some(hit => hit.type === "SOFT" && !overrides.has(hit.code))) return { error: "Сначала обоснуйте оверрайд мягких стоп-факторов" };
    const next = app.workflowSteps.find(entry => entry.seq > step.seq);
    const toStatus = decision === "REJECT" ? "REJECTED" : decision === "REWORK" ? "DOCUMENTS" : next?.roleCode === "ROLE-14" ? "COMMITTEE" : statusForIndex((next?.seq ?? 1) - 1);
    const now = new Date((await tx.config.findUnique({ where: { id: "system" } }))!.systemDate);
    await tx.workflowStep.update({ where: { id: step.id }, data: {
      status: decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "PENDING",
      decision, comment: comment.trim(), decidedById: user.id, decidedAt: now,
    } });
    if (decision === "APPROVE" && next) {
      await tx.workflowStep.update({ where: { id: next.id }, data: { status: "PENDING" } });
      if (next.roleCode === "ROLE-14") await tx.committeeSession.create({ data: { date: now, status: "PLANNED", sessionJson: JSON.stringify([applicationId]) } });
    }
    if (decision === "REJECT") await tx.workflowStep.updateMany({ where: { applicationId, seq: { gt: step.seq } }, data: { status: "CANCELLED" } });
    await tx.application.update({ where: { id: applicationId }, data: { status: toStatus } });
    await tx.applicationStatusHistory.create({ data: { applicationId, fromStatus: app.status, toStatus, userId: user.id, comment: `${step.name}: ${decision}. ${comment.trim()}` } });
    await tx.auditLog.create({ data: { userId: user.id, roleCode: role.code, object: "application", objectId: applicationId, operation: `STEP_${decision}`, newValue: JSON.stringify({ stepId, comment: comment.trim() }) } });
    return { ok: true };
  });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/committee");
  revalidatePath("/");
  return result;
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
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { client: true } });
  if (!application) return { error: "Заявка не найдена" };
  if (["REJECTED", "APPROVED", "CONTRACT", "FUNDED"].includes(application.status)) return { error: "Заявка уже завершена" };
  const risk = await evaluateRiskFor(application.client, application);
  if (!risk.stopFactors.hits.some(hit => hit.code === code && hit.type === "SOFT")) return { error: "Можно снять только действующий мягкий стоп-фактор" };
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
  const systemDate = new Date(await getSystemDate());
  const client = await prisma.client.findUniqueOrThrow({ where: { id: application.clientId } });
  const risk = await evaluateRiskFor(client, application);
  if (risk.stopFactors.hits.some(hit => hit.type === "HARD")) return { error: "Жёсткий стоп-фактор блокирует договор" };
  const contractNumber = `ДЛ-${systemDate.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const contract = await prisma.$transaction(async tx => {
  const contract = await tx.contract.create({
    data: {
      number: contractNumber,
      applicationId: application.id,
      clientId: application.clientId,
      signDate: systemDate,
      amount: schedule.reduce((sum, line) => sum.plus(line.total), new Decimal(0)).toFixed(2),
      annualRate: application.annualRate,
      termMonths: application.termMonths,
      status: "ACTIVE",
      scheduleJson: JSON.stringify(schedule),
    },
    select: { id: true, amount: true },
  });
  const version = await tx.paymentSchedule.create({ data: { contractId: contract.id, version: 1, isActive: true, reason: "Первичный график" }, select: { id: true } });
  for (const line of schedule) {
    await tx.scheduleLine.create({
      data: { scheduleId: version.id, seq: line.seq, dueDate: line.dueDate, principal: line.principal, interest: line.interest, vat: line.vat, commission: line.commission, total: line.total, balance: line.balance, status: "OPEN", paidTotal: "0" },
    });
  }
  await tx.asset.create({
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
  await tx.application.update({ where: { id: application.id }, data: { status: "CONTRACT" } });
  await tx.auditLog.create({ data: { userId: user.id, roleCode: role.code, object: "contract", objectId: contract.id, operation: "CREATE", newValue: JSON.stringify({ number: contractNumber, clientId: application.clientId, amount: contract.amount }) } });
  await tx.notification.create({ data: { userId: user.id, channel: "INAPP", subject: "Договор сформирован", body: `${contractNumber}: проверьте условия и подпишите` } });
  return contract;
  });
  revalidatePath("/contracts");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true, redirectTo: `/contracts/${contract.id}` };
}

export async function importBankStatementAction() {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "payments", "create")) return { error: "Недостаточно прав" };
  const rows = readFileSync(path.join(process.cwd(), "mocks", "bank-statement.csv"), "utf8").trim().split(/\r?\n/).slice(1);
  const result = await prisma.$transaction(async tx => {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const [externalId, dateStr, amountStr, contractNumber, currency] = row.split(",").map(cell => cell.trim());
      const amount = paymentAmount(amountStr ?? "");
      if (!externalId || !amount || currency !== "KZT" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "") || !Number.isFinite(Date.parse(dateStr)) || new Date(dateStr).toISOString().slice(0, 10) !== dateStr) {
        errors.push(`${externalId || "Строка"}: неверные данные выписки`); continue;
      }
      const contract = await tx.contract.findUnique({ where: { number: contractNumber || "" } });
      if (!contract) { errors.push(`${externalId}: договор ${contractNumber} не найден`); continue; }
      const saved = await recordPayment(tx, { contractId: contract.id, amount, date: new Date(dateStr), source: "BANK", externalId, userId: user.id, roleCode: role.code });
      if (saved.error) errors.push(`${externalId}: ${saved.error}`);
      else if (saved.duplicate) skipped++;
      else imported++;
    }
    return { ok: true, imported, allocated: imported, skipped, errors };
  });
  revalidatePath("/", "layout");
  return result;
}

export async function simulateTimeAction(days: number) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "admin", "view")) return { error: "Симуляция времени доступна системному администратору" };
  if (!Number.isInteger(days) || days <= 0 || days > 3660) return { error: "Некорректное число дней (1–3660)" };
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
  if (!["ROLE-14", "ROLE-15", "ROLE-02"].includes(role.code)) return { error: "Голосовать может только член демо-комитета" };
  if (!["FOR", "AGAINST", "ABSTAIN"].includes(vote)) return { error: "Неизвестный голос" };
  const app = await prisma.application.findUnique({ where: { id: applicationId }, include: { client: true } });
  if (!app) return { error: "Заявка не найдена" };
  const risk = await evaluateRiskFor(app.client, app);
  if (vote === "FOR" && risk.stopFactors.hits.some(hit => hit.type === "HARD" || !JSON.parse(app.stopFlags || "[]").includes(hit.code))) return { error: "Есть неустранённые стоп-факторы" };
  const result = await prisma.$transaction(async tx => {
    const application = await tx.application.findUniqueOrThrow({ where: { id: applicationId } });
    if (application.status !== "COMMITTEE") return { error: "Заявка не ожидает решения комитета" };
    if (application.createdById === user.id) return { error: "Maker-Checker: автор не голосует по своей заявке" };
    const sessions = await tx.committeeSession.findMany({ where: { status: "PLANNED" }, orderBy: { createdAt: "desc" } });
    const session = sessions.find(entry => JSON.parse(entry.sessionJson).includes(applicationId));
    if (!session) return { error: "Заявка не включена в повестку" };
    const existing = await tx.committeeVote.findUnique({ where: { sessionId_applicationId_userId: { sessionId: session.id, applicationId, userId: user.id } } });
    if (existing) return { error: "Ваш голос уже учтён" };
    await tx.committeeVote.create({ data: { sessionId: session.id, applicationId, userId: user.id, vote, comment: comment.trim() } });
    const votes = await tx.committeeVote.findMany({ where: { sessionId: session.id, applicationId }, include: { user: true } });
    const eligible = votes.filter(entry => ["ROLE-14", "ROLE-15", "ROLE-02"].includes(entry.user.roleCode));
    const forCount = new Set(eligible.filter(entry => entry.vote === "FOR").map(entry => entry.user.roleCode)).size;
    const againstCount = new Set(eligible.filter(entry => entry.vote === "AGAINST").map(entry => entry.user.roleCode)).size;
    const allVoted = new Set(eligible.map(entry => entry.user.roleCode)).size === 3;
    const status = forCount >= 2 ? "APPROVED" : againstCount >= 2 || allVoted ? "REJECTED" : null;
    await tx.auditLog.create({ data: { userId: user.id, roleCode: role.code, object: "committee", objectId: session.id, operation: "VOTE", newValue: JSON.stringify({ applicationId, vote }) } });
    if (status) {
      await tx.application.update({ where: { id: applicationId }, data: { status } });
      await tx.workflowStep.updateMany({ where: { applicationId, roleCode: "ROLE-14", status: "PENDING" }, data: { status, decision: status === "APPROVED" ? "APPROVE" : "REJECT", decidedById: user.id, decidedAt: new Date(), comment: "Решение демо-комитета: 2 из 3; без большинства после трёх голосов — отказ" } });
      await tx.applicationStatusHistory.create({ data: { applicationId, fromStatus: "COMMITTEE", toStatus: status, userId: user.id, comment: "Решение демо-комитета" } });
      await tx.auditLog.create({ data: { userId: user.id, roleCode: role.code, object: "application", objectId: applicationId, operation: "COMMITTEE_DECISION", newValue: status } });
      const pending = await tx.application.count({ where: { id: { in: JSON.parse(session.sessionJson) }, status: "COMMITTEE" } });
      if (!pending) await tx.committeeSession.update({ where: { id: session.id }, data: { status: "CLOSED" } });
    }
    return { ok: true };
  });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/committee");
  revalidatePath("/");
  return result;
}

export async function signContractMockAction(contractId: string) {
  const role = await requireRole();
  const user = await requireUser();
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return { error: "Договор не найден" };
  if (!can(role.code, "contracts", "sign")) return { error: "Нет права подписывать договор" };
  const signedAt = await getSystemDate();
  const content = JSON.stringify({ number: contract.number, applicationId: contract.applicationId, clientId: contract.clientId, amount: contract.amount, annualRate: contract.annualRate, termMonths: contract.termMonths, schedule: contract.scheduleJson });
  const hash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const certificateFingerprint = createHash("sha256").update(`DEMO-NUC-RK:${user.id}`).digest("hex").match(/.{1,2}/g)?.join(":").toUpperCase() ?? "";
  await writeAudit({ userId: user.id, roleCode: role.code, object: "contract", objectId: contractId, operation: "SIGN_ECP", newValue: JSON.stringify({ signedAt, signer: user.name, role: role.name, certificate: "НУЦ РК DEMO RSA", certificateFingerprint, hash }) });
  await prisma.notification.create({ data: { userId: user.id, channel: "INAPP", subject: "ЭЦП подписана", body: `${contract.number}: мок-подпись фиксирована (SHA-256)` } });
  revalidatePath(`/contracts/${contractId}`);
  return { ok: true };
}

export async function createPaymentAction(contractId: string, amount: string, requestId?: string) {
  const role = await requireRole();
  const user = await requireUser();
  if (!can(role.code, "payments", "create")) return { error: "Нет доступа к зачислению платежей" };
  const parsed = paymentAmount(amount);
  if (!parsed) return { error: "Введите положительную сумму с точностью до двух знаков" };
  const paymentDate = new Date(await getSystemDate());
  const result = await prisma.$transaction(tx => recordPayment(tx, {
    contractId, amount: parsed, date: paymentDate, source: "MANUAL",
    externalId: requestId ? `MANUAL:${contractId}:${requestId}` : undefined,
    userId: user.id, roleCode: role.code,
  }));
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/payments");
  revalidatePath("/overdue");
  revalidatePath("/");
  return result.duplicate ? { ok: true } : result;
}
