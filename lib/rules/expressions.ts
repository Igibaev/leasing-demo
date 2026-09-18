import { decimal, type DecimalValue } from "../calc/decimal";

export type FormulaContext = Readonly<Record<string, string | boolean>>;
type Value = DecimalValue | boolean;
type Node = { kind: "literal"; value: Value } | { kind: "variable"; name: string } | { kind: "unary"; operator: string; child: Node } | { kind: "binary"; operator: string; left: Node; right: Node };
const precedence: Readonly<Record<string, number>> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };

function numeric(value: Value): DecimalValue {
  if (typeof value === "boolean") throw new Error("Expected numeric expression");
  return value;
}

function logical(value: Value): boolean {
  if (typeof value !== "boolean") throw new Error("Expected boolean expression");
  return value;
}

function parse(expression: string): Node {
  if (typeof expression !== "string" || !expression.trim() || expression.length > 4096) throw new Error("Invalid expression length");
  const tokens: string[] = [];
  let offset = 0;
  while (offset < expression.length) {
    const rest = expression.slice(offset);
    const space = /^\s+/.exec(rest);
    if (space) { offset += space[0].length; continue; }
    const token = /^(?:\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|&&|\|\||==|!=|<=|>=|[()+\-*/%!<>])/.exec(rest);
    if (!token) throw new Error(`Invalid expression token at ${offset}`);
    tokens.push(token[0]);
    offset += token[0].length;
    if (tokens.length > 512) throw new Error("Expression has too many tokens");
  }
  let position = 0;
  const binary = (minimum: number, depth: number): Node => {
    if (depth > 64) throw new Error("Expression nesting limit exceeded");
    const token = tokens[position++];
    if (token === undefined) throw new Error("Unexpected end of expression");
    let left: Node;
    if (["!", "+", "-"].includes(token)) {
      left = { kind: "unary", operator: token, child: binary(7, depth + 1) };
    } else if (token === "(") {
      left = binary(1, depth + 1);
      if (tokens[position++] !== ")") throw new Error("Unclosed parentheses");
    } else if (/^\d/.test(token)) {
      left = { kind: "literal", value: decimal(token) };
    } else if (token === "true" || token === "false") {
      left = { kind: "literal", value: token === "true" };
    } else if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(token)) {
      left = { kind: "variable", name: token };
    } else {
      throw new Error(`Unexpected token: ${token}`);
    }
    while (position < tokens.length) {
      const operator = tokens[position]!;
      const level = Object.hasOwn(precedence, operator) ? precedence[operator] : undefined;
      if (level === undefined || level < minimum) break;
      position += 1;
      left = { kind: "binary", operator, left, right: binary(level + 1, depth + 1) };
    }
    return left;
  };
  const root = binary(1, 0);
  if (position !== tokens.length) throw new Error(`Unexpected token: ${tokens[position]}`);
  return root;
}

function execute(node: Node, context: FormulaContext): Value {
  if (node.kind === "literal") return node.value;
  if (node.kind === "variable") {
    if (!Object.hasOwn(context, node.name) || ["__proto__", "constructor", "prototype"].includes(node.name)) throw new Error(`Unknown variable: ${node.name}`);
    const value = context[node.name];
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") throw new Error(`Invalid value: ${node.name}`);
    return decimal(value, node.name);
  }
  if (node.kind === "unary") {
    const value = execute(node.child, context);
    if (node.operator === "!") return !logical(value);
    return node.operator === "-" ? numeric(value).negated() : numeric(value);
  }
  const left = execute(node.left, context);
  if (node.operator === "&&") return logical(left) && logical(execute(node.right, context));
  if (node.operator === "||") return logical(left) || logical(execute(node.right, context));
  const right = execute(node.right, context);
  if (node.operator === "==" || node.operator === "!=") {
    if ((typeof left === "boolean") !== (typeof right === "boolean")) throw new Error("Cannot compare boolean with number");
    const equal = typeof left === "boolean" ? left === right : left.eq(numeric(right));
    return node.operator === "==" ? equal : !equal;
  }
  const a = numeric(left);
  const b = numeric(right);
  switch (node.operator) {
    case "+": return a.plus(b);
    case "-": return a.minus(b);
    case "*": return a.times(b);
    case "/":
      if (b.isZero()) throw new Error("Division by zero");
      return a.div(b);
    case "%":
      if (b.isZero()) throw new Error("Division by zero");
      return a.mod(b);
    case "<": return a.lt(b);
    case "<=": return a.lte(b);
    case ">": return a.gt(b);
    case ">=": return a.gte(b);
    default: throw new Error("Unknown operator");
  }
}

export function evaluateExpression(expression: string, context: FormulaContext = {}): string | boolean {
  const value = execute(parse(expression), context);
  if (typeof value === "boolean") return value;
  if (!value.isFinite()) throw new Error("Non-finite expression result");
  return value.toString();
}

export function evaluateFormula(expression: string, context: FormulaContext = {}): string {
  const result = evaluateExpression(expression, context);
  if (typeof result !== "string") throw new Error("Formula must produce a number");
  return result;
}

export function evaluateCondition(expression: string, context: FormulaContext = {}): boolean {
  const result = evaluateExpression(expression, context);
  if (typeof result !== "boolean") throw new Error("Condition must produce a boolean");
  return result;
}

export interface RatioDefinition { code: string; name: string; formula: string }
export const DEFAULT_RATIOS: readonly RatioDefinition[] = [
  { code: "DEBT_EBITDA", name: "Debt/EBITDA", formula: "debt / ebitda" },
  { code: "NET_DEBT_EBITDA", name: "Net Debt/EBITDA", formula: "(debt - cash) / ebitda" },
  { code: "DEBT_EQUITY", name: "Debt/Equity", formula: "debt / equity" },
  { code: "DSCR", name: "DSCR", formula: "operatingCashFlow / debtService" },
  { code: "ROA", name: "ROA", formula: "netIncome / averageAssets * 100" },
  { code: "ROE", name: "ROE", formula: "netIncome / averageEquity * 100" },
  { code: "ROS", name: "ROS", formula: "netIncome / revenue * 100" },
  { code: "EBITDA_MARGIN", name: "EBITDA Margin", formula: "ebitda / revenue * 100" },
  { code: "RECEIVABLES_TURNOVER", name: "Оборачиваемость ДЗ", formula: "revenue / averageReceivables" },
  { code: "PAYABLES_TURNOVER", name: "Оборачиваемость КЗ", formula: "costOfSales / averagePayables" },
  { code: "INVENTORY_TURNOVER", name: "Оборачиваемость запасов", formula: "costOfSales / averageInventory" },
];

export function calculateRatios(context: FormulaContext, definitions: readonly RatioDefinition[] = DEFAULT_RATIOS): Record<string, string> {
  const result: Record<string, string> = {};
  const seen = new Set<string>();
  for (const definition of definitions) {
    if (!definition.code.trim() || seen.has(definition.code)) throw new Error("Ratio codes must be unique and nonempty");
    seen.add(definition.code);
    Object.defineProperty(result, definition.code, { value: evaluateFormula(definition.formula, context), enumerable: true, configurable: true, writable: true });
  }
  return result;
}
