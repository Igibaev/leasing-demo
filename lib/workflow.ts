import { addWorkingHours, businessDaysBetween, dateParam } from "../lib/datetime";
import { prisma } from "../lib/prisma";
import { getSystemDate, writeAudit } from "../lib/audit";

export interface RouteStepDefinition {
  seq: number;
  name: string;
  roleCode: string;
  slaHours: number;
}

export const BASE_ROUTE: RouteStepDefinition[] = [
  { seq: 1, name: "Анализ кредитной заявки", roleCode: "ROLE-03", slaHours: 8 },
  { seq: 2, name: "Маркетинговое заключение", roleCode: "ROLE-02", slaHours: 4 },
  { seq: 3, name: "Юридическое заключение", roleCode: "ROLE-08", slaHours: 8 },
  { seq: 4, name: "Профиль риска", roleCode: "ROLE-04", slaHours: 12 },
  { seq: 5, name: "Проверка ПОД/ФТ", roleCode: "ROLE-07", slaHours: 8 },
  { seq: 6, name: "Заседание кредитного комитета", roleCode: "ROLE-14", slaHours: 24 },
];

export const EXTENDED_ROUTE: RouteStepDefinition[] = [
  ...BASE_ROUTE.slice(0, 5),
  { seq: 6, name: "Расширенный контроль лимитов", roleCode: "ROLE-05", slaHours: 12 },
  { seq: 7, name: "Заседание кредитного комитета", roleCode: "ROLE-14", slaHours: 24 },
];

const STATUS_BY_STEP: Record<number, string> = {
  0: "DOCUMENTS",
  1: "ANALYSIS",
  2: "ANALYSIS",
  3: "RISK",
  4: "RISK",
  5: "APPROVAL",
  6: "COMMITTEE",
};

export function routeFor(limitExceeded: boolean, hasSoftStop: boolean): RouteStepDefinition[] {
  if (limitExceeded || hasSoftStop) return EXTENDED_ROUTE;
  return BASE_ROUTE;
}

export async function createWorkflowForApplication(applicationId: string, route: RouteStepDefinition[], createdById: string): Promise<void> {
  const systemDate = await getSystemDate();
  let deadline = new Date(systemDate);
  for (const step of route) {
    deadline = addWorkingHours(deadline, step.slaHours);
    await prisma.workflowStep.create({
      data: {
        applicationId,
        seq: step.seq,
        name: step.name,
        roleCode: step.roleCode,
        slaHours: step.slaHours,
        deadline,
        decidedById: null,
        status: step.seq === 1 ? "PENDING" : "WAITING",
      },
    });
  }
  await writeAudit({
    userId: createdById,
    roleCode: "ROLE-01",
    object: "application",
    objectId: applicationId,
    operation: "WORKFLOW_CREATED",
    newValue: JSON.stringify(route.map((step) => `${step.seq}:${step.name}@${step.roleCode}`)),
  });
}

export function statusForStep(seq: number, routeLength: number): string {
  if (seq === routeLength) return "COMMITTEE";
  return STATUS_BY_STEP[seq] ?? "ANALYSIS";
}

export function slaLabel(deadline: Date, systemDate: Date): { label: string; overdue: boolean } {
  if (systemDate > deadline) {
    const days = businessDaysBetween(deadline, systemDate);
    return { label: days === 0 ? "просрочен сегодня" : `просрочен ${days} раб. дн.`, overdue: true };
  }
  const hours = Math.max(1, Math.round((deadline.getTime() - systemDate.getTime()) / 3600000));
  return { label: `в работе · осталось ~${hours} ч`, overdue: false };
}

export async function currentPendingStep(applicationId: string) {
  const steps = await prisma.workflowStep.findMany({
    where: { applicationId },
    orderBy: { seq: "asc" },
    include: { decidedBy: { select: { id: true, name: true } } },
  });
  const pending = steps.find((step) => step.status === "PENDING");
  return { steps, pending };
}

export { dateParam };