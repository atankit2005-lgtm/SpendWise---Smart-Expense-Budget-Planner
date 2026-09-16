import assert from "node:assert/strict";
import test from "node:test";

import type { AnomalyResult } from "@/lib/ai/anomalies";
import type { BudgetRiskResult } from "@/lib/ai/budget-risk";
import type { HealthScoreResult } from "@/lib/ai/health-score";
import type { SpendingPattern } from "@/lib/ai/patterns";
import { generateRecommendations } from "@/lib/ai/recommendations";
import type { Category } from "@/types";

const categories: Category[] = [
  { id: "cat_food", name: "Food & Dining", type: "expense", color: "red", icon: "utensils" },
];

const okHealthScore: HealthScoreResult = {
  score: 80,
  grade: "good",
  factors: [],
  recommendations: [],
};

test("generateRecommendations returns nothing when everything is healthy", () => {
  const recs = generateRecommendations({
    patterns: [],
    anomalies: [],
    budgetRisks: [
      {
        budgetId: "bdg_1",
        categoryId: "cat_food",
        level: "low",
        utilization: 20,
        projectedUtilization: 40,
        explanation: "On track.",
      },
    ],
    healthScore: okHealthScore,
    categories,
  });
  assert.equal(recs.length, 0);
});

test("a critical budget risk becomes a high-priority recommendation", () => {
  const risk: BudgetRiskResult = {
    budgetId: "bdg_1",
    categoryId: "cat_food",
    level: "critical",
    utilization: 120,
    projectedUtilization: 140,
    explanation: "You've exceeded this budget.",
  };
  const recs = generateRecommendations({
    patterns: [],
    anomalies: [],
    budgetRisks: [risk],
    healthScore: okHealthScore,
    categories,
  });
  assert.equal(recs.length, 1);
  assert.equal(recs[0]?.priority, "high");
  assert.equal(recs[0]?.source, "budget_risk");
});

test("a high-severity anomaly becomes a high-priority recommendation, a low-severity one is dropped", () => {
  const highAnomaly: AnomalyResult = {
    id: "anom_1",
    type: "large_expense",
    severity: "high",
    title: "Unusually large expense",
    explanation: "Far above your usual spend.",
    amount: 5000,
  };
  const lowAnomaly: AnomalyResult = {
    id: "anom_2",
    type: "large_expense",
    severity: "low",
    title: "Slightly above average",
    explanation: "Marginally higher than usual.",
    amount: 500,
  };
  const recs = generateRecommendations({
    patterns: [],
    anomalies: [highAnomaly, lowAnomaly],
    budgetRisks: [],
    healthScore: okHealthScore,
    categories,
  });
  assert.equal(recs.length, 1);
  assert.equal(recs[0]?.id, "rec_anomaly_anom_1");
});

test("an informational pattern is not turned into a recommendation, a warning pattern is", () => {
  const infoPattern: SpendingPattern = {
    id: "pat_1",
    type: "recurring_expense",
    title: "Recurring subscription",
    explanation: "Netflix charges you monthly.",
    severity: "info",
  };
  const warningPattern: SpendingPattern = {
    id: "pat_2",
    type: "increasing_trend",
    title: "Spending is rising",
    explanation: "Up 20% over the last month.",
    severity: "warning",
  };
  const recs = generateRecommendations({
    patterns: [infoPattern, warningPattern],
    anomalies: [],
    budgetRisks: [],
    healthScore: okHealthScore,
    categories,
  });
  assert.equal(recs.length, 1);
  assert.equal(recs[0]?.id, "rec_pattern_pat_2");
});

test("recommendations are sorted with high priority first", () => {
  const risk: BudgetRiskResult = {
    budgetId: "bdg_1",
    categoryId: "cat_food",
    level: "medium",
    utilization: 60,
    projectedUtilization: 72,
    explanation: "Approaching the limit.",
  };
  const lowHealthScore: HealthScoreResult = {
    score: 20,
    grade: "poor",
    factors: [],
    recommendations: ["Cut discretionary spend."],
  };
  const recs = generateRecommendations({
    patterns: [],
    anomalies: [],
    budgetRisks: [risk],
    healthScore: lowHealthScore,
    categories,
  });

  assert.ok(recs.length >= 2);
  assert.equal(recs[0]?.priority, "high"); // the poor health score (< 40) is high priority
  assert.notEqual(recs[recs.length - 1]?.priority, "high");
});
