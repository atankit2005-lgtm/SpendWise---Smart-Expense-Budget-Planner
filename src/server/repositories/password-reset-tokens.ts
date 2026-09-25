import { and, eq, gt } from "drizzle-orm";
import { type InferSelectModel } from "drizzle-orm";

import { passwordResetTokens } from "../../../db/schema";
import { resolveUserId } from "../auth";
import type { PasswordResetTokenHash } from "../password-reset-token";
import type { SpendWiseDatabase } from "../db";

export type PasswordResetTokenRecord = InferSelectModel<typeof passwordResetTokens>;
export type PasswordResetTokenExecutor = Pick<SpendWiseDatabase, "delete" | "insert">;

/**
 * Replace the user's outstanding token inside the caller's transaction.
 * The per-user unique index protects the one-token invariant under concurrency.
 */
export async function replacePasswordResetToken(
  userId: string,
  tokenHash: PasswordResetTokenHash,
  expiresAt: Date,
  executor: PasswordResetTokenExecutor,
): Promise<PasswordResetTokenRecord> {
  const currentUserId = resolveUserId(userId);

  await executor.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, currentUserId));

  const [created] = await executor
    .insert(passwordResetTokens)
    .values({ userId: currentUserId, tokenHash, expiresAt })
    .returning();

  if (!created) {
    throw new Error("Password reset token could not be created.");
  }

  return created;
}

/**
 * Atomically consume a token only while it is unexpired. Call inside the same
 * transaction as the password update and session revocation.
 */
export async function consumePasswordResetToken(
  tokenHash: PasswordResetTokenHash,
  now: Date,
  executor: Pick<SpendWiseDatabase, "delete">,
): Promise<PasswordResetTokenRecord | null> {
  const rows = await executor
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), gt(passwordResetTokens.expiresAt, now)))
    .returning();

  return rows[0] ?? null;
}
