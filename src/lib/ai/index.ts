import { detectAnomalies, type AnomalyResult } from "@/lib/ai/anomalies";
import { detectBudgetRisks, type BudgetRiskResult } from "@/lib/ai/budget-risk";
import { computeForecast, type ForecastResult } from "@/lib/ai/forecast";
import { computeHealthScore, type HealthScoreResult } from "@/lib/ai/health-score";
import { generateInsights } from "@/lib/ai/insights";
import { detectSpendingPatterns, type SpendingPattern } from "@/lib/ai/patterns";
import { generateRecommendations, type Recommendation } from "@/lib/ai/recommendations";
import type { AIInsight, Budget, Category, Goal, Transaction } from "@/types";

export * from "@/lib/ai/anomalies";
export * from "@/lib/ai/budget-risk";
export * from "@/lib/ai/categorize";
export { AI_CONFIG } from "@/lib/ai/config";
export * from "@/lib/ai/events";
export * from "@/lib/ai/forecast";
export * from "@/lib/ai/health-score";
export * from "@/lib/ai/insights";
export * from "@/lib/ai/patterns";
export * from "@/lib/ai/recommendations";

export interface FinancialIntelligence {
  patterns: SpendingPattern[];
  anomalies: AnomalyResult[];
  budgetRisks: BudgetRiskResult[];
  healthScore: HealthScoreResult;
  forecast: ForecastResult;
  recommendations: Recommendation[];
  insights: AIInsight[];
}

export interface FinancialIntelligenceInput {
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  categories: Category[];
  currentBalance?: number | undefined;
  referenceDate?: Date | undefined;
}

/**
 * Single entry point that runs the whole deterministic intelligence layer
 * over the current financial data and returns every derived artifact the UI
 * needs. Pure function, no React dependency — safe to call from a
 * `useMemo`, a test, or (later) a server route.
 */
export function computeFinancialIntelligence(
  input: FinancialIntelligenceInput,
): FinancialIntelligence {
  const referenceDate = input.referenceDate ?? new Date();

  const patterns = detectSpendingPatterns(input.transactions, input.categories, referenceDate);
  const anomalies = detectAnomalies(input.transactions, input.categories, referenceDate);
  const budgetRisks = detectBudgetRisks(
    input.budgets,
    input.transactions,
    input.categories,
    referenceDate,
  );
  const healthScore = computeHealthScore({
    transactions: input.transactions,
    budgets: input.budgets,
    goals: input.goals,
    referenceDate,
  });
  const forecast = computeForecast(input.transactions, input.currentBalance, referenceDate);
  const recommendations = generateRecommendations({
    patterns,
    anomalies,
    budgetRisks,
    healthScore,
    categories: input.categories,
  });
  const insights = generateInsights({
    patterns,
    anomalies,
    budgetRisks,
    healthScore,
    forecast,
    categories: input.categories,
    referenceDate,
  });

  return { patterns, anomalies, budgetRisks, healthScore, forecast, recommendations, insights };
}
