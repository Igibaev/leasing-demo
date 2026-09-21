import { calculateScoring, DEFAULT_SCORING_MODEL, evaluateStopFactors, checkLimits, type StopFactor, type Exposure, type ScoringResult, type StopFactorResult, type LimitCheck } from "./rules";
import Decimal from "decimal.js";
import type { Application, Client } from "@prisma/client";

export interface ScoringFacts {
  financialCondition: string;
  debtBurden: string;
  paymentDiscipline: string;
  industry: string;
  assetQuality: string;
  liquidity: string;
  downPayment: string;
  businessAge: string;
  additionalCollateral: string;
  ewsScore: string;
  financedAmount: string;
  clientType: string;
  businessAgeYears: string;
  assetCost: string;
  industryCode: string;
}

export function factsFor(client: Client, appl: Application): ScoringFacts {
  let finance: Record<string, number> = {};
  try {
    finance = JSON.parse(client.financeJson) as Record<string, number>;
  } catch {
    finance = {};
  }
  const ebitdaMargin = finance.ebitdaMargin ?? 15;
  const debtEbitda = finance.debtEbitda ?? 2;
  const currentRatio = finance.currentRatio ?? 1.2;
  const registered = new Date(client.registrationDate);
  const ageYears = Math.max(0.2, Math.round((new Date().getTime() - registered.getTime()) / (365.25 * 24 * 3600 * 1000) * 10) / 10);
  const financialCondition = clamp(30 + ebitdaMargin * 2.5 - 4);
  const debtBurden = clamp(90 - debtEbitda * 12 + 10);
  const downShare = new Decimal(appl.downPayment).div(new Decimal(appl.assetCost)).toNumber();
  const assetQuality = assetQualityFor(appl.product);
  const industry = industryFor(client.oked);
  const downPayment = Math.round(downShare * 100 * 2);
  const liquidity = clamp(currentRatio * 30 + 20);
  const paymentDiscipline = client.ewsColor === "GREEN" ? 88 : client.ewsColor === "YELLOW" ? 60 : client.ewsColor === "ORANGE" ? 35 : 15;
  const businessAge = Math.min(92, Math.round(ageYears * 12 + 30));
  const ewsScore = client.ewsColor === "GREEN" ? 3 : client.ewsColor === "YELLOW" ? 2 : client.ewsColor === "ORANGE" ? 1 : 0;
  return {
    financialCondition: financialCondition.toFixed(2),
    debtBurden: debtBurden.toFixed(2),
    paymentDiscipline: String(paymentDiscipline),
    industry: String(industry),
    assetQuality: String(assetQuality),
    liquidity: liquidity.toFixed(2),
    downPayment: String(Math.max(5, downPayment)),
    businessAge: String(businessAge),
    additionalCollateral: client.groupId ? "80" : "55",
    ewsScore: String(ewsScore),
    financedAmount: appl.financedAmount,
    clientType: client.clientType,
    businessAgeYears: ageYears.toFixed(2),
    assetCost: appl.assetCost,
    industryCode: client.oked,
  };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function assetQualityFor(product: string): number {
  const map: Record<string, number> = {
    "Автобус": 72,
    "Грузовой транспорт": 68,
    "Седельный тягач": 65,
    "Экскаватор": 60,
    "Станки": 58,
    "Медицинское оборудование": 74,
  };
  return map[product] ?? 60;
}

function industryFor(oked: string): number {
  const prefix = oked.slice(0, 2);
  const map: Record<string, number> = {
    "01": 55, "02": 55, "03": 55, "05": 70, "06": 82, "07": 78, "08": 72, "09": 76,
    "10": 68, "11": 68, "12": 68, "13": 62, "14": 62, "15": 66, "16": 66, "17": 66,
    "25": 60, "26": 72, "28": 64, "30": 58, "41": 56, "42": 58, "43": 60,
    "45": 58, "46": 64, "47": 60, "49": 62, "52": 58, "55": 62, "86": 70,
  };
  return map[prefix] ?? 60;
}

export interface RiskResult {
  scoring: ScoringResult;
  stopFactors: StopFactorResult;
  limits: { exceeded: boolean; route: "STANDARD" | "EXTENDED"; checks: LimitCheck[] };
}

const DEFAULT_STOP_FACTORS: StopFactor[] = [
  { code: "EWS_RED", name: "Клиент в красной зоне EWS", type: "HARD", condition: "ewsscore == 0", active: true },
  { code: "NEW_CLIENT", name: "Срок бизнеса менее 3 лет", type: "SOFT", condition: "businessAgeYears < 3", active: true },
  { code: "HIGH_EXPOSURE", name: "Сумма сделки свыше 500 млн ₸", type: "SOFT", condition: "financedAmount > 500000000", active: true },
  { code: "INDIVIDUAL", name: "Заявка от физического лица", type: "SOFT", condition: "clientTypeIndividual", active: true },
];

const CLIENT_LIMIT = "1000000000";
const INDUSTRY_LIMIT = "2500000000";

export async function evaluateRisk(client: Client, appl: Application, exposures: Exposure[]): Promise<RiskResult> {
  const facts = factsFor(client, appl);
  const scoring = calculateScoring({
    financialCondition: facts.financialCondition,
    debtBurden: facts.debtBurden,
    paymentDiscipline: facts.paymentDiscipline,
    industry: facts.industry,
    assetQuality: facts.assetQuality,
    liquidity: facts.liquidity,
    downPayment: facts.downPayment,
    businessAge: facts.businessAge,
    additionalCollateral: facts.additionalCollateral,
  }, DEFAULT_SCORING_MODEL);
  const stopFactors = evaluateStopFactors(DEFAULT_STOP_FACTORS, {
    ewsscore: facts.ewsScore,
    businessAgeYears: facts.businessAgeYears,
    financedAmount: facts.financedAmount,
    clientTypeIndividual: facts.clientType === "INDIVIDUAL",
  });
  const limits = checkLimits(
    [
      { scope: "CLIENT", key: client.id, amount: CLIENT_LIMIT, currency: "KZT" },
      { scope: "INDUSTRY", key: facts.industryCode.slice(0, 2), amount: INDUSTRY_LIMIT, currency: "KZT" },
    ],
    exposures,
    { clientId: client.id, groupId: client.groupId ?? undefined, industry: facts.industryCode.slice(0, 2), amount: appl.financedAmount, currency: "KZT" },
  );
  return { scoring, stopFactors, limits };
}

export { DEFAULT_STOP_FACTORS, CLIENT_LIMIT as CLIENT_EXPOSURE_LIMIT };

export function exposureForClient(clientId: string, groupId: string | null, industryKey: string): Exposure[] {
  return [
    { scope: "CLIENT", key: clientId, amount: "0", currency: "KZT" },
    ...(groupId ? [{ scope: "GROUP" as const, key: groupId, amount: "0", currency: "KZT" }] : []),
    { scope: "INDUSTRY" as const, key: industryKey, amount: "0", currency: "KZT" },
  ];
}
