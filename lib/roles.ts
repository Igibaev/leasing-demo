export type Action = "view" | "create" | "edit" | "approve" | "sign" | "crm";

export const MODULES = [
  "dashboard",
  "clients",
  "applications",
  "calculator",
  "committee",
  "contracts",
  "payments",
  "overdue",
  "monitoring",
  "portfolio",
  "admin",
  "audit",
  "account",
] as const;

export type Module = (typeof MODULES)[number];

export type PermissionSet = Partial<Record<Action, boolean>>;
export type PermissionMatrix = Partial<Record<Module, PermissionSet>>;

const ALL = { view: true, create: true, edit: true, approve: true, sign: true, crm: true } satisfies PermissionSet;
const VIEW_ONLY = { view: true } satisfies PermissionSet;
const INSPECT = { view: true, approve: true } satisfies PermissionSet;

export interface RoleInfo {
  code: string;
  name: string;
  permissions: PermissionMatrix;
}

export const ALL_ROLES: RoleInfo[] = [
  { code: "ROLE-01", name: "Менеджер по продажам", permissions: { dashboard: ALL, clients: ALL, applications: ALL, calculator: ALL, contracts: { view: true }, account: VIEW_ONLY } },
  { code: "ROLE-02", name: "Руководитель продаж", permissions: { dashboard: ALL, clients: ALL, applications: { view: true, approve: true }, calculator: ALL, portfolio: VIEW_ONLY } },
  { code: "ROLE-03", name: "Кредитный аналитик", permissions: { dashboard: ALL, clients: VIEW_ONLY, applications: { view: true, approve: true, edit: true }, calculator: VIEW_ONLY, portfolio: VIEW_ONLY } },
  { code: "ROLE-04", name: "Риск-менеджер", permissions: { dashboard: ALL, clients: VIEW_ONLY, applications: { view: true, approve: true }, portfolio: VIEW_ONLY, overdue: VIEW_ONLY } },
  { code: "ROLE-05", name: "Руководитель риск-подразделения", permissions: { dashboard: ALL, applications: { view: true, approve: true }, portfolio: ALL, overdue: VIEW_ONLY, clients: VIEW_ONLY } },
  { code: "ROLE-06", name: "Служба безопасности", permissions: { dashboard: ALL, clients: INSPECT, applications: { view: true, approve: true } } },
  { code: "ROLE-07", name: "ПОД/ФТ", permissions: { dashboard: ALL, clients: INSPECT, applications: { view: true, approve: true } } },
  { code: "ROLE-08", name: "Юрист", permissions: { dashboard: ALL, clients: VIEW_ONLY, applications: { view: true, approve: true }, contracts: ALL } },
  { code: "ROLE-09", name: "Лизинговые операции", permissions: { dashboard: ALL, contracts: ALL, clients: VIEW_ONLY, monitoring: ALL, payments: VIEW_ONLY } },
  { code: "ROLE-10", name: "Бюджетирование", permissions: { dashboard: ALL, portfolio: VIEW_ONLY, contracts: VIEW_ONLY } },
  { code: "ROLE-11", name: "Бухгалтерия", permissions: { dashboard: ALL, payments: ALL, contracts: VIEW_ONLY, portfolio: VIEW_ONLY } },
  { code: "ROLE-12", name: "Мониторинг", permissions: { dashboard: ALL, monitoring: ALL, clients: VIEW_ONLY, contracts: VIEW_ONLY } },
  { code: "ROLE-13", name: "Взыскание", permissions: { dashboard: ALL, overdue: ALL, clients: VIEW_ONLY, contracts: VIEW_ONLY } },
  { code: "ROLE-14", name: "Член кредитного комитета", permissions: { dashboard: ALL, committee: ALL, applications: VIEW_ONLY, clients: VIEW_ONLY } },
  { code: "ROLE-15", name: "Руководство", permissions: { dashboard: ALL, portfolio: ALL, committee: { view: true }, audit: VIEW_ONLY, clients: VIEW_ONLY } },
  { code: "ROLE-16", name: "Внутренний аудит", permissions: { dashboard: ALL, audit: ALL, portfolio: VIEW_ONLY, clients: VIEW_ONLY, payments: VIEW_ONLY, applications: VIEW_ONLY } },
  { code: "ROLE-17", name: "Системный администратор", permissions: { dashboard: ALL, admin: ALL, audit: ALL, clients: ALL, applications: ALL, contracts: ALL, payments: ALL, portfolio: ALL, committee: ALL, monitoring: ALL, overdue: ALL, calculator: ALL } },
  { code: "ROLE-18", name: "Клиент (личный кабинет)", permissions: { account: ALL, dashboard: VIEW_ONLY } },
];

const ROLE_MAP = new Map(ALL_ROLES.map((role) => [role.code, role]));

export function getRole(code: string): RoleInfo {
  return ROLE_MAP.get(code) ?? ALL_ROLES[16]!;
}

export function can(roleCode: string, module: Module, action: Action): boolean {
  return getRole(roleCode).permissions[module]?.[action] === true;
}

export function menuFor(roleCode: string): { module: Module; label: string }[] {
  const items: { module: Module; label: string }[] = [
    { module: "dashboard", label: "Дашборд" },
    { module: "clients", label: "Клиенты" },
    { module: "applications", label: "Заявки" },
    { module: "calculator", label: "Калькулятор" },
    { module: "committee", label: "Комитет" },
    { module: "contracts", label: "Договоры" },
    { module: "payments", label: "Платежи" },
    { module: "overdue", label: "Просрочка" },
    { module: "monitoring", label: "Мониторинг" },
    { module: "portfolio", label: "BI-дашборды" },
    { module: "audit", label: "Аудит" },
    { module: "admin", label: "Администрирование" },
    { module: "account", label: "Личный кабинет" },
  ];
  return items.filter((item) => can(roleCode, item.module, "view"));
}
