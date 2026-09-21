import Decimal from "decimal.js";
import { remainingLine } from "./payment-balance";
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

export function overdueForLines(lines: readonly { dueDate: string; status: string; principal: string; interest: string; vat: string; commission: string; total: string; balance: string; paidTotal?: string }[], asOfDate: string): OverdueState {
  const open = lines
    .filter((line) => ["OPEN", "PARTIAL"].includes(line.status))
    .map((line) => remainingLine({ ...line, seq: 0 } satisfies ScheduleLine))
    .filter(line => line.dueDate < asOfDate && new Decimal(line.total).gt(0));
  if (open.length === 0) return { dpd: 0, bucket: "CURRENT", overdueAmount: "0", principalOverdue: "0", interestOverdue: "0", lineCount: 0 };
  const result = calculateDpd(open, asOfDate);
  const overdueAmount = open.reduce((sum, line) => sum.plus(line.total), new Decimal(0));
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