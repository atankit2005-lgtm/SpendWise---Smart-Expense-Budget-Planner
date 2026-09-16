import assert from "node:assert/strict";
import test from "node:test";

import { computeHealthScore } from "@/lib/ai/health-score";
import type { Budget, Goal, Transaction } from "@/types";

let counter = 0;
function makeTransaction(overrides: Partial<Transaction>): Transaction {
  counter += 1;
  return {
    id: overrides.id ?? `txn_${counter}`,
    amount: overrides.amount ?? 100,
    type: overrides.type ?? "expense",
    categoryId: overrides.categoryId ?? "cat_food",
    description: overrides.description ?? "Test transaction",
    paymentMethod: overrides.paymentMethod ?? "UPI",
    date: overrides.date ?? "2026-09-05",
    createdAt: overrides.createdAt ?? "2026-09-05T00:00:00.000Z",
  };
}

test("computeHealthScore returns a score in [0, 100] and a valid grade for no data at all", () => {
  const result = computeHealthScore({
    transactions: [],
    budgets: [],
    goals: [],
    referenceDate: new Date("2026-09-15"),
  });
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(["excellent", "good", "fair", "poor", "critical"].includes(result.grade));
  assert.ok(result.factors.length > 0);
});

test("a healthy saver (income well above expenses) scores higher than an overspender", () => {
  const healthy = [
    makeTransaction({ type: "income", amount: 10000, date: "2026-09-02" }),
    makeTransaction({ type: "expense", amount: 3000, date: "2026-09-05" }),
  ];
  const overspender = [
    makeTransaction({ type: "income", amount: 10000, date: "2026-09-02" }),
    makeTransaction({ type: "expense", amount: 15000, date: "2026-09-05" }),
  ];

  const healthyScore = computeHealthScore({
    transactions: healthy,
    budgets: [],
    goals: [],
    referenceDate: new Date("2026-09-15"),
  });
  const overspenderScore = computeHealthScore({
    transactions: overspender,
    budgets: [],
    goals: [],
    referenceDate: new Date("2026-09-15"),
  });

  assert.ok(healthyScore.score > overspenderScore.score);
});

test("every factor's weight is a positive fraction and factors are individually explainable", () => {
  const result = computeHealthScore({
    transactions: [
      makeTransaction({ type: "income", amount: 5000 }),
      makeTransaction({ type: "expense", amount: 2000 }),
    ],
    budgets: [],
    goals: [],
    referenceDate: new Date("2026-09-15"),
  });

  for (const factor of result.factors) {
    assert.ok(factor.weight > 0);
    assert.ok(factor.score >= 0 && factor.score <= 100);
    assert.ok(factor.explanation.length > 0);
  }
});

test("goal progress factor reflects progress toward active goals", () => {
  const goals: Goal[] = [
    {
      id: "goal_1",
      name: "Emergency fund",
      targetAmount: 10000,
      currentAmount: 9000,
      targetDate: "2026-12-01",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const result = computeHealthScore({
    transactions: [],
    budgets: [],
    goals,
    referenceDate: new Date("2026-09-15"),
  });
  const goalFactor = result.factors.find((f) => f.key === "goalProgress");
  assert.ok(goalFactor);
  assert.ok(goalFactor.score > 50);
});

test("a budget spent well past its limit pulls the budget-adherence factor down", () => {
  const budgets: Budget[] = [
    {
      id: "bdg_1",
      categoryId: "cat_food",
      limit: 1000,
      spent: 0,
      period: "monthly",
      startDate: "2026-09-01",
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  const txns = [makeTransaction({ amount: 2000, categoryId: "cat_food", date: "2026-09-05" })];
  const result = computeHealthScore({
    transactions: txns,
    budgets,
    goals: [],
    referenceDate: new Date("2026-09-15"),
  });
  const adherence = result.factors.find((f) => f.key === "budgetAdherence");
  assert.ok(adherence);
  assert.ok(adherence.score < 60);
});
