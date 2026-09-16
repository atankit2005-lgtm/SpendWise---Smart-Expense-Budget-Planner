import { AI_CONFIG } from "@/lib/ai/config";
import { mean, standardDeviation } from "@/lib/ai/date-utils";
import {
  computeBudgetUtilization,
  computeCashFlowSeries,
  sumExpensesForRange,
  sumIncomeForRange,
} from "@/lib/financial-engine";
import type { Budget, Goal, Transaction } from "@/types";

export type HealthGrade = "excellent" | "good" | "fair" | "poor" | "critical";

export interface HealthScoreFactor {
  key:
    | "savingsRate"
    | "budgetAdherence"
    | "spendingVolatility"
    | "expenseIncomeBalance"
    | "goalProgress";
  label: string;
  score: number; // 0-100, this factor's own score before weighting
  weight: number; // percentage weight in the final score
  explanation: string;
}

export interface HealthScoreResult {
  score: number; // 0-100
  grade: HealthGrade;
  factors: HealthScoreFactor[];
  recommendations: string[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function scoreSavingsRate(income: number, expenses: number): HealthScoreFactor {
  const weight = AI_CONFIG.healthScore.weights.savingsRate;

  if (income <= 0) {
    return {
      key: "savingsRate",
      label: "Savings rate",
      score: 0,
      weight,
      explanation: "No income recorded this period, so a savings rate can't be calculated.",
    };
  }

  const rate = (income - expenses) / income;
  const score = clamp((rate / AI_CONFIG.healthScore.targetSavingsRate) * 100);

  return {
    key: "savingsRate",
    label: "Savings rate",
    score: Math.round(score),
    weight,
    explanation: `Saving ${Math.round(rate * 100)}% of income this period (target: ${Math.round(
      AI_CONFIG.healthScore.targetSavingsRate * 100,
    )}%).`,
  };
}

function scoreBudgetAdherence(budgets: Budget[], transactions: Transaction[]): HealthScoreFactor {
  const weight = AI_CONFIG.healthScore.weights.budgetAdherence;

  if (budgets.length === 0) {
    return {
      key: "budgetAdherence",
      label: "Budget adherence",
      score: AI_CONFIG.healthScore.neutralScore,
      weight,
      explanation: "No budgets set yet, so adherence is treated as neutral.",
    };
  }

  const utilizations = budgets.map((b) => computeBudgetUtilization(b, transactions));
  const withinLimit = utilizations.filter((u) => u <= 100).length;
  const score = (withinLimit / budgets.length) * 100;

  return {
    key: "budgetAdherence",
    label: "Budget adherence",
    score: Math.round(score),
    weight,
    explanation: `${withinLimit} of ${budgets.length} budgets are within their limit this period.`,
  };
}

function scoreSpendingVolatility(
  transactions: Transaction[],
  referenceDate: Date,
): HealthScoreFactor {
  const weight = AI_CONFIG.healthScore.weights.spendingVolatility;

  const currentMonth = referenceDate.toISOString().slice(0, 7);
  const series = computeCashFlowSeries(
    transactions.filter((t) => t.date.slice(0, 7) !== currentMonth),
    undefined,
    undefined,
    "month",
  );

  if (series.length < 2) {
    return {
      key: "spendingVolatility",
      label: "Spending volatility",
      score: AI_CONFIG.healthScore.neutralScore,
      weight,
      explanation: "Not enough completed months of history yet to measure volatility.",
    };
  }

  const expenseValues = series.slice(-6).map((p) => p.expenses);
  const avg = mean(expenseValues);
  if (avg <= 0) {
    return {
      key: "spendingVolatility",
      label: "Spending volatility",
      score: AI_CONFIG.healthScore.neutralScore,
      weight,
      explanation: "No expense history to measure volatility against.",
    };
  }

  const coefficientOfVariation = standardDeviation(expenseValues) / avg;
  const score = clamp(
    100 - (coefficientOfVariation / AI_CONFIG.healthScore.maxVolatilityCoefficient) * 100,
  );

  return {
    key: "spendingVolatility",
    label: "Spending volatility",
    score: Math.round(score),
    weight,
    explanation: `Month-to-month spending varies by about ${Math.round(coefficientOfVariation * 100)}% around the average.`,
  };
}

function scoreExpenseIncomeBalance(income: number, expenses: number): HealthScoreFactor {
  const weight = AI_CONFIG.healthScore.weights.expenseIncomeBalance;

  if (income <= 0) {
    return {
      key: "expenseIncomeBalance",
      label: "Expense-to-income balance",
      score: 0,
      weight,
      explanation: "No income recorded this period.",
    };
  }

  const ratio = expenses / income;
  const { healthyExpenseRatio, unhealthyExpenseRatio } = AI_CONFIG.healthScore;

  let score: number;
  if (ratio <= healthyExpenseRatio) {
    score = 100;
  } else if (ratio >= unhealthyExpenseRatio) {
    score = 0;
  } else {
    score =
      100 * (1 - (ratio - healthyExpenseRatio) / (unhealthyExpenseRatio - healthyExpenseRatio));
  }

  return {
    key: "expenseIncomeBalance",
    label: "Expense-to-income balance",
    score: Math.round(clamp(score)),
    weight,
    explanation: `Expenses are ${Math.round(ratio * 100)}% of income this period.`,
  };
}

function scoreGoalProgress(goals: Goal[]): HealthScoreFactor {
  const weight = AI_CONFIG.healthScore.weights.goalProgress;
  const activeGoals = goals.filter((g) => g.status === "active");

  if (activeGoals.length === 0) {
    return {
      key: "goalProgress",
      label: "Goal progress",
      score: AI_CONFIG.healthScore.neutralScore,
      weight,
      explanation: "No active savings goals to track yet.",
    };
  }

  const progressValues = activeGoals.map((g) =>
    g.targetAmount > 0 ? clamp((g.currentAmount / g.targetAmount) * 100) : 0,
  );
  const score = mean(progressValues);

  return {
    key: "goalProgress",
    label: "Goal progress",
    score: Math.round(score),
    weight,
    explanation: `Active goals are ${Math.round(score)}% funded on average across ${activeGoals.length} goal${
      activeGoals.length === 1 ? "" : "s"
    }.`,
  };
}

function gradeFor(score: number): HealthGrade {
  const { excellent, good, fair, poor } = AI_CONFIG.healthScore.grades;
  if (score >= excellent) return "excellent";
  if (score >= good) return "good";
  if (score >= fair) return "fair";
  if (score >= poor) return "poor";
  return "critical";
}

function buildRecommendations(factors: HealthScoreFactor[]): string[] {
  return factors
    .filter((f) => f.score < 60)
    .sort((a, b) => a.score - b.score)
    .map((f) => {
      switch (f.key) {
        case "savingsRate":
          return "Increase your savings rate — trimming discretionary spending or automating a transfer on payday both help.";
        case "budgetAdherence":
          return "Revisit budgets that are consistently over their limit — either curb spending in that category or raise the limit to something realistic.";
        case "spendingVolatility":
          return "Smooth out month-to-month spending swings by planning ahead for irregular or large expenses.";
        case "expenseIncomeBalance":
          return "Expenses are taking up a large share of income — look for recurring costs that can be reduced.";
        case "goalProgress":
          return "Set up small, regular contributions toward your active goals to keep progress moving.";
        default:
          return "Review your recent spending for opportunities to improve.";
      }
    });
}

export function computeHealthScore(input: {
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  referenceDate?: Date;
}): HealthScoreResult {
  const referenceDate = input.referenceDate ?? new Date();
  const monthStart = `${referenceDate.toISOString().slice(0, 7)}-01`;
  const monthEnd = referenceDate.toISOString().slice(0, 10);

  const income = sumIncomeForRange(input.transactions, monthStart, monthEnd);
  const expenses = sumExpensesForRange(input.transactions, monthStart, monthEnd);

  const factors: HealthScoreFactor[] = [
    scoreSavingsRate(income, expenses),
    scoreBudgetAdherence(input.budgets, input.transactions),
    scoreSpendingVolatility(input.transactions, referenceDate),
    scoreExpenseIncomeBalance(income, expenses),
    scoreGoalProgress(input.goals),
  ];

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0) || 1;
  const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight;
  const score = Math.round(clamp(weightedScore));

  return {
    score,
    grade: gradeFor(score),
    factors,
    recommendations: buildRecommendations(factors),
  };
}
