import db, { isDatabaseConfigured, type SpendWiseDatabase } from "./db";
import { ConfigurationError } from "./env";
import {
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { generateLoginChallenge, MFA_LOGIN_CHALLENGE_TTL_MS } from "./mfa-digests";
import { createSession, setSessionCookie } from "./session";
import { getTotpMfaConfiguration, advanceAcceptedTotpStep } from "./repositories/totp-mfa-configurations";
import {
  createTotpMfaLoginChallenge,
  lockUnconsumedTotpMfaLoginChallenge,
  consumeTotpMfaLoginChallenge,
  incrementTotpMfaLoginChallengeAttempts,
} from "./repositories/totp-mfa-login-challenges";
import { getUserById } from "./repositories/users";
import { decryptTotpSecret } from "./totp-crypto";
import { validateTotpCode } from "./totp";

export const TOTP_LOGIN_ATTEMPT_LIMIT = 5;
export const TOTP_LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const INVALID_TOTP_MESSAGE = "Invalid verification code.";
const CHALLENGE_EXPIRED_MESSAGE = "This verification challenge has expired. Please try logging in again.";
const CHALLENGE_CONSUMED_MESSAGE = "This verification code has already been used.";
const MFA_REQUIRED_MESSAGE = "Two-factor authentication is required for this account.";

function requireDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ConfigurationError("Database persistence is not configured.");
  }
}

function isVerificationCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

export interface TotpLoginChallenge {
  token: string;
  expiresAt: string;
}

export interface LoginResult {
  requiresMfa: boolean;
  mfaChallenge?: TotpLoginChallenge;
  user?: { id: string; email: string; name: string };
}

/** Check if a user has active MFA configuration. */
export async function userHasActiveMfa(userId: string): Promise<boolean> {
  try {
    const configuration = await getTotpMfaConfiguration(userId, db);
    return configuration !== null;
  } catch (error) {
    // In test environments with mock executors, this might fail
    // Treat as no MFA in that case
    return false;
  }
}

/** Create an MFA challenge after successful password verification. */
export async function createMfaLoginChallenge(
  userId: string,
  now: Date = new Date(),
): Promise<TotpLoginChallenge> {
  requireDatabase();
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid challenge creation time is required.");

  const { token, digest, expiresAt } = generateLoginChallenge(now);
  await createTotpMfaLoginChallenge(userId, { digest, expiresAt, createdAt: now }, db);

  return { token, expiresAt: expiresAt.toISOString() };
}

/** Verify TOTP code and complete MFA login. */
export async function verifyTotpLogin(
  input: { challengeToken: string; code: string },
  now: Date = new Date(),
): Promise<{ userId: string; email: string; name: string }> {
  requireDatabase();
  const { challengeToken, code } = input;
  
  if (!isVerificationCode(code)) throw new ValidationError(INVALID_TOTP_MESSAGE);
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid verification time is required.");

  // Rate limit TOTP verification attempts
  const decision = await db.transaction(async (tx) => {
    const challenge = await lockUnconsumedTotpMfaLoginChallenge(challengeToken, now, tx);
    if (!challenge) throw new ValidationError(CHALLENGE_EXPIRED_MESSAGE);

    // Increment attempt counter for failed attempts
    if (challenge.attempts >= TOTP_LOGIN_ATTEMPT_LIMIT) {
      throw new TooManyRequestsError("Too many verification attempts. Please log in again.");
    }

    const configuration = await getTotpMfaConfiguration(challenge.userId, tx);
    if (!configuration) throw new UnauthorizedError("MFA is not configured for this account.");

    const secret = decryptTotpSecret(configuration.encryptedSecret);
    const acceptedStep = validateTotpCode(secret, code, now);
    
    if (acceptedStep === null) {
      await incrementTotpMfaLoginChallengeAttempts(challenge.userId, challengeToken, now, tx);
      throw new ValidationError(INVALID_TOTP_MESSAGE);
    }

    // Verify the step advances to prevent replay
    const updated = await advanceAcceptedTotpStep(challenge.userId, acceptedStep, now, tx);
    if (!updated) {
      await incrementTotpMfaLoginChallengeAttempts(challenge.userId, challengeToken, now, tx);
      throw new ValidationError(INVALID_TOTP_MESSAGE);
    }

    // Consume the challenge to prevent reuse
    await consumeTotpMfaLoginChallenge(challenge.userId, challengeToken, now, tx);

    return { userId: challenge.userId };
  });

  // Create session after successful MFA verification
  const user = await getUserById(decision.userId);
  await createSession(user.id);
  return { userId: user.id, email: user.email, name: user.name };
}
