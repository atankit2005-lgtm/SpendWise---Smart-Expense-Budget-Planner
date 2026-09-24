import test from "node:test";
import assert from "node:assert/strict";

import type { Transaction } from "../types";
import { computeAnalyticsSeries, computeFinanceSummary } from "./financial-engine.ts";

function makeTransaction(overrides: Partial<Transaction> & { date: string }): Transaction {
  return {
    id: overrides.id ?? `txn_${overrides.date}`,
    amount: overrides.amount ?? 0,
    type: overrides.type ?? "expense",
    categoryId: overrides.categoryId ?? "cat_food",
    description: overrides.description ?? "Test transaction",
    paymentMethod: overrides.paymentMethod ?? "UPI",
    date: overrides.date,
    notes: overrides.notes,
    createdAt: overrides.createdAt ?? `${overrides.date}T00:00:00.000Z`,
  };
}

// Fixed reference date so no test depends on the wall clock: 2026-09-11 UTC.
const REFERENCE_DATE = new Date(Date.UTC(2026, 8, 11));

test("analytics series buckets real transactions into day buckets (7d)", () => {
  const transactions = [
    makeTransaction({ date: "2026-09-11", type: "expense", amount: 400 }),
    makeTransaction({ date: "2026-09-11", type: "income", amount: 1500 }),
    makeTransaction({ date: "2026-09-07", type: "expense", amount: 250 }),
    // Outside the 7-day window (window is 2026-09-05..2026-09-11 inclusive).
    makeTransaction({ date: "2026-09-01", type: "expense", amount: 999 }),
  ];

  const series = computeAnalyticsSeries(transactions, "7d", REFERENCE_DATE);

  assert.equal(series.length, 7);
  assert.deepEqual(series[0], { label: "05 Sep", income: 0, spending: 0 });
  assert.deepEqual(series[6], { label: "11 Sep", income: 1500, spending: 400 });

  const sept7 = series.find((p) => p.label === "07 Sep");
  assert.deepEqual(sept7, { label: "07 Sep", income: 0, spending: 250 });

  // Out-of-window transaction never leaks into any bucket.
  assert.equal(
    series.reduce((sum, p) => sum + p.spending, 0),
    650,
  );
  assert.equal(
    series.reduce((sum, p) => sum + p.income, 0),
    1500,
  );
});

test("analytics series buckets by month for month-based ranges", () => {
  const transactions = [
    makeTransaction({ date: "2026-09-02", type: "income", amount: 20000 }),
    makeTransaction({ date: "2026-09-05", type: "expense", amount: 5000 }),
    makeTransaction({ date: "2026-08-20", type: "expense", amount: 2000 }),
    // Before the 6-month window (window is Apr..Sep 2026).
    makeTransaction({ date: "2026-01-15", type: "expense", amount: 777 }),
  ];

  const series = computeAnalyticsSeries(transactions, "6m", REFERENCE_DATE);

  assert.equal(series.length, 6);
  assert.deepEqual(
    series.map((p) => p.label),
    ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
  );
  assert.deepEqual(series[5], { label: "Sep", income: 20000, spending: 5000 });
  assert.deepEqual(series[4], { label: "Aug", income: 0, spending: 2000 });
  assert.deepEqual(series[0], { label: "Apr", income: 0, spending: 0 });
});

test("analytics series produces the correct bucket count for every range", () => {
  const expected: Array<[Parameters<typeof computeAnalyticsSeries>[1], number]> = [
    ["7d", 7],
    ["30d", 30],
    ["3m", 3],
    ["6m", 6],
    ["1y", 12],
  ];

  for (const [range, length] of expected) {
    assert.equal(computeAnalyticsSeries([], range, REFERENCE_DATE).length, length, range);
  }
});

test("empty transactions yield zeroed buckets, never fabricated values", () => {
  const series = computeAnalyticsSeries([], "6m", REFERENCE_DATE);

  assert.equal(series.length, 6);
  for (const point of series) {
    assert.equal(point.income, 0);
    assert.equal(point.spending, 0);
  }
});

test("finance summary derives income, expenses, savings and balance from real data", () => {
  const transactions = [
    // Current month (September 2026)
    makeTransaction({ date: "2026-09-02", type: "income", amount: 20000 }),
    makeTransaction({ date: "2026-09-05", type: "expense", amount: 5000 }),
    makeTransaction({ date: "2026-09-10", type: "expense", amount: 1000 }),
    // Previous month (August 2026)
    makeTransaction({ date: "2026-08-15", type: "income", amount: 8000 }),
    makeTransaction({ date: "2026-08-20", type: "expense", amount: 2000 }),
    // Older history (July 2026) — lifetime balance only
    makeTransaction({ date: "2026-07-01", type: "expense", amount: 500 }),
  ];

  const summary = computeFinanceSummary(transactions, REFERENCE_DATE);

  assert.equal(summary.income, 20000);
  assert.equal(summary.expenses, 6000);
  assert.equal(summary.savings, 14000);
  // balance = lifetime income (28000) - lifetime expenses (8500)
  assert.equal(summary.balance, 19500);

  // Month-over-month changes vs August (income 8000, expenses 2000, savings 6000).
  assert.equal(summary.incomeChange, 150);
  assert.equal(summary.expenseChange, 200);
  assert.equal(summary.savingsChange, 133.3);
  // Balance at end of August was 8000 - 2500 = 5500; (19500-5500)/5500 = 254.5%
  assert.equal(summary.balanceChange, 254.5);
});

test("finance summary change fields are undefined when the previous period is zero", () => {
  const transactions = [
    makeTransaction({ date: "2026-09-03", type: "income", amount: 1000 }),
    makeTransaction({ date: "2026-09-04", type: "expense", amount: 400 }),
  ];

  const summary = computeFinanceSummary(transactions, REFERENCE_DATE);

  assert.equal(summary.income, 1000);
  assert.equal(summary.expenses, 400);
  assert.equal(summary.savings, 600);
  assert.equal(summary.balance, 600);
  assert.equal(summary.incomeChange, undefined);
  assert.equal(summary.expenseChange, undefined);
  assert.equal(summary.savingsChange, undefined);
  assert.equal(summary.balanceChange, undefined);
});

test("finance summary of empty history is all zeros with no change indicators", () => {
  const summary = computeFinanceSummary([], REFERENCE_DATE);

  assert.deepEqual(summary, {
    balance: 0,
    income: 0,
    expenses: 0,
    savings: 0,
    balanceChange: undefined,
    incomeChange: undefined,
    expenseChange: undefined,
    savingsChange: undefined,
  });
});
