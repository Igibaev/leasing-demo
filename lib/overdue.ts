import { calculateDpd, type DpdBucket, type ScheduleLine } from "./calc";
import { moneyKzt } from "./money";

export interface OverdueState {
  dpd: number;
  bucket: DpdBucket;
  overdueAmount: string;
  principalOverdue: string;
  interestOverdue: string;
  lineCount: number;
}

export function overdueForLines(lines: readonly { dueDate: string; status: string; principal: string; interest: string; vat: string; commission: string; total: string; balance: string }[], asOfDate: string): OverdueState {
  const open = lines
    .filter((line) => line.status === "OPEN")
    .map((line) => ({ seq: 0, dueDate: line.dueDate, principal: line.principal, interest: line.interest, vat: line.vat, commission: line.commission, total: line.total, balance: line.balance } satisfies ScheduleLine));
  if (open.length === 0) return { dpd: 0, bucket: "CURRENT", overdueAmount: "0", principalOverdue: "0", interestOverdue: "0", lineCount: 0 };
  const result = calculateDpd(open, asOfDate);
  const overdueAmount = Number(result.principalOverdue) + Number(result.interestOverdue);
  return {
    dpd: result.dpd,
    bucket: result.bucket,
    principalOverdue: result.principalOverdue,
    interestOverdue: result.interestOverdue,
    overdueAmount: overdueAmount.toFixed(2),
    lineCount: open.length,
  };
}

export const BUCKET_LABEL: Record<string, string> = {
  "CURRENT": "Текущая",
  "1–7": "1–7 дней",
  "8–30": "8–30 дней",
  "31–60": "31–60 дней",
  "61–90": "61–90 дней",
  "91–180": "91–180 дней",
  "180+": "180+ дней",
};

export { moneyKzt };