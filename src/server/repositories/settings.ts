import { eq } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { userSettings } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { NotFoundError } from "../errors";
import db from "../db";

export type UserSettingsRecord = InferSelectModel<typeof userSettings>;
export type UserSettingsInsert = InferInsertModel<typeof userSettings>;

export async function getSettingsForUser(userId: string): Promise<UserSettingsRecord> {
  const currentUserId = resolveUserId(userId);

  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, currentUserId)).limit(1);

  if (!rows[0]) {
    throw new NotFoundError("User settings not found.");
  }

  return rows[0];
}

export async function upsertSettings(
  userId: string,
  patch: Partial<Omit<UserSettingsInsert, "userId">>,
): Promise<UserSettingsRecord> {
  const currentUserId = resolveUserId(userId);

  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, currentUserId))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(userSettings)
      .set({
        ...existing[0],
        ...patch,
      })
      .where(eq(userSettings.userId, currentUserId))
      .returning();

    if (!updated) {
      throw new NotFoundError("User settings not found.");
    }

    return updated;
  }

  const [created] = await db
    .insert(userSettings)
    .values({
      userId: currentUserId,
      ...patch,
    })
    .returning();

  if (!created) {
    throw new Error("User settings could not be created.");
  }

  return created;
}
