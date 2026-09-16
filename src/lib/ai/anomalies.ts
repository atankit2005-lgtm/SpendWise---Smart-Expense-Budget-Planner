import { AI_CONFIG } from "@/lib/ai/config";
import {
  mean,
  monthKey,
  round2,
  standardDeviation,
  trailingCompleteMonthKeys,
} from "@/lib/ai/date-utils";
import type { Category, Transaction } from "@/types";

export type AnomalyType = "large_expense" | "category_overspend";
export type AnomalySeverity = "low" | "medium" | "high";

export interface AnomalyResult {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  explanation: string;
  amount: number;
  categoryId?: string | undefined;
  transactionId?: string | undefined;
}

function categoryLabel(categoryId: string, categories: Category[]): string {
  return categories.find((c) => c.id === categoryId)?.name ?? "Uncategorised";
}

/**
 * Flags individual expenses that are far outside a category's normal
 * spending pattern: at least `minRatioOfMean` times the category's average
 * transaction, and (when there's enough history) `stdDevMultiplier`
 * standard deviations above it.
 */
export function detectLargeExpenseAnomalies(
  transactions: Transaction[],
  categories: Category[],
): AnomalyResult[] {
  const byCategory = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const group = byCategory.get(t.categoryId) ?? [];
    group.push(t);
    byCategory.set(t.categoryId, group);
  }

  const anomalies: AnomalyResult[] = [];

  for (const [categoryId, group] of byCategory.entries()) {
    if (group.length < AI_CONFIG.anomalies.minSamplesForBaseline) continue;

    const amounts = group.map((t) => t.amount);
    const avg = mean(amounts);
    const stdDev = standardDeviation(amounts);
    if (avg <= 0) continue;

    for (const transaction of group) {
      const ratio = transaction.amount / avg;
      if (ratio < AI_CONFIG.anomalies.minRatioOfMean) continue;

      // With enough spread in the data, require the amount to also clear a
      // standard-deviation bar so a merely "somewhat above average" spend
      // in a volatile category isn't flagged.
      if (stdDev > 0) {
        const zScore = (transaction.amount - avg) / stdDev;
        if (zScore < AI_CONFIG.anomalies.stdDevMultiplier) continue;
      }

      anomalies.push({
        id: `anomaly_large_expense_${transaction.id}`,
        type: "large_expense",
        severity: ratio >= AI_CONFIG.anomalies.minRatioOfMean * 1.5 ? "high" : "medium",
        title: "Unusually large expense",
        explanation: `₹${Math.round(transaction.amount).toLocaleString("en-IN")} on "${transaction.description}" is ${round2(
          ratio,
        )}× the typical ${categoryLabel(categoryId, categories)} transaction of ₹${Math.round(
          avg,
        ).toLocaleString("en-IN")}.`,
        amount: transaction.amount,
        categoryId,
        transactionId: transaction.id,
      });
    }
  }

  return anomalies.sort((a, b) => b.amount - a.amount);
}

/**
 * Flags categories where the current (in-progress) month's spend is
 * significantly above the trailing average of completed months, even if no
 * single transaction in that category looked unusual on its own.
 */
export function detectCategoryOverspendAnomalies(
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date,
): AnomalyResult[] {
  const currentMonth = monthKey(referenceDate.toISOString());
  const lookbackKeys = new Set(
    trailingCompleteMonthKeys(referenceDate, AI_CONFIG.anomalies.categoryLookbackMonths),
  );

  const currentTotals = new Map<string, number>();
  const historicalTotals = new Map<string, number[]>();
  const historicalByCategoryMonth = new Map<string, Map<string, number>>();

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const bucket = monthKey(t.date);

    if (bucket === currentMonth) {
      currentTotals.set(t.categoryId, (currentTotals.get(t.categoryId) ?? 0) + t.amount);
    } else if (lookbackKeys.has(bucket)) {
      const monthMap = historicalByCategoryMonth.get(t.categoryId) ?? new Map<string, number>();
      monthMap.set(bucket, (monthMap.get(bucket) ?? 0) + t.amount);
      historicalByCategoryMonth.set(t.categoryId, monthMap);
    }
  }

  for (const [categoryId, monthMap] of historicalByCategoryMonth.entries()) {
    historicalTotals.set(categoryId, Array.from(monthMap.values()));
  }

  const anomalies: AnomalyResult[] = [];

  for (const [categoryId, currentAmount] of currentTotals.entries()) {
    const history = historicalTotals.get(categoryId) ?? [];
    if (history.length === 0) continue;
    if (currentAmount < AI_CONFIG.anomalies.categoryOverspendMinAmount) continue;

    const avgHistorical = mean(history);
    if (avgHistorical <= 0) continue;

    const increase = (currentAmount - avgHistorical) / avgHistorical;
    if (increase < AI_CONFIG.anomalies.categoryOverspendThreshold) continue;

    anomalies.push({
      id: `anomaly_category_overspend_${categoryId}`,
      type: "category_overspend",
      severity: increase >= AI_CONFIG.anomalies.categoryOverspendThreshold * 2 ? "high" : "medium",
      title: `${categoryLabel(categoryId, categories)} spending is above normal`,
      explanation: `${categoryLabel(categoryId, categories)} spend this month is ₹${Math.round(
        currentAmount,
      ).toLocaleString(
        "en-IN",
      )}, ${Math.round(increase * 100)}% above the recent monthly average of ₹${Math.round(
        avgHistorical,
      ).toLocaleString("en-IN")}.`,
      amount: currentAmount,
      categoryId,
    });
  }

  return anomalies.sort((a, b) => b.amount - a.amount);
}

export function detectAnomalies(
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date(),
): AnomalyResult[] {
  return [
    ...detectLargeExpenseAnomalies(transactions, categories),
    ...detectCategoryOverspendAnomalies(transactions, categories, referenceDate),
  ];
}
