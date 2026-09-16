import { AI_CONFIG } from "@/lib/ai/config";
import { daysBetween } from "@/lib/ai/date-utils";
import {
  computeBudgetSpend,
  computeBudgetUtilization,
  getBudgetPeriodRange,
  normalizeDate,
} from "@/lib/financial-engine";
import type { Budget, Category, Transaction } from "@/types";

export type BudgetRiskLevel = "low" | "medium" | "high" | "critical";

export interface BudgetRiskResult {
  budgetId: string;
  categoryId: string;
  level: BudgetRiskLevel;
  utilization: number; // % spent of limit so far
  projectedUtilization: number; // % of limit projected by period end
  explanation: string;
}

function categoryLabel(categoryId: string, categories: Category[]): string {
  return categories.find((c) => c.id === categoryId)?.name ?? "Uncategorised";
}

/** Fraction (0-1) of the budget period that has elapsed as of `referenceDate`. */
function elapsedFraction(start: string, end: string, referenceDate: Date): number {
  const referenceDateStr = referenceDate.toISOString().slice(0, 10);
  const totalDays = daysBetween(start, end) + 1;
  if (totalDays <= 0) return 1;

  if (referenceDateStr < start) return 0;
  if (referenceDateStr > end) return 1;

  const elapsedDays = daysBetween(start, referenceDateStr) + 1;
  return Math.min(1, Math.max(0, elapsedDays / totalDays));
}

function classifyRisk(utilization: number, projectedUtilization: number): BudgetRiskLevel {
  if (utilization >= 100) return "critical";
  if (projectedUtilization >= AI_CONFIG.budgetRisk.highThreshold) return "high";
  if (projectedUtilization >= AI_CONFIG.budgetRisk.mediumThreshold) return "medium";
  return "low";
}

export function computeBudgetRisk(
  budget: Budget,
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date(),
): BudgetRiskResult {
  const label = categoryLabel(budget.categoryId, categories);
  const utilization = computeBudgetUtilization(budget, transactions);

  if (!Number.isFinite(budget.limit) || budget.limit <= 0 || !budget.startDate) {
    return {
      budgetId: budget.id,
      categoryId: budget.categoryId,
      level: "low",
      utilization: 0,
      projectedUtilization: 0,
      explanation: `${label} budget has no usable limit set, so risk can't be projected.`,
    };
  }

  const spent = computeBudgetSpend(budget, transactions);
  const { start, end } = getBudgetPeriodRange(budget.period, budget.startDate);
  const normalizedStart = start ? normalizeDate(start) : normalizeDate(budget.startDate);
  const normalizedEnd = end ?? normalizedStart;

  const elapsed = elapsedFraction(normalizedStart, normalizedEnd, referenceDate);
  const usableElapsed = Math.max(AI_CONFIG.budgetRisk.minElapsedFraction, elapsed);
  const projectedSpend = spent / usableElapsed;
  const projectedUtilization = Math.round((projectedSpend / budget.limit) * 100);

  const level = classifyRisk(utilization, projectedUtilization);

  const explanation =
    level === "critical"
      ? `${label} has already exceeded its ₹${budget.limit.toLocaleString("en-IN")} limit (${utilization}% used).`
      : level === "high"
        ? `${label} is on pace to hit ${projectedUtilization}% of its ₹${budget.limit.toLocaleString(
            "en-IN",
          )} limit by the end of the period.`
        : level === "medium"
          ? `${label} is projected to reach ${projectedUtilization}% of its limit — worth keeping an eye on.`
          : `${label} is tracking comfortably at a projected ${projectedUtilization}% of its limit.`;

  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    level,
    utilization,
    projectedUtilization,
    explanation,
  };
}

const RISK_ORDER: Record<BudgetRiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function detectBudgetRisks(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date(),
): BudgetRiskResult[] {
  return budgets
    .map((budget) => computeBudgetRisk(budget, transactions, categories, referenceDate))
    .sort((a, b) => RISK_ORDER[a.level] - RISK_ORDER[b.level]);
}
