import { Decimal, fixed, money, nonNegative, type DecimalValue } from "./decimal";
import { parseDate, shiftMonths, daysBetween } from "./dates";

export interface CustomScheduleLine {
  dueDate: string;
  principal: string;
  interest: string;
  vat?: string;
  commission?: string;
}

export interface ScheduleInput {
  assetCost: string;
  downPayment: string;
  financedAmount?: string;
  termMonths: number;
  annualRate: string;
  commission?: string;
  commissionType?: "UPFRONT" | "IN_SCHEDULE";
  vatRate?: string;
  residualValue?: string;
  frequency?: "MONTHLY" | "QUARTERLY";
  firstPaymentDate: string;
  scheduleType: "ANNUITY" | "DIFFERENTIATED" | "CUSTOM";
  customLines?: CustomScheduleLine[];
  accrualStartDate?: string;
  vatBase?: "INTEREST_AND_COMMISSION" | "INTEREST" | "TOTAL" | "NONE";
}

export interface ScheduleLine {
  seq: number;
  dueDate: string;
  principal: string;
  interest: string;
  vat: string;
  commission: string;
  total: string;
  balance: string;
  penalty?: string;
}

export interface Profitability {
  irr: string;
  totalPayments: string;
  totalInterest: string;
  overpayment: string;
}

function rounded(value: DecimalValue): DecimalValue {
  return value.toDecimalPlaces(2);
}

function tax(principal: DecimalValue, interest: DecimalValue, commission: DecimalValue, rate: DecimalValue, base: ScheduleInput["vatBase"]): DecimalValue {
  if (base === "NONE") return new Decimal(0);
  const taxable = base === "INTEREST" ? interest : base === "TOTAL" ? principal.plus(interest).plus(commission) : interest.plus(commission);
  return rounded(taxable.times(rate).div(100));
}

function line(seq: number, dueDate: string, principal: DecimalValue, interest: DecimalValue, vat: DecimalValue, commission: DecimalValue, balance: DecimalValue): ScheduleLine {
  return { seq, dueDate, principal: fixed(principal), interest: fixed(interest), vat: fixed(vat), commission: fixed(commission), total: fixed(principal.plus(interest).plus(vat).plus(commission)), balance: fixed(balance) };
}

export function calculateSchedule(input: ScheduleInput): ScheduleLine[] {
  const asset = money(input.assetCost, "assetCost");
  const down = money(input.downPayment, "downPayment");
  if (asset.lte(0) || down.gt(asset)) throw new Error("Invalid asset cost or down payment");
  const financed = input.financedAmount === undefined ? asset.minus(down) : money(input.financedAmount, "financedAmount");
  if (financed.gt(asset.minus(down))) throw new Error("Financed amount exceeds asset cost less down payment");
  if (!Number.isInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > 1200) throw new Error("termMonths must be between 1 and 1200");
  const rate = nonNegative(input.annualRate, "annualRate");
  if (rate.gt(1000)) throw new Error("annualRate exceeds 1000 percent");
  const commission = money(input.commission ?? "0", "commission");
  const residual = money(input.residualValue ?? "0", "residualValue");
  if (residual.gt(financed)) throw new Error("Residual exceeds financed amount");
  const vatRate = nonNegative(input.vatRate ?? "12", "vatRate");
  if (vatRate.gt(100)) throw new Error("vatRate exceeds 100 percent");
  const frequency = input.frequency ?? "MONTHLY";
  const commissionType = input.commissionType ?? "UPFRONT";
  const vatBase = input.vatBase ?? "INTEREST_AND_COMMISSION";
  if (!["MONTHLY", "QUARTERLY"].includes(frequency)) throw new Error("Invalid frequency");
  if (!["UPFRONT", "IN_SCHEDULE"].includes(commissionType)) throw new Error("Invalid commissionType");
  if (!["INTEREST_AND_COMMISSION", "INTEREST", "TOTAL", "NONE"].includes(vatBase)) throw new Error("Invalid vatBase");
  if (!["ANNUITY", "DIFFERENTIATED", "CUSTOM"].includes(input.scheduleType)) throw new Error("Invalid scheduleType");
  const months = frequency === "QUARTERLY" ? 3 : 1;
  if (input.termMonths % months !== 0) throw new Error("Term must contain whole payment periods");
  const count = input.termMonths / months;
  parseDate(input.firstPaymentDate);
  const start = input.accrualStartDate ?? shiftMonths(input.firstPaymentDate, -months);
  if (daysBetween(start, input.firstPaymentDate) <= 0) throw new Error("Accrual start must precede first payment");
  const result: ScheduleLine[] = [];
  if (commissionType === "UPFRONT" && commission.gt(0)) {
    result.push(line(0, start, new Decimal(0), new Decimal(0), tax(new Decimal(0), new Decimal(0), commission, vatRate, vatBase), commission, financed));
  }
  let balance = financed;
  let commissionLeft = commissionType === "IN_SCHEDULE" ? commission : new Decimal(0);
  const periodCommission = rounded(commissionLeft.div(count));
  if (input.scheduleType === "CUSTOM") {
    const custom = input.customLines;
    if (!custom || custom.length !== count) throw new Error("Custom lines must match payment period count");
    let previous = start;
    for (const [index, entry] of custom.entries()) {
      if (daysBetween(previous, entry.dueDate) <= 0 || (index === 0 && entry.dueDate !== input.firstPaymentDate)) throw new Error("Custom dates must be increasing and start at firstPaymentDate");
      const principal = money(entry.principal, "custom principal");
      const interest = money(entry.interest, "custom interest");
      const fee = entry.commission === undefined ? Decimal.min(commissionLeft, index === count - 1 ? commissionLeft : periodCommission) : money(entry.commission, "custom commission");
      if (fee.gt(commissionLeft)) throw new Error("Custom commission exceeds remaining commission");
      commissionLeft = commissionLeft.minus(fee);
      balance = balance.minus(principal);
      if (balance.lt(0)) throw new Error("Custom principal exceeds financing");
      const vat = entry.vat === undefined ? tax(principal, interest, fee, vatRate, vatBase) : money(entry.vat, "custom vat");
      result.push(line(index + 1, entry.dueDate, principal, interest, vat, fee, balance));
      previous = entry.dueDate;
    }
    if (!balance.isZero() || !commissionLeft.isZero()) throw new Error("Custom principal and commission must reconcile");
    if (money(custom[custom.length - 1]!.principal, "last principal").lt(residual)) throw new Error("Last payment must include residual value");
    return result;
  }
  const periodicRate = rate.div(100).times(months).div(12);
  const factor = periodicRate.plus(1).pow(count);
  const payment = periodicRate.isZero() ? financed.minus(residual).div(count) : financed.times(factor).minus(residual).times(periodicRate).div(factor.minus(1));
  const principalShare = rounded(financed.minus(residual).div(count));
  let previous = start;
  for (let index = 0; index < count; index += 1) {
    const dueDate = shiftMonths(input.firstPaymentDate, index * months);
    const interest = rounded(balance.times(rate).times(daysBetween(previous, dueDate)).div(36500));
    const proposed = input.scheduleType === "ANNUITY" ? rounded(payment.minus(interest)) : principalShare;
    const principal = index === count - 1 ? balance : Decimal.min(Decimal.max(0, proposed), Decimal.max(0, balance.minus(residual)));
    const fee = Decimal.min(commissionLeft, index === count - 1 ? commissionLeft : periodCommission);
    commissionLeft = commissionLeft.minus(fee);
    balance = balance.minus(principal);
    result.push(line(index + 1, dueDate, principal, interest, tax(principal, interest, fee, vatRate, vatBase), fee, balance));
    previous = dueDate;
  }
  return result;
}

export type PaymentComponent = "principal" | "interest" | "vat" | "commission" | "penalty";
export type OpenScheduleLine = ScheduleLine & { id?: string };
export type PaymentAllocation = { scheduleLineId: string } & Record<PaymentComponent, string>;
export const DEFAULT_PAYMENT_PRIORITY: readonly PaymentComponent[] = ["penalty", "commission", "vat", "interest", "principal"];

function components(entry: ScheduleLine): Record<PaymentComponent, DecimalValue> {
  parseDate(entry.dueDate);
  if (!Number.isInteger(entry.seq) || entry.seq < 0) throw new Error("Invalid sequence number");
  money(entry.total, "total");
  money(entry.balance, "balance");
  return { principal: money(entry.principal, "principal"), interest: money(entry.interest, "interest"), vat: money(entry.vat, "vat"), commission: money(entry.commission, "commission"), penalty: money(entry.penalty ?? "0", "penalty") };
}

export function allocatePayment(amount: string, openLines: readonly OpenScheduleLine[], priority: readonly PaymentComponent[] = DEFAULT_PAYMENT_PRIORITY): PaymentAllocation[] {
  let remaining = money(amount, "amount");
  if (priority.length !== 5 || new Set(priority).size !== 5 || priority.some((key) => !DEFAULT_PAYMENT_PRIORITY.includes(key))) throw new Error("Priority must contain each payment component once");
  const ids = new Set<string>();
  const prepared = openLines.map((entry) => {
    const id = entry.id ?? String(entry.seq);
    if (!id.trim() || id === "ADVANCE" || ids.has(id)) throw new Error("Schedule line IDs must be unique and not ADVANCE");
    ids.add(id);
    return { entry, id, amounts: components(entry) };
  }).sort((a, b) => a.entry.dueDate.localeCompare(b.entry.dueDate) || a.entry.seq - b.entry.seq);
  const result: PaymentAllocation[] = [];
  for (const { id, amounts } of prepared) {
    if (remaining.isZero()) break;
    const allocation: PaymentAllocation = { scheduleLineId: id, principal: "0.00", interest: "0.00", vat: "0.00", commission: "0.00", penalty: "0.00" };
    let allocated = new Decimal(0);
    for (const key of priority) {
      const paid = Decimal.min(remaining, amounts[key]);
      allocation[key] = fixed(paid);
      remaining = remaining.minus(paid);
      allocated = allocated.plus(paid);
    }
    if (allocated.gt(0)) result.push(allocation);
  }
  if (remaining.gt(0)) result.push({ scheduleLineId: "ADVANCE", principal: fixed(remaining), interest: "0.00", vat: "0.00", commission: "0.00", penalty: "0.00" });
  return result;
}

export type DpdBucket = "CURRENT" | "1–7" | "8–30" | "31–60" | "61–90" | "91–180" | "180+";
export interface DpdResult {
  dpd: number;
  bucket: DpdBucket;
  principalOverdue: string;
  interestOverdue: string;
}

export function calculateDpd(openLines: readonly ScheduleLine[], asOfDate: string): DpdResult {
  parseDate(asOfDate);
  let dpd = 0;
  let principal = new Decimal(0);
  let interest = new Decimal(0);
  for (const entry of openLines) {
    const amounts = components(entry);
    const days = daysBetween(entry.dueDate, asOfDate);
    if (days <= 0 || Object.values(amounts).every((value) => value.isZero())) continue;
    dpd = Math.max(dpd, days);
    principal = principal.plus(amounts.principal);
    interest = interest.plus(amounts.interest);
  }
  const bucket: DpdBucket = dpd === 0 ? "CURRENT" : dpd <= 7 ? "1–7" : dpd <= 30 ? "8–30" : dpd <= 60 ? "31–60" : dpd <= 90 ? "61–90" : dpd <= 180 ? "91–180" : "180+";
  return { dpd, bucket, principalOverdue: fixed(principal), interestOverdue: fixed(interest) };
}

export function calculateProfitability(lines: readonly ScheduleLine[], financedAmount: string, options: { startDate?: string; frequency?: "MONTHLY" | "QUARTERLY" } = {}): Profitability {
  const financed = money(financedAmount, "financedAmount");
  if (financed.lte(0) || lines.length === 0) throw new Error("IRR requires positive financing and payments");
  const sorted = [...lines].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const entry of sorted) components(entry);
  const regular = sorted.filter((entry) => entry.seq > 0);
  if (!regular.length) throw new Error("IRR requires future payments");
  const first = regular[0]!;
  const second = regular[1];
  const inferredQuarterly = second !== undefined && daysBetween(first.dueDate, second.dueDate) >= 80;
  const months = options.frequency === "QUARTERLY" || (options.frequency === undefined && inferredQuarterly) ? 3 : 1;
  const startDate = options.startDate ?? sorted.find((entry) => entry.seq === 0)?.dueDate ?? shiftMonths(first.dueDate, -months);
  parseDate(startDate);
  let totalPayments = new Decimal(0);
  let totalInterest = new Decimal(0);
  let initial = financed.negated();
  const flows: { amount: DecimalValue; years: DecimalValue }[] = [];
  for (const entry of sorted) {
    const amount = money(entry.total, "total");
    const days = daysBetween(startDate, entry.dueDate);
    if (days < 0) throw new Error("Payments cannot precede funding");
    totalPayments = totalPayments.plus(amount);
    totalInterest = totalInterest.plus(entry.interest);
    if (days === 0) initial = initial.plus(amount);
    else if (amount.gt(0)) flows.push({ amount, years: new Decimal(days).div(365) });
  }
  if (initial.gte(0) || flows.length === 0) throw new Error("IRR has no unique finite root");
  const evaluate = (rate: DecimalValue): { value: DecimalValue; derivative: DecimalValue } => {
    let value = initial;
    let derivative = new Decimal(0);
    for (const flow of flows) {
      const discounted = flow.amount.div(rate.plus(1).pow(flow.years));
      value = value.plus(discounted);
      derivative = derivative.minus(discounted.times(flow.years).div(rate.plus(1)));
    }
    return { value, derivative };
  };
  const tolerance = financed.times("0.00000000000000000001");
  let root = new Decimal("0.1");
  let solved = false;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const { value, derivative } = evaluate(root);
    if (value.abs().lte(tolerance)) { solved = true; break; }
    if (derivative.isZero()) break;
    const next = root.minus(value.div(derivative));
    if (!next.isFinite() || next.lte("-0.999999999999") || next.gt("1e20")) break;
    root = next;
  }
  if (!solved) {
    let low = new Decimal("-0.999999999999999999999999999999");
    let high = new Decimal(1);
    while (evaluate(high).value.gt(0) && high.lt("1e30")) high = high.times(2).plus(1);
    if (evaluate(low).value.lt(0) || evaluate(high).value.gt(0)) throw new Error("Unable to bracket IRR");
    for (let iteration = 0; iteration < 256; iteration += 1) {
      root = low.plus(high).div(2);
      const value = evaluate(root).value;
      if (value.abs().lte(tolerance)) { solved = true; break; }
      if (value.gt(0)) low = root;
      else high = root;
    }
    if (!solved) throw new Error("IRR did not converge");
  }
  const irr = root.times(100).toDecimalPlaces(8);
  return { irr: irr.isZero() ? "0.00000000" : irr.toFixed(8), totalPayments: fixed(totalPayments), totalInterest: fixed(totalInterest), overpayment: fixed(totalPayments.minus(financed)) };
}

export interface PaymentSchedule {
  contractId?: string;
  version: number;
  createdAt: string;
  reason: string;
  isActive: boolean;
  lines: ScheduleLine[];
}

export interface RestructuringContract {
  id?: string;
  input: ScheduleInput;
  currentScheduleVersion: number;
  schedules: readonly PaymentSchedule[];
  outstandingPrincipal: string;
}

export type RestructuringChanges = Partial<ScheduleInput> & { reason: string; effectiveDate: string };
export type RestructuringResult = PaymentSchedule & { previousSchedules: PaymentSchedule[] };

export function recalculateOnRestructuring(contract: RestructuringContract, changes: RestructuringChanges): RestructuringResult {
  const outstanding = money(contract.outstandingPrincipal, "outstandingPrincipal");
  if (outstanding.lte(0)) throw new Error("No outstanding principal to restructure");
  parseDate(changes.effectiveDate);
  if (!changes.reason.trim()) throw new Error("Restructuring reason is required");
  const versions = contract.schedules.map((schedule) => schedule.version);
  if (!Number.isSafeInteger(contract.currentScheduleVersion) || contract.currentScheduleVersion < 1 || versions.some((version) => !Number.isSafeInteger(version) || version < 1) || new Set(versions).size !== versions.length) throw new Error("Invalid schedule versions");
  const active = contract.schedules.filter((schedule) => schedule.isActive);
  if (active.length !== 1 || active[0]!.version !== contract.currentScheduleVersion || Math.max(...versions) !== contract.currentScheduleVersion) throw new Error("Active schedule version mismatch");
  if (changes.financedAmount !== undefined && !money(changes.financedAmount, "financedAmount").eq(outstanding)) throw new Error("Restructuring must preserve outstanding principal");
  const { reason, effectiveDate, ...terms } = changes;
  const input: ScheduleInput = { ...contract.input, commission: "0", customLines: undefined, ...terms, financedAmount: fixed(outstanding), accrualStartDate: effectiveDate };
  const lines = calculateSchedule(input);
  return { contractId: contract.id, version: contract.currentScheduleVersion + 1, createdAt: effectiveDate, reason: reason.trim(), isActive: true, lines, previousSchedules: contract.schedules.map((schedule) => ({ ...schedule, isActive: false, lines: schedule.lines.map((entry) => ({ ...entry })) })) };
}
