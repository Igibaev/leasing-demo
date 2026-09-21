import Decimal from "decimal.js";
import { calculateSchedule, type ScheduleLine } from "./calc";
import { addDays, dateParam } from "./datetime";

export interface ApplicationScheduleParams {
  assetCost: string;
  downPayment: string;
  termMonths: number;
  annualRate: string;
  scheduleType: string;
}

const COMMISSION_RATE = 0.006;

export function buildScheduleForApplication(application: ApplicationScheduleParams, firstPaymentDate: string = dateParam(addDays(new Date(), 30))): ScheduleLine[] {
  const commission = new Decimal(application.assetCost).times(COMMISSION_RATE).toFixed(2);
  return calculateSchedule({
    assetCost: application.assetCost,
    downPayment: application.downPayment,
    termMonths: application.termMonths,
    annualRate: application.annualRate,
    commission,
    commissionType: "IN_SCHEDULE",
    vatBase: "INTEREST_AND_COMMISSION",
    firstPaymentDate,
    scheduleType: application.scheduleType as "ANNUITY" | "DIFFERENTIATED",
  });
}