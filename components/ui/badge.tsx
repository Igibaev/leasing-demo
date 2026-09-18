import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-slate-100 text-slate-800",
      blue: "bg-blue-100 text-blue-800",
      green: "bg-emerald-100 text-emerald-800",
      amber: "bg-amber-100 text-amber-800",
      red: "bg-red-100 text-red-800",
      purple: "bg-violet-100 text-violet-800",
      outline: "border border-slate-300 text-slate-700",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={badgeVariants({ variant, className })} {...props} />;
}

export function statusColor(status: string): "default" | "blue" | "green" | "amber" | "red" | "purple" {
  if (["APPROVED", "FUNDED", "PAID", "ACTIVE", "FOR"].includes(status)) return "green";
  if (["REJECTED", "RED"].includes(status)) return "red";
  if (["DRAFT", "PLANNED"].includes(status)) return "default";
  if (["COMMITTEE", "APPROVAL", "RISK"].includes(status)) return "amber";
  if (["REGISTERED", "DOCUMENTS", "ANALYSIS", "CONTRACT"].includes(status)) return "blue";
  if (["AGAINST", "DEFAULT_180"].includes(status)) return "red";
  return "blue";
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Черновик",
  REGISTERED: "Зарегистрирована",
  DOCUMENTS: "Документы",
  ANALYSIS: "На анализе",
  RISK: "Оценка рисков",
  APPROVAL: "Согласование",
  COMMITTEE: "Комитет",
  APPROVED: "Одобрена",
  REJECTED: "Отклонена",
  CONTRACT: "Оформление",
  FUNDED: "Финансирована",
  ACTIVE: "Действует",
  PLANNED: "Запланировано",
};