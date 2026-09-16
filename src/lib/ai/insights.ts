import type { AnomalyResult } from "@/lib/ai/anomalies";
import type { BudgetRiskResult } from "@/lib/ai/budget-risk";
import type { ForecastResult } from "@/lib/ai/forecast";
import type { HealthScoreResult } from "@/lib/ai/health-score";
import type { SpendingPattern } from "@/lib/ai/patterns";
import type { AIInsight, Category, InsightSeverity } from "@/types";

function categoryLabel(categoryId: string | undefined, categories: Category[]): string {
  if (!categoryId) return "";
  return categories.find((c) => c.id === categoryId)?.name ?? "";
}

const BUDGET_RISK_CONFIDENCE: Record<BudgetRiskResult["level"], number> = {
  critical: 0.97,
  high: 0.88,
  medium: 0.75,
  low: 0.6,
};

const BUDGET_RISK_SEVERITY: Record<BudgetRiskResult["level"], InsightSeverity> = {
  critical: "critical",
  high: "warning",
  medium: "warning",
  low: "info",
};

const ANOMALY_CONFIDENCE: Record<AnomalyResult["severity"], number> = {
  high: 0.9,
  medium: 0.78,
  low: 0.62,
};

const ANOMALY_SEVERITY: Record<AnomalyResult["severity"], InsightSeverity> = {
  high: "critical",
  medium: "warning",
  low: "info",
};

const PATTERN_CONFIDENCE: Record<InsightSeverity, number> = {
  critical: 0.9,
  warning: 0.8,
  info: 0.68,
  positive: 0.8,
};

function budgetRiskInsight(
  risk: BudgetRiskResult,
  categories: Category[],
  createdAt: string,
): AIInsight {
  const label = categoryLabel(risk.categoryId, categories);
  return {
    id: `insight_budget_${risk.budgetId}`,
    title: `${label} budget: ${risk.level} risk`,
    description: risk.explanation,
    severity: BUDGET_RISK_SEVERITY[risk.level],
    metric: `${risk.projectedUtilization}%`,
    confidence: BUDGET_RISK_CONFIDENCE[risk.level],
    createdAt,
  };
}

function anomalyInsight(anomaly: AnomalyResult, createdAt: string): AIInsight {
  return {
    id: `insight_${anomaly.id}`,
    title: anomaly.title,
    description: anomaly.explanation,
    severity: ANOMALY_SEVERITY[anomaly.severity],
    metric: `₹${Math.round(anomaly.amount).toLocaleString("en-IN")}`,
    confidence: ANOMALY_CONFIDENCE[anomaly.severity],
    createdAt,
  };
}

function patternInsight(pattern: SpendingPattern, createdAt: string): AIInsight {
  return {
    id: `insight_${pattern.id}`,
    title: pattern.title,
    description: pattern.explanation,
    severity: pattern.severity,
    metric: typeof pattern.value === "number" ? `${pattern.value}` : undefined,
    confidence: PATTERN_CONFIDENCE[pattern.severity],
    createdAt,
  };
}

function healthScoreInsight(health: HealthScoreResult, createdAt: string): AIInsight {
  const severity: InsightSeverity =
    health.grade === "excellent" || health.grade === "good"
      ? "positive"
      : health.grade === "fair"
        ? "info"
        : health.grade === "poor"
          ? "warning"
          : "critical";

  return {
    id: "insight_health_score",
    title: `Financial health score: ${health.score}/100 (${health.grade})`,
    description:
      health.recommendations[0] ??
      "Your financial health score reflects savings rate, budget adherence, volatility, expense balance and goal progress.",
    severity,
    metric: `${health.score}/100`,
    confidence: 0.85,
    createdAt,
  };
}

function forecastInsight(forecast: ForecastResult, createdAt: string): AIInsight | null {
  if (forecast.monthsUsed === 0) return null;

  return {
    id: "insight_forecast",
    title: "Next period spending estimate",
    description: forecast.explanation,
    severity: "info",
    metric: `₹${forecast.projectedExpenses.toLocaleString("en-IN")}`,
    confidence: Math.min(0.85, 0.55 + forecast.monthsUsed * 0.1),
    createdAt,
  };
}

/**
 * Turns the deterministic intelligence layer's raw findings into the
 * `AIInsight[]` shape the UI already knows how to render. Ranked roughly by
 * how actionable/urgent each item is: budget risk and anomalies first, then
 * behavioural patterns, then the health score and forecast.
 */
export function generateInsights(input: {
  patterns: SpendingPattern[];
  anomalies: AnomalyResult[];
  budgetRisks: BudgetRiskResult[];
  healthScore: HealthScoreResult;
  forecast: ForecastResult;
  categories: Category[];
  referenceDate?: Date;
}): AIInsight[] {
  const createdAt = (input.referenceDate ?? new Date()).toISOString();

  const insights: AIInsight[] = [
    ...input.budgetRisks
      .filter((r) => r.level !== "low")
      .map((r) => budgetRiskInsight(r, input.categories, createdAt)),
    ...input.anomalies.map((a) => anomalyInsight(a, createdAt)),
    ...input.patterns.map((p) => patternInsight(p, createdAt)),
    healthScoreInsight(input.healthScore, createdAt),
  ];

  const forecast = forecastInsight(input.forecast, createdAt);
  if (forecast) insights.push(forecast);

  return insights.sort((a, b) => b.confidence - a.confidence);
}
