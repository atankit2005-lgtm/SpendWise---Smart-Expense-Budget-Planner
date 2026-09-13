import test from "node:test";
import assert from "node:assert/strict";

import type { Transaction } from "../types";
import {
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
