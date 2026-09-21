import { describe, expect, it } from "vitest";
import { remainingLine } from "@/lib/payment-balance";
import { overdueForLines } from "@/lib/overdue";
const line = { id: "line", seq: 1, dueDate: "2026-09-01", principal: "100.00", interest: "20.00", vat: "3.00", commission: "2.00", total: "125.00", balance: "0.00", paidTotal: "15.00", status: "PARTIAL" };
describe("payment balances and overdue", () => {
  it("deducts already paid components in payment priority", () => {
    expect(remainingLine(line)).toMatchObject({ commission: "0.00", vat: "0.00", interest: "10.00", principal: "100.00", total: "110.00" });
  });
  it("partial payment does not erase overdue", () => {
    expect(overdueForLines([line], "2026-09-21")).toMatchObject({ dpd: 20, overdueAmount: "110.00", principalOverdue: "100.00", interestOverdue: "10.00", lineCount: 1 });
  });
  it("includes fees and tax, excludes future and fully paid lines", () => {
    expect(overdueForLines([{ ...line, paidTotal: "0", status: "OPEN" }, { ...line, dueDate: "2027-01-01" }], "2026-09-21").overdueAmount).toBe("125.00");
    expect(overdueForLines([{ ...line, paidTotal: "125.00", status: "PAID" }], "2026-09-21").dpd).toBe(0);
  });
});
