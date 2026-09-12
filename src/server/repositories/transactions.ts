import { and, eq, sql } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { transactions } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { NotFoundError, ValidationError } from "../errors";
import db from "../db";
import { assertPositiveMoney, assertRequiredText, assertDateString } from "../validation";

export type TransactionRecord = InferSelectModel<typeof transactions>;
export type TransactionInsert = InferInsertModel<typeof transactions>;

export async function listTransactionsForUser(userId: string): Promise<TransactionRecord[]> {
  const currentUserId = resolveUserId(userId);

  return db.select().from(transactions).where(eq(transactions.userId, currentUserId));
}

export async function getTransactionForUser(userId: string, transactionId: string): Promise<TransactionRecord> {
  const currentUserId = resolveUserId(userId);

  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, currentUserId)))
    .limit(1);

  if (!rows[0]) {
    throw new NotFoundError("Transaction not found.");
  }

  return rows[0];
}

export async function createTransaction(input: {
  userId: string;
  categoryId: string;
  amount: number | string;
  type: "income" | "expense";
  description: string;
  paymentMethod?: "upi" | "credit_card" | "debit_card" | "cash" | "net_banking" | null;
  occurredOn: string;
  notes?: string | null;
}): Promise<TransactionRecord> {
  const currentUserId = resolveUserId(input.userId);
  const amount = assertPositiveMoney(input.amount, "amount");
  const description = assertRequiredText(input.description, "description");
  const occurredOn = assertDateString(input.occurredOn, "occurredOn");

  const [created] = await db
    .insert(transactions)
    .values({
      userId: currentUserId,
      categoryId: input.categoryId,
      amount: amount.toFixed(2),
      type: input.type,
      description,
      paymentMethod: input.paymentMethod ?? null,
      occurredOn,
      notes: input.notes?.trim() || null,
    })
    .returning();

  if (!created) {
    throw new Error("Transaction could not be created.");
  }

  return created;
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  patch: Partial<{
    categoryId: string;
    amount: number | string;
    type: "income" | "expense";
    description: string;
    paymentMethod: "upi" | "credit_card" | "debit_card" | "cash" | "net_banking" | null;
    occurredOn: string;
    notes: string | null;
  }>,
): Promise<TransactionRecord> {
  const currentUserId = resolveUserId(userId);
  const existing = await getTransactionForUser(currentUserId, transactionId);

  const next = {
    categoryId: patch.categoryId ?? existing.categoryId,
    amount: patch.amount !== undefined ? assertPositiveMoney(patch.amount, "amount") : existing.amount,
    type: patch.type ?? existing.type,
    description: patch.description !== undefined ? assertRequiredText(patch.description, "description") : existing.description,
    paymentMethod: patch.paymentMethod !== undefined ? patch.paymentMethod : existing.paymentMethod,
    occurredOn: patch.occurredOn !== undefined ? assertDateString(patch.occurredOn, "occurredOn") : existing.occurredOn,
    notes: patch.notes !== undefined ? patch.notes?.trim() || null : existing.notes,
  };

  const [updated] = await db
    .update(transactions)
    .set({
      ...next,
      amount: next.amount.toString(),
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, currentUserId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Transaction not found.");
  }

  return updated;
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<boolean> {
  const currentUserId = resolveUserId(userId);

  const result = await db
    .delete(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, currentUserId)))
    .returning({ id: transactions.id });

  return result.length > 0;
}

export async function getMonthlySummaryForUser(userId: string): Promise<{
  income: string;
  expenses: string;
  savings: string;
  balance: string;
}> {
  const currentUserId = resolveUserId(userId);

  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' AND occurred_on >= date_trunc('month', CURRENT_DATE) THEN amount::numeric ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' AND occurred_on >= date_trunc('month', CURRENT_DATE) THEN amount::numeric ELSE 0 END), 0) AS expenses
    FROM ${transactions}
    WHERE ${transactions.userId} = ${currentUserId}
  ` as never);

  const summary = rows[0] as { income?: string | number | null; expenses?: string | number | null } | undefined;

  const income = Number(summary?.income ?? 0);
  const expenses = Number(summary?.expenses ?? 0);

  return {
    income: income.toFixed(2),
    expenses: expenses.toFixed(2),
    savings: (income - expenses).toFixed(2),
    balance: (income - expenses).toFixed(2),
  };
}
