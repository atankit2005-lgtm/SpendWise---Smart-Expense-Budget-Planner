import type { Budget, BudgetPeriod, SeriesPoint, TimeRange, Transaction } from "../types";

export type CashFlowGrouping = "day" | "week" | "month" | "year";

export interface CashFlowPoint {
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export function normalizeDate(value: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inRange(date: string, start?: string, end?: string): boolean {
  const normalized = normalizeDate(date);
  if (!normalized) return true;

  if (start) {
    const startDate = normalizeDate(start);
    if (startDate && normalized < startDate) {
      return false;
    }
  }

  if (end) {
    const endDate = normalizeDate(end);
    if (endDate && normalized > endDate) {
      return false;
    }
  }

  return true;
}

function getBucketLabel(date: string, grouping: CashFlowGrouping): string {
  const normalized = normalizeDate(date);

  switch (grouping) {
    case "day":
      return normalized;
    case "week": {
      const current = new Date(`${normalized}T00:00:00Z`);
      const dayOfWeek = current.getUTCDay() || 7;
      const startOfWeek = new Date(current);
      startOfWeek.setUTCDate(current.getUTCDate() - (dayOfWeek - 1));
      return formatDateUTC(startOfWeek);
    }
    case "month":
      return normalized.slice(0, 7);
    case "year":
      return normalized.slice(0, 4);
    default:
      return normalized.slice(0, 7);
  }
}

export function getBudgetPeriodRange(
  period: BudgetPeriod,
  startDate: string,
): { start?: string; end?: string } {
  const normalizedStartDate = normalizeDate(startDate);

  if (!normalizedStartDate) {
    return {};
  }

  const date = new Date(`${normalizedStartDate}T00:00:00Z`);

  switch (period) {
    case "weekly": {
      const weekday = date.getUTCDay() || 7;
      const weekStart = new Date(date);
      weekStart.setUTCDate(date.getUTCDate() - (weekday - 1));
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
      return {
        start: formatDateUTC(weekStart),
        end: formatDateUTC(weekEnd),
      };
    }
    case "yearly": {
      const year = date.getUTCFullYear();
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
      };
    }
    case "monthly":
    default: {
      const year = date.getUTCFullYear();
      const monthIndex = date.getUTCMonth();
      const monthStart = new Date(Date.UTC(year, monthIndex, 1));
      const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
      return {
        start: formatDateUTC(monthStart),
        end: formatDateUTC(monthEnd),
      };
    }
  }
}

export function sumIncomeForRange(
  transactions: Transaction[],
  start?: string,
  end?: string,
): number {
  return transactions
    .filter((transaction) => transaction.type === "income" && inRange(transaction.date, start, end))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function sumExpensesForRange(
  transactions: Transaction[],
  start?: string,
  end?: string,
): number {
  return transactions
    .filter(
      (transaction) => transaction.type === "expense" && inRange(transaction.date, start, end),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function computeSavings(income: number, expenses: number): number {
  return income - expenses;
}

export function computeBalanceDelta(income: number, expenses: number): number {
  return income - expenses;
}

export function computeCategoryTotals(
  transactions: Transaction[],
  start?: string,
  end?: string,
): Record<string, number> {
  return transactions.reduce<Record<string, number>>((totals, transaction) => {
    if (transaction.type !== "expense" || !inRange(transaction.date, start, end)) {
      return totals;
    }

    const categoryId = transaction.categoryId ?? "uncategorized";
    totals[categoryId] = (totals[categoryId] ?? 0) + transaction.amount;
    return totals;
  }, {});
}

export function computeBudgetSpend(
  budget: Pick<Budget, "categoryId" | "period" | "startDate">,
  transactions: Transaction[],
): number {
  if (!budget.categoryId || !budget.startDate) return 0;

  const { start, end } = getBudgetPeriodRange(budget.period, budget.startDate);

  return transactions
    .filter(
      (transaction) =>
        transaction.type === "expense" &&
        transaction.categoryId === budget.categoryId &&
        inRange(transaction.date, start, end),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function computeBudgetUtilization(
  budget: Pick<Budget, "categoryId" | "period" | "startDate" | "limit">,
  transactions: Transaction[],
): number {
  if (!Number.isFinite(budget.limit) || budget.limit <= 0) {
    return 0;
  }

  const spent = computeBudgetSpend(budget, transactions);
  return Math.round((spent / budget.limit) * 100);
}

export function computeBudgetSpendingMap(
  budgets: Array<Pick<Budget, "id" | "categoryId" | "period" | "startDate">>,
  transactions: Transaction[],
): Record<string, number> {
  return budgets.reduce<Record<string, number>>((map, budget) => {
    map[budget.id] = computeBudgetSpend(budget, transactions);
    return map;
  }, {});
}

export function computeCashFlowSeries(
  transactions: Transaction[],
  start?: string,
  end?: string,
  grouping: CashFlowGrouping = "month",
): CashFlowPoint[] {
  const filteredTransactions = transactions.filter((transaction) =>
    inRange(transaction.date, start, end),
  );

  const buckets = new Map<
    string,
    {
      label: string;
      income: number;
      expenses: number;
    }
  >();

  filteredTransactions.forEach((transaction) => {
    const bucketLabel = getBucketLabel(transaction.date, grouping);
    const existing = buckets.get(bucketLabel) ?? {
      label: bucketLabel,
      income: 0,
      expenses: 0,
    };

    if (transaction.type === "income") {
      existing.income += transaction.amount;
    }

    if (transaction.type === "expense") {
      existing.expenses += transaction.amount;
    }

    buckets.set(bucketLabel, existing);
  });

  return Array.from(buckets.values())
    .map((entry) => ({
      label: entry.label,
      income: entry.income,
      expenses: entry.expenses,
      net: entry.income - entry.expenses,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ANALYTICS_RANGE_SPECS: Record<TimeRange, { count: number; unit: "day" | "month" }> = {
  "7d": { count: 7, unit: "day" },
  "30d": { count: 30, unit: "day" },
  "3m": { count: 3, unit: "month" },
  "6m": { count: 6, unit: "month" },
  "1y": { count: 12, unit: "month" },
};

const DAY_MS = 86_400_000;

/**
 * Zero-filled income/spending series for a fixed window of day- or
 * month-sized buckets ending at the reference date (inclusive). Buckets
 * without transactions are kept at zero so charts always render a stable,
 * continuous axis derived purely from the given transactions.
 */
export function computeAnalyticsSeries(
  transactions: Transaction[],
  range: TimeRange,
  referenceDate: Date = new Date(),
): SeriesPoint[] {
  const spec = ANALYTICS_RANGE_SPECS[range];
  const refDayUTC = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  const buckets: Array<{ key: string; label: string; income: number; spending: number }> = [];
  for (let offset = spec.count - 1; offset >= 0; offset -= 1) {
    if (spec.unit === "day") {
      const day = new Date(refDayUTC - offset * DAY_MS);
      buckets.push({
        key: formatDateUTC(day),
        label: `${String(day.getUTCDate()).padStart(2, "0")} ${MONTH_LABELS[day.getUTCMonth()]!}`,
        income: 0,
        spending: 0,
      });
    } else {
      const month = new Date(
        Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - offset, 1),
      );
      buckets.push({
        key: formatDateUTC(month).slice(0, 7),
        label: MONTH_LABELS[month.getUTCMonth()]!,
        income: 0,
        spending: 0,
      });
    }
  }

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const transaction of transactions) {
    const normalized = normalizeDate(transaction.date);
    if (!normalized) continue;
    const bucket = byKey.get(spec.unit === "day" ? normalized : normalized.slice(0, 7));
    if (!bucket) continue;
    if (transaction.type === "income") bucket.income += transaction.amount;
    if (transaction.type === "expense") bucket.spending += transaction.amount;
  }

  return buckets.map(({ label, income, spending }) => ({ label, income, spending }));
}

export interface FinanceSummary {
  balance: number;
  income: number;
  expenses: number;
  savings: number;
  balanceChange: number | undefined;
  incomeChange: number | undefined;
  expenseChange: number | undefined;
  savingsChange: number | undefined;
}

/**
 * Percentage change between two periods, rounded to one decimal. Returns
 * undefined when the previous period is zero, because a percentage change
 * from zero is not meaningful (the UI hides the badge in that case).
 */
function percentChange(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * Headline figures derived entirely from persisted transactions:
 * income/expenses/savings cover the calendar month of the reference date,
 * while balance keeps the domain meaning "income - expenses" applied over
 * the full transaction history (lifetime net). Change fields compare the
 * current month with the previous one (balance compares lifetime net at
 * both month boundaries).
 */
export function computeFinanceSummary(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
): FinanceSummary {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();

  const currentStart = formatDateUTC(new Date(Date.UTC(year, month, 1)));
  const currentEnd = formatDateUTC(new Date(Date.UTC(year, month + 1, 0)));
  const previousStart = formatDateUTC(new Date(Date.UTC(year, month - 1, 1)));
  const previousEnd = formatDateUTC(new Date(Date.UTC(year, month, 0)));

  const income = sumIncomeForRange(transactions, currentStart, currentEnd);
  const expenses = sumExpensesForRange(transactions, currentStart, currentEnd);
  const savings = computeSavings(income, expenses);

  const previousIncome = sumIncomeForRange(transactions, previousStart, previousEnd);
  const previousExpenses = sumExpensesForRange(transactions, previousStart, previousEnd);
  const previousSavings = computeSavings(previousIncome, previousExpenses);

  const balance = computeBalanceDelta(
    sumIncomeForRange(transactions),
    sumExpensesForRange(transactions),
  );
  const balanceAtPreviousEnd = computeBalanceDelta(
    sumIncomeForRange(transactions, undefined, previousEnd),
    sumExpensesForRange(transactions, undefined, previousEnd),
  );

  return {
    balance,
    income,
    expenses,
    savings,
    balanceChange: percentChange(balance, balanceAtPreviousEnd),
    incomeChange: percentChange(income, previousIncome),
    expenseChange: percentChange(expenses, previousExpenses),
    savingsChange: percentChange(savings, previousSavings),
  };
}
