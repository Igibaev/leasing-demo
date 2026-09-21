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
  createMockDocumentAction,
  runAmlCheckAction,
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

describe("demo business scenarios against an isolated SQLite database", () => {
  it("заявка → маршрут по ролям → решение комитета → договор → платёж", async () => {
    const client = await prisma.client.findUniqueOrThrow({ where: { binIin: "000000000001" } });
    const created = await run("ROLE-01", () => createApplicationAction(null, form({ clientId: client.id, product: "Автобус", assetCost: "900000000", downPayment: "100000000", termMonths: "36", annualRate: "18", scheduleType: "ANNUITY" })));
    if (!("redirectTo" in created) || !created.redirectTo) throw new Error("Application was not created");
    const appId = created.redirectTo.split("/").pop()!;
    const submitted = await run("ROLE-01", () => submitApplicationAction(appId));
    expect(submitted).toMatchObject({ ok: true });
    const steps = await prisma.workflowStep.findMany({ where: { applicationId: appId }, orderBy: { seq: "asc" } });
    expect(steps).toHaveLength(7);
    expect(steps.filter(step => step.status === "PENDING")).toHaveLength(1);
    expect(await run("ROLE-01", () => submitApplicationAction(appId))).toHaveProperty("error");
    expect(await run("ROLE-02", () => decideStepAction(appId, steps[1].id, "APPROVE", ""))).toHaveProperty("error");
    for (const step of steps.slice(0, -1)) {
      if (step.roleCode === "ROLE-05") {
        expect(await run("ROLE-05", () => decideStepAction(appId, step.id, "APPROVE", ""))).toHaveProperty("error");
        expect(await run("ROLE-05", () => overrideStopAction(appId, "HIGH_EXPOSURE", "Демонстрационное обоснование"))).toMatchObject({ ok: true });
      }
      expect(await run(step.roleCode, () => decideStepAction(appId, step.id, "APPROVE", "Согласовано"))).toMatchObject({ ok: true });
    }
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe("COMMITTEE");
    expect(await run("ROLE-14", () => decideStepAction(appId, steps[6].id, "APPROVE", ""))).toHaveProperty("error");
    expect(await run("ROLE-14", () => voteAction(appId, "FOR", "За"))).toMatchObject({ ok: true });
    expect(await run("ROLE-14", () => voteAction(appId, "AGAINST", "Повтор"))).toHaveProperty("error");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe("COMMITTEE");
    expect(await run("ROLE-15", () => voteAction(appId, "FOR", "За"))).toMatchObject({ ok: true });
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe("APPROVED");
    expect(await run("ROLE-01", () => createContractAction(appId))).toHaveProperty("error");
    await run("ROLE-09", () => createContractAction(appId));
    const contract = await prisma.contract.findUniqueOrThrow({ where: { applicationId: appId }, include: { paymentSchedules: { include: { lines: { orderBy: { seq: "asc" } } } } } });
    expect(contract.paymentSchedules[0].lines).toHaveLength(36);
    expect(await run("ROLE-09", () => createContractAction(appId))).toHaveProperty("error");
    const amount = contract.paymentSchedules[0].lines[0].total;
    expect(await run("ROLE-11", () => createPaymentAction(contract.id, amount, "one-request"))).toMatchObject({ ok: true });
    expect(await run("ROLE-11", () => createPaymentAction(contract.id, amount, "one-request"))).toMatchObject({ ok: true });
    expect(await prisma.payment.count({ where: { contractId: contract.id } })).toBe(1);
    expect((await prisma.scheduleLine.findUniqueOrThrow({ where: { id: contract.paymentSchedules[0].lines[0].id } })).paidTotal).toBe(amount);
    await run("ROLE-09", () => signContractMockAction(contract.id));
    const signature = await prisma.auditLog.findFirstOrThrow({ where: { objectId: contract.id, operation: "SIGN_ECP" } });
    expect(JSON.parse(signature.newValue!).hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await prisma.auditLog.count({ where: { objectId: appId, operation: "COMMITTEE_DECISION" } })).toBe(1);
  });

  it("частичные платежи учитывают остаток; выписка привязана к договору и не дублируется", async () => {
    const contract = await prisma.contract.findUniqueOrThrow({ where: { number: "ДЛ-DEMO-001" }, include: { paymentSchedules: { include: { lines: { orderBy: { seq: "asc" } } } } } });
    const first = contract.paymentSchedules[0].lines[0];
    expect(await run("ROLE-11", () => createPaymentAction(contract.id, "1000.00"))).toMatchObject({ ok: true });
    const imported = await run("ROLE-11", () => importBankStatementAction());
    expect(imported).toMatchObject({ ok: true, imported: 2, errors: [] });
    expect(await run("ROLE-11", () => importBankStatementAction())).toMatchObject({ imported: 0, skipped: 2 });
    expect((await prisma.scheduleLine.findUniqueOrThrow({ where: { id: first.id } })).paidTotal).toBe("26000.00");
    const { Decimal } = await import("decimal.js");
    const rest = new Decimal(first.total).minus(26000).plus(100).toFixed(2);
    expect(await run("ROLE-11", () => createPaymentAction(contract.id, rest))).toMatchObject({ ok: true });
    const after = await prisma.scheduleLine.findMany({ where: { scheduleId: first.scheduleId }, orderBy: { seq: "asc" } });
    expect(after[0]).toMatchObject({ status: "PAID", paidTotal: first.total });
    expect(after[1]).toMatchObject({ status: "PARTIAL", paidTotal: "100.00" });
    const count = await prisma.payment.count({ where: { contractId: contract.id } });
    for (const amount of ["", "abc", "0", "-10", "0.001", "999999999999999"]) {
      expect(await run("ROLE-11", () => createPaymentAction(contract.id, amount))).toHaveProperty("error");
    }
    expect(await run("ROLE-01", () => createPaymentAction(contract.id, "100"))).toHaveProperty("error");
    expect(await prisma.payment.count({ where: { contractId: contract.id } })).toBe(count);
  });

  it("HARD нельзя отправить или снять; неизвестная роль cookie не повышает права", async () => {
    const app = await prisma.application.findUniqueOrThrow({ where: { number: "Z-DEMO-001" } });
    await prisma.client.update({ where: { id: app.clientId }, data: { ewsColor: "RED" } });
    expect(await run("ROLE-01", () => submitApplicationAction(app.id))).toHaveProperty("error");
    expect(await run("ROLE-05", () => overrideStopAction(app.id, "EWS_RED", "попытка"))).toHaveProperty("error");
    expect(await prisma.workflowStep.count({ where: { applicationId: app.id } })).toBe(0);
    await prisma.client.update({ where: { id: app.clientId }, data: { ewsColor: "GREEN" } });
    const user = await prisma.user.findFirstOrThrow({ where: { roleCode: "ROLE-01" } });
    state.cookie = `${user.id}:ROLE-17`;
    expect(await simulateTimeAction(1)).toHaveProperty("error");
    const { can } = await import("@/lib/roles");
    expect(can("unknown", "admin", "view")).toBe(false);
  });

  it("отклонённая заявка не возобновляется через следующий шаг", async () => {
    const app = await prisma.application.findUniqueOrThrow({ where: { number: "Z-DEMO-001" } });
    expect(await run("ROLE-01", () => submitApplicationAction(app.id))).toMatchObject({ ok: true });
    const steps = await prisma.workflowStep.findMany({ where: { applicationId: app.id }, orderBy: { seq: "asc" } });
    expect(await run("ROLE-01", () => decideStepAction(app.id, steps[0].id, "APPROVE", ""))).toHaveProperty("error");
    expect(await run("ROLE-03", () => decideStepAction(app.id, steps[0].id, "REJECT", "Нет документов"))).toMatchObject({ ok: true });
    expect(await run("ROLE-02", () => decideStepAction(app.id, steps[1].id, "APPROVE", ""))).toHaveProperty("error");
    expect((await prisma.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("REJECTED");
  });

  it("досье, AML-имитация, валидация и системное время", async () => {
    const client = await prisma.client.findUniqueOrThrow({ where: { binIin: "000000000001" } });
    expect(await run("ROLE-01", () => createClientAction(null, form({ clientType: "LEGAL", binIin: "000000000001", name: "Дубль", oked: "49410", registrationDate: "2018-01-01", address: "Демо", phone: "+7 000 000 00 00", email: "" })))).toHaveProperty("error");
    expect(await run("ROLE-01", () => createMockDocumentAction(null, form({ clientId: client.id, category: "LEGAL", name: "ДЕМО заключение" })))).toMatchObject({ ok: true });
    const doc = await prisma.clientDocument.findFirstOrThrow({ where: { clientId: client.id, name: "ДЕМО заключение" } });
    expect(doc.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await run("ROLE-01", () => runAmlCheckAction(client.id))).toHaveProperty("error");
    expect(await run("ROLE-07", () => runAmlCheckAction(client.id))).toMatchObject({ ok: true });
    const before = await prisma.config.findUniqueOrThrow({ where: { id: "system" } });
    expect(await run("ROLE-17", () => simulateTimeAction(0.5))).toHaveProperty("error");
    expect(await run("ROLE-17", () => simulateTimeAction(90))).toMatchObject({ ok: true });
    const after = await prisma.config.findUniqueOrThrow({ where: { id: "system" } });
    expect(Date.parse(after.systemDate) - Date.parse(before.systemDate)).toBe(90 * 86400000);
  });
});
