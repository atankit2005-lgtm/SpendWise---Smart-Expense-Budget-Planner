import { eq } from "drizzle-orm";

import { users } from "../../db/schema";
import type { Budget, Goal, Transaction, User } from "@/types";
import { NotFoundError } from "./errors";
import db, { isDatabaseConfigured } from "./db";
import {
  toBudget,
  toCategory,
  toDbPaymentMethod,
  toGoal,
  toNotification,
  toTransaction,
  toUser,
  type FinanceSnapshot,
} from "./mappers";
import {
  createBudget,
  deleteBudget as deleteBudgetRecord,
  listBudgetsForUser,
  updateBudget as updateBudgetRecord,
} from "./repositories/budgets";
import { getCategoryForUser, listCategoriesForUser } from "./repositories/categories";
import {
  createGoal,
  deleteGoal as deleteGoalRecord,
  listGoalsForUser,
  updateGoal as updateGoalRecord,
} from "./repositories/goals";
import {
  deleteNotification as deleteNotificationRecord,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "./repositories/notifications";
import {
  createTransaction,
  deleteTransaction as deleteTransactionRecord,
  listTransactionsForUser,
  updateTransaction as updateTransactionRecord,
} from "./repositories/transactions";
import { getUserById } from "./repositories/users";
import { requireSessionUserId } from "./authentication";
import { publishPersistenceEvent } from "./realtime/publish";

export function persistenceAvailable(): boolean {
  return isDatabaseConfigured();
}

export async function loadFinanceSnapshot(): Promise<FinanceSnapshot> {
  const userId = await requireSessionUserId();

  const [user, categoryRows, transactionRows, budgetRows, goalRows, notificationRows] = await Promise.all([
    getUserById(userId),
    listCategoriesForUser(userId),
    listTransactionsForUser(userId),
    listBudgetsForUser(userId),
    listGoalsForUser(userId),
    listNotificationsForUser(userId),
  ]);

  return {
    user: toUser(user),
    categories: categoryRows.map(toCategory),
    transactions: transactionRows.map(toTransaction),
    budgets: budgetRows.map(toBudget),
    goals: goalRows.map(toGoal),
    notifications: notificationRows.map(toNotification),
  };
}

async function requireUserId(): Promise<string> {
  return requireSessionUserId();
}

export async function persistUserPatch(patch: Partial<User>): Promise<User> {
  const userId = await requireUserId();
  const existing = await getUserById(userId);

  const [updated] = await db
    .update(users)
    .set({
      name: patch.name ?? existing.name,
      email: patch.email ?? existing.email,
      phone: patch.phone ?? existing.phone,
      location: patch.location ?? existing.location,
      occupation: patch.occupation ?? existing.occupation,
      currency: patch.currency ?? existing.currency,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw new NotFoundError("User not found.");
  publishPersistenceEvent(userId, "finance.snapshot.invalidated");
  return toUser(updated);
}

export async function persistCreateTransaction(input: Omit<Transaction, "id" | "createdAt">): Promise<Transaction> {
  const userId = await requireUserId();
  await getCategoryForUser(userId, input.categoryId);

  const created = await createTransaction({
    userId,
    categoryId: input.categoryId,
    amount: input.amount,
    type: input.type,
    description: input.description,
    paymentMethod: toDbPaymentMethod(input.paymentMethod),
    occurredOn: input.date,
    notes: input.notes ?? null,
  });

  publishPersistenceEvent(userId, "transaction.changed");
  return toTransaction(created);
}

export async function persistUpdateTransaction(id: string, patch: Partial<Transaction>): Promise<Transaction> {
  const userId = await requireUserId();
  if (patch.categoryId) {
    await getCategoryForUser(userId, patch.categoryId);
  }

  const updated = await updateTransactionRecord(userId, id, {
    ...(patch.categoryId ? { categoryId: patch.categoryId } : {}),
    ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
    ...(patch.type ? { type: patch.type } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.paymentMethod ? { paymentMethod: toDbPaymentMethod(patch.paymentMethod) } : {}),
    ...(patch.date ? { occurredOn: patch.date } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
  });

  publishPersistenceEvent(userId, "transaction.changed");
  return toTransaction(updated);
}

export async function persistDeleteTransaction(id: string): Promise<boolean> {
  const userId = await requireUserId();
  const deleted = await deleteTransactionRecord(userId, id);
  if (deleted) publishPersistenceEvent(userId, "transaction.changed");
  return deleted;
}

export async function persistCreateBudget(input: Omit<Budget, "id" | "createdAt" | "spent">): Promise<Budget> {
  const userId = await requireUserId();
  await getCategoryForUser(userId, input.categoryId);

  const created = await createBudget({
    userId,
    categoryId: input.categoryId,
    limitAmount: input.limit,
    period: input.period,
    startDate: input.startDate,
  });

  publishPersistenceEvent(userId, "budget.changed");
  return toBudget(created);
}

export async function persistUpdateBudget(id: string, patch: Partial<Budget>): Promise<Budget> {
  const userId = await requireUserId();
  if (patch.categoryId) {
    await getCategoryForUser(userId, patch.categoryId);
  }

  const updated = await updateBudgetRecord(userId, id, {
    ...(patch.categoryId ? { categoryId: patch.categoryId } : {}),
    ...(patch.limit !== undefined ? { limitAmount: patch.limit } : {}),
    ...(patch.period ? { period: patch.period } : {}),
    ...(patch.startDate ? { startDate: patch.startDate } : {}),
  });

  publishPersistenceEvent(userId, "budget.changed");
  return toBudget(updated);
}

export async function persistDeleteBudget(id: string): Promise<boolean> {
  const userId = await requireUserId();
  const deleted = await deleteBudgetRecord(userId, id);
  if (deleted) publishPersistenceEvent(userId, "budget.changed");
  return deleted;
}

export async function persistCreateGoal(input: Omit<Goal, "id" | "createdAt">): Promise<Goal> {
  const userId = await requireUserId();
  const created = await createGoal({
    userId,
    name: input.name,
    targetAmount: input.targetAmount,
    currentAmount: input.currentAmount,
    targetDate: input.targetDate,
    status: input.status,
    note: input.note ?? null,
  });
  publishPersistenceEvent(userId, "goal.changed");
  return toGoal(created);
}

export async function persistUpdateGoal(id: string, patch: Partial<Goal>): Promise<Goal> {
  const userId = await requireUserId();
  const updated = await updateGoalRecord(userId, id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.targetAmount !== undefined ? { targetAmount: patch.targetAmount } : {}),
    ...(patch.currentAmount !== undefined ? { currentAmount: patch.currentAmount } : {}),
    ...(patch.targetDate ? { targetDate: patch.targetDate } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.note !== undefined ? { note: patch.note ?? null } : {}),
  });
  publishPersistenceEvent(userId, "goal.changed");
  return toGoal(updated);
}

export async function persistDeleteGoal(id: string): Promise<boolean> {
  const userId = await requireUserId();
  const deleted = await deleteGoalRecord(userId, id);
  if (deleted) publishPersistenceEvent(userId, "goal.changed");
  return deleted;
}

export async function persistToggleNotification(id: string, currentlyRead: boolean) {
  const userId = await requireUserId();
  const updated = currentlyRead
    ? await markNotificationUnread(userId, id)
    : await markNotificationRead(userId, id);
  publishPersistenceEvent(userId, "notification.changed");
  return toNotification(updated);
}

export async function persistMarkAllNotificationsRead() {
  const userId = await requireUserId();
  await markAllNotificationsRead(userId);
  publishPersistenceEvent(userId, "notification.changed");
}

export async function persistDeleteNotification(id: string): Promise<boolean> {
  const userId = await requireUserId();
  const deleted = await deleteNotificationRecord(userId, id);
  if (deleted) publishPersistenceEvent(userId, "notification.changed");
  return deleted;
}
