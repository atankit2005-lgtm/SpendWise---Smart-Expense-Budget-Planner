import { sql } from "drizzle-orm";

import { transactions } from "../../../db/schema";
import db from "../db";
import { resolveUserId } from "../auth";

export async function getCurrentMonthSummaryForUser(userId: string): Promise<{
  income: number;
  expenses: number;
  savings: number;
  balance: number;
}> {
  const currentUserId = resolveUserId(userId);

  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount::numeric ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount::numeric ELSE 0 END), 0) AS expenses
    FROM ${transactions}
    WHERE ${transactions.userId} = ${currentUserId}
      AND ${transactions.occurredOn} >= date_trunc('month', CURRENT_DATE)
      AND ${transactions.occurredOn} < date_trunc('month', CURRENT_DATE) + interval '1 month'
  `);

  const summary = rows[0] as { income?: string | number | null; expenses?: string | number | null } | undefined;
  const income = Number(summary?.income ?? 0);
  const expenses = Number(summary?.expenses ?? 0);

  return {
    income,
    expenses,
    savings: income - expenses,
    balance: income - expenses,
  };
}
