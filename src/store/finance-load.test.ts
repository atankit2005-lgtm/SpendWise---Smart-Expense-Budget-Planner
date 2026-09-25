import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyFinanceSnapshotFailure,
  emptyFinanceState,
  financeStatusForSnapshotFailure,
  shouldLoadFinanceSnapshot,
} from "./finance-load";

describe("finance snapshot load classification", () => {
  it("only loads snapshots for authenticated application routes", () => {
    assert.equal(shouldLoadFinanceSnapshot(false), false);
    assert.equal(shouldLoadFinanceSnapshot(true), true);
  });

  it("treats a successful snapshot as real state (empty seed is not mock account data)", () => {
    const empty = emptyFinanceState();
    assert.equal(empty.transactions.length, 0);
    assert.equal(empty.budgets.length, 0);
    assert.equal(empty.goals.length, 0);
    assert.equal(empty.user.id, "");
    assert.notEqual(empty.user.email, "ankit.kumar@spendwise.app");
  });

  it("classifies missing-session failures as unauthenticated, not as account data", () => {
    assert.equal(
      classifyFinanceSnapshotFailure(new Error("You must be signed in to access SpendWise.")),
      "unauthenticated",
    );
    assert.equal(classifyFinanceSnapshotFailure({ status: 401, message: "Unauthorized" }), "unauthenticated");
    assert.equal(classifyFinanceSnapshotFailure({ statusCode: 401 }), "unauthenticated");
  });

  it("classifies authenticated snapshot failures as failed so mock data cannot be shown", () => {
    assert.equal(
      classifyFinanceSnapshotFailure(new Error("SpendWise is temporarily unavailable. Please try again shortly.")),
      "failed",
    );
    assert.equal(classifyFinanceSnapshotFailure({ status: 500 }), "failed");
    assert.equal(classifyFinanceSnapshotFailure({ status: 503 }), "failed");
  });

  it("maps initial and realtime failures to guest or error lifecycle states", () => {
    assert.equal(financeStatusForSnapshotFailure({ status: 401 }), "guest");
    assert.equal(financeStatusForSnapshotFailure({ statusCode: 401 }), "guest");
    assert.equal(financeStatusForSnapshotFailure({ status: 500 }), "error");
    assert.equal(financeStatusForSnapshotFailure({ status: 503 }), "error");
  });
});
