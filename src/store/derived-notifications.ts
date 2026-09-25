/**
 * Derived (non-persisted) AI notifications.
 *
 * The architecture keeps two notification lanes:
 *   1. Durable notifications — rows in the `notifications` table, delivered
 *      through the FinanceSnapshot and mutated via the persistence layer.
 *   2. Derived notifications — generated client-side from SpendWise
 *      Intelligence (budget risks / anomalies), with deterministic ids keyed
 *      to the underlying entity so repeated computation never duplicates.
 *
 * The Stage 6.3 snapshot refetch *replaces* persisted state wholesale, so
 * derived notifications live in their own state lane (see finance.tsx) and
 * are re-combined for display. That gives them a deliberate lifecycle: they
 * survive refetches, keep their read state, and stay deleted once dismissed
 * (tracked via the dismissed-id set), without inventing a second persistence
 * system.
 *
 * All functions here are pure so the lifecycle can be unit-tested without
 * React or a database.
 */

import type { AnomalyResult, BudgetRiskResult } from "@/lib/ai";
import { resolveCategoryName } from "@/lib/category-labels";
import type { AppNotification, Category } from "@/types";

export interface DerivedNotificationSource {
  budgetRisks: BudgetRiskResult[];
  anomalies: AnomalyResult[];
  categories: Category[];
}

/**
 * Build the current candidate list from intelligence results. Ids are
 * deterministic functions of the underlying budget/anomaly identity and
 * severity, so the same condition always produces the same id.
 */
export function buildDerivedNotificationCandidates(
  source: DerivedNotificationSource,
  createdAt: string,
): AppNotification[] {
  const candidates: AppNotification[] = [];

  source.budgetRisks.forEach((risk) => {
    const name = resolveCategoryName(source.categories, risk.categoryId);

    if (risk.level === "critical") {
      candidates.push({
        id: `ai_budget_${risk.budgetId}_critical`,
        type: "budget_exceeded",
        title: `${name} budget exceeded`,
        message: risk.explanation,
        read: false,
        createdAt,
      });
    } else if (risk.level === "high") {
      candidates.push({
        id: `ai_budget_${risk.budgetId}_high`,
        type: "budget_warning",
        title: `${name} budget at risk`,
        message: risk.explanation,
        read: false,
        createdAt,
      });
    }
  });

  source.anomalies.forEach((anomaly) => {
    if (anomaly.severity === "high") {
      candidates.push({
        id: `ai_anomaly_${anomaly.id}`,
        type: "unusual_transaction",
        title: anomaly.title,
        message: anomaly.explanation,
        read: false,
        createdAt,
      });
    }
  });

  return candidates;
}

/**
 * Merge fresh candidates into the existing derived list. Already-present ids
 * keep their current state (including read flags), dismissed ids never come
 * back, and when nothing is new the original array reference is returned so
 * callers can skip a state update entirely.
 */
export function mergeDerivedNotifications(
  existing: AppNotification[],
  candidates: AppNotification[],
  dismissedIds: ReadonlySet<string>,
): AppNotification[] {
  const existingIds = new Set(existing.map((notification) => notification.id));
  const fresh = candidates.filter(
    (candidate) => !existingIds.has(candidate.id) && !dismissedIds.has(candidate.id),
  );
  if (fresh.length === 0) return existing;
  return [...fresh, ...existing];
}

/**
 * Display list: derived notifications first (they are the freshest alerts),
 * followed by the persisted ones exactly as the snapshot delivered them.
 * Persisted records are never modified here.
 */
export function combineNotifications(
  derived: AppNotification[],
  persisted: AppNotification[],
): AppNotification[] {
  if (derived.length === 0) return persisted;
  return [...derived, ...persisted];
}
