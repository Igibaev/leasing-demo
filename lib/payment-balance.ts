import Decimal from "decimal.js";
import { DEFAULT_PAYMENT_PRIORITY, type OpenScheduleLine } from "./calc";

// All payments use the same component priority, so paidTotal can be replayed
// against the original components without losing cent precision.
export function remainingLine(line: OpenScheduleLine & { paidTotal?: string }): OpenScheduleLine {
  let paid = new Decimal(line.paidTotal ?? 0);
  const remaining = { ...line };
  for (const key of DEFAULT_PAYMENT_PRIORITY) {
    const value = new Decimal(line[key] ?? 0);
    const consumed = Decimal.min(paid, value);
    remaining[key] = value.minus(consumed).toFixed(2);
    paid = paid.minus(consumed);
  }
  remaining.total = Decimal.max(0, new Decimal(line.total).minus(line.paidTotal ?? 0)).toFixed(2);
  return remaining;
}
