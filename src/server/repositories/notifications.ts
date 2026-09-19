import { and, eq } from "drizzle-orm";
import { type InferInsertModel, type InferSelectModel } from "drizzle-orm";

import { notifications } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { NotFoundError } from "../errors";
import db from "../db";
import { assertRequiredText } from "../validation";

export type NotificationRecord = InferSelectModel<typeof notifications>;
export type NotificationInsert = InferInsertModel<typeof notifications>;

export async function listNotificationsForUser(userId: string): Promise<NotificationRecord[]> {
  const currentUserId = resolveUserId(userId);

  return db.select().from(notifications).where(eq(notifications.userId, currentUserId));
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<NotificationRecord> {
  const currentUserId = resolveUserId(userId);

  const [updated] = await db
    .update(notifications)
    .set({
      readAt: new Date(),
    })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, currentUserId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Notification not found.");
  }

  return updated;
}

export async function markNotificationUnread(userId: string, notificationId: string): Promise<NotificationRecord> {
  const currentUserId = resolveUserId(userId);

  const [updated] = await db
    .update(notifications)
    .set({
      readAt: null,
    })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, currentUserId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Notification not found.");
  }

  return updated;
}

export async function createNotification(input: {
  userId: string;
  type: "budget_warning" | "budget_exceeded" | "unusual_transaction" | "goal_progress" | "insight";
  title: string;
  message: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}): Promise<NotificationRecord> {
  const currentUserId = resolveUserId(input.userId);
  const title = assertRequiredText(input.title, "title");
  const message = assertRequiredText(input.message, "message");

  const [created] = await db
    .insert(notifications)
    .values({
      userId: currentUserId,
      type: input.type,
      title,
      message,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      readAt: null,
    })
    .returning();

  if (!created) {
    throw new Error("Notification could not be created.");
  }

  return created;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const currentUserId = resolveUserId(userId);

  const result = await db
    .update(notifications)
    .set({
      readAt: new Date(),
    })
    .where(eq(notifications.userId, currentUserId))
    .returning({ id: notifications.id });

  return result.length;
}

export async function deleteNotification(userId: string, notificationId: string): Promise<boolean> {
  const currentUserId = resolveUserId(userId);

  const result = await db
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, currentUserId)))
    .returning({ id: notifications.id });

  return result.length > 0;
}
