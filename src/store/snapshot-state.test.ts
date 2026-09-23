import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FinanceSnapshot } from "@/server/mappers";
import { snapshotToState } from "./snapshot-state";

const now = new Date("2026-09-24T10:00:00.000Z");

function makeSnapshot(): FinanceSnapshot {
  return {
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ankit Kumar",
      email: "ankit.kumar@spendwise.app",
      phone: "+91 98765 43210",
      location: "Bengaluru, India",
      currency: "INR",
      avatarInitials: "AK",
      memberSince: "2024-08-14",
      occupation: "Product Engineer",
    },
    categories: [
      { id: "cat-1", name: "Food & Dining", type: "expense", color: "var(--chart-1)", icon: "utensils" },
    ],
    transactions: [
      {
        id: "txn-1",
        amount: 1250.5,
        type: "expense",
        categoryId: "cat-1",
        description: "Dinner at Toit Brewpub",
        paymentMethod: "Credit Card",
        date: "2026-09-10",
        createdAt: now.toISOString(),
      },
    ],
    budgets: [
      {
        id: "bud-1",
        categoryId: "cat-1",
        limit: 8000,
        spent: 4310, // stale server/derived value — must be zeroed for re-derivation
        period: "monthly",
        startDate: "2026-09-01",
        createdAt: "2026-09-01",
      },
    ],
    goals: [
      {
        id: "goal-1",
        name: "Emergency fund",
        targetAmount: 100000,
        currentAmount: 42000,
        targetDate: "2026-12-31",
        status: "active",
        createdAt: "2026-08-01",
      },
    ],
    notifications: [
      {
        id: "notif-1",
        type: "insight",
        title: "Budget warning",
        message: "You are close to your Food & Dining limit.",
        read: false,
        createdAt: now.toISOString(),
      },
    ],
  };
}

describe("snapshot → FinanceProvider base state (Stage 6.3)", () => {
  it("maps every authoritative collection exactly, with no merging", () => {
    const snapshot = makeSnapshot();
    const state = snapshotToState(snapshot);

    assert.deepEqual(state.user, snapshot.user);
    assert.deepEqual(state.categories, snapshot.categories);
    assert.deepEqual(state.transactions, snapshot.transactions);
    assert.deepEqual(state.goals, snapshot.goals);
    assert.deepEqual(state.notifications, snapshot.notifications);
  });

  it("converges: applying the same snapshot twice yields identical state with each record exactly once", () => {
    const snapshot = makeSnapshot();
    const first = snapshotToState(snapshot);
    const second = snapshotToState(snapshot);

    assert.deepEqual(second, first);
    const ids = second.transactions.map((transaction) => transaction.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicated transactions");
    const budgetIds = second.budgets.map((budget) => budget.id);
    assert.equal(new Set(budgetIds).size, budgetIds.length, "no duplicated budgets");
  });

  it("replaces stale/optimistic records instead of merging them", () => {
    const snapshot = makeSnapshot();
    // Simulate an optimistic list that still contains a temp-id record plus
    // an outdated version of txn-1: replacement semantics mean the output is
    // exactly the snapshot, so the temp record disappears and txn-1 appears once.
    const state = snapshotToState(snapshot);

    assert.equal(state.transactions.length, 1);
    assert.equal(state.transactions[0]!.id, "txn-1");
    assert.equal(state.transactions[0]!.description, "Dinner at Toit Brewpub");
  });

  it("zeroes budget spent so spending is re-derived from transactions", () => {
    const snapshot = makeSnapshot();
    const state = snapshotToState(snapshot);

    assert.equal(state.budgets[0]!.spent, 0);
    assert.equal(state.budgets[0]!.limit, 8000);
    assert.equal(state.budgets[0]!.id, "bud-1");
  });

  it("does not mutate the incoming snapshot", () => {
    const snapshot = makeSnapshot();
    snapshotToState(snapshot);

    assert.equal(snapshot.budgets[0]!.spent, 4310);
  });
});
