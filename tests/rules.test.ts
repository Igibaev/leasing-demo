import { describe, expect, it } from "vitest";
import { calculateRatios, calculateScoring, checkLimits, DEFAULT_RATIOS, DEFAULT_RATING_BOUNDARIES, DEFAULT_SCORING_MODEL, evaluateCondition, evaluateExpression, evaluateFormula, evaluateStopFactors, recalculateRating, type ExposureLimit, type ScoringModel, type StopFactor } from "../lib/rules";

const model: ScoringModel = { indicators: [{ code: "metric", name: "Metric", weight: "100", scale: [{ max: "0", score: "0" }, { min: "0", max: "50", score: "40" }, { min: "50", score: "85" }] }], ratings: DEFAULT_RATING_BOUNDARIES };
const soft: StopFactor = { code: "DPD", name: "Просрочка", type: "SOFT", condition: "dpd > 30", active: true };
const override = { code: "DPD", userId: "risk-head", role: "ROLE-05", comment: "Verified mitigating evidence" };

describe("expression interpreter", () => {
  it.each([
    ["2 + 3 * 4", "14"], ["(2 + 3) * 4", "20"], ["10 - 3 - 2", "5"], ["20 / 2 / 2", "5"],
    ["-2 * +3", "-6"], ["--2", "2"], ["0.1 + 0.2", "0.3"], ["17 % 5", "2"], ["10 / 4", "2.5"],
  ])("evaluates %s precisely", (expression, result) => expect(evaluateFormula(expression)).toBe(result));
  it("keeps large financial values exact", () => expect(evaluateFormula("assets - debt", { assets: "9007199254740993.01", debt: "9007199254740993" })).toBe("0.01"));
  it("evaluates reporting formulas", () => expect(evaluateFormula("(debt - cash) / ebitda", { debt: "1000", cash: "100", ebitda: "300" })).toBe("3"));
  it.each([
    ["1 < 2 && 3 >= 3", true], ["1 == 1.0", true], ["1 != 2", true], ["false || true && false", false],
    ["!(1 > 2)", true], ["true == false", false], ["2 <= 1", false], ["true != false", true],
  ])("evaluates condition %s", (expression, expected) => expect(evaluateCondition(expression)).toBe(expected));
  it("supports boolean context values", () => expect(evaluateCondition("bankrupt || dpd > 30", { bankrupt: false, dpd: "31" })).toBe(true));
  it("short circuits guarded division", () => expect(evaluateCondition("ebitda != 0 && debt / ebitda > 3", { debt: "100", ebitda: "0" })).toBe(false));
  it("short circuits a missing unneeded variable", () => expect(evaluateCondition("true || missing > 0")).toBe(true));
  it.each(["", "1 / 0", "1 % 0", "missing", "(1 + 2", "1 +", "1 2", "1e3", "1 + true", "1 == true", "1 && true", "true + 1"])("rejects invalid expression %s", (expression) => expect(() => evaluateExpression(expression)).toThrow());
  it("requires the requested result type", () => {
    expect(() => evaluateCondition("1")).toThrow(/boolean/);
    expect(() => evaluateFormula("true")).toThrow(/number/);
  });
  it("rejects oversized expressions and nesting", () => {
    expect(() => evaluateFormula("1".repeat(4097))).toThrow(/length/);
    expect(() => evaluateFormula("(".repeat(66) + "1" + ")".repeat(66))).toThrow(/nesting/);
    expect(() => evaluateFormula(Array.from({ length: 300 }, () => "1").join("+"))).toThrow(/tokens/);
  });
  it("rejects non-finite financial input", () => expect(() => evaluateFormula("debt", { debt: "Infinity" })).toThrow());
  it("provides eleven configurable default ratios", () => {
    const ratios = calculateRatios({ debt: "600", cash: "100", ebitda: "200", equity: "300", operatingCashFlow: "150", debtService: "100", netIncome: "60", averageAssets: "1000", averageEquity: "300", revenue: "1200", averageReceivables: "100", costOfSales: "800", averagePayables: "200", averageInventory: "400" });
    expect(Object.keys(ratios)).toHaveLength(11);
    expect(DEFAULT_RATIOS).toHaveLength(11);
    expect(ratios).toMatchObject({ DEBT_EBITDA: "3", NET_DEBT_EBITDA: "2.5", DEBT_EQUITY: "2", DSCR: "1.5", ROA: "6", ROE: "20", ROS: "5", RECEIVABLES_TURNOVER: "12", PAYABLES_TURNOVER: "4", INVENTORY_TURNOVER: "2" });
  });
  it("accepts edited ratio formulas", () => expect(calculateRatios({ debt: "600" }, [{ code: "CUSTOM", name: "Custom", formula: "debt / 2" }])).toEqual({ CUSTOM: "300" }));
  it("rejects duplicate ratio codes", () => expect(() => calculateRatios({}, [{ code: "X", name: "X", formula: "1" }, { code: "X", name: "X", formula: "2" }])).toThrow(/unique/));
});

describe("scoring", () => {
  it("uses the specified default weights", () => expect(DEFAULT_SCORING_MODEL.indicators.map((entry) => entry.weight)).toEqual(["25", "15", "15", "10", "10", "10", "5", "5", "5"]));
  it("calculates a weighted score from configurable ranges", () => {
    expect(calculateScoring({ metric: "75" }, model)).toMatchObject({ score: "85.00", rating: "A" });
    expect(calculateScoring({ metric: "25" }, model)).toMatchObject({ score: "40.00", rating: "D" });
  });
  it("treats range minimum as inclusive and maximum as exclusive", () => expect(calculateScoring({ metric: "50" }, model).score).toBe("85.00"));
  it("supports values below zero through configured bands", () => expect(calculateScoring({ metric: "-10" }, model).rating).toBe("F"));
  it("returns rating A for all maximum default scores", () => {
    const values = Object.fromEntries(DEFAULT_SCORING_MODEL.indicators.map((entry) => [entry.code, "100"]));
    expect(calculateScoring(values)).toMatchObject({ score: "100.00", rating: "A" });
  });
  it.each([["85", "A"], ["70", "B"], ["55", "C"], ["40", "D"], ["25", "E"], ["0", "F"]] as const)("maps exact boundary %s to %s", (score, rating) => {
    expect(calculateScoring({ metric: "1" }, { ...model, indicators: [{ ...model.indicators[0]!, scale: [{ score }] }] }).rating).toBe(rating);
  });
  it("uses exact rather than rounded score for the rating", () => {
    expect(calculateScoring({ metric: "1" }, { ...model, indicators: [{ ...model.indicators[0]!, scale: [{ score: "84.999" }] }] })).toMatchObject({ score: "85.00", rating: "B" });
  });
  it("rejects missing inputs", () => expect(() => calculateScoring({}, model)).toThrow(/Missing/));
  it("rejects weights that do not total one hundred", () => expect(() => calculateScoring({ metric: "1" }, { ...model, indicators: [{ ...model.indicators[0]!, weight: "99" }] })).toThrow(/sum/));
  it("rejects overlapping bands", () => expect(() => calculateScoring({ metric: "1" }, { ...model, indicators: [{ ...model.indicators[0]!, scale: [{ max: "10", score: "1" }, { min: "5", score: "2" }] }] })).toThrow(/overlap/));
  it("rejects out-of-range scores", () => expect(() => calculateScoring({ metric: "1" }, { ...model, indicators: [{ ...model.indicators[0]!, scale: [{ score: "101" }] }] })).toThrow(/100/));
  it("rejects uncovered input values", () => expect(() => calculateScoring({ metric: "1" }, { ...model, indicators: [{ ...model.indicators[0]!, scale: [{ min: "2", score: "1" }] }] })).toThrow(/No score/));
  it("rejects incomplete rating boundaries", () => expect(() => calculateScoring({ metric: "1" }, { ...model, ratings: model.ratings.slice(1) })).toThrow(/ratings/));
  it("appends rating history without overwriting prior entries", () => {
    const first = recalculateRating({ metric: "25" }, model, [], { clientId: "c1", calculatedAt: "2025-01-01", modelVersion: "1" });
    const second = recalculateRating({ metric: "75" }, model, first.history, { clientId: "c1", calculatedAt: "2025-02-01", modelVersion: "2" });
    expect(first.history).toHaveLength(1);
    expect(second.history.map((entry) => entry.rating)).toEqual(["D", "A"]);
    expect(second.history[0]).toEqual(first.current);
    second.history[0]!.details[0]!.value = "changed";
    expect(first.current.details[0]!.value).toBe("25");
  });
});

describe("stop factors", () => {
  it("blocks triggered SOFT factors until explicit override", () => expect(evaluateStopFactors([soft], { dpd: "31" })).toMatchObject({ blocked: true, hits: [{ code: "DPD", overridden: false }] }));
  it("does not block untriggered factors", () => expect(evaluateStopFactors([soft], { dpd: "30" })).toEqual({ blocked: false, hits: [], audit: [] }));
  it("ignores disabled factors", () => expect(evaluateStopFactors([{ ...soft, active: false }], {}).blocked).toBe(false));
  it("accepts ROLE-05 override and returns an audit event", () => {
    expect(evaluateStopFactors([soft], { dpd: "31" }, [override])).toMatchObject({ blocked: false, hits: [{ overridden: true }], audit: [{ operation: "STOP_FACTOR_OVERRIDE", ...override }] });
  });
  it("blocks HARD factors", () => expect(evaluateStopFactors([{ ...soft, type: "HARD" }], { dpd: "31" }).blocked).toBe(true));
  it("never permits a HARD override", () => expect(() => evaluateStopFactors([{ ...soft, type: "HARD" }], { dpd: "31" }, [override])).toThrow(/SOFT/));
  it.each([{ role: "ROLE-04" }, { comment: " " }, { userId: " " }])("rejects invalid override %j", (patch) => expect(() => evaluateStopFactors([soft], { dpd: "31" }, [{ ...override, ...patch }])).toThrow(/ROLE-05/));
  it("fails closed when input data or formula is invalid", () => {
    expect(evaluateStopFactors([soft], {})).toMatchObject({ blocked: true, hits: [{ overridden: false, error: expect.stringContaining("Unknown variable") }] });
    expect(() => evaluateStopFactors([soft], {}, [override])).toThrow();
  });
  it("rejects stale override of a factor that did not trigger", () => expect(() => evaluateStopFactors([soft], { dpd: "0" }, [override])).toThrow());
  it("rejects duplicate codes", () => expect(() => evaluateStopFactors([soft, soft], { dpd: "0" })).toThrow(/unique/));
});

describe("limits", () => {
  const deal = { clientId: "c1", groupId: "g1", industry: "agro", currency: "KZT", amount: "100" };
  const limits: ExposureLimit[] = [{ scope: "CLIENT", key: "c1", currency: "KZT", amount: "1000" }, { scope: "GROUP", key: "g1", currency: "KZT", amount: "2000" }, { scope: "INDUSTRY", key: "agro", currency: "KZT", amount: "5000" }];
  it("adds new financing to each scoped exposure", () => {
    const result = checkLimits(limits, [{ scope: "CLIENT", key: "c1", currency: "KZT", amount: "950" }], deal);
    expect(result).toMatchObject({ exceeded: true, route: "EXTENDED" });
    expect(result.checks[0]).toMatchObject({ currentExposure: "950.00", projectedExposure: "1050.00", excess: "50.00", exceeded: true });
    expect(result.checks[1]?.projectedExposure).toBe("100.00");
  });
  it.each(["CLIENT", "GROUP", "INDUSTRY"] as const)("routes %s breaches to extended approval", (scope) => {
    const limit = limits.find((entry) => entry.scope === scope)!;
    expect(checkLimits(limits, [{ ...limit, amount: limit.amount }], deal).route).toBe("EXTENDED");
  });
  it("allows exact equality to a limit", () => expect(checkLimits(limits, [{ ...limits[0]!, amount: "900" }], deal).route).toBe("STANDARD"));
  it("aggregates multiple exposures", () => expect(checkLimits(limits, [{ ...limits[0]!, amount: "600" }, { ...limits[0]!, amount: "350" }], deal).checks[0]?.currentExposure).toBe("950.00"));
  it("ignores unrelated exposure", () => expect(checkLimits(limits, [{ ...limits[0]!, key: "other", amount: "999999" }], deal).exceeded).toBe(false));
  it("does not mix currencies", () => expect(() => checkLimits(limits, [{ ...limits[0]!, currency: "USD", amount: "1" }], deal)).toThrow(/Currency/));
  it("supports deals without a related group", () => expect(checkLimits(limits, [], { ...deal, groupId: undefined }).checks).toHaveLength(2));
  it("rejects negative exposure", () => expect(() => checkLimits(limits, [{ ...limits[0]!, amount: "-1" }], deal)).toThrow());
  it("rejects duplicate limits", () => expect(() => checkLimits([limits[0]!, limits[0]!], [], deal)).toThrow(/Duplicate/));
});
