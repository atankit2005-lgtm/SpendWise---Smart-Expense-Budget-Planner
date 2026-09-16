import assert from "node:assert/strict";
import test from "node:test";

import { computeForecast } from "@/lib/ai/forecast";
import type { Transaction } from "@/types";

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
    date: overrides.date ?? "2026-08-05",
    createdAt: overrides.createdAt ?? "2026-08-05T00:00:00.000Z",
  };
}

test("computeForecast reports zero months used and is clearly an estimate with no history", () => {
  const forecast = computeForecast([], 0, new Date("2026-09-15"));
  assert.equal(forecast.monthsUsed, 0);
  assert.equal(forecast.isEstimate, true);
  assert.equal(forecast.projectedIncome, 0);
  assert.equal(forecast.projectedExpenses, 0);
});

test("computeForecast averages completed months, excluding the current in-progress month", () => {
  const txns = [
    makeTransaction({ type: "income", amount: 10000, date: "2026-07-02" }),
    makeTransaction({ type: "expense", amount: 4000, date: "2026-07-10" }),
    makeTransaction({ type: "income", amount: 10000, date: "2026-08-02" }),
    makeTransaction({ type: "expense", amount: 6000, date: "2026-08-10" }),
    // Current (in-progress) month — must not skew the average.
    makeTransaction({ type: "expense", amount: 100000, date: "2026-09-05" }),
  ];

  const forecast = computeForecast(txns, 0, new Date("2026-09-15"));
  assert.equal(forecast.monthsUsed, 2);
  assert.equal(forecast.projectedIncome, 10000);
  assert.equal(forecast.projectedExpenses, 5000);
  assert.equal(forecast.projectedSavings, 5000);
});

test("computeForecast projects an end-of-period balance from the current balance when provided", () => {
  const txns = [
    makeTransaction({ type: "income", amount: 5000, date: "2026-08-02" }),
    makeTransaction({ type: "expense", amount: 2000, date: "2026-08-10" }),
  ];
  const forecast = computeForecast(txns, 1000, new Date("2026-09-15"));
  assert.equal(forecast.projectedEndOfPeriodBalance, 1000 + forecast.projectedSavings);
});

test("computeForecast returns null projected balance when no current balance is given", () => {
  const txns = [makeTransaction({ type: "income", amount: 5000, date: "2026-08-02" })];
  const forecast = computeForecast(txns, undefined, new Date("2026-09-15"));
  assert.equal(forecast.projectedEndOfPeriodBalance, null);
});

test("computeForecast is explicitly labelled as an estimate, never presented as certain", () => {
  const forecast = computeForecast(
    [makeTransaction({ type: "income", amount: 5000, date: "2026-08-02" })],
    0,
    new Date("2026-09-15"),
  );
  assert.equal(forecast.isEstimate, true);
  assert.equal(forecast.method, "moving_average");
  assert.ok(forecast.explanation.length > 0);
});
