import { AI_CONFIG } from "@/lib/ai/config";
import { mean } from "@/lib/ai/date-utils";
import { computeCashFlowSeries } from "@/lib/financial-engine";
import type { Transaction } from "@/types";

export interface ForecastResult {
  method: "moving_average";
  isEstimate: true;
  monthsUsed: number;
  projectedIncome: number;
  projectedExpenses: number;
  projectedSavings: number;
  projectedEndOfPeriodBalance: number | null;
  explanation: string;
}

/**
 * A simple, fully explainable forecast: the average income and expenses
 * across the last few *completed* months, projected forward one period.
 * This is explicitly a moving-average estimate, not a predictive model —
 * see `isEstimate`.
 */
export function computeForecast(
  transactions: Transaction[],
  currentBalance: number | undefined,
  referenceDate: Date = new Date(),
  lookbackMonths: number = AI_CONFIG.forecast.lookbackMonths,
): ForecastResult {
  const currentMonth = referenceDate.toISOString().slice(0, 7);
  const completedMonths = transactions.filter((t) => t.date.slice(0, 7) !== currentMonth);

  const series = computeCashFlowSeries(completedMonths, undefined, undefined, "month").slice(
    -lookbackMonths,
  );

  if (series.length === 0) {
    return {
      method: "moving_average",
      isEstimate: true,
      monthsUsed: 0,
      projectedIncome: 0,
      projectedExpenses: 0,
      projectedSavings: 0,
      projectedEndOfPeriodBalance: currentBalance ?? null,
      explanation: "Not enough completed months of history yet to build a forecast estimate.",
    };
  }

  const projectedIncome = Math.round(mean(series.map((p) => p.income)));
  const projectedExpenses = Math.round(mean(series.map((p) => p.expenses)));
  const projectedSavings = projectedIncome - projectedExpenses;
  const projectedEndOfPeriodBalance =
    typeof currentBalance === "number" ? Math.round(currentBalance + projectedSavings) : null;

  return {
    method: "moving_average",
    isEstimate: true,
    monthsUsed: series.length,
    projectedIncome,
    projectedExpenses,
    projectedSavings,
    projectedEndOfPeriodBalance,
    explanation: `Estimate based on the average of the last ${series.length} completed month${
      series.length === 1 ? "" : "s"
    } of activity — a simple moving average, not a guarantee.`,
  };
}
