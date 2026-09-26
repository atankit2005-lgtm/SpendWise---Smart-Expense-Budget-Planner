import { and, eq, gt, isNull, lt, sql, type InferSelectModel } from "drizzle-orm";

import { totpMfaLoginChallenges } from "../../../db/schema";
import { resolveUserId } from "../auth";
import type { SpendWiseDatabase } from "../db";
import type { MfaDigest } from "../mfa-digests";

export type TotpMfaLoginChallengeRecord = InferSelectModel<typeof totpMfaLoginChallenges>;
export type TotpMfaLoginChallengeExecutor = Pick<
  SpendWiseDatabase,
  "delete" | "insert" | "select" | "update"
>;

/** Create a new login challenge for a user. */
export async function createTotpMfaLoginChallenge(
  userId: string,
  input: { digest: MfaDigest; expiresAt: Date; createdAt?: Date },
  executor: Pick<SpendWiseDatabase, "insert">,
): Promise<TotpMfaLoginChallengeRecord> {
  const currentUserId = resolveUserId(userId);
  const createdAt = input.createdAt ?? new Date();
  if (
    !Number.isFinite(createdAt.getTime()) ||
    !Number.isFinite(input.expiresAt.getTime()) ||
    input.expiresAt.getTime() <= createdAt.getTime()
  ) {
    throw new RangeError("MFA login challenge expiry must be after its creation time.");
  }

  const [record] = await executor
    .insert(totpMfaLoginChallenges)
    .values({
      userId: currentUserId,
      digest: input.digest,
      expiresAt: input.expiresAt,
      attempts: 0,
      createdAt,
    })
    .returning();

  if (!record) throw new Error("MFA login challenge could not be created.");
  return record;
}

/** Fetch an unexpired, unconsumed challenge by its digest. */
export async function getUnconsumedTotpMfaLoginChallenge(
  digest: MfaDigest,
  now: Date,
  executor: Pick<SpendWiseDatabase, "select">,
): Promise<TotpMfaLoginChallengeRecord | null> {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid challenge lookup time is required.");

  const [record] = await executor
    .select()
    .from(totpMfaLoginChallenges)
    .where(
      and(
        eq(totpMfaLoginChallenges.digest, digest),
        gt(totpMfaLoginChallenges.expiresAt, now),
        isNull(totpMfaLoginChallenges.consumedAt),
      ),
    )
    .limit(1);
  return record ?? null;
}

/** Lock and fetch a challenge for atomic consumption in a transaction. */
export async function lockUnconsumedTotpMfaLoginChallenge(
  digest: MfaDigest,
  now: Date,
  executor: Pick<SpendWiseDatabase, "select">,
): Promise<TotpMfaLoginChallengeRecord | null> {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid challenge lookup time is required.");

  const [record] = await executor
    .select()
    .from(totpMfaLoginChallenges)
    .where(
      and(
        eq(totpMfaLoginChallenges.digest, digest),
        gt(totpMfaLoginChallenges.expiresAt, now),
        isNull(totpMfaLoginChallenges.consumedAt),
      ),
    )
    .for("update")
    .limit(1);

  return record ?? null;
}

/** Mark a challenge as consumed after successful TOTP verification. */
export async function consumeTotpMfaLoginChallenge(
  userId: string,
  digest: MfaDigest,
  now: Date,
  executor: Pick<SpendWiseDatabase, "update">,
): Promise<TotpMfaLoginChallengeRecord | null> {
  const currentUserId = resolveUserId(userId);
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid consumption time is required.");

  const [updated] = await executor
    .update(totpMfaLoginChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(totpMfaLoginChallenges.userId, currentUserId),
        eq(totpMfaLoginChallenges.digest, digest),
        gt(totpMfaLoginChallenges.expiresAt, now),
        isNull(totpMfaLoginChallenges.consumedAt),
      ),
    )
    .returning();

  return updated ?? null;
}

/** Increment attempt counter for a challenge (failed verification). */
export async function incrementTotpMfaLoginChallengeAttempts(
  userId: string,
  digest: MfaDigest,
  now: Date,
  executor: Pick<SpendWiseDatabase, "update">,
): Promise<TotpMfaLoginChallengeRecord | null> {
  const currentUserId = resolveUserId(userId);
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid increment time is required.");

  const [updated] = await executor
    .update(totpMfaLoginChallenges)
    .set({ attempts: sql`${totpMfaLoginChallenges.attempts} + 1` })
    .where(
      and(
        eq(totpMfaLoginChallenges.userId, currentUserId),
        eq(totpMfaLoginChallenges.digest, digest),
        gt(totpMfaLoginChallenges.expiresAt, now),
        isNull(totpMfaLoginChallenges.consumedAt),
      ),
    )
    .returning();

  return updated ?? null;
}

/** Delete expired challenges for cleanup. */
export async function deleteExpiredTotpMfaLoginChallenges(
  now: Date,
  executor: Pick<SpendWiseDatabase, "delete">,
): Promise<void> {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid cleanup time is required.");

  await executor
    .delete(totpMfaLoginChallenges)
    .where(lt(totpMfaLoginChallenges.expiresAt, now));
}
