import assert from "node:assert/strict";
import test from "node:test";

import { computeBudgetRisk, detectBudgetRisks } from "@/lib/ai/budget-risk";
import type { Budget, Category, Transaction } from "@/types";

const categories: Category[] = [
  { id: "cat_food", name: "Food & Dining", type: "expense", color: "red", icon: "utensils" },
];

function makeBudget(overrides: Partial<Budget>): Budget {
  return {
    id: overrides.id ?? "bdg_1",
    categoryId: overrides.categoryId ?? "cat_food",
    limit: overrides.limit ?? 10000,
    spent: overrides.spent ?? 0,
    period: overrides.period ?? "monthly",
    startDate: overrides.startDate ?? "2026-09-01",
    createdAt: overrides.createdAt ?? "2026-09-01T00:00:00.000Z",
  };
}

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

test("a budget with no spend halfway through the period is low risk", () => {
  const budget = makeBudget({ limit: 10000, startDate: "2026-09-01" });
  const risk = computeBudgetRisk(budget, [], categories, new Date("2026-09-15"));
  assert.equal(risk.level, "low");
  assert.equal(risk.utilization, 0);
});

test("a budget already spent past its limit is critical, regardless of time elapsed", () => {
  const budget = makeBudget({ limit: 1000, startDate: "2026-09-01" });
  const txns = [makeTransaction({ amount: 1200, categoryId: "cat_food", date: "2026-09-03" })];
  const risk = computeBudgetRisk(budget, txns, categories, new Date("2026-09-05"));
  assert.equal(risk.level, "critical");
});

test("early, on-pace spending projects to a lower risk than heavy early spending", () => {
  const budget = makeBudget({ limit: 3000, startDate: "2026-09-01" });
  // 2 days into a 30-day month, already spent 1/3 of the whole month's budget.
  const heavy = [makeTransaction({ amount: 1000, date: "2026-09-02" })];
  const heavyRisk = computeBudgetRisk(budget, heavy, categories, new Date("2026-09-02"));

  const light = [makeTransaction({ amount: 50, date: "2026-09-02" })];
  const lightRisk = computeBudgetRisk(budget, light, categories, new Date("2026-09-02"));

  assert.ok(heavyRisk.projectedUtilization > lightRisk.projectedUtilization);
});

test("a zero-limit budget does not throw and resolves to a defined risk level", () => {
  const budget = makeBudget({ limit: 0, startDate: "2026-09-01" });
  const risk = computeBudgetRisk(budget, [], categories, new Date("2026-09-15"));
  assert.ok(["low", "medium", "high", "critical"].includes(risk.level));
  assert.ok(Number.isFinite(risk.utilization));
  assert.ok(Number.isFinite(risk.projectedUtilization));
});

test("detectBudgetRisks sorts results with the most severe risk first", () => {
  const safe = makeBudget({ id: "bdg_safe", limit: 5000, startDate: "2026-09-01" });
  const exceeded = makeBudget({ id: "bdg_exceeded", limit: 100, startDate: "2026-09-01" });
  const txns = [makeTransaction({ amount: 500, categoryId: "cat_food", date: "2026-09-03" })];

  const risks = detectBudgetRisks([safe, exceeded], txns, categories, new Date("2026-09-05"));
  assert.equal(risks[0]?.budgetId, "bdg_exceeded");
  assert.equal(risks[0]?.level, "critical");
});

test("detectBudgetRisks returns an empty array for no budgets", () => {
  assert.deepEqual(detectBudgetRisks([], [], categories, new Date("2026-09-05")), []);
});
