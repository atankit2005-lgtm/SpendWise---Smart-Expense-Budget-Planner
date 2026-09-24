/**
 * Stage 8.2 derived AI notification lifecycle tests.
 *
 * The AI notifications are derived (not persisted): they must have stable
 * deterministic ids, never duplicate across repeated renders/refetches,
 * survive snapshot replacement of the persisted lane, and stay deleted once
 * dismissed. These tests cover the pure module behind that lifecycle.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AnomalyResult, BudgetRiskResult } from "@/lib/ai";
import type { AppNotification, Category } from "@/types";
import {
  buildDerivedNotificationCandidates,
  combineNotifications,
  mergeDerivedNotifications,
  type DerivedNotificationSource,
} from "./derived-notifications";

const CREATED_AT = "2026-09-24T10:00:00.000Z";

const categories: Category[] = [
  { id: "cat-1", name: "Food & Dining", type: "expense", color: "var(--chart-1)", icon: "utensils" },
];

function risk(budgetId: string, level: BudgetRiskResult["level"], categoryId = "cat-1"): BudgetRiskResult {
  return {
    budgetId,
    categoryId,
    level,
    utilization: 95,
    projectedUtilization: 120,
    explanation: `Projected overspend on ${budgetId}`,
  };
}

function anomaly(id: string, severity: AnomalyResult["severity"]): AnomalyResult {
  return {
    id,
    type: "large_expense",
    severity,
    title: `Unusual spend ${id}`,
    explanation: `Spike detected for ${id}`,
    amount: 9999,
  };
}

function makeSource(overrides: Partial<DerivedNotificationSource> = {}): DerivedNotificationSource {
  return {
    budgetRisks: [risk("bud-1", "critical"), risk("bud-2", "high"), risk("bud-3", "low"), risk("bud-4", "medium")],
    anomalies: [anomaly("an-1", "high"), anomaly("an-2", "medium")],
    categories,
    ...overrides,
  };
}

const NO_DISMISSED: ReadonlySet<string> = new Set();

describe("derived AI notifications (Stage 8.2)", () => {
  it("generates alerts only for actionable severities, with deterministic ids", () => {
    const candidates = buildDerivedNotificationCandidates(makeSource(), CREATED_AT);

    assert.deepEqual(
      candidates.map((candidate) => candidate.id),
      ["ai_budget_bud-1_critical", "ai_budget_bud-2_high", "ai_anomaly_an-1"],
    );

    const critical = candidates[0]!;
    assert.equal(critical.type, "budget_exceeded");
    assert.equal(critical.title, "Food & Dining budget exceeded");
    assert.equal(critical.message, "Projected overspend on bud-1");
    assert.equal(critical.read, false);
    assert.equal(critical.createdAt, CREATED_AT);

    const high = candidates[1]!;
    assert.equal(high.type, "budget_warning");
    assert.equal(high.title, "Food & Dining budget at risk");

    const anomalyAlert = candidates[2]!;
    assert.equal(anomalyAlert.type, "unusual_transaction");
    assert.equal(anomalyAlert.title, "Unusual spend an-1");
    assert.equal(anomalyAlert.message, "Spike detected for an-1");
  });

  it("falls back to the mock category name for unknown categories", () => {
    const candidates = buildDerivedNotificationCandidates(
      makeSource({ budgetRisks: [risk("bud-9", "critical", "cat-unknown")] }),
      CREATED_AT,
    );

    assert.equal(candidates[0]!.title, "Uncategorised budget exceeded");
  });

  it("produces stable identity: rebuilding from the same state yields the same ids", () => {
    const source = makeSource();
    const first = buildDerivedNotificationCandidates(source, CREATED_AT);
    const second = buildDerivedNotificationCandidates(source, CREATED_AT);

    assert.deepEqual(
      second.map((candidate) => candidate.id),
      first.map((candidate) => candidate.id),
    );
  });

  it("never duplicates on repeated renders/refetches (merge is idempotent)", () => {
    const candidates = buildDerivedNotificationCandidates(makeSource(), CREATED_AT);

    const afterFirst = mergeDerivedNotifications([], candidates, NO_DISMISSED);
    const afterSecond = mergeDerivedNotifications(afterFirst, candidates, NO_DISMISSED);
    const afterThird = mergeDerivedNotifications(afterSecond, candidates, NO_DISMISSED);

    assert.equal(afterFirst.length, 3);
    assert.equal(afterThird.length, 3);
    assert.equal(new Set(afterThird.map((n) => n.id)).size, 3);
    assert.strictEqual(afterSecond, afterFirst, "no state update when nothing is new");
    assert.strictEqual(afterThird, afterFirst, "no state update when nothing is new");
  });

  it("keeps dismissed notifications deleted across rebuilds", () => {
    const candidates = buildDerivedNotificationCandidates(makeSource(), CREATED_AT);
    const dismissed = new Set(["ai_budget_bud-1_critical"]);

    const merged = mergeDerivedNotifications([], candidates, dismissed);

    assert.deepEqual(
      merged.map((n) => n.id),
      ["ai_budget_bud-2_high", "ai_anomaly_an-1"],
    );

    // A later re-render with the same dismissed memory must not resurrect it.
    const again = mergeDerivedNotifications(merged, buildDerivedNotificationCandidates(makeSource(), CREATED_AT), dismissed);
    assert.strictEqual(again, merged);
  });

  it("preserves read state when the same condition is recomputed", () => {
    const candidates = buildDerivedNotificationCandidates(makeSource(), CREATED_AT);
    const existing = mergeDerivedNotifications([], candidates, NO_DISMISSED).map((n) =>
      n.id === "ai_budget_bud-1_critical" ? { ...n, read: true } : n,
    );

    const merged = mergeDerivedNotifications(existing, buildDerivedNotificationCandidates(makeSource(), CREATED_AT), NO_DISMISSED);

    assert.strictEqual(merged, existing);
    assert.equal(merged.find((n) => n.id === "ai_budget_bud-1_critical")!.read, true);
  });

  it("survives a snapshot refetch: persisted lane replaced, derived lane intact and exactly once", () => {
    const persistedNotification: AppNotification = {
      id: "11111111-1111-4111-8111-111111111111",
      type: "insight",
      title: "Budget warning",
      message: "You are close to your Food & Dining limit.",
      read: false,
      createdAt: CREATED_AT,
    };

    const candidates = buildDerivedNotificationCandidates(makeSource(), CREATED_AT);
    const derived = mergeDerivedNotifications([], candidates, NO_DISMISSED);
    const beforeRefetch = combineNotifications(derived, [persistedNotification]);

    // Snapshot refetch replaces the persisted list wholesale; the derived lane
    // is re-merged from recomputed intelligence, then re-combined.
    const derivedAfterRefetch = mergeDerivedNotifications(derived, buildDerivedNotificationCandidates(makeSource(), CREATED_AT), NO_DISMISSED);
    const afterRefetch = combineNotifications(derivedAfterRefetch, [persistedNotification, { ...persistedNotification, id: "22222222-2222-4222-8222-222222222222" }]);

    const idsBefore = beforeRefetch.map((n) => n.id);
    assert.equal(new Set(idsBefore).size, idsBefore.length);
    assert.equal(afterRefetch.filter((n) => n.id === "ai_budget_bud-1_critical").length, 1);
    assert.equal(afterRefetch.filter((n) => n.id === "ai_anomaly_an-1").length, 1);
    assert.equal(afterRefetch.length, 5, "3 derived + 2 persisted");
  });

  it("combines derived first and never modifies the persisted lane", () => {
    const persisted: AppNotification[] = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        type: "insight",
        title: "Persisted",
        message: "From the database",
        read: true,
        createdAt: CREATED_AT,
      },
    ];
    const derived = buildDerivedNotificationCandidates(makeSource({ anomalies: [] }), CREATED_AT);

    const combined = combineNotifications(derived, persisted);

    assert.deepEqual(combined.slice(0, derived.length), derived);
    assert.deepEqual(combined.slice(derived.length), persisted);

    // With no derived alerts the persisted reference passes straight through.
    assert.strictEqual(combineNotifications([], persisted), persisted);
  });
});
