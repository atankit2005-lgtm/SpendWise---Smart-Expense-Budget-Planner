import type { Budget, BudgetPeriod, Transaction } from "../types";

export type CashFlowGrouping = "day" | "week" | "month" | "year";

export interface CashFlowPoint {
  label: string;
  income: number;
  expenses: number;
  net: number;
}

function normalizeDate(value: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDate(date: Date): string {
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
      return formatDate(startOfWeek);
    }
    case "month":
      return normalized.slice(0, 7);
    case "year":
      return normalized.slice(0, 4);
    default:
      return normalized.slice(0, 7);
  }
}

function getBudgetPeriodRange(
  period: BudgetPeriod,
  startDate: string,
): { start?: string; end?: string } {
  const normalizedStartDate = normalizeDate(startDate);

  if (!normalizedStartDate) {
    return { start: undefined, end: undefined };
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
        start: formatDate(weekStart),
        end: formatDate(weekEnd),
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
        start: formatDate(monthStart),
        end: formatDate(monthEnd),
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
    .filter(
      (transaction) =>
        transaction.type === "income" && inRange(transaction.date, start, end),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function sumExpensesForRange(
  transactions: Transaction[],
  start?: string,
  end?: string,
): number {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === "expense" && inRange(transaction.date, start, end),
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
