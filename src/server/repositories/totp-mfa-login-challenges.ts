import { and, eq, gt, isNull, lt, sql, type InferSelectModel } from "drizzle-orm";

import { totpMfaLoginChallenges } from "../../../db/schema";
import { resolveUserId } from "../auth";
import { MFA_LOGIN_CHALLENGE_TTL_MS, type MfaDigest } from "../mfa-digests";
import type { SpendWiseDatabase } from "../db";

export const TOTP_LOGIN_CHALLENGE_MAX_ATTEMPTS = 5;

export type TotpMfaLoginChallengeRecord = InferSelectModel<typeof totpMfaLoginChallenges>;

function validateDigest(digest: MfaDigest): void {
  if (!/^[a-f0-9]{64}$/.test(digest))
    throw new TypeError("A SHA-256 challenge digest is required.");
}

export async function createTotpMfaLoginChallenge(
  userId: string,
  input: { digest: MfaDigest; expiresAt: Date; createdAt?: Date },
  executor: Pick<SpendWiseDatabase, "insert">,
): Promise<TotpMfaLoginChallengeRecord> {
  const currentUserId = resolveUserId(userId);
  validateDigest(input.digest);
  const createdAt = input.createdAt ?? new Date();
  if (
    !Number.isFinite(createdAt.getTime()) ||
    !Number.isFinite(input.expiresAt.getTime()) ||
    input.expiresAt.getTime() <= createdAt.getTime() ||
    input.expiresAt.getTime() > createdAt.getTime() + MFA_LOGIN_CHALLENGE_TTL_MS
  ) {
    throw new RangeError("Login challenge expiry must be within its short-lived window.");
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

  if (!record) throw new Error("TOTP login challenge could not be created.");
  return record;
}

export async function incrementTotpMfaLoginChallengeAttempts(
  userId: string,
  digest: MfaDigest,
  now: Date,
  executor: Pick<SpendWiseDatabase, "update">,
): Promise<TotpMfaLoginChallengeRecord | null> {
  const currentUserId = resolveUserId(userId);
  validateDigest(digest);
  if (!Number.isFinite(now.getTime()))
    throw new RangeError("A valid challenge attempt time is required.");

  const [updated] = await executor
    .update(totpMfaLoginChallenges)
    .set({ attempts: sql`${totpMfaLoginChallenges.attempts} + 1` })
    .where(
      and(
        eq(totpMfaLoginChallenges.userId, currentUserId),
        eq(totpMfaLoginChallenges.digest, digest),
        gt(totpMfaLoginChallenges.expiresAt, now),
        isNull(totpMfaLoginChallenges.consumedAt),
        lt(totpMfaLoginChallenges.attempts, TOTP_LOGIN_CHALLENGE_MAX_ATTEMPTS),
      ),
    )
    .returning();

  return updated ?? null;
}

/** A conditional UPDATE consumes an unexpired challenge exactly once. */
export async function consumeTotpMfaLoginChallenge(
  userId: string,
  digest: MfaDigest,
  consumedAt: Date,
  executor: Pick<SpendWiseDatabase, "update">,
): Promise<TotpMfaLoginChallengeRecord | null> {
  const currentUserId = resolveUserId(userId);
  validateDigest(digest);
  if (!Number.isFinite(consumedAt.getTime()))
    throw new RangeError("A valid challenge consumption time is required.");

  const [consumed] = await executor
    .update(totpMfaLoginChallenges)
    .set({ consumedAt })
    .where(
      and(
        eq(totpMfaLoginChallenges.userId, currentUserId),
        eq(totpMfaLoginChallenges.digest, digest),
        gt(totpMfaLoginChallenges.expiresAt, consumedAt),
        isNull(totpMfaLoginChallenges.consumedAt),
        lt(totpMfaLoginChallenges.attempts, TOTP_LOGIN_CHALLENGE_MAX_ATTEMPTS),
      ),
    )
    .returning();

  return consumed ?? null;
}
