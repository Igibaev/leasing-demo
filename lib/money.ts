import Decimal from "decimal.js";

export function moneyKzt(value: string | number | Decimal | null | undefined): string {
  if (value === null || value === undefined) return "0 ₸";
  const amount = typeof value === "object" ? (value as Decimal).toFixed(2) : String(value);
  const numeric = Number.parseFloat(amount);
  if (!Number.isFinite(numeric)) return `${amount} ₸`;
  return `${new Intl.NumberFormat("ru-RU").format(numeric)} ₸`;
}

export function moneyPlain(value: string | number | Decimal | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const amount = typeof value === "object" ? (value as Decimal).toFixed(2) : String(value);
  const numeric = Number.parseFloat(amount);
  if (!Number.isFinite(numeric)) return amount;
  return new Intl.NumberFormat("ru-RU").format(numeric);
}

export function toDecimal(value: string | number | Decimal): Decimal {
  return typeof value === "object" ? (value as Decimal) : new Decimal(value);
}