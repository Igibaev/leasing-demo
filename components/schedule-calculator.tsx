"use client";

import { useMemo, useState } from "react";
import { calculateSchedule, calculateProfitability, type ScheduleInput } from "@/lib/calc";
import { moneyKzt } from "@/lib/money";
import { formatDate } from "@/lib/datetime";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { CardBody } from "@/components/ui/card";

export function ScheduleCalculator() {
  const [params, setParams] = useState<ScheduleInput>({
    assetCost: "60000000",
    downPayment: "12000000",
    termMonths: 36,
    annualRate: "20",
    commission: "360000",
    commissionType: "IN_SCHEDULE",
    vatBase: "INTEREST_AND_COMMISSION",
    scheduleType: "ANNUITY",
    firstPaymentDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });
  const set = (patch: Partial<ScheduleInput>) => setParams((prev) => ({ ...prev, ...patch }));

  const result = useMemo(() => {
    try {
      const lines = calculateSchedule(params);
      const profitability = calculateProfitability(lines, params.financedAmount ?? String(Number(params.assetCost) - Number(params.downPayment)));
      return { lines, profitability, financed: Number(params.assetCost) - Number(params.downPayment), error: null as string | null };
    } catch (error) {
      return { lines: [], profitability: null, financed: 0, error: error instanceof Error ? error.message : "Ошибка расчёта" };
    }
  }, [params]);

  return (
    <div className="space-y-4">
      <CardBody className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Field label="Стоимость предмета, ₸">
          <Input value={params.assetCost} onChange={(event) => set({ assetCost: event.target.value })} inputMode="numeric" />
        </Field>
        <Field label="Взнос, ₸">
          <Input value={params.downPayment} onChange={(event) => set({ downPayment: event.target.value })} inputMode="numeric" />
        </Field>
        <Field label="Срок, мес.">
          <Select value={params.termMonths} onChange={(event) => set({ termMonths: Number(event.target.value) })}>
            {[12, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Ставка, % годовых">
          <Input value={params.annualRate} onChange={(event) => set({ annualRate: event.target.value })} inputMode="decimal" />
        </Field>
        <Field label="Тип графика">
          <Select value={params.scheduleType} onChange={(event) => set({ scheduleType: event.target.value as ScheduleInput["scheduleType"] })}>
            <option value="ANNUITY">Аннуитет</option>
            <option value="DIFFERENTIATED">Дифференцированный</option>
          </Select>
        </Field>
        <Field label="Комиссия за весь срок, ₸">
          <Input value={params.commission ?? "0"} onChange={(event) => set({ commission: event.target.value })} inputMode="decimal" />
        </Field>
        <Field label="Комиссия">
          <Select value={params.commissionType ?? "UPFRONT"} onChange={(event) => set({ commissionType: event.target.value as ScheduleInput["commissionType"] })}>
            <option value="UPFRONT">Единовременно (0-ая строка)</option>
            <option value="IN_SCHEDULE">Равными частями</option>
          </Select>
        </Field>
        <Field label="НДС начислять на">
          <Select value={params.vatBase ?? "INTEREST_AND_COMMISSION"} onChange={(event) => set({ vatBase: event.target.value as ScheduleInput["vatBase"] })}>
            <option value="INTEREST_AND_COMMISSION">проценты + комиссию</option>
            <option value="INTEREST">только проценты</option>
            <option value="NONE">нет</option>
          </Select>
        </Field>
        <Field label="Первый платёж">
          <Input type="date" value={params.firstPaymentDate} onChange={(event) => set({ firstPaymentDate: event.target.value })} />
        </Field>
      </CardBody>

      {result.error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</div> : null}

      {result.lines.length > 0 && result.profitability ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
            <div className="text-lg font-bold text-slate-900">{moneyKzt(result.financed)}</div>
            <div className="text-[10px] uppercase text-slate-400">сумма финансирования</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
            <div className="text-lg font-bold text-slate-900">{Number(result.profitability.irr).toFixed(2)}%</div>
            <div className="text-[10px] uppercase text-slate-400">IRR годовых</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
            <div className="text-lg font-bold text-slate-900">{moneyKzt(result.profitability.totalInterest)}</div>
            <div className="text-[10px] uppercase text-slate-400">проценты</div>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-center">
            <div className="text-lg font-bold text-slate-900">{moneyKzt(result.profitability.overpayment)}</div>
            <div className="text-[10px] uppercase text-slate-400">переплата</div>
          </div>
        </div>
      ) : null}

      {result.lines.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">№</th>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2 text-right">Основной долг</th>
                <th className="px-3 py-2 text-right">Проценты</th>
                <th className="px-3 py-2 text-right">Комиссия</th>
                <th className="px-3 py-2 text-right">НДС</th>
                <th className="px-3 py-2 text-right">Платёж</th>
                <th className="px-3 py-2 text-right">Остаток</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.lines.map((line) => (
                <tr key={`${line.seq}-${line.dueDate}`}>
                  <td className="px-3 py-1.5 text-center">{line.seq}</td>
                  <td className="px-3 py-1.5">{formatDate(line.dueDate)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{moneyKzt(line.principal)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{moneyKzt(line.interest)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{moneyKzt(line.commission)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{moneyKzt(line.vat)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">{moneyKzt(line.total)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-400">{moneyKzt(line.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between rounded-b-lg border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span>{result.lines.length} строк графика (комиссия {params.commissionType === "UPFRONT" ? "зачтена строкой 0" : "распределена"})</span>
            <Button type="button" variant="outline" size="sm" onClick={() => {
              const blob = new Blob([result.lines.map((l) => [l.seq, l.dueDate, l.principal, l.interest, l.commission, l.vat, l.total, l.balance].join(",")).join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "schedule.csv";
              anchor.click();
              URL.revokeObjectURL(url);
            }}>Экспорт CSV</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}