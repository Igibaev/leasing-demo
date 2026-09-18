import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const state = vi.hoisted(() => ({ cookie: "" as string, redirects: [] as string[] }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "leasing_session" && state.cookie ? { value: state.cookie } : undefined),
    set: (_name: string, value: string) => {
      state.cookie = value;
    },
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirects.push(url);
    throw new Error("REDIRECT:" + url);
  },
}));

import {
  createClientAction,
  createApplicationAction,
  submitApplicationAction,
  decideStepAction,
  overrideStopAction,
  createContractAction,
  importBankStatementAction,
  simulateTimeAction,
  voteAction,
  signContractMockAction,
  createPaymentAction,
} from "@/app/actions";

async function run<T>(roleCode: string, fn: () => Promise<T>): Promise<T> {
  const user = await prisma.user.findFirstOrThrow({ where: { roleCode } });
  state.cookie = `${user.id}:${roleCode}`;
  state.redirects.length = 0;
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      return null as T;
    }
    throw error;
  }
}

const form = (entries: Record<string, string>) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
};

describe("server actions: полный клиентский сценарий", () => {
  it("создание → маршрут → согласование → договор → платежи → симуляция времени", async () => {
    const binIin = String(Math.floor(100000000000 + Math.random() * 899999999999));

    await run("ROLE-01", () =>
      createClientAction(null as unknown, form({
        clientType: "LEGAL",
        binIin,
        name: "ТОО «Тестовая сделка»",
        oked: "46610",
        registrationDate: "2021-03-12",
        address: "г. Алматы, пр. Аль-Фараби",
        phone: "+77001112233",
        email: "",
      })),
    );
    const client = await prisma.client.findUniqueOrThrow({ where: { binIin } });
    expect(client.ewsColor).toBe("GREEN");
    expect(client.riskRating).toBe("C");

    await run("ROLE-01", () =>
      createApplicationAction(null as unknown, form({
        clientId: client.id,
        product: "Комбайн",
        assetCost: "900000000",
        downPayment: "100000000",
        termMonths: "36",
        annualRate: "18.0",
        scheduleType: "ANNUITY",
      })),
    );
    const createdApp = await prisma.application.findFirstOrThrow({ where: { clientId: client.id }, orderBy: { createdAt: "desc" } });
    expect(createdApp.status).toBe("DRAFT");
    expect(createdApp.financedAmount).toBe("800000000.00");
    const lines = JSON.parse(createdApp.scheduleJson || "[]") as unknown[];
    expect(lines).toHaveLength(36);
    expect(createdApp.riskScore).toBeGreaterThan(0);

    const submitted = await run("ROLE-01", () => submitApplicationAction(createdApp.id));
    expect(submitted.ok).toBe(true);
    expect(String(submitted.lessons?.join(" "))).toContain("расширенный");
    let refreshed = await prisma.application.findUniqueOrThrow({ where: { id: createdApp.id }, include: { workflowSteps: { orderBy: { seq: "asc" } } } });
    expect(refreshed.status).toBe("REGISTERED");
    expect(refreshed.workflowSteps).toHaveLength(7);

    const routeRoles = ["ROLE-03", "ROLE-02", "ROLE-08", "ROLE-04", "ROLE-07", "ROLE-05", "ROLE-14"];
    for (const roleCode of routeRoles) {
      refreshed = await prisma.application.findUniqueOrThrow({ where: { id: createdApp.id }, include: { workflowSteps: { orderBy: { seq: "asc" } } } });
      const step = refreshed.workflowSteps.find((s) => s.status === "PENDING");
      expect(step).toBeDefined();
      const result = await run(roleCode, () => decideStepAction(createdApp.id, step!.id, "APPROVE", "согласовано"));
      expect(result.ok).toBe(true);
    }
    refreshed = await prisma.application.findUniqueOrThrow({ where: { id: createdApp.id }, include: { workflowSteps: true } });
    expect(refreshed.status).toBe("APPROVED");
    expect(refreshed.workflowSteps.every((s) => s.status === "APPROVED")).toBe(true);

    const audit = await prisma.auditLog.count({ where: { objectId: createdApp.id, operation: { startsWith: "STEP_" } } });
    expect(audit).toBe(7);

    const overdue = await run("ROLE-05", () => overrideStopAction(createdApp.id, "HIGH_EXPOSURE", "лимит согласован отдельно"));
    expect(overdue.ok).toBe(true);
    const flagged = await prisma.application.findUniqueOrThrow({ where: { id: createdApp.id } });
    expect(JSON.parse(flagged.stopFlags || "[]")).toContain("HIGH_EXPOSURE");

    const noPermission = await run("ROLE-01", () => createContractAction(createdApp.id));
    expect(noPermission.error).toBeTruthy();

    const contract = await run("ROLE-09", () => createContractAction(createdApp.id));
    expect(contract).toBeNull();
    const createdContract = await prisma.contract.findUniqueOrThrow({ where: { applicationId: createdApp.id }, include: { paymentSchedules: { include: { lines: true } }, asset: true } });
    expect(createdContract.status).toBe("ACTIVE");
    expect(createdContract.paymentSchedules).toHaveLength(1);
    expect(createdContract.paymentSchedules[0]!.lines).toHaveLength(36);
    expect(createdContract.paymentSchedules[0]!.lines.every((l) => l.status === "OPEN")).toBe(true);
    expect(createdContract.asset).not.toBeNull();

    const firstTotal = createdContract.paymentSchedules[0]!.lines[0]!.total;
    const payment = await run("ROLE-11", () => createPaymentAction(createdContract.id, firstTotal));
    expect(payment.ok).toBe(true);
    const paidContract = await prisma.contract.findUniqueOrThrow({ where: { id: createdContract.id }, include: { paymentSchedules: { include: { lines: true } } } });
    expect(paidContract.paymentSchedules[0]!.lines[0]!.status).toBe("PAID");
    expect(Number(paidContract.paymentSchedules[0]!.lines[0]!.paidTotal)).toBeCloseTo(Number(firstTotal));
    const paymentRow = await prisma.payment.findFirstOrThrow({ where: { contractId: createdContract.id, source: "MANUAL" } });
    expect(paymentRow.externalId).toBeNull();

    const imported = await run("ROLE-11", () => importBankStatementAction());
    expect(imported.ok).toBe(true);
    expect(Number(imported.imported)).toBeGreaterThan(0);
    const bankPayments = await prisma.payment.findMany({ where: { source: "BANK" } });
    expect(bankPayments.length).toBeGreaterThan(0);

    await run("ROLE-09", () => signContractMockAction(createdContract.id));
    const signedAudit = await prisma.auditLog.count({ where: { objectId: createdContract.id, operation: "SIGN_ECP" } });
    expect(signedAudit).toBe(1);

    const before = await prisma.config.findUniqueOrThrow({ where: { id: "system" } });
    const simulated = await run("ROLE-17", () => simulateTimeAction(90));
    expect(simulated.ok).toBe(true);
    const after = await prisma.config.findUniqueOrThrow({ where: { id: "system" } });
    expect(Date.parse(after.systemDate) - Date.parse(before.systemDate)).toBe(90 * 86400000);

    const committeeApp = await prisma.application.findFirstOrThrow({ where: { status: "COMMITTEE" } });
    const session = await prisma.committeeSession.findFirstOrThrow({ where: { status: "PLANNED" } });
    const vote = await run("ROLE-14", () => voteAction(committeeApp.id, "FOR", "за"));
    expect(vote.ok).toBe(true);
    const member = await prisma.user.findFirstOrThrow({ where: { roleCode: "ROLE-14" } });
    const savedVote = await prisma.committeeVote.findUniqueOrThrow({ where: { sessionId_applicationId_userId: { sessionId: session.id, applicationId: committeeApp.id, userId: member.id } } });
    expect(savedVote.vote).toBe("FOR");
  });

  it("негативные проверки: maker-checker и неверная роль", async () => {
    const client = await prisma.client.findFirstOrThrow({});
    await run("ROLE-01", () =>
      createApplicationAction(null as unknown, form({
        clientId: client.id,
        product: "Трактор",
        assetCost: "50000000",
        downPayment: "10000000",
        termMonths: "12",
        annualRate: "16.0",
        scheduleType: "ANNUITY",
      })),
    );
    const app = await prisma.application.findFirstOrThrow({ where: { status: "DRAFT" }, orderBy: { createdAt: "desc" } });
    const creator = await prisma.user.findFirstOrThrow({ where: { roleCode: "ROLE-01" } });
    const submitted = await run("ROLE-01", () => submitApplicationAction(app.id));
    expect(submitted.ok).toBe(true);
    const step = await prisma.workflowStep.findFirstOrThrow({ where: { applicationId: app.id, status: "PENDING" } });
    state.cookie = `${creator.id}:${step.roleCode}`;
    const block = await decideStepAction(app.id, step.id, "APPROVE", "");
    expect(block.error).toContain("Maker-Checker");

    const other = await prisma.user.findFirstOrThrow({ where: { roleCode: "ROLE-08" } });
    state.cookie = `${other.id}:ROLE-08`;
    const wrongRole = await decideStepAction(app.id, step.id, "APPROVE", "");
    expect(String(wrongRole.error)).toContain("принимает роль");
  });
});