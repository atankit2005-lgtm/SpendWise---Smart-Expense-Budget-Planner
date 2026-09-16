import { AI_CONFIG } from "@/lib/ai/config";
import { addDays, daysBetween, isWeekend, mean, monthKey, round2 } from "@/lib/ai/date-utils";
import { computeCashFlowSeries, sumExpensesForRange } from "@/lib/financial-engine";
import type { Category, InsightSeverity, Transaction } from "@/types";

export type PatternType =
  | "increasing_trend"
  | "frequent_small_purchases"
  | "category_spike"
  | "recurring_expense"
  | "weekend_weekday";

export interface SpendingPattern {
  id: string;
  type: PatternType;
  title: string;
  explanation: string;
  severity: InsightSeverity;
  categoryId?: string | undefined;
  value?: number | undefined;
}

function categoryLabel(categoryId: string, categories: Category[]): string {
  return categories.find((c) => c.id === categoryId)?.name ?? "Uncategorised";
}

/**
 * A steady month-over-month rise in total expenses across the most recent
 * complete months of history.
 */
export function detectIncreasingTrend(
  transactions: Transaction[],
  referenceDate: Date,
): SpendingPattern[] {
  const cutoff = referenceDate.toISOString().slice(0, 10);
  const series = computeCashFlowSeries(
    transactions.filter((t) => t.date < cutoff.slice(0, 7)),
    undefined,
    undefined,
    "month",
  );

  if (series.length < AI_CONFIG.patterns.minMonthsForTrend) return [];

  const recent = series.slice(-AI_CONFIG.patterns.minMonthsForTrend);
  let risingSteps = 0;
  let totalGrowth = 0;

  for (let i = 1; i < recent.length; i += 1) {
    const prev = recent[i - 1];
    const curr = recent[i];
    if (!prev || !curr || prev.expenses <= 0) continue;
    const growth = (curr.expenses - prev.expenses) / prev.expenses;
    totalGrowth += growth;
    if (growth >= AI_CONFIG.patterns.trendIncreaseThreshold) {
      risingSteps += 1;
    }
  }

  const requiredRisingSteps = recent.length - 1;
  if (risingSteps < requiredRisingSteps || requiredRisingSteps <= 0) return [];

  const averageGrowth = totalGrowth / requiredRisingSteps;

  return [
    {
      id: "pattern_increasing_trend",
      type: "increasing_trend",
      title: "Spending has been climbing",
      explanation: `Monthly expenses rose in each of the last ${recent.length} months, averaging a ${Math.round(
        averageGrowth * 100,
      )}% increase month over month.`,
      severity: "warning",
      value: round2(averageGrowth * 100),
    },
  ];
}

/**
 * A cluster of many small expenses recently — the kind of spending that
 * rarely shows up as a single alarming transaction but adds up quickly.
 */
export function detectFrequentSmallPurchases(
  transactions: Transaction[],
  referenceDate: Date,
): SpendingPattern[] {
  const referenceDateStr = referenceDate.toISOString().slice(0, 10);
  const windowStart = addDays(referenceDateStr, -AI_CONFIG.patterns.smallPurchaseLookbackDays);

  const smallPurchases = transactions.filter(
    (t) =>
      t.type === "expense" &&
      t.amount <= AI_CONFIG.patterns.smallPurchaseAmount &&
      t.date >= windowStart &&
      t.date <= referenceDateStr,
  );

  if (smallPurchases.length < AI_CONFIG.patterns.smallPurchaseMinCount) return [];

  const total = smallPurchases.reduce((sum, t) => sum + t.amount, 0);

  return [
    {
      id: "pattern_frequent_small_purchases",
      type: "frequent_small_purchases",
      title: "Frequent small purchases are adding up",
      explanation: `${smallPurchases.length} purchases of ₹${AI_CONFIG.patterns.smallPurchaseAmount} or less in the last ${AI_CONFIG.patterns.smallPurchaseLookbackDays} days total ₹${Math.round(
        total,
      ).toLocaleString("en-IN")}.`,
      severity: "info",
      value: smallPurchases.length,
    },
  ];
}

/**
 * Categories whose spend in the current (in-progress) month is
 * significantly higher than the same category's spend in the prior month.
 */
export function detectCategorySpikes(
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date,
): SpendingPattern[] {
  const currentMonth = monthKey(referenceDate.toISOString());
  const previousMonthDate = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1),
  );
  const previousMonth = monthKey(previousMonthDate.toISOString());

  const totalsByCategory = new Map<string, { current: number; previous: number }>();

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const bucket = monthKey(t.date);
    if (bucket !== currentMonth && bucket !== previousMonth) continue;

    const entry = totalsByCategory.get(t.categoryId) ?? { current: 0, previous: 0 };
    if (bucket === currentMonth) entry.current += t.amount;
    else entry.previous += t.amount;
    totalsByCategory.set(t.categoryId, entry);
  }

  const patterns: SpendingPattern[] = [];

  for (const [categoryId, { current, previous }] of totalsByCategory.entries()) {
    if (previous <= 0 || current < AI_CONFIG.patterns.categorySpikeMinAmount) continue;
    const increase = (current - previous) / previous;
    if (increase < AI_CONFIG.patterns.categorySpikeThreshold) continue;

    patterns.push({
      id: `pattern_category_spike_${categoryId}`,
      type: "category_spike",
      title: `${categoryLabel(categoryId, categories)} spending spiked`,
      explanation: `${categoryLabel(categoryId, categories)} spending is ₹${Math.round(
        current,
      ).toLocaleString(
        "en-IN",
      )} this month, up ${Math.round(increase * 100)}% from ₹${Math.round(previous).toLocaleString("en-IN")} last month.`,
      severity: increase >= AI_CONFIG.patterns.categorySpikeThreshold * 2 ? "critical" : "warning",
      categoryId,
      value: round2(increase * 100),
    });
  }

  return patterns.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/**
 * Expenses with the same normalized description and a similar amount that
 * repeat across at least two distinct months — a proxy for subscriptions
 * and recurring bills without needing an explicit "recurring" flag.
 */
export function detectRecurringExpenses(transactions: Transaction[]): SpendingPattern[] {
  const groups = new Map<string, Transaction[]>();

  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const key = t.description.trim().toLowerCase();
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(t);
    groups.set(key, group);
  }

  const patterns: SpendingPattern[] = [];

  for (const [description, group] of groups.entries()) {
    const distinctMonths = new Set(group.map((t) => monthKey(t.date)));
    if (distinctMonths.size < AI_CONFIG.patterns.recurringMinOccurrences) continue;

    const amounts = group.map((t) => t.amount);
    const avgAmount = mean(amounts);
    const withinTolerance = amounts.every(
      (a) => Math.abs(a - avgAmount) <= avgAmount * AI_CONFIG.patterns.recurringAmountTolerance,
    );
    if (!withinTolerance) continue;

    const first = group[0];
    if (!first) continue;

    patterns.push({
      id: `pattern_recurring_${description.replace(/\s+/g, "_")}`,
      type: "recurring_expense",
      title: `Recurring charge: ${first.description}`,
      explanation: `"${first.description}" has appeared in ${distinctMonths.size} different months, averaging ₹${Math.round(
        avgAmount,
      ).toLocaleString("en-IN")} each time.`,
      severity: "info",
      categoryId: first.categoryId,
      value: round2(avgAmount),
    });
  }

  return patterns.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

/**
 * Compares average weekend spend per day against average weekday spend per
 * day, when there's enough data to make the comparison meaningful.
 */
export function detectWeekendWeekdayPattern(transactions: Transaction[]): SpendingPattern[] {
  const expenses = transactions.filter((t) => t.type === "expense");
  if (expenses.length < AI_CONFIG.patterns.weekendWeekdayMinSamples) return [];

  const weekend = expenses.filter((t) => isWeekend(t.date));
  const weekday = expenses.filter((t) => !isWeekend(t.date));

  if (
    weekend.length === 0 ||
    weekday.length === 0 ||
    expenses.length < AI_CONFIG.patterns.weekendWeekdayMinSamples
  ) {
    return [];
  }

  const weekendDays = new Set(weekend.map((t) => t.date)).size;
  const weekdayDays = new Set(weekday.map((t) => t.date)).size;
  if (weekendDays === 0 || weekdayDays === 0) return [];

  const weekendAvgPerDay = weekend.reduce((s, t) => s + t.amount, 0) / weekendDays;
  const weekdayAvgPerDay = weekday.reduce((s, t) => s + t.amount, 0) / weekdayDays;
  if (weekdayAvgPerDay <= 0) return [];

  const difference = (weekendAvgPerDay - weekdayAvgPerDay) / weekdayAvgPerDay;
  if (Math.abs(difference) < AI_CONFIG.patterns.weekendWeekdayDifferenceThreshold) return [];

  const higher = difference > 0 ? "weekend" : "weekday";

  return [
    {
      id: "pattern_weekend_weekday",
      type: "weekend_weekday",
      title: `${higher === "weekend" ? "Weekend" : "Weekday"} spending runs higher`,
      explanation: `Average daily spend on ${higher}s is ₹${Math.round(
        higher === "weekend" ? weekendAvgPerDay : weekdayAvgPerDay,
      ).toLocaleString(
        "en-IN",
      )}, about ${Math.round(Math.abs(difference) * 100)}% more than the other days of the week.`,
      severity: "info",
      value: round2(Math.abs(difference) * 100),
    },
  ];
}

/** Unusually high total spend in the current month vs. the trailing average. */
export function detectHighSpendingMonth(
  transactions: Transaction[],
  referenceDate: Date,
): SpendingPattern[] {
  const referenceDateStr = referenceDate.toISOString().slice(0, 10);
  const currentMonth = monthKey(referenceDateStr);
  const monthStart = `${currentMonth}-01`;

  const currentMonthSpend = sumExpensesForRange(transactions, monthStart, referenceDateStr);
  if (currentMonthSpend <= 0) return [];

  const series = computeCashFlowSeries(
    transactions.filter((t) => monthKey(t.date) !== currentMonth),
    undefined,
    undefined,
    "month",
  );

  if (series.length < AI_CONFIG.patterns.minMonthsForTrend - 1) return [];

  const trailing = series.slice(-3).map((p) => p.expenses);
  const avg = mean(trailing);
  if (avg <= 0) return [];

  const increase = (currentMonthSpend - avg) / avg;
  if (increase < AI_CONFIG.patterns.trendIncreaseThreshold * 2) return [];

  return [
    {
      id: "pattern_high_spending_month",
      type: "increasing_trend",
      title: "This month is running high",
      explanation: `Spending so far this month (₹${Math.round(currentMonthSpend).toLocaleString(
        "en-IN",
      )}) is ${Math.round(increase * 100)}% above the recent monthly average of ₹${Math.round(
        avg,
      ).toLocaleString("en-IN")}.`,
      severity: increase >= 0.5 ? "critical" : "warning",
      value: round2(increase * 100),
    },
  ];
}

export function detectSpendingPatterns(
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date(),
): SpendingPattern[] {
  return [
    ...detectHighSpendingMonth(transactions, referenceDate),
    ...detectIncreasingTrend(transactions, referenceDate),
    ...detectFrequentSmallPurchases(transactions, referenceDate),
    ...detectCategorySpikes(transactions, categories, referenceDate),
    ...detectRecurringExpenses(transactions),
    ...detectWeekendWeekdayPattern(transactions),
  ];
}

// Re-exported for tests and downstream consumers that only need the day count.
export { daysBetween };
