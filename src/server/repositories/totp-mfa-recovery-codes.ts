import { and, eq, isNull, type InferSelectModel } from "drizzle-orm";

import { totpMfaRecoveryCodes } from "../../../db/schema";
import { resolveUserId } from "../auth";
import type { MfaDigest } from "../mfa-digests";
import type { SpendWiseDatabase } from "../db";

export type TotpMfaRecoveryCodeRecord = InferSelectModel<typeof totpMfaRecoveryCodes>;

function validateDigest(digest: MfaDigest): void {
  if (!/^[a-f0-9]{64}$/.test(digest))
    throw new TypeError("A SHA-256 recovery-code digest is required.");
}

/** Replace stored digests in a caller-owned transaction; raw recovery codes are never stored. */
export async function replaceTotpMfaRecoveryCodeDigests(
  userId: string,
  digests: MfaDigest[],
  executor: Pick<SpendWiseDatabase, "delete" | "insert">,
  createdAt = new Date(),
): Promise<void> {
  const currentUserId = resolveUserId(userId);
  if (!Number.isFinite(createdAt.getTime()))
    throw new RangeError("A valid creation time is required.");
  if (new Set(digests).size !== digests.length)
    throw new TypeError("Recovery-code digests must be unique.");
  digests.forEach(validateDigest);

  await executor.delete(totpMfaRecoveryCodes).where(eq(totpMfaRecoveryCodes.userId, currentUserId));
  if (digests.length > 0) {
    await executor
      .insert(totpMfaRecoveryCodes)
      .values(digests.map((digest) => ({ userId: currentUserId, digest, createdAt })));
  }
}

/** A single conditional UPDATE makes concurrent use of a code single-use. */
export async function consumeTotpMfaRecoveryCode(
  userId: string,
  digest: MfaDigest,
  consumedAt: Date,
  executor: Pick<SpendWiseDatabase, "update">,
): Promise<TotpMfaRecoveryCodeRecord | null> {
  const currentUserId = resolveUserId(userId);
  validateDigest(digest);
  if (!Number.isFinite(consumedAt.getTime()))
    throw new RangeError("A valid consumption time is required.");

  const [consumed] = await executor
    .update(totpMfaRecoveryCodes)
    .set({ consumedAt })
    .where(
      and(
        eq(totpMfaRecoveryCodes.userId, currentUserId),
        eq(totpMfaRecoveryCodes.digest, digest),
        isNull(totpMfaRecoveryCodes.consumedAt),
      ),
    )
    .returning();

  return consumed ?? null;
}
