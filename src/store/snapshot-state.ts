/**
 * Pure mapping from an authoritative server `FinanceSnapshot` to the base
 * state FinanceProvider holds. Extracted so both the initial authenticated
 * load and Stage 6.3 realtime resynchronization apply snapshots through the
 * exact same path.
 *
 * Replacement semantics (never merge) are what guarantee convergence across
 * tabs: optimistic records with temporary ids and stale rows disappear, and
 * every persisted record appears exactly once. `spent` is zeroed because
 * budget spending is always re-derived from transactions by the Stage 3
 * financial engine — it is never carried as base state.
 */

import type { FinanceSnapshot } from "@/server/mappers";
import type { AppNotification, Budget, Category, Goal, Transaction, User } from "@/types";

export interface FinanceSnapshotState {
  user: User;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  notifications: AppNotification[];
}

export function snapshotToState(snapshot: FinanceSnapshot): FinanceSnapshotState {
  return {
    user: snapshot.user,
    categories: snapshot.categories,
    transactions: snapshot.transactions,
    budgets: snapshot.budgets.map((budget) => ({ ...budget, spent: 0 })),
    goals: snapshot.goals,
    notifications: snapshot.notifications,
  };
}
