import type { AppNotification, Budget, Category, Goal, Transaction, User } from "@/types";
import { defaultUserPreferences, type UserPreferences } from "@/types";

/**
 * Empty finance state used before a snapshot succeeds, after logout, and
 * after a failed authenticated load. Mock seed data must never occupy this
 * slot — it would look like the signed-in user's account.
 */
export const placeholderFinanceUser: User = {
  id: "",
  name: "",
  email: "",
  phone: "",
  location: "",
  currency: "INR",
  avatarInitials: "",
  memberSince: "",
  occupation: "",
};

export interface EmptyFinanceState {
  user: User;
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  notifications: AppNotification[];
  categories: Category[];
  preferences: UserPreferences;
}

export function emptyFinanceState(): EmptyFinanceState {
  return {
    user: placeholderFinanceUser,
    transactions: [],
    budgets: [],
    goals: [],
    notifications: [],
    categories: [],
    preferences: { ...defaultUserPreferences },
  };
}

export type FinanceLoadStatus = "loading" | "ready" | "guest" | "error";

export function shouldLoadFinanceSnapshot(inApp: boolean): boolean {
  return inApp;
}

/**
 * Snapshot failures on public pages are expected (no session → 401).
 * Any other failure is an authenticated load problem and must not fall back
 * to mock financial data.
 */
export function classifyFinanceSnapshotFailure(error: unknown): "unauthenticated" | "failed" {
  if (error != null && typeof error === "object") {
    const record = error as { status?: unknown; statusCode?: unknown };
    const status = record.status ?? record.statusCode;
    if (status === 401) return "unauthenticated";
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("You must be signed in")) return "unauthenticated";
  return "failed";
}

export function financeStatusForSnapshotFailure(error: unknown): "guest" | "error" {
  return classifyFinanceSnapshotFailure(error) === "unauthenticated" ? "guest" : "error";
}
