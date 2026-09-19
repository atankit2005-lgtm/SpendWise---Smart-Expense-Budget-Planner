import { and, eq, gte, sql } from "drizzle-orm";

import { budgets, transactions } from "../../../db/schema";
import { resolveUserId } from "../auth";
import db from "../db";

export async function deriveBudgetSpentForUser(
  userId: string,
  categoryId: string,
  _period: "weekly" | "monthly" | "yearly",
  startDate: string,
): Promise<number> {
  const currentUserId = resolveUserId(userId);

  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, currentUserId),
        eq(transactions.categoryId, categoryId),
        eq(transactions.type, "expense"),
        gte(transactions.occurredOn, startDate),
      ),
    );

  const total = rows[0]?.total ?? 0;
  return Number(total);
}

export async function listBudgetProgressForUser(userId: string): Promise<Array<{
  budgetId: string;
  categoryId: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  utilisation: number;
  period: "weekly" | "monthly" | "yearly";
}>> {
  const currentUserId = resolveUserId(userId);

  const rows = await db.select().from(budgets).where(eq(budgets.userId, currentUserId));

  const result = await Promise.all(
    rows.map(async (budget) => {
      const spent = await deriveBudgetSpentForUser(currentUserId, budget.categoryId, budget.period, budget.startDate);
      const limitAmount = Number(budget.limitAmount);
      return {
        budgetId: budget.id,
        categoryId: budget.categoryId,
        limitAmount,
        spent,
        remaining: limitAmount - spent,
        utilisation: limitAmount > 0 ? (spent / limitAmount) * 100 : 0,
        period: budget.period,
      };
    }),
  );

  return result;
}
