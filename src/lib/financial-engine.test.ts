import test from "node:test";
import assert from "node:assert/strict";

import type { Budget, Transaction } from "../types";
import {
  computeBudgetSpend,
  computeBudgetSpendingMap,
  computeBudgetUtilization,
  computeCashFlowSeries,
  computeCategoryTotals,
  computeSavings,
  sumExpensesForRange,
  sumIncomeForRange,
} from "./financial-engine.ts";

function makeTransaction(
  overrides: Partial<Transaction>,
): Transaction {
  return {
    id: overrides.id ?? "txn_test",
    amount: overrides.amount ?? 100,
    type: overrides.type ?? "expense",
    categoryId: overrides.categoryId ?? "cat_food",
    description: overrides.description ?? "Test transaction",
    paymentMethod: overrides.paymentMethod ?? "UPI",
    date: overrides.date ?? "2026-01-01",
    notes: overrides.notes,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: overrides.id ?? "bdg_test",
    categoryId: overrides.categoryId ?? "cat_food",
    limit: overrides.limit ?? 5000,
    spent: overrides.spent ?? 0,
    period: overrides.period ?? "monthly",
    startDate: overrides.startDate ?? "2026-01-01",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

test("empty transactions return zero values", () => {
  assert.equal(sumIncomeForRange([], "2026-01-01", "2026-01-31"), 0);
  assert.equal(sumExpensesForRange([], "2026-01-01", "2026-01-31"), 0);
  assert.deepEqual(computeCategoryTotals([], "2026-01-01", "2026-01-31"), {});
  assert.deepEqual(computeCashFlowSeries([], "2026-01-01", "2026-01-31"), []);
});

test("income only range totals correctly", () => {
  const transactions = [
    makeTransaction({ type: "income", amount: 3000, date: "2026-01-03" }),
    makeTransaction({ type: "income", amount: 1000, date: "2026-01-15" }),
    makeTransaction({ type: "income", amount: 2000, date: "2026-02-01" }),
  ];

  assert.equal(sumIncomeForRange(transactions, "2026-01-01", "2026-01-31"), 4000);
  assert.equal(sumExpensesForRange(transactions, "2026-01-01", "2026-01-31"), 0);
  assert.equal(computeSavings(4000, 0), 4000);
});

test("expenses only range totals correctly", () => {
  const transactions = [
    makeTransaction({ type: "expense", amount: 250, date: "2026-01-03" }),
    makeTransaction({ type: "expense", amount: 750, date: "2026-01-15" }),
    makeTransaction({ type: "expense", amount: 600, date: "2026-02-01" }),
  ];

  assert.equal(sumIncomeForRange(transactions, "2026-01-01", "2026-01-31"), 0);
  assert.equal(sumExpensesForRange(transactions, "2026-01-01", "2026-01-31"), 1000);
  assert.equal(computeSavings(0, 1000), -1000);
});

test("income plus expenses produces net value", () => {
  const transactions = [
    makeTransaction({ type: "income", amount: 2500, date: "2026-01-05" }),
    makeTransaction({ type: "expense", amount: 900, date: "2026-01-06" }),
    makeTransaction({ type: "expense", amount: 1300, date: "2026-01-11" }),
  ];

  const income = sumIncomeForRange(transactions, "2026-01-01", "2026-01-31");
  const expenses = sumExpensesForRange(transactions, "2026-01-01", "2026-01-31");

  assert.equal(income, 2500);
  assert.equal(expenses, 2200);
  assert.equal(computeSavings(income, expenses), 300);
});

test("zero income stays zero", () => {
  const transactions = [
    makeTransaction({ type: "expense", amount: 500, date: "2026-01-10" }),
    makeTransaction({ type: "expense", amount: 250, date: "2026-01-20" }),
  ];

  assert.equal(sumIncomeForRange(transactions, "2026-01-01", "2026-01-31"), 0);
  assert.equal(computeSavings(0, 750), -750);
});

test("zero expenses stays zero", () => {
  const transactions = [
    makeTransaction({ type: "income", amount: 1500, date: "2026-01-05" }),
    makeTransaction({ type: "income", amount: 400, date: "2026-01-15" }),
  ];

  assert.equal(sumExpensesForRange(transactions, "2026-01-01", "2026-01-31"), 0);
  assert.equal(computeSavings(1900, 0), 1900);
});

test("negative net savings is preserved", () => {
  const income = 2000;
  const expenses = 2600;

  assert.equal(computeSavings(income, expenses), -600);
});

test("transactions exactly on range boundaries are included", () => {
  const transactions = [
    makeTransaction({ type: "income", amount: 1200, date: "2026-01-01" }),
    makeTransaction({ type: "expense", amount: 600, date: "2026-01-31" }),
    makeTransaction({ type: "expense", amount: 200, date: "2026-02-01" }),
  ];

  assert.equal(sumIncomeForRange(transactions, "2026-01-01", "2026-01-31"), 1200);
  assert.equal(sumExpensesForRange(transactions, "2026-01-01", "2026-01-31"), 600);
});

test("transactions outside the selected range are excluded", () => {
  const transactions = [
    makeTransaction({ type: "income", amount: 1000, date: "2025-12-31" }),
    makeTransaction({ type: "income", amount: 1100, date: "2026-02-01" }),
    makeTransaction({ type: "expense", amount: 300, date: "2025-12-31" }),
    makeTransaction({ type: "expense", amount: 400, date: "2026-02-03" }),
  ];

  assert.equal(sumIncomeForRange(transactions, "2026-01-01", "2026-01-31"), 0);
  assert.equal(sumExpensesForRange(transactions, "2026-01-01", "2026-01-31"), 0);
});

test("category totals are grouped by category id", () => {
  const transactions = [
    makeTransaction({ id: "t1", type: "expense", categoryId: "cat_food", amount: 300, date: "2026-01-04" }),
    makeTransaction({ id: "t2", type: "expense", categoryId: "cat_food", amount: 150, date: "2026-01-08" }),
    makeTransaction({ id: "t3", type: "expense", categoryId: "cat_transport", amount: 200, date: "2026-01-09" }),
    makeTransaction({ id: "t4", type: "expense", categoryId: "cat_transport", amount: 75, date: "2026-02-01" }),
    makeTransaction({ id: "t5", type: "income", categoryId: "cat_salary", amount: 2000, date: "2026-01-10" }),
  ];

  assert.deepEqual(
    computeCategoryTotals(transactions, "2026-01-01", "2026-01-31"),
    {
      cat_food: 450,
      cat_transport: 200,
    },
  );
});

test("cash flow series groups transactions by the selected bucket", () => {
  const transactions = [
    makeTransaction({ type: "income", amount: 1000, date: "2026-01-05" }),
    makeTransaction({ type: "expense", amount: 400, date: "2026-01-12" }),
    makeTransaction({ type: "expense", amount: 300, date: "2026-02-02" }),
    makeTransaction({ type: "income", amount: 500, date: "2026-02-03" }),
  ];

  const series = computeCashFlowSeries(transactions, "2026-01-01", "2026-02-28", "month");

  assert.deepEqual(series, [
    { label: "2026-01", income: 1000, expenses: 400, net: 600 },
    { label: "2026-02", income: 500, expenses: 300, net: 200 },
  ]);
});

test("budget spend is zero when there are no transactions", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });

  assert.equal(computeBudgetSpend(budget, []), 0);
});

test("budget spend includes one matching expense", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [makeTransaction({ type: "expense", categoryId: "cat_food", amount: 1250, date: "2026-01-12" })];

  assert.equal(computeBudgetSpend(budget, transactions), 1250);
});

test("budget spend sums multiple matching expenses", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 850, date: "2026-01-03" }),
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 1250, date: "2026-01-12" }),
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 400, date: "2026-02-02" }),
  ];

  assert.equal(computeBudgetSpend(budget, transactions), 2100);
});

test("income in the same category is ignored for budget spend", () => {
  const budget = makeBudget({ categoryId: "cat_salary", startDate: "2026-01-01", limit: 10000 });
  const transactions = [
    makeTransaction({ type: "income", categoryId: "cat_salary", amount: 6000, date: "2026-01-08" }),
    makeTransaction({ type: "expense", categoryId: "cat_salary", amount: 1500, date: "2026-01-11" }),
  ];

  assert.equal(computeBudgetSpend(budget, transactions), 1500);
});

test("expenses in different categories are ignored for budget spend", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [makeTransaction({ type: "expense", categoryId: "cat_transport", amount: 900, date: "2026-01-10" })];

  assert.equal(computeBudgetSpend(budget, transactions), 0);
});

test("transactions outside the budget period are ignored", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [makeTransaction({ type: "expense", categoryId: "cat_food", amount: 600, date: "2026-02-02" })];

  assert.equal(computeBudgetSpend(budget, transactions), 0);
});

test("transactions exactly on the period start are included", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [makeTransaction({ type: "expense", categoryId: "cat_food", amount: 330, date: "2026-01-01" })];

  assert.equal(computeBudgetSpend(budget, transactions), 330);
});

test("transactions exactly on the period end are included", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [makeTransaction({ type: "expense", categoryId: "cat_food", amount: 215, date: "2026-01-31" })];

  assert.equal(computeBudgetSpend(budget, transactions), 215);
});

test("budget utilization is computed with the current period spend", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 1200, date: "2026-01-04" }),
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 900, date: "2026-01-12" }),
  ];

  assert.equal(computeBudgetUtilization(budget, transactions), 42);
});

test("budget utilization at or above 80% is tracked as a warning threshold", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 3000, date: "2026-01-08" }),
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 1000, date: "2026-01-15" }),
  ];

  assert.equal(computeBudgetUtilization(budget, transactions), 80);
});

test("budget utilization at or above 100% is tracked as exceeded", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 4100, date: "2026-01-10" }),
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 1000, date: "2026-01-18" }),
  ];

  assert.equal(computeBudgetUtilization(budget, transactions), 102);
});

test("changing the transaction amount or category changes the derived budget spend", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [
    makeTransaction({ id: "t1", type: "expense", categoryId: "cat_food", amount: 600, date: "2026-01-03" }),
    makeTransaction({ id: "t2", type: "expense", categoryId: "cat_food", amount: 900, date: "2026-01-20" }),
  ];

  const updatedTransactions = [
    makeTransaction({ id: "t1", type: "expense", categoryId: "cat_food", amount: 1200, date: "2026-01-03" }),
    makeTransaction({ id: "t2", type: "expense", categoryId: "cat_transport", amount: 900, date: "2026-01-20" }),
  ];

  assert.equal(computeBudgetSpend(budget, transactions), 1500);
  assert.equal(computeBudgetSpend(budget, updatedTransactions), 1200);
});

test("deleting an expense reduces the derived budget spend", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 });
  const transactions = [
    makeTransaction({ id: "t1", type: "expense", categoryId: "cat_food", amount: 600, date: "2026-01-03" }),
    makeTransaction({ id: "t2", type: "expense", categoryId: "cat_food", amount: 900, date: "2026-01-20" }),
  ];

  const remainingTransactions = [transactions[0]!];
  assert.equal(computeBudgetSpend(budget, transactions), 1500);
  assert.equal(computeBudgetSpend(budget, remainingTransactions), 600);
});

test("duplicate budgets for the same category do not multiply the same transaction spend", () => {
  const transactions = [
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 1200, date: "2026-01-05" }),
    makeTransaction({ type: "expense", categoryId: "cat_food", amount: 300, date: "2026-01-28" }),
  ];

  const budgets = [
    makeBudget({ id: "bdg_1", categoryId: "cat_food", startDate: "2026-01-01", limit: 5000 }),
    makeBudget({ id: "bdg_2", categoryId: "cat_food", startDate: "2026-01-01", limit: 6000 }),
  ];

  const map = computeBudgetSpendingMap(budgets, transactions);

  assert.equal(map["bdg_1"], 1500);
  assert.equal(map["bdg_2"], 1500);
});

test("zero-limit budgets do not divide by zero during utilization", () => {
  const budget = makeBudget({ categoryId: "cat_food", startDate: "2026-01-01", limit: 0 });
  const transactions = [makeTransaction({ type: "expense", categoryId: "cat_food", amount: 250, date: "2026-01-06" })];

  assert.equal(computeBudgetUtilization(budget, transactions), 0);
});
