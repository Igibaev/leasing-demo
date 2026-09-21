import Decimal from "decimal.js";
import type { Prisma } from "@prisma/client";
import { allocatePayment, DEFAULT_PAYMENT_PRIORITY } from "./calc";
import { remainingLine } from "./payment-balance";

export function paymentAmount(value: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = new Decimal(value.trim());
  return amount.isFinite() && amount.gt(0) ? amount.toFixed(2) : null;
}

export async function recordPayment(tx: Prisma.TransactionClient, input: {
  contractId: string; amount: string; date: Date; source: string;
  externalId?: string; userId: string; roleCode: string;
}) {
  if (input.externalId && await tx.payment.findFirst({ where: { externalId: input.externalId } })) return { duplicate: true };
  const contract = await tx.contract.findUnique({
    where: { id: input.contractId },
    include: { paymentSchedules: { where: { isActive: true }, include: { lines: true } } },
  });
  if (!contract || contract.status !== "ACTIVE") return { error: "Активный договор не найден" };
  if (contract.paymentSchedules.length !== 1) return { error: "У договора должен быть один активный график" };
  const lines = contract.paymentSchedules[0].lines;
  const open = lines.filter(line => ["OPEN", "PARTIAL"].includes(line.status)).map(remainingLine);
  const outstanding = open.reduce((sum, line) => sum.plus(line.total), new Decimal(0));
  if (new Decimal(input.amount).gt(outstanding)) return { error: `Сумма превышает остаток по графику: ${outstanding.toFixed(2)} ₸` };
  const allocations = allocatePayment(input.amount, open);
  const payment = await tx.payment.create({ data: {
    contractId: input.contractId, amount: input.amount, date: input.date,
    source: input.source, externalId: input.externalId, allocations: JSON.stringify(allocations),
  } });
  for (const allocation of allocations) {
    const line = lines.find(entry => entry.id === allocation.scheduleLineId)!;
    const added = DEFAULT_PAYMENT_PRIORITY.reduce((sum, key) => sum.plus(allocation[key]), new Decimal(0));
    const paid = new Decimal(line.paidTotal).plus(added);
    await tx.scheduleLine.update({ where: { id: line.id }, data: {
      paidTotal: paid.toFixed(2), status: paid.eq(line.total) ? "PAID" : "PARTIAL",
    } });
  }
  await tx.auditLog.create({ data: {
    userId: input.userId, roleCode: input.roleCode, object: "contract", objectId: input.contractId,
    operation: input.source === "BANK" ? "PAYMENT_IMPORT" : "PAYMENT_CREATE",
    newValue: JSON.stringify({ amount: input.amount, externalId: input.externalId, reference: payment.id }),
  } });
  return { ok: true };
}
