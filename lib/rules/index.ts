import { Decimal, decimal, money, nonNegative } from "../calc/decimal";
import { parseDate } from "../calc/dates";
import { evaluateCondition, type FormulaContext } from "./expressions";

export { evaluateExpression, evaluateFormula, evaluateCondition, calculateRatios, DEFAULT_RATIOS } from "./expressions";
export type { FormulaContext, RatioDefinition } from "./expressions";

export type Rating = "A" | "B" | "C" | "D" | "E" | "F";
export interface ScoreBand { min?: string; max?: string; score: string }
export interface ScoringIndicator { code: string; name: string; weight: string; scale: readonly ScoreBand[] }
export interface RatingBoundary { rating: Rating; min: string }
export interface ScoringModel { indicators: readonly ScoringIndicator[]; ratings: readonly RatingBoundary[] }
export interface ScoringResult {
  score: string;
  rating: Rating;
  details: { code: string; value: string; score: string; weight: string; contribution: string }[];
}

export const DEFAULT_RATING_BOUNDARIES: readonly RatingBoundary[] = [
  { rating: "A", min: "85" }, { rating: "B", min: "70" }, { rating: "C", min: "55" },
  { rating: "D", min: "40" }, { rating: "E", min: "25" }, { rating: "F", min: "0" },
];

const DEFAULT_SCALE: readonly ScoreBand[] = [
  { min: "0", max: "25", score: "10" }, { min: "25", max: "50", score: "35" },
  { min: "50", max: "75", score: "60" }, { min: "75", max: "100", score: "85" },
  { min: "100", score: "100" },
];

export const DEFAULT_SCORING_MODEL: ScoringModel = {
  indicators: [
    { code: "financialCondition", name: "Финансовое состояние", weight: "25", scale: DEFAULT_SCALE },
    { code: "debtBurden", name: "Долговая нагрузка", weight: "15", scale: DEFAULT_SCALE },
    { code: "paymentDiscipline", name: "Платёжная дисциплина", weight: "15", scale: DEFAULT_SCALE },
    { code: "industry", name: "Отрасль", weight: "10", scale: DEFAULT_SCALE },
    { code: "assetQuality", name: "Качество предмета", weight: "10", scale: DEFAULT_SCALE },
    { code: "liquidity", name: "Ликвидность", weight: "10", scale: DEFAULT_SCALE },
    { code: "downPayment", name: "Аванс", weight: "5", scale: DEFAULT_SCALE },
    { code: "businessAge", name: "Срок бизнеса", weight: "5", scale: DEFAULT_SCALE },
    { code: "additionalCollateral", name: "Дополнительное обеспечение", weight: "5", scale: DEFAULT_SCALE },
  ],
  ratings: DEFAULT_RATING_BOUNDARIES,
};

function validateScale(scale: readonly ScoreBand[]): void {
  if (!scale.length) throw new Error("Score scale must not be empty");
  for (const band of scale) {
    const score = nonNegative(band.score, "score");
    if (score.gt(100)) throw new Error("Score must be between 0 and 100");
    const min = band.min === undefined ? undefined : decimal(band.min, "min");
    const max = band.max === undefined ? undefined : decimal(band.max, "max");
    if (min !== undefined && max !== undefined && min.gte(max)) throw new Error("Invalid score range");
  }
  const ordered = [...scale].sort((a, b) => a.min === undefined ? -1 : b.min === undefined ? 1 : decimal(a.min).cmp(decimal(b.min)));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (previous.max === undefined || current.min === undefined || decimal(previous.max).gt(decimal(current.min))) throw new Error("Score ranges overlap");
  }
}

export function calculateScoring(values: Readonly<Record<string, string>>, model: ScoringModel = DEFAULT_SCORING_MODEL): ScoringResult {
  if (model.indicators.length === 0) throw new Error("Scoring indicators required");
  const codes = new Set<string>();
  let weightSum = new Decimal(0);
  let score = new Decimal(0);
  const details: ScoringResult["details"] = [];
  for (const indicator of model.indicators) {
    if (!indicator.code.trim() || codes.has(indicator.code)) throw new Error("Indicator codes must be unique and nonempty");
    codes.add(indicator.code);
    validateScale(indicator.scale);
    const weight = nonNegative(indicator.weight, "weight");
    weightSum = weightSum.plus(weight);
    if (!Object.hasOwn(values, indicator.code)) throw new Error(`Missing indicator: ${indicator.code}`);
    const raw = values[indicator.code];
    if (raw === undefined) throw new Error(`Missing indicator: ${indicator.code}`);
    const value = decimal(raw, indicator.code);
    const band = indicator.scale.find((candidate) => (candidate.min === undefined || value.gte(decimal(candidate.min))) && (candidate.max === undefined || value.lt(decimal(candidate.max))));
    if (!band) throw new Error(`No score range for ${indicator.code}`);
    const contribution = decimal(band.score).times(weight).div(100);
    score = score.plus(contribution);
    details.push({ code: indicator.code, value: raw, score: band.score, weight: indicator.weight, contribution: contribution.toString() });
  }
  if (!weightSum.eq(100)) throw new Error("Scoring weights must sum to 100");
  const ratings = [...model.ratings].sort((a, b) => decimal(b.min).cmp(decimal(a.min)));
  if (ratings.length !== 6 || new Set(ratings.map((boundary) => boundary.rating)).size !== 6 || ratings.some((boundary) => !["A", "B", "C", "D", "E", "F"].includes(boundary.rating))) throw new Error("All ratings A–F are required exactly once");
  const minima = ratings.map((boundary) => nonNegative(boundary.min, "rating minimum"));
  if (minima.some((min) => min.gt(100)) || !minima[minima.length - 1]!.isZero() || new Set(minima.map((min) => min.toString())).size !== 6) throw new Error("Invalid rating boundaries");
  const rating = ratings.find((boundary) => score.gte(decimal(boundary.min)));
  if (!rating) throw new Error("No rating for score");
  return { score: score.toFixed(2), rating: rating.rating, details };
}

export const calculateScore = calculateScoring;

export interface RatingHistoryEntry extends ScoringResult {
  clientId: string;
  calculatedAt: string;
  modelVersion: string;
}

export function recalculateRating(values: Readonly<Record<string, string>>, model: ScoringModel, history: readonly RatingHistoryEntry[], metadata: { clientId: string; calculatedAt: string; modelVersion: string }): { current: RatingHistoryEntry; history: RatingHistoryEntry[] } {
  parseDate(metadata.calculatedAt);
  if (!metadata.clientId.trim() || !metadata.modelVersion.trim()) throw new Error("Rating metadata required");
  const current: RatingHistoryEntry = { ...calculateScoring(values, model), ...metadata };
  return { current, history: [...history.map((entry) => ({ ...entry, details: entry.details.map((detail) => ({ ...detail })) })), { ...current, details: current.details.map((detail) => ({ ...detail })) }] };
}

export interface StopFactor {
  code: string;
  name: string;
  type: "HARD" | "SOFT";
  condition: string;
  active: boolean;
}
export interface StopFactorOverride { code: string; userId: string; role: string; comment: string }
export interface StopFactorAudit { operation: "STOP_FACTOR_OVERRIDE"; code: string; userId: string; role: "ROLE-05"; comment: string }
export interface StopFactorResult {
  blocked: boolean;
  hits: { code: string; name: string; type: "HARD" | "SOFT"; overridden: boolean; error?: string }[];
  audit: StopFactorAudit[];
}

export function evaluateStopFactors(factors: readonly StopFactor[], context: FormulaContext, overrides: readonly StopFactorOverride[] = []): StopFactorResult {
  const result: StopFactorResult = { blocked: false, hits: [], audit: [] };
  const codes = new Set<string>();
  const overrideMap = new Map<string, StopFactorOverride>();
  for (const override of overrides) {
    if (overrideMap.has(override.code)) throw new Error("Duplicate stop factor override");
    if (override.role !== "ROLE-05" || !override.userId.trim() || !override.comment.trim()) throw new Error("SOFT override requires ROLE-05, user and comment");
    overrideMap.set(override.code, override);
  }
  for (const factor of factors) {
    if (!factor.code.trim() || codes.has(factor.code)) throw new Error("Stop factor codes must be unique and nonempty");
    codes.add(factor.code);
    if (factor.type !== "HARD" && factor.type !== "SOFT") throw new Error("Invalid stop factor type");
    if (!factor.active) continue;
    let triggered: boolean;
    try {
      triggered = evaluateCondition(factor.condition, context);
    } catch (error: unknown) {
      result.hits.push({ code: factor.code, name: factor.name, type: factor.type, overridden: false, error: error instanceof Error ? error.message : "Condition evaluation failed" });
      result.blocked = true;
      continue;
    }
    if (!triggered) continue;
    const override = overrideMap.get(factor.code);
    const overridden = factor.type === "SOFT" && override !== undefined;
    result.hits.push({ code: factor.code, name: factor.name, type: factor.type, overridden });
    if (overridden && override) result.audit.push({ operation: "STOP_FACTOR_OVERRIDE", code: factor.code, userId: override.userId, role: "ROLE-05", comment: override.comment.trim() });
    if (!overridden) result.blocked = true;
  }
  for (const code of overrideMap.keys()) {
    const hit = result.hits.find((entry) => entry.code === code);
    if (!hit || hit.type === "HARD" || hit.error !== undefined) throw new Error("Only triggered, valid SOFT factors may be overridden");
  }
  return result;
}

export const checkStopFactors = evaluateStopFactors;
export type LimitScope = "CLIENT" | "GROUP" | "INDUSTRY";
export interface ExposureLimit { scope: LimitScope; key: string; amount: string; currency: string }
export interface Exposure { scope: LimitScope; key: string; amount: string; currency: string }
export interface LimitDeal { clientId: string; groupId?: string; industry: string; amount: string; currency: string }
export interface LimitCheck {
  scope: LimitScope;
  key: string;
  currency: string;
  limit: string;
  currentExposure: string;
  projectedExposure: string;
  excess: string;
  exceeded: boolean;
}

export function checkLimits(limits: readonly ExposureLimit[], exposures: readonly Exposure[], deal: LimitDeal): { exceeded: boolean; route: "STANDARD" | "EXTENDED"; checks: LimitCheck[] } {
  const amount = money(deal.amount, "deal amount");
  if (!deal.clientId.trim() || !deal.industry.trim() || !deal.currency.trim()) throw new Error("Deal client, industry and currency required");
  const keyFor = (scope: LimitScope): string | undefined => scope === "CLIENT" ? deal.clientId : scope === "GROUP" ? deal.groupId : deal.industry;
  for (const entry of [...limits, ...exposures]) {
    money(entry.amount, "exposure or limit");
    if (!["CLIENT", "GROUP", "INDUSTRY"].includes(entry.scope) || !entry.key.trim() || !entry.currency.trim()) throw new Error("Invalid exposure scope, key or currency");
    if (entry.key === keyFor(entry.scope) && entry.currency !== deal.currency) throw new Error("Currency conversion is required before checking limits");
  }
  const seen = new Set<string>();
  const checks: LimitCheck[] = [];
  for (const limit of limits) {
    const identity = JSON.stringify([limit.scope, limit.key, limit.currency]);
    if (seen.has(identity)) throw new Error("Duplicate limit");
    seen.add(identity);
    if (limit.key !== keyFor(limit.scope)) continue;
    const current = exposures.filter((entry) => entry.scope === limit.scope && entry.key === limit.key && entry.currency === limit.currency).reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    const projected = current.plus(amount);
    const excess = Decimal.max(0, projected.minus(limit.amount));
    checks.push({ scope: limit.scope, key: limit.key, currency: limit.currency, limit: money(limit.amount, "limit").toFixed(2), currentExposure: current.toFixed(2), projectedExposure: projected.toFixed(2), excess: excess.toFixed(2), exceeded: excess.gt(0) });
  }
  const exceeded = checks.some((check) => check.exceeded);
  return { exceeded, route: exceeded ? "EXTENDED" : "STANDARD", checks };
}
