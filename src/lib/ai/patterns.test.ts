import assert from "node:assert/strict";
import test from "node:test";

import {
  detectCategorySpikes,
  detectFrequentSmallPurchases,
  detectHighSpendingMonth,
  detectIncreasingTrend,
  detectRecurringExpenses,
  detectSpendingPatterns,
  detectWeekendWeekdayPattern,
} from "@/lib/ai/patterns";
import type { Category, Transaction } from "@/types";

const categories: Category[] = [
  { id: "cat_food", name: "Food & Dining", type: "expense", color: "red", icon: "utensils" },
  { id: "cat_transport", name: "Transport", type: "expense", color: "blue", icon: "car" },
];

let seq = 0;
function tx(overrides: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: overrides.id ?? `txn_${seq}`,
    amount: overrides.amount ?? 100,
    type: overrides.type ?? "expense",
    categoryId: overrides.categoryId ?? "cat_food",
    description: overrides.description ?? `Transaction ${seq}`,
    paymentMethod: overrides.paymentMethod ?? "UPI",
    date: overrides.date ?? "2026-01-01",
    notes: overrides.notes,
    createdAt: overrides.createdAt ?? `${overrides.date ?? "2026-01-01"}T00:00:00.000Z`,
  };
}

test("detectSpendingPatterns returns nothing for empty transaction history", () => {
  const patterns = detectSpendingPatterns([], categories, new Date("2026-09-15T00:00:00.000Z"));
  assert.deepEqual(patterns, []);
});

test("detectIncreasingTrend flags a steady month-over-month rise", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-06-15", amount: 5000 }),
    tx({ date: "2026-07-15", amount: 6000 }),
    tx({ date: "2026-08-15", amount: 7500 }),
  ];
  const result = detectIncreasingTrend(transactions, new Date("2026-09-15T00:00:00.000Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0]?.type, "increasing_trend");
});

test("detectIncreasingTrend does not flag flat or falling spending", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-06-15", amount: 6000 }),
    tx({ date: "2026-07-15", amount: 5800 }),
    tx({ date: "2026-08-15", amount: 5600 }),
  ];
  const result = detectIncreasingTrend(transactions, new Date("2026-09-15T00:00:00.000Z"));
  assert.deepEqual(result, []);
});

test("detectIncreasingTrend requires enough months of history", () => {
  const transactions: Transaction[] = [tx({ date: "2026-08-15", amount: 7500 })];
  const result = detectIncreasingTrend(transactions, new Date("2026-09-15T00:00:00.000Z"));
  assert.deepEqual(result, []);
});

test("detectFrequentSmallPurchases flags a cluster of small recent expenses", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-09-01", amount: 120 }),
    tx({ date: "2026-09-03", amount: 90 }),
    tx({ date: "2026-09-05", amount: 150 }),
    tx({ date: "2026-09-08", amount: 200 }),
  ];
  const result = detectFrequentSmallPurchases(transactions, new Date("2026-09-10T00:00:00.000Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0]?.type, "frequent_small_purchases");
});

test("detectFrequentSmallPurchases ignores purchases outside the lookback window", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-01-01", amount: 120 }),
    tx({ date: "2026-01-03", amount: 90 }),
    tx({ date: "2026-01-05", amount: 150 }),
    tx({ date: "2026-01-08", amount: 200 }),
  ];
  const result = detectFrequentSmallPurchases(transactions, new Date("2026-09-10T00:00:00.000Z"));
  assert.deepEqual(result, []);
});

test("detectFrequentSmallPurchases requires the minimum count", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-09-01", amount: 120 }),
    tx({ date: "2026-09-03", amount: 90 }),
  ];
  const result = detectFrequentSmallPurchases(transactions, new Date("2026-09-10T00:00:00.000Z"));
  assert.deepEqual(result, []);
});

test("detectCategorySpikes flags a category that jumped vs. last month", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-08-05", amount: 1000, categoryId: "cat_food" }),
    tx({ date: "2026-09-05", amount: 2000, categoryId: "cat_food" }),
  ];
  const result = detectCategorySpikes(
    transactions,
    categories,
    new Date("2026-09-15T00:00:00.000Z"),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0]?.categoryId, "cat_food");
});

test("detectCategorySpikes ignores small absolute amounts even with a big percentage jump", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-08-05", amount: 20, categoryId: "cat_food" }),
    tx({ date: "2026-09-05", amount: 60, categoryId: "cat_food" }),
  ];
  const result = detectCategorySpikes(
    transactions,
    categories,
    new Date("2026-09-15T00:00:00.000Z"),
  );
  assert.deepEqual(result, []);
});

test("detectCategorySpikes ignores categories with no prior month spend", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-09-05", amount: 2000, categoryId: "cat_food" }),
  ];
  const result = detectCategorySpikes(
    transactions,
    categories,
    new Date("2026-09-15T00:00:00.000Z"),
  );
  assert.deepEqual(result, []);
});

test("detectRecurringExpenses flags a same-description charge repeating across months", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-07-27", amount: 540, description: "Streaming subscriptions" }),
    tx({ date: "2026-08-27", amount: 540, description: "Streaming subscriptions" }),
    tx({ date: "2026-09-27", amount: 549, description: "Streaming subscriptions" }),
  ];
  const result = detectRecurringExpenses(transactions);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.type, "recurring_expense");
});

test("detectRecurringExpenses ignores amounts that vary too much to be the same charge", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-07-27", amount: 200, description: "Variable spend" }),
    tx({ date: "2026-08-27", amount: 900, description: "Variable spend" }),
  ];
  const result = detectRecurringExpenses(transactions);
  assert.deepEqual(result, []);
});

test("detectRecurringExpenses requires at least two distinct months", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-07-27", amount: 540, description: "Streaming subscriptions" }),
  ];
  const result = detectRecurringExpenses(transactions);
  assert.deepEqual(result, []);
});

test("detectWeekendWeekdayPattern flags materially higher weekend spend", () => {
  const transactions: Transaction[] = [
    // Weekends (Sat/Sun in Sept 2026: 5-6, 12-13, 19-20)
    tx({ date: "2026-09-05", amount: 2000 }),
    tx({ date: "2026-09-06", amount: 2200 }),
    tx({ date: "2026-09-12", amount: 2100 }),
    // Weekdays
    tx({ date: "2026-09-07", amount: 300 }),
    tx({ date: "2026-09-08", amount: 300 }),
    tx({ date: "2026-09-09", amount: 300 }),
    tx({ date: "2026-09-10", amount: 300 }),
  ];
  const result = detectWeekendWeekdayPattern(transactions);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.type, "weekend_weekday");
});

test("detectWeekendWeekdayPattern requires enough samples", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-09-05", amount: 2000 }),
    tx({ date: "2026-09-07", amount: 300 }),
  ];
  const result = detectWeekendWeekdayPattern(transactions);
  assert.deepEqual(result, []);
});

test("detectHighSpendingMonth flags a big jump over the trailing average", () => {
  const transactions: Transaction[] = [
    tx({ date: "2026-06-10", amount: 10000 }),
    tx({ date: "2026-07-10", amount: 10500 }),
    tx({ date: "2026-08-10", amount: 9800 }),
    tx({ date: "2026-09-05", amount: 20000 }),
  ];
  const result = detectHighSpendingMonth(transactions, new Date("2026-09-10T00:00:00.000Z"));
  assert.equal(result.length, 1);
});

test("detectHighSpendingMonth is silent with no spending yet this month", () => {
  const transactions: Transaction[] = [tx({ date: "2026-08-10", amount: 9800 })];
  const result = detectHighSpendingMonth(transactions, new Date("2026-09-10T00:00:00.000Z"));
  assert.deepEqual(result, []);
});

test("detectSpendingPatterns handles a single transaction without throwing", () => {
  const transactions: Transaction[] = [tx({ date: "2026-09-10", amount: 500 })];
  const result = detectSpendingPatterns(
    transactions,
    categories,
    new Date("2026-09-15T00:00:00.000Z"),
  );
  assert.ok(Array.isArray(result));
});
