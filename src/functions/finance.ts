import { createServerFn } from "@tanstack/react-start";
import type { Budget, Goal, Transaction, User, UserPreferences } from "@/types";
import type { FinanceSnapshot } from "@/server/mappers";
import {
  loadFinanceSnapshot,
  persistCreateBudget,
  persistCreateGoal,
  persistCreateTransaction,
  persistDeleteBudget,
  persistDeleteGoal,
  persistDeleteNotification,
  persistDeleteTransaction,
  persistMarkAllNotificationsRead,
  persistPreferencesPatch,
  persistToggleNotification,
  persistUpdateBudget,
  persistUpdateGoal,
  persistUpdateTransaction,
  persistUserPatch,
  persistenceAvailable,
} from "@/server/persistence";

export interface FinanceSnapshotResponse {
  snapshot: FinanceSnapshot;
}

export const getFinanceSnapshotFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<FinanceSnapshotResponse> => {
    if (!persistenceAvailable()) throw new Error("Database persistence is not configured.");
    return { snapshot: await loadFinanceSnapshot() };
  },
);

function withDatabase<T>(fn: () => Promise<T>): Promise<T> {
  if (!persistenceAvailable()) {
    throw new Error("Database persistence is not configured.");
  }
  return fn();
}

export const persistUserFn = createServerFn({ method: "POST" })
  .validator((data: Partial<User>) => data)
  .handler(async ({ data }) => withDatabase(() => persistUserPatch(data)));

export const persistPreferencesFn = createServerFn({ method: "POST" })
  .validator((data: Partial<UserPreferences>) => data)
  .handler(async ({ data }) => withDatabase(() => persistPreferencesPatch(data)));

export const persistCreateTransactionFn = createServerFn({ method: "POST" })
  .validator((data: Omit<Transaction, "id" | "createdAt">) => data)
  .handler(async ({ data }) => withDatabase(() => persistCreateTransaction(data)));

export const persistUpdateTransactionFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; patch: Partial<Transaction> }) => data)
  .handler(async ({ data }) => withDatabase(() => persistUpdateTransaction(data.id, data.patch)));

export const persistDeleteTransactionFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => withDatabase(() => persistDeleteTransaction(data.id)));

export const persistCreateBudgetFn = createServerFn({ method: "POST" })
  .validator((data: Omit<Budget, "id" | "createdAt" | "spent">) => data)
  .handler(async ({ data }) => withDatabase(() => persistCreateBudget(data)));

export const persistUpdateBudgetFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; patch: Partial<Budget> }) => data)
  .handler(async ({ data }) => withDatabase(() => persistUpdateBudget(data.id, data.patch)));

export const persistDeleteBudgetFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => withDatabase(() => persistDeleteBudget(data.id)));

export const persistCreateGoalFn = createServerFn({ method: "POST" })
  .validator((data: Omit<Goal, "id" | "createdAt">) => data)
  .handler(async ({ data }) => withDatabase(() => persistCreateGoal(data)));

export const persistUpdateGoalFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; patch: Partial<Goal> }) => data)
  .handler(async ({ data }) => withDatabase(() => persistUpdateGoal(data.id, data.patch)));

export const persistDeleteGoalFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => withDatabase(() => persistDeleteGoal(data.id)));

export const persistToggleNotificationFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; currentlyRead: boolean }) => data)
  .handler(async ({ data }) =>
    withDatabase(() => persistToggleNotification(data.id, data.currentlyRead)),
  );

export const persistMarkAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () =>
  withDatabase(() => persistMarkAllNotificationsRead()),
);

export const persistDeleteNotificationFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => withDatabase(() => persistDeleteNotification(data.id)));
