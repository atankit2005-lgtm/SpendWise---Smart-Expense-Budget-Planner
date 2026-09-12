import { and, eq, sql } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { budgets, transactions } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { NotFoundError } from "../errors";
import db from "../db";
import { assertPositiveMoney, assertDateString } from "../validation";

export type BudgetRecord = InferSelectModel<typeof budgets>;
export type BudgetInsert = InferInsertModel<typeof budgets>;

export async function listBudgetsForUser(userId: string): Promise<BudgetRecord[]> {
  const currentUserId = resolveUserId(userId);

  return db.select().from(budgets).where(eq(budgets.userId, currentUserId));
}

export async function getBudgetForUser(userId: string, budgetId: string): Promise<BudgetRecord> {
  const currentUserId = resolveUserId(userId);

  const rows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.userId, currentUserId)))
    .limit(1);

  if (!rows[0]) {
    throw new NotFoundError("Budget not found.");
  }

  return rows[0];
}

export async function createBudget(input: {
  userId: string;
  categoryId: string;
  limitAmount: number | string;
  period: "weekly" | "monthly" | "yearly";
  startDate: string;
}): Promise<BudgetRecord> {
  const currentUserId = resolveUserId(input.userId);
  const limitAmount = assertPositiveMoney(input.limitAmount, "limitAmount");
  const startDate = assertDateString(input.startDate, "startDate");

  const [created] = await db
    .insert(budgets)
    .values({
      userId: currentUserId,
      categoryId: input.categoryId,
      limitAmount: limitAmount.toFixed(2),
      period: input.period,
      startDate,
    })
    .returning();

  if (!created) {
    throw new Error("Budget could not be created.");
  }

  return created;
}

export async function updateBudget(
  userId: string,
  budgetId: string,
  patch: Partial<{ categoryId: string; limitAmount: number | string; period: "weekly" | "monthly" | "yearly"; startDate: string }>,
): Promise<BudgetRecord> {
  const currentUserId = resolveUserId(userId);
  const existing = await getBudgetForUser(currentUserId, budgetId);

  const next = {
    categoryId: patch.categoryId ?? existing.categoryId,
    limitAmount:
      patch.limitAmount !== undefined ? assertPositiveMoney(patch.limitAmount, "limitAmount") : existing.limitAmount,
    period: patch.period ?? existing.period,
    startDate: patch.startDate !== undefined ? assertDateString(patch.startDate, "startDate") : existing.startDate,
  };

  const [updated] = await db
    .update(budgets)
    .set({
      ...next,
      limitAmount: next.limitAmount.toString(),
      updatedAt: new Date(),
    })
    .where(and(eq(budgets.id, budgetId), eq(budgets.userId, currentUserId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Budget not found.");
  }

  return updated;
}

export async function deleteBudget(userId: string, budgetId: string): Promise<boolean> {
  const currentUserId = resolveUserId(userId);

  const result = await db
    .delete(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.userId, currentUserId)))
    .returning({ id: budgets.id });

  return result.length > 0;
}

export async function getBudgetSpentForCategory(
  userId: string,
  categoryId: string,
  period: "weekly" | "monthly" | "yearly",
  startDate: string,
): Promise<string> {
  const currentUserId = resolveUserId(userId);

  const rows: Array<{ total: string | number | null }> = await db.execute(
    sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM ${transactions}
      WHERE ${transactions.userId} = ${currentUserId}
        AND ${transactions.categoryId} = ${categoryId}
        AND ${transactions.type} = 'expense'
        AND ${transactions.occurredOn} >= ${startDate}
    `,
  );

  const total = Number(rows[0]?.total ?? 0);
  return total.toFixed(2);
}
