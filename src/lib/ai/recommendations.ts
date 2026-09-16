import type { AnomalyResult } from "@/lib/ai/anomalies";
import type { BudgetRiskResult } from "@/lib/ai/budget-risk";
import type { ForecastResult } from "@/lib/ai/forecast";
import type { HealthScoreResult } from "@/lib/ai/health-score";
import type { SpendingPattern } from "@/lib/ai/patterns";
import type { Category } from "@/types";

export type RecommendationPriority = "low" | "medium" | "high";
export type RecommendationSource = "pattern" | "anomaly" | "budget_risk" | "health_score";

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  priority: RecommendationPriority;
  source: RecommendationSource;
}

function categoryLabel(categoryId: string | undefined, categories: Category[]): string {
  if (!categoryId) return "this category";
  return categories.find((c) => c.id === categoryId)?.name ?? "this category";
}

const PRIORITY_ORDER: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

export function generateRecommendations(input: {
  patterns: SpendingPattern[];
  anomalies: AnomalyResult[];
  budgetRisks: BudgetRiskResult[];
  healthScore: HealthScoreResult;
  categories: Category[];
}): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const risk of input.budgetRisks) {
    if (risk.level === "low") continue;
    recommendations.push({
      id: `rec_budget_${risk.budgetId}`,
      title: `${categoryLabel(risk.categoryId, input.categories)} budget needs attention`,
      detail: risk.explanation,
      priority: risk.level === "critical" || risk.level === "high" ? "high" : "medium",
      source: "budget_risk",
    });
  }

  for (const anomaly of input.anomalies) {
    if (anomaly.severity === "low") continue;
    recommendations.push({
      id: `rec_anomaly_${anomaly.id}`,
      title: anomaly.title,
      detail: anomaly.explanation,
      priority: anomaly.severity === "high" ? "high" : "medium",
      source: "anomaly",
    });
  }

  for (const pattern of input.patterns) {
    if (pattern.severity === "info") continue;
    recommendations.push({
      id: `rec_pattern_${pattern.id}`,
      title: pattern.title,
      detail: pattern.explanation,
      priority: pattern.severity === "critical" ? "high" : "medium",
      source: "pattern",
    });
  }

  input.healthScore.recommendations.forEach((detail, index) => {
    recommendations.push({
      id: `rec_health_${index}`,
      title: "Improve your financial health score",
      detail,
      priority: input.healthScore.score < 40 ? "high" : "low",
      source: "health_score",
    });
  });

  return recommendations.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
