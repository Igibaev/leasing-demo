import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { allocatePayment, calculateDpd, calculateProfitability, calculateSchedule, DEFAULT_PAYMENT_PRIORITY, recalculateOnRestructuring, type PaymentSchedule, type ScheduleInput, type ScheduleLine } from "../lib/calc";

const base: ScheduleInput = { assetCost: "1200", downPayment: "0", termMonths: 12, annualRate: "12", firstPaymentDate: "2025-02-01", scheduleType: "ANNUITY" };
const sum = (lines: readonly ScheduleLine[], key: "principal" | "interest" | "total" | "commission"): string => lines.reduce((value, entry) => value.plus(entry[key]), new Decimal(0)).toFixed(2);
const open = (patch: Partial<ScheduleLine> = {}): ScheduleLine => ({ seq: 1, dueDate: "2025-01-01", principal: "100.00", interest: "10.00", vat: "2.00", commission: "3.00", penalty: "5.00", total: "120.00", balance: "100.00", ...patch });
const custom: ScheduleInput = { ...base, termMonths: 2, scheduleType: "CUSTOM", customLines: [{ dueDate: "2025-02-01", principal: "400", interest: "20" }, { dueDate: "2025-03-01", principal: "800", interest: "10" }] };

function verifySchedule(lines: ScheduleLine[], financed: string): void {
  expect(sum(lines, "principal")).toBe(new Decimal(financed).toFixed(2));
  expect(lines.at(-1)?.balance).toBe("0.00");
  let balance = new Decimal(financed);
  for (const entry of lines) {
    balance = balance.minus(entry.principal);
    expect(entry.balance).toBe(balance.toFixed(2));
    expect(entry.total).toBe(new Decimal(entry.principal).plus(entry.interest).plus(entry.vat).plus(entry.commission).toFixed(2));
    for (const key of ["principal", "interest", "vat", "commission", "total", "balance"] as const) expect(entry[key]).toMatch(/^\d+\.\d{2}$/);
  }
}

describe("calculateSchedule", () => {
  it("uses financed cost less down payment and reconciles every balance", () => {
    const lines = calculateSchedule({ ...base, downPayment: "200" });
    expect(lines).toHaveLength(12);
    verifySchedule(lines, "1000");
  });
  it("uses the classical annuity amount with actual/365 interest", () => {
    const lines = calculateSchedule(base);
    expect(lines[0]?.interest).toBe("12.23");
    const payment = new Decimal(1200).times("0.01").div(new Decimal(1).minus(new Decimal("1.01").pow(-12))).toFixed(2);
    expect(new Decimal(lines[0]!.principal).plus(lines[0]!.interest).toFixed(2)).toBe(payment);
    verifySchedule(lines, "1200");
  });
  it("differentiates principal and uses each actual interval", () => {
    const lines = calculateSchedule({ ...base, scheduleType: "DIFFERENTIATED" });
    expect(lines.every((entry) => entry.principal === "100.00")).toBe(true);
    expect(lines[0]?.interest).toBe("12.23");
    expect(lines[1]?.interest).toBe("10.13");
    verifySchedule(lines, "1200");
  });
  it("places the rounding difference in the last zero-rate payment", () => {
    const lines = calculateSchedule({ ...base, assetCost: "100", annualRate: "0", termMonths: 3 });
    expect(lines.map((entry) => entry.principal)).toEqual(["33.33", "33.33", "33.34"]);
    expect(sum(lines, "interest")).toBe("0.00");
  });
  it("handles leap-year actual days with fixed 365 denominator", () => {
    const lines = calculateSchedule({ ...base, firstPaymentDate: "2024-03-01" });
    expect(lines[0]?.interest).toBe("11.44");
  });
  it("clamps month-end dates without permanently drifting the anchor", () => {
    const lines = calculateSchedule({ ...base, firstPaymentDate: "2024-01-31", termMonths: 3 });
    expect(lines.map((entry) => entry.dueDate)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
  });
  it("supports an explicit first accrual interval", () => {
    expect(calculateSchedule({ ...base, accrualStartDate: "2025-01-15" })[0]?.interest).toBe("6.71");
  });
  it("creates quarterly payments and actual quarter interest", () => {
    const lines = calculateSchedule({ ...base, frequency: "QUARTERLY", firstPaymentDate: "2025-04-01" });
    expect(lines).toHaveLength(4);
    expect(lines[0]?.interest).toBe("35.51");
    expect(lines.at(-1)?.dueDate).toBe("2026-01-01");
    verifySchedule(lines, "1200");
  });
  it("collects upfront commission in a separate funding-date row", () => {
    const lines = calculateSchedule({ ...base, commission: "100" });
    expect(lines[0]).toMatchObject({ seq: 0, dueDate: "2025-01-01", principal: "0.00", commission: "100.00", vat: "12.00", total: "112.00", balance: "1200.00" });
    expect(lines).toHaveLength(13);
    verifySchedule(lines, "1200");
  });
  it("reconciles in-schedule commission rounding", () => {
    const lines = calculateSchedule({ ...base, termMonths: 3, commission: "10", commissionType: "IN_SCHEDULE" });
    expect(lines.map((entry) => entry.commission)).toEqual(["3.33", "3.33", "3.34"]);
    expect(sum(lines, "commission")).toBe("10.00");
  });
  it("does not overcharge tiny commissions rounded over many periods", () => {
    const lines = calculateSchedule({ ...base, commission: "0.07", commissionType: "IN_SCHEDULE" });
    expect(sum(lines, "commission")).toBe("0.07");
    verifySchedule(lines, "1200");
  });
  it("defaults VAT to twelve percent on interest and commission", () => {
    const first = calculateSchedule({ ...base, commission: "12", commissionType: "IN_SCHEDULE" })[0]!;
    expect(first.vat).toBe(new Decimal(first.interest).plus(first.commission).times("0.12").toFixed(2));
  });
  it.each(["INTEREST", "TOTAL", "NONE"] as const)("supports VAT base %s", (vatBase) => {
    const first = calculateSchedule({ ...base, vatBase, commission: "12", commissionType: "IN_SCHEDULE" })[0]!;
    const taxable = vatBase === "NONE" ? new Decimal(0) : vatBase === "INTEREST" ? new Decimal(first.interest) : new Decimal(first.principal).plus(first.interest).plus(first.commission);
    expect(first.vat).toBe(taxable.times("0.12").toFixed(2));
  });
  it("supports zero VAT", () => expect(calculateSchedule({ ...base, vatRate: "0" }).every((entry) => entry.vat === "0.00")).toBe(true));
  it.each(["ANNUITY", "DIFFERENTIATED"] as const)("preserves the residual for the final %s payment", (scheduleType) => {
    const lines = calculateSchedule({ ...base, scheduleType, residualValue: "600" });
    expect(new Decimal(lines.at(-2)!.balance).gte(600)).toBe(true);
    expect(new Decimal(lines.at(-1)!.principal).gte(600)).toBe(true);
    verifySchedule(lines, "1200");
  });
  it("handles a fully residual zero-rate loan", () => {
    const lines = calculateSchedule({ ...base, residualValue: "1200", annualRate: "0" });
    expect(lines.slice(0, -1).every((entry) => entry.principal === "0.00")).toBe(true);
    expect(lines.at(-1)?.principal).toBe("1200.00");
  });
  it("handles one payment", () => verifySchedule(calculateSchedule({ ...base, termMonths: 1, residualValue: "300" }), "1200"));
  it("keeps amounts larger than Number.MAX_SAFE_INTEGER exact", () => {
    verifySchedule(calculateSchedule({ ...base, assetCost: "9007199254740993.01", annualRate: "0", termMonths: 3 }), "9007199254740993.01");
  });
  it("accepts fully prepaid assets without NaN or negative components", () => {
    verifySchedule(calculateSchedule({ ...base, downPayment: "1200" }), "0");
  });
  it("allows explicit lower financing", () => verifySchedule(calculateSchedule({ ...base, financedAmount: "700" }), "700"));
  it("preserves externally supplied custom amounts", () => {
    const lines = calculateSchedule(custom);
    expect(lines.map((entry) => entry.principal)).toEqual(["400.00", "800.00"]);
    expect(lines.map((entry) => entry.interest)).toEqual(["20.00", "10.00"]);
    verifySchedule(lines, "1200");
  });
  it("preserves explicit custom VAT and commission", () => {
    const lines = calculateSchedule({ ...custom, commission: "9", commissionType: "IN_SCHEDULE", customLines: [{ ...custom.customLines![0]!, vat: "1", commission: "2" }, { ...custom.customLines![1]!, vat: "3", commission: "7" }] });
    expect(lines.map((entry) => [entry.vat, entry.commission])).toEqual([["1.00", "2.00"], ["3.00", "7.00"]]);
  });
  it("rejects custom underpayment", () => expect(() => calculateSchedule({ ...custom, customLines: custom.customLines!.map((entry) => ({ ...entry, principal: "100" })) })).toThrow(/reconcile/));
  it("rejects custom principal overpayment", () => expect(() => calculateSchedule({ ...custom, customLines: custom.customLines!.map((entry) => ({ ...entry, principal: "900" })) })).toThrow(/exceeds/));
  it("rejects unordered custom dates", () => expect(() => calculateSchedule({ ...custom, customLines: custom.customLines!.map((entry) => ({ ...entry, dueDate: "2025-02-01" })) })).toThrow(/dates/));
  it("rejects missing custom rows", () => expect(() => calculateSchedule({ ...custom, customLines: [] })).toThrow(/period count/));
  it.each([
    { assetCost: "-1" }, { downPayment: "1201" }, { financedAmount: "1201" }, { termMonths: 0 }, { termMonths: 1.5 }, { termMonths: 1201 },
    { annualRate: "-1" }, { annualRate: "NaN" }, { assetCost: "Infinity" }, { assetCost: "1e3" }, { assetCost: "1.001" },
    { firstPaymentDate: "2025-02-29" }, { firstPaymentDate: "2025-2-01" }, { vatRate: "101" }, { residualValue: "1201" },
    { commission: "-1" }, { frequency: "QUARTERLY" as const, termMonths: 5 }, { accrualStartDate: "2025-02-01" },
  ])("rejects invalid schedule input %j", (patch) => expect(() => calculateSchedule({ ...base, ...patch })).toThrow());
  it("never mutates the input", () => {
    const original = structuredClone(custom);
    calculateSchedule(custom);
    expect(custom).toEqual(original);
  });
});

describe("allocatePayment", () => {
  it("applies penalty, commission, VAT, interest, then principal", () => {
    expect(allocatePayment("25", [{ ...open(), id: "line-1" }])).toEqual([{ scheduleLineId: "line-1", penalty: "5.00", commission: "3.00", vat: "2.00", interest: "10.00", principal: "5.00" }]);
  });
  it("partially settles a priority component", () => expect(allocatePayment("6", [open()])[0]).toMatchObject({ penalty: "5.00", commission: "1.00", interest: "0.00", principal: "0.00" }));
  it("supports a custom complete priority", () => expect(allocatePayment("6", [open()], ["principal", "interest", "vat", "commission", "penalty"])[0]).toMatchObject({ principal: "6.00", penalty: "0.00" }));
  it("settles oldest rows first regardless of input order", () => {
    const allocations = allocatePayment("125", [open({ seq: 2, dueDate: "2025-02-01" }), open()]);
    expect(allocations.map((entry) => entry.scheduleLineId)).toEqual(["1", "2"]);
    expect(allocations[0]?.principal).toBe("100.00");
    expect(allocations[1]?.penalty).toBe("5.00");
  });
  it("returns excess as ADVANCE principal", () => expect(allocatePayment("125", [open()]).at(-1)).toMatchObject({ scheduleLineId: "ADVANCE", principal: "5.00" }));
  it("allocates an empty schedule entirely to advance", () => expect(allocatePayment("17.23", [])[0]).toMatchObject({ scheduleLineId: "ADVANCE", principal: "17.23" }));
  it("returns no records for zero payment", () => expect(allocatePayment("0", [open()])).toEqual([]));
  it("ignores already cleared rows", () => expect(allocatePayment("1", [open({ principal: "0", interest: "0", vat: "0", commission: "0", penalty: "0" })])[0]?.scheduleLineId).toBe("ADVANCE"));
  it("rejects incomplete or duplicate priorities", () => {
    expect(() => allocatePayment("1", [], ["principal"])).toThrow(/Priority/);
    expect(() => allocatePayment("1", [], [...DEFAULT_PAYMENT_PRIORITY.slice(1), "principal"])).toThrow(/Priority/);
  });
  it("rejects duplicate or reserved row identifiers", () => {
    expect(() => allocatePayment("1", [open(), open()])).toThrow(/IDs/);
    expect(() => allocatePayment("1", [{ ...open(), id: "ADVANCE" }])).toThrow(/IDs/);
  });
  it("validates amounts even when no payment remains", () => expect(() => allocatePayment("0", [open({ interest: "-1" })])).toThrow());
  it("does not mutate outstanding lines", () => {
    const lines = [open()];
    const copy = structuredClone(lines);
    allocatePayment("111", lines);
    expect(lines).toEqual(copy);
  });
});

describe("calculateDpd", () => {
  it("has no overdue balance on the due date", () => expect(calculateDpd([open()], "2025-01-01")).toEqual({ dpd: 0, bucket: "CURRENT", principalOverdue: "0.00", interestOverdue: "0.00" }));
  it.each([[1, "1–7"], [7, "1–7"], [8, "8–30"], [30, "8–30"], [31, "31–60"], [60, "31–60"], [61, "61–90"], [90, "61–90"], [91, "91–180"], [180, "91–180"], [181, "180+"]] as const)("classifies day %i as %s", (days, bucket) => {
    const date = new Date(Date.UTC(2025, 0, 1 + days)).toISOString().slice(0, 10);
    expect(calculateDpd([open()], date)).toEqual({ dpd: days, bucket, principalOverdue: "100.00", interestOverdue: "10.00" });
  });
  it("sums only remaining overdue balances and uses the oldest unpaid date", () => {
    expect(calculateDpd([open({ principal: "25" }), open({ seq: 2, dueDate: "2025-01-05", principal: "30" }), open({ seq: 3, dueDate: "2025-02-01" })], "2025-01-10")).toEqual({ dpd: 9, bucket: "8–30", principalOverdue: "55.00", interestOverdue: "20.00" });
  });
  it("does not count a cleared old line", () => expect(calculateDpd([open({ principal: "0", interest: "0", vat: "0", commission: "0", penalty: "0" })], "2026-01-01").dpd).toBe(0));
  it("counts fee-only overdue rows", () => expect(calculateDpd([open({ principal: "0", interest: "0" })], "2025-01-02").dpd).toBe(1));
  it("rejects invalid as-of dates even for an empty schedule", () => expect(() => calculateDpd([], "2025-13-01")).toThrow());
});

describe("calculateProfitability", () => {
  it("finds an exact annual ten percent IRR", () => {
    const result = calculateProfitability([open({ dueDate: "2026-01-01", principal: "1000", interest: "100", total: "1100", penalty: "0", vat: "0", commission: "0" })], "1000", { startDate: "2025-01-01" });
    expect(result).toEqual({ irr: "10.00000000", totalPayments: "1100.00", totalInterest: "100.00", overpayment: "100.00" });
  });
  it("returns zero IRR for zero-rate repayments", () => expect(calculateProfitability(calculateSchedule({ ...base, annualRate: "0" }), "1200").irr).toBe("0.00000000"));
  it("finds negative IRR via the safeguarded solver", () => {
    const result = calculateProfitability([open({ dueDate: "2026-01-01", total: "10" })], "1000", { startDate: "2025-01-01" });
    expect(result.irr).toBe("-99.00000000");
  });
  it("includes upfront fees in date-zero cash flow", () => {
    const without = calculateProfitability(calculateSchedule(base), "1200");
    const withFee = calculateProfitability(calculateSchedule({ ...base, commission: "20" }), "1200");
    expect(new Decimal(withFee.irr).gt(without.irr)).toBe(true);
    expect(new Decimal(withFee.totalPayments).minus(without.totalPayments).toFixed(2)).toBe("22.40");
  });
  it("infers quarterly funding date with multiple installments", () => {
    const lines = calculateSchedule({ ...base, frequency: "QUARTERLY", firstPaymentDate: "2025-04-01" });
    expect(calculateProfitability(lines, "1200")).toEqual(calculateProfitability(lines, "1200", { startDate: "2025-01-01" }));
  });
  it("accepts frequency for a single quarterly installment", () => {
    const lines = calculateSchedule({ ...base, termMonths: 3, frequency: "QUARTERLY", firstPaymentDate: "2025-04-01" });
    expect(calculateProfitability(lines, "1200", { frequency: "QUARTERLY" })).toEqual(calculateProfitability(lines, "1200", { startDate: "2025-01-01" }));
  });
  it("rejects undefined IRR with no positive future cash flow", () => {
    expect(() => calculateProfitability([], "100")).toThrow();
    expect(() => calculateProfitability([open({ total: "0" })], "100")).toThrow();
    expect(() => calculateProfitability([open()], "0")).toThrow();
  });
  it("rejects payments before funding", () => expect(() => calculateProfitability([open()], "100", { startDate: "2025-02-01" })).toThrow(/precede/));
});

describe("recalculateOnRestructuring", () => {
  const schedule: PaymentSchedule = { version: 1, createdAt: "2025-01-01", reason: "Original", isActive: true, lines: calculateSchedule(base) };
  const contract = { id: "contract-1", input: base, currentScheduleVersion: 1, schedules: [schedule], outstandingPrincipal: "600" };
  const changes = { reason: "Extension", effectiveDate: "2025-07-01", firstPaymentDate: "2025-08-01", termMonths: 18 };
  it("creates the next active version and preserves all previous rows", () => {
    const result = recalculateOnRestructuring(contract, changes);
    expect(result).toMatchObject({ contractId: "contract-1", version: 2, isActive: true, reason: "Extension" });
    expect(result.lines).toHaveLength(18);
    verifySchedule(result.lines, "600");
    expect(result.previousSchedules[0]).toEqual({ ...schedule, isActive: false });
    expect(schedule.isActive).toBe(true);
  });
  it("does not share mutable schedule lines with prior versions", () => {
    const result = recalculateOnRestructuring(contract, changes);
    result.previousSchedules[0]!.lines[0]!.principal = "0";
    expect(schedule.lines[0]!.principal).not.toBe("0");
  });
  it("rejects rewriting outstanding principal", () => expect(() => recalculateOnRestructuring(contract, { ...changes, financedAmount: "500" })).toThrow(/preserve/));
  it("rejects inconsistent active version", () => expect(() => recalculateOnRestructuring({ ...contract, currentScheduleVersion: 2 }, changes)).toThrow(/version/));
  it("requires a reason and a future first payment", () => {
    expect(() => recalculateOnRestructuring(contract, { ...changes, reason: " " })).toThrow(/reason/);
    expect(() => recalculateOnRestructuring(contract, { ...changes, firstPaymentDate: "2025-07-01" })).toThrow(/precede/);
  });
});
