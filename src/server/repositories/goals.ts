import { and, eq } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { goals } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { NotFoundError } from "../errors";
import db from "../db";
import { assertPositiveMoney, assertDateString, assertRequiredText } from "../validation";

export type GoalRecord = InferSelectModel<typeof goals>;
export type GoalInsert = InferInsertModel<typeof goals>;

export async function listGoalsForUser(userId: string): Promise<GoalRecord[]> {
  const currentUserId = resolveUserId(userId);

  return db.select().from(goals).where(eq(goals.userId, currentUserId));
}

export async function getGoalForUser(userId: string, goalId: string): Promise<GoalRecord> {
  const currentUserId = resolveUserId(userId);

  const rows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, currentUserId)))
    .limit(1);

  if (!rows[0]) {
    throw new NotFoundError("Goal not found.");
  }

  return rows[0];
}

export async function createGoal(input: {
  userId: string;
  name: string;
  targetAmount: number | string;
  currentAmount?: number | string;
  targetDate: string;
  status?: "active" | "paused" | "completed";
  note?: string | null;
}): Promise<GoalRecord> {
  const currentUserId = resolveUserId(input.userId);
  const name = assertRequiredText(input.name, "name");
  const targetAmount = assertPositiveMoney(input.targetAmount, "targetAmount");
  const currentAmount = input.currentAmount !== undefined ? Math.max(0, Number(input.currentAmount)) : 0;
  const targetDate = assertDateString(input.targetDate, "targetDate");

  const [created] = await db
    .insert(goals)
    .values({
      userId: currentUserId,
      name,
      targetAmount: targetAmount.toFixed(2),
      currentAmount: currentAmount.toFixed(2),
      targetDate,
      status: input.status ?? "active",
      note: input.note?.trim() || null,
    })
    .returning();

  if (!created) {
    throw new Error("Goal could not be created.");
  }

  return created;
}

export async function updateGoal(
  userId: string,
  goalId: string,
  patch: Partial<{ name: string; targetAmount: number | string; currentAmount: number | string; targetDate: string; status: "active" | "paused" | "completed"; note: string | null }>,
): Promise<GoalRecord> {
  const currentUserId = resolveUserId(userId);
  const existing = await getGoalForUser(currentUserId, goalId);

  const next = {
    name: patch.name !== undefined ? assertRequiredText(patch.name, "name") : existing.name,
    targetAmount:
      patch.targetAmount !== undefined ? assertPositiveMoney(patch.targetAmount, "targetAmount") : existing.targetAmount,
    currentAmount:
      patch.currentAmount !== undefined ? Math.max(0, Number(patch.currentAmount)) : existing.currentAmount,
    targetDate: patch.targetDate !== undefined ? assertDateString(patch.targetDate, "targetDate") : existing.targetDate,
    status: patch.status ?? existing.status,
    note: patch.note !== undefined ? patch.note?.trim() || null : existing.note,
  };

  const [updated] = await db
    .update(goals)
    .set({
      ...next,
      targetAmount: next.targetAmount.toString(),
      currentAmount: next.currentAmount.toString(),
      updatedAt: new Date(),
    })
    .where(and(eq(goals.id, goalId), eq(goals.userId, currentUserId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Goal not found.");
  }

  return updated;
}

export async function deleteGoal(userId: string, goalId: string): Promise<boolean> {
  const currentUserId = resolveUserId(userId);

  const result = await db
    .delete(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, currentUserId)))
    .returning({ id: goals.id });

  return result.length > 0;
}
