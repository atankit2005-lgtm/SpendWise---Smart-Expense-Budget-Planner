import { and, eq, gt, type InferSelectModel } from "drizzle-orm";

import { pendingTotpMfaEnrollments } from "../../../db/schema";
import { resolveUserId } from "../auth";
import type { SpendWiseDatabase } from "../db";
import { validateEncryptedTotpSecret, type EncryptedTotpSecret } from "../totp-crypto";

export type PendingTotpMfaEnrollmentRecord = InferSelectModel<typeof pendingTotpMfaEnrollments>;
export type PendingTotpMfaEnrollmentExecutor = Pick<
  SpendWiseDatabase,
  "delete" | "insert" | "select"
>;

/** Replace a user's pending setup atomically when called in the caller's transaction. */
export async function replacePendingTotpMfaEnrollment(
  userId: string,
  input: { secret: EncryptedTotpSecret; expiresAt: Date; createdAt?: Date },
  executor: Pick<SpendWiseDatabase, "delete" | "insert">,
): Promise<PendingTotpMfaEnrollmentRecord> {
  const currentUserId = resolveUserId(userId);
  const createdAt = input.createdAt ?? new Date();
  validateEncryptedTotpSecret(input.secret);
  if (
    !Number.isFinite(createdAt.getTime()) ||
    !Number.isFinite(input.expiresAt.getTime()) ||
    input.expiresAt.getTime() <= createdAt.getTime()
  ) {
    throw new RangeError("Pending TOTP enrollment expiry must be after its creation time.");
  }

  await executor
    .delete(pendingTotpMfaEnrollments)
    .where(eq(pendingTotpMfaEnrollments.userId, currentUserId));

  const [record] = await executor
    .insert(pendingTotpMfaEnrollments)
    .values({
      userId: currentUserId,
      encryptedSecret: input.secret.ciphertext,
      encryptionKeyId: input.secret.keyId,
      expiresAt: input.expiresAt,
      createdAt,
    })
    .returning();

  if (!record) throw new Error("Pending TOTP enrollment could not be created.");
  return record;
}

export async function getUnexpiredPendingTotpMfaEnrollment(
  userId: string,
  now: Date,
  executor: Pick<SpendWiseDatabase, "select">,
): Promise<PendingTotpMfaEnrollmentRecord | null> {
  const currentUserId = resolveUserId(userId);
  const [record] = await executor
    .select()
    .from(pendingTotpMfaEnrollments)
    .where(
      and(
        eq(pendingTotpMfaEnrollments.userId, currentUserId),
        gt(pendingTotpMfaEnrollments.expiresAt, now),
      ),
    )
    .limit(1);
  return record ?? null;
}
