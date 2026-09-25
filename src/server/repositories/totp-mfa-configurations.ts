import { and, eq, isNull, lt, or, type InferSelectModel } from "drizzle-orm";

import { pendingTotpMfaEnrollments, totpMfaConfigurations } from "../../../db/schema";
import { resolveUserId } from "../auth";
import type { SpendWiseDatabase } from "../db";
import { validateEncryptedTotpSecret, type EncryptedTotpSecret } from "../totp-crypto";

export type TotpMfaConfigurationRecord = InferSelectModel<typeof totpMfaConfigurations>;
export type TotpMfaConfigurationExecutor = Pick<
  SpendWiseDatabase,
  "delete" | "insert" | "select" | "update"
>;

export async function getTotpMfaConfiguration(
  userId: string,
  executor: Pick<SpendWiseDatabase, "select">,
): Promise<TotpMfaConfigurationRecord | null> {
  const currentUserId = resolveUserId(userId);
  const [record] = await executor
    .select()
    .from(totpMfaConfigurations)
    .where(eq(totpMfaConfigurations.userId, currentUserId))
    .limit(1);
  return record ?? null;
}

/** Activate only from a caller-owned transaction shared with its proof/consumption step. */
export async function activateTotpMfa(
  userId: string,
  input: { secret: EncryptedTotpSecret; activatedAt?: Date },
  executor: TotpMfaConfigurationExecutor,
): Promise<TotpMfaConfigurationRecord> {
  const currentUserId = resolveUserId(userId);
  const activatedAt = input.activatedAt ?? new Date();
  if (!Number.isFinite(activatedAt.getTime()))
    throw new RangeError("A valid activation time is required.");
  validateEncryptedTotpSecret(input.secret);

  await executor
    .delete(pendingTotpMfaEnrollments)
    .where(eq(pendingTotpMfaEnrollments.userId, currentUserId));

  const [record] = await executor
    .insert(totpMfaConfigurations)
    .values({
      userId: currentUserId,
      encryptedSecret: input.secret.ciphertext,
      encryptionKeyId: input.secret.keyId,
      lastAcceptedStep: null,
      createdAt: activatedAt,
      updatedAt: activatedAt,
    })
    .onConflictDoUpdate({
      target: totpMfaConfigurations.userId,
      set: {
        encryptedSecret: input.secret.ciphertext,
        encryptionKeyId: input.secret.keyId,
        lastAcceptedStep: null,
        createdAt: activatedAt,
        updatedAt: activatedAt,
      },
    })
    .returning();

  if (!record) throw new Error("TOTP MFA configuration could not be activated.");
  return record;
}

/** Accepts a counter only if it strictly advances the user's replay watermark. */
export async function advanceAcceptedTotpStep(
  userId: string,
  step: number,
  acceptedAt: Date,
  executor: Pick<SpendWiseDatabase, "update">,
): Promise<TotpMfaConfigurationRecord | null> {
  const currentUserId = resolveUserId(userId);
  if (!Number.isSafeInteger(step) || step < 0)
    throw new RangeError("TOTP step must be a nonnegative safe integer.");
  if (!Number.isFinite(acceptedAt.getTime()))
    throw new RangeError("A valid acceptance time is required.");

  const [updated] = await executor
    .update(totpMfaConfigurations)
    .set({ lastAcceptedStep: step, updatedAt: acceptedAt })
    .where(
      and(
        eq(totpMfaConfigurations.userId, currentUserId),
        or(
          isNull(totpMfaConfigurations.lastAcceptedStep),
          lt(totpMfaConfigurations.lastAcceptedStep, step),
        ),
      ),
    )
    .returning();

  return updated ?? null;
}
