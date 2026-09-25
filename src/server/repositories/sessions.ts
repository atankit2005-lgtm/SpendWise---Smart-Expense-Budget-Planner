import { eq } from "drizzle-orm";

import { sessions } from "../../../db/schema";
import { resolveUserId } from "../auth";
import type { SpendWiseDatabase } from "../db";

export async function revokeAllSessionsForUser(
  userId: string,
  executor: Pick<SpendWiseDatabase, "delete">,
): Promise<number> {
  const currentUserId = resolveUserId(userId);
  const deleted = await executor
    .delete(sessions)
    .where(eq(sessions.userId, currentUserId))
    .returning({ id: sessions.id });

  return deleted.length;
}
