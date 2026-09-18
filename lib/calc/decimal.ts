import DecimalJs from "decimal.js";

export const Decimal = DecimalJs.clone({ precision: 48, rounding: DecimalJs.ROUND_HALF_UP });
export type DecimalValue = DecimalJs;

export function decimal(value: string, name = "value"): DecimalValue {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value) || value.length > 100) {
    throw new Error(`${name} must be a finite decimal string`);
  }
  const result = new Decimal(value);
  if (!result.isFinite()) throw new Error(`${name} must be finite`);
  return result;
}

export function nonNegative(value: string, name: string): DecimalValue {
  const result = decimal(value, name);
  if (result.isNegative()) throw new Error(`${name} must not be negative`);
  return result;
}

export function money(value: string, name: string): DecimalValue {
  const result = nonNegative(value, name);
  if (result.decimalPlaces() > 2) throw new Error(`${name} must have at most two decimal places`);
  return result;
}

export function fixed(value: DecimalValue): string {
  return value.toDecimalPlaces(2).toFixed(2);
}
