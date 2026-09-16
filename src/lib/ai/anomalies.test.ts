import assert from "node:assert/strict";
import test from "node:test";

import {
  detectAnomalies,
  detectCategoryOverspendAnomalies,
  detectLargeExpenseAnomalies,
} from "@/lib/ai/anomalies";
import type { Category, Transaction } from "@/types";

const categories: Category[] = [
  { id: "cat_food", name: "Food & Dining", type: "expense", color: "red", icon: "utensils" },
  { id: "cat_shopping", name: "Shopping", type: "expense", color: "purple", icon: "bag" },
];

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
    date: overrides.date ?? "2026-09-01",
    createdAt: overrides.createdAt ?? "2026-09-01T00:00:00.000Z",
  };
}

test("detectLargeExpenseAnomalies flags a transaction far above the category average", () => {
  const history = Array.from({ length: 6 }, (_, i) =>
    makeTransaction({ amount: 200, date: `2026-0${(i % 6) + 1}-05` }),
  );
  const outlier = makeTransaction({ amount: 5000, date: "2026-09-10" });
  const anomalies = detectLargeExpenseAnomalies([...history, outlier], categories);

  assert.ok(anomalies.some((a) => a.transactionId === outlier.id));
  const match = anomalies.find((a) => a.transactionId === outlier.id)!;
  assert.equal(match.type, "large_expense");
  assert.equal(match.amount, 5000);
});

test("detectLargeExpenseAnomalies does not flag consistent, similar-sized spending", () => {
  const history = Array.from({ length: 8 }, (_, i) =>
    makeTransaction({ amount: 200 + (i % 3) * 5, date: `2026-0${(i % 6) + 1}-05` }),
  );
  const anomalies = detectLargeExpenseAnomalies(history, categories);
  assert.equal(anomalies.length, 0);
});

test("detectLargeExpenseAnomalies returns nothing for a category with too little history", () => {
  const txns = [makeTransaction({ amount: 5000 })];
  const anomalies = detectLargeExpenseAnomalies(txns, categories);
  assert.equal(anomalies.length, 0);
});

test("detectCategoryOverspendAnomalies flags a category spending well above its own baseline", () => {
  const past = ["2026-06-05", "2026-07-05", "2026-08-05"].map((date) =>
    makeTransaction({ amount: 500, categoryId: "cat_shopping", date }),
  );
  const spike = makeTransaction({ amount: 3000, categoryId: "cat_shopping", date: "2026-09-05" });
  const anomalies = detectCategoryOverspendAnomalies(
    [...past, spike],
    categories,
    new Date("2026-09-15"),
  );

  assert.ok(
    anomalies.some((a) => a.categoryId === "cat_shopping" && a.type === "category_overspend"),
  );
});

test("detectCategoryOverspendAnomalies ignores a category spending in line with its baseline", () => {
  const past = ["2026-06-05", "2026-07-05", "2026-08-05"].map((date) =>
    makeTransaction({ amount: 500, categoryId: "cat_shopping", date }),
  );
  const current = makeTransaction({ amount: 520, categoryId: "cat_shopping", date: "2026-09-05" });
  const anomalies = detectCategoryOverspendAnomalies(
    [...past, current],
    categories,
    new Date("2026-09-15"),
  );
  assert.equal(anomalies.filter((a) => a.categoryId === "cat_shopping").length, 0);
});

test("detectAnomalies returns an empty array for no transactions", () => {
  assert.deepEqual(detectAnomalies([], categories), []);
});

test("detectAnomalies combines large-expense and category-overspend detectors", () => {
  const baseline = ["2026-06-05", "2026-07-05", "2026-08-05"].map((date) =>
    makeTransaction({ amount: 300, categoryId: "cat_food", date }),
  );
  const outlier = makeTransaction({ amount: 6000, categoryId: "cat_food", date: "2026-09-05" });
  const anomalies = detectAnomalies([...baseline, outlier], categories, new Date("2026-09-15"));
  assert.ok(anomalies.length >= 1);
  for (const a of anomalies) {
    assert.ok(["large_expense", "category_overspend"].includes(a.type));
    assert.ok(["low", "medium", "high"].includes(a.severity));
  }
});
