import type { DecimalValue } from "./calc/decimal";

export function parseDateInput(systemDate: string): Date {
  return new Date(systemDate);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function dateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function daysBetween(a: string, b: string): number {
  const left = new Date(a);
  const right = new Date(b);
  return Math.round((right.getTime() - left.getTime()) / 86400000);
}

export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function addWorkingHours(start: Date, hours: number): Date {
  const workingDayHours = 8;
  let remaining = hours;
  const cursor = new Date(start);
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) continue;
    remaining -= workingDayHours;
  }
  return cursor;
}

export type { DecimalValue };