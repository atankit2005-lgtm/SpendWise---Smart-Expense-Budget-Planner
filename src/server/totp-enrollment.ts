import db, { isDatabaseConfigured, type SpendWiseDatabase } from "./db";
import { ConfigurationError } from "./env";
import {
  DuplicateResourceError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { digestRecoveryCode, generateRecoveryCodes } from "./mfa-digests";
import { reauthenticateCurrentUser, requireSessionUserId } from "./authentication";
import { consumeRateLimit } from "./rate-limit";
import { clearSessionCookie } from "./session";
import { revokeAllSessionsForUser } from "./repositories/sessions";
import {
  consumeTotpMfaRecoveryCode,
  deleteTotpMfaRecoveryCodesForUser,
  getRemainingTotpMfaRecoveryCodeCount,
  replaceTotpMfaRecoveryCodeDigests,
} from "./repositories/totp-mfa-recovery-codes";
import {
  activateTotpMfa,
  advanceAcceptedTotpStep,
  deactivateTotpMfa,
  getTotpMfaConfiguration,
  lockUserForTotpMfaEnrollment,
} from "./repositories/totp-mfa-configurations";
import {
  lockUnexpiredPendingTotpMfaEnrollment,
  replacePendingTotpMfaEnrollment,
} from "./repositories/pending-totp-mfa-enrollments";
import { decryptTotpSecret, encryptTotpSecret } from "./totp-crypto";
import { createTotpUri, generateTotpSecret, validateTotpCode } from "./totp";
import { classifyVerificationCode } from "./totp-login";

export const TOTP_PENDING_ENROLLMENT_TTL_MS = 10 * 60 * 1000;
export const TOTP_ENROLLMENT_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const TOTP_ENROLLMENT_ATTEMPT_LIMIT = 10;

const MFA_ALREADY_ENABLED_MESSAGE =
  "Authenticator-based two-factor authentication is already enabled for this account.";
const MFA_NOT_ENABLED_MESSAGE =
  "Authenticator-based two-factor authentication is not enabled for this account.";
const INVALID_ENROLLMENT_CODE_MESSAGE =
  "That verification code is invalid or has already been used.";
const ENROLLMENT_UNAVAILABLE_MESSAGE =
  "Your authenticator setup is missing or expired. Start the setup again.";

function requireDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ConfigurationError("Database persistence is not configured.");
  }
}

function requireEnrollmentTransaction(tx: SpendWiseDatabase, userId: string): Promise<boolean> {
  return lockUserForTotpMfaEnrollment(userId, tx);
}

function isVerificationCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

export interface TotpEnrollmentProvisioning {
  secret: string;
  provisioningUri: string;
  expiresAt: string;
}

/** Reauthenticate, then create only encrypted pending enrollment material. */
export async function beginTotpMfaEnrollment(
  input: { currentPassword?: unknown } | null,
  now: Date = new Date(),
): Promise<TotpEnrollmentProvisioning> {
  requireDatabase();
  const account = await reauthenticateCurrentUser(input?.currentPassword);
  if (!Number.isFinite(now.getTime()))
    throw new RangeError("A valid enrollment start time is required.");

  return db.transaction(async (tx) => {
    if (!(await requireEnrollmentTransaction(tx, account.userId))) {
      throw new UnauthorizedError("You must be signed in to access SpendWise.");
    }

    const active = await getTotpMfaConfiguration(account.userId, tx);
    if (active) throw new DuplicateResourceError(MFA_ALREADY_ENABLED_MESSAGE);

    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const expiresAt = new Date(now.getTime() + TOTP_PENDING_ENROLLMENT_TTL_MS);
    await replacePendingTotpMfaEnrollment(
      account.userId,
      { secret: encrypted, expiresAt, createdAt: now },
      tx,
    );

    return {
      secret,
      provisioningUri: createTotpUri(secret, "SpendWise", account.email),
      expiresAt: expiresAt.toISOString(),
    };
  });
}

/** Verify and activate enrollment in one transaction; plaintext recovery codes are returned once. */
export async function confirmTotpMfaEnrollment(
  input: { code?: unknown } | null,
  now: Date = new Date(),
): Promise<{ recoveryCodes: string[] }> {
  requireDatabase();
  const userId = await requireSessionUserId();
  const code = input?.code;
  if (!isVerificationCode(code)) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);
  if (!Number.isFinite(now.getTime()))
    throw new RangeError("A valid confirmation time is required.");

  // In-memory and intentionally process-local, like the existing auth limiter; distributed limits
  // are deferred. Keys contain only the authenticated user id, never the submitted OTP.
  const decision = consumeRateLimit(
    `auth:totp-enrollment:confirm:${userId}`,
    TOTP_ENROLLMENT_ATTEMPT_LIMIT,
    TOTP_ENROLLMENT_ATTEMPT_WINDOW_MS,
    now.getTime(),
  );
  if (!decision.allowed)
    throw new TooManyRequestsError("Too many verification attempts. Start again later.");

  const recoveryCodes = await db.transaction(async (tx) => {
    if (!(await requireEnrollmentTransaction(tx, userId))) {
      throw new UnauthorizedError("You must be signed in to access SpendWise.");
    }

    const active = await getTotpMfaConfiguration(userId, tx);
    if (active) throw new DuplicateResourceError(MFA_ALREADY_ENABLED_MESSAGE);

    const pending = await lockUnexpiredPendingTotpMfaEnrollment(userId, now, tx);
    if (!pending) throw new ValidationError(ENROLLMENT_UNAVAILABLE_MESSAGE);

    const secret = decryptTotpSecret(pending.encryptedSecret);
    const acceptedStep = validateTotpCode(secret, code, now);
    if (acceptedStep === null) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);

    const generatedRecoveryCodes = generateRecoveryCodes();
    const recoveryDigests = generatedRecoveryCodes.map(digestRecoveryCode);
    const configuration = await activateTotpMfa(
      userId,
      {
        secret: {
          ciphertext: pending.encryptedSecret,
          keyId: pending.encryptionKeyId,
        },
        acceptedStep,
        activatedAt: now,
      },
      tx,
    );
    if (!configuration) throw new DuplicateResourceError(MFA_ALREADY_ENABLED_MESSAGE);

    await replaceTotpMfaRecoveryCodeDigests(userId, recoveryDigests, tx, now);
    await revokeAllSessionsForUser(userId, tx);
    return generatedRecoveryCodes;
  });

  clearSessionCookie();
  return { recoveryCodes };
}

export async function getTotpMfaStatus(): Promise<{
  enabled: boolean;
  remainingRecoveryCodes?: number;
}> {
  requireDatabase();
  const userId = await requireSessionUserId();
  const active = await getTotpMfaConfiguration(userId, db);
  if (!active) return { enabled: false };
  const remainingRecoveryCodes = await getRemainingTotpMfaRecoveryCodeCount(userId, db);
  return { enabled: true, remainingRecoveryCodes };
}

/**
 * Reauthenticate, verify a current TOTP (advancing the replay watermark),
 * atomically replace all stored recovery-code digests with 10 fresh codes,
 * and revoke every session so the user must log in again.
 */
export async function regenerateTotpMfaRecoveryCodes(
  input: { currentPassword?: unknown; code?: unknown } | null,
  now: Date = new Date(),
): Promise<{ recoveryCodes: string[] }> {
  requireDatabase();
  const account = await reauthenticateCurrentUser(input?.currentPassword);
  const code = input?.code;
  if (!isVerificationCode(code)) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);
  if (!Number.isFinite(now.getTime()))
    throw new RangeError("A valid regeneration time is required.");

  const decision = consumeRateLimit(
    `auth:totp-recovery:regenerate:${account.userId}`,
    TOTP_ENROLLMENT_ATTEMPT_LIMIT,
    TOTP_ENROLLMENT_ATTEMPT_WINDOW_MS,
    now.getTime(),
  );
  if (!decision.allowed)
    throw new TooManyRequestsError("Too many verification attempts. Start again later.");

  const recoveryCodes = await db.transaction(async (tx) => {
    if (!(await requireEnrollmentTransaction(tx, account.userId))) {
      throw new UnauthorizedError("You must be signed in to access SpendWise.");
    }

    const active = await getTotpMfaConfiguration(account.userId, tx);
    if (!active) throw new ValidationError(MFA_NOT_ENABLED_MESSAGE);

    const secret = decryptTotpSecret(active.encryptedSecret);
    const acceptedStep = validateTotpCode(secret, code, now);
    if (acceptedStep === null) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);

    const advanced = await advanceAcceptedTotpStep(account.userId, acceptedStep, now, tx);
    if (!advanced) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);

    const generatedRecoveryCodes = generateRecoveryCodes();
    const recoveryDigests = generatedRecoveryCodes.map(digestRecoveryCode);

    await replaceTotpMfaRecoveryCodeDigests(account.userId, recoveryDigests, tx, now);
    await revokeAllSessionsForUser(account.userId, tx);

    return generatedRecoveryCodes;
  });

  clearSessionCookie();
  return { recoveryCodes };
}

/**
 * Reauthenticate, verify a current TOTP (advancing the replay watermark) or
 * an unused recovery code (consumed atomically), then deactivate MFA in one
 * transaction and revoke every session so the account must log in again as
 * password-only.
 */
export async function disableTotpMfa(
  input: { currentPassword?: unknown; code?: unknown } | null,
  now: Date = new Date(),
): Promise<void> {
  requireDatabase();
  const account = await reauthenticateCurrentUser(input?.currentPassword);
  const submitted = classifyVerificationCode(input?.code);
  if (!submitted) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);
  if (!Number.isFinite(now.getTime()))
    throw new RangeError("A valid deactivation time is required.");

  // Same process-local limiter design as enrollment confirmation: the key
  // holds only the authenticated user id, never the password or the code.
  const decision = consumeRateLimit(
    `auth:totp-disable:${account.userId}`,
    TOTP_ENROLLMENT_ATTEMPT_LIMIT,
    TOTP_ENROLLMENT_ATTEMPT_WINDOW_MS,
    now.getTime(),
  );
  if (!decision.allowed)
    throw new TooManyRequestsError("Too many verification attempts. Start again later.");

  await db.transaction(async (tx) => {
    if (!(await requireEnrollmentTransaction(tx, account.userId))) {
      throw new UnauthorizedError("You must be signed in to access SpendWise.");
    }

    const active = await getTotpMfaConfiguration(account.userId, tx);
    if (!active) throw new ValidationError(MFA_NOT_ENABLED_MESSAGE);

    if (submitted.kind === "totp") {
      const secret = decryptTotpSecret(active.encryptedSecret);
      const acceptedStep = validateTotpCode(secret, submitted.code, now);
      if (acceptedStep === null) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);
      const advanced = await advanceAcceptedTotpStep(account.userId, acceptedStep, now, tx);
      if (!advanced) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);
    } else {
      const consumed = await consumeTotpMfaRecoveryCode(
        account.userId,
        digestRecoveryCode(submitted.code),
        now,
        tx,
      );
      if (!consumed) throw new ValidationError(INVALID_ENROLLMENT_CODE_MESSAGE);
    }

    if (!(await deactivateTotpMfa(account.userId, tx)))
      throw new ValidationError(MFA_NOT_ENABLED_MESSAGE);
    await deleteTotpMfaRecoveryCodesForUser(account.userId, tx);
    await revokeAllSessionsForUser(account.userId, tx);
  });

  clearSessionCookie();
}
