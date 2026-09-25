import { getRequestIP } from "@tanstack/react-start/server";

import db, { isDatabaseConfigured } from "./db";
import { ConfigurationError } from "./env";
import { TooManyRequestsError, UnauthorizedError, ValidationError } from "./errors";
import { hashPassword } from "./password";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  isValidPasswordResetToken,
} from "./password-reset-token";
import { validatePassword } from "./password-policy";
import { consumeRateLimit } from "./rate-limit";
import { clearSessionCookie } from "./session";
import { sendPasswordResetEmail } from "./password-reset-email";
import { revokeAllSessionsForUser } from "./repositories/sessions";
import {
  consumePasswordResetToken,
  replacePasswordResetToken,
} from "./repositories/password-reset-tokens";
import { getUserByEmail, updateUserPasswordHash } from "./repositories/users";

const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_LIMITS = { perIp: 10, perEmail: 5 } as const;
const PASSWORD_RESET_RESPONSE = {
  message: "If an account exists for that email, password reset instructions will be sent shortly.",
} as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requestIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function enforcePasswordResetRateLimit(email: string): void {
  const ipDecision = consumeRateLimit(
    `auth:password-reset:ip:${requestIp()}`,
    PASSWORD_RESET_LIMITS.perIp,
    PASSWORD_RESET_WINDOW_MS,
  );
  const emailDecision = consumeRateLimit(
    `auth:password-reset:email:${email}`,
    PASSWORD_RESET_LIMITS.perEmail,
    PASSWORD_RESET_WINDOW_MS,
  );

  if (!ipDecision.allowed || !emailDecision.allowed) {
    throw new TooManyRequestsError("Too many attempts. Please try again later.");
  }
}

export async function requestPasswordReset(
  input: { email?: unknown } | null,
): Promise<typeof PASSWORD_RESET_RESPONSE> {
  if (typeof input?.email !== "string") throw new ValidationError("Enter a valid email address.");
  const email = normalizeEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("Enter a valid email address.");
  }

  enforcePasswordResetRateLimit(email);

  if (!isDatabaseConfigured()) {
    throw new ConfigurationError("Database persistence is not configured.");
  }

  const user = await getUserByEmail(email);
  if (!user) return PASSWORD_RESET_RESPONSE;

  const generated = generatePasswordResetToken();
  try {
    await db.transaction((tx) =>
      replacePasswordResetToken(user.id, generated.tokenHash, generated.expiresAt, tx),
    );
  } catch {
    console.warn("Password reset token issuance failed.");
    return PASSWORD_RESET_RESPONSE;
  }

  try {
    await sendPasswordResetEmail(email, generated.token, generated.expiresAt);
  } catch {
    console.warn("Password reset email delivery failed.");
  }

  return PASSWORD_RESET_RESPONSE;
}

export async function completePasswordReset(
  input: { token?: unknown; newPassword?: unknown } | null,
): Promise<{ message: string }> {
  if (!isValidPasswordResetToken(input?.token)) {
    throw new UnauthorizedError("This password reset link is invalid or expired.");
  }
  validatePassword(input?.newPassword);

  if (!isDatabaseConfigured()) {
    throw new ConfigurationError("Database persistence is not configured.");
  }

  const tokenHash = hashPasswordResetToken(input.token);
  const passwordHash = await hashPassword(input.newPassword);

  let consumedUserId: string | undefined;
  try {
    consumedUserId = await db.transaction(async (tx) => {
      const consumed = await consumePasswordResetToken(tokenHash, new Date(), tx);
      if (!consumed) return undefined;

      const updated = await updateUserPasswordHash(consumed.userId, passwordHash, tx);
      if (!updated) throw new Error("Password reset could not be completed.");

      await revokeAllSessionsForUser(consumed.userId, tx);
      return consumed.userId;
    });
  } catch {
    throw new Error("Password reset could not be completed.");
  }

  if (!consumedUserId) {
    throw new UnauthorizedError("This password reset link is invalid or expired.");
  }

  clearSessionCookie();
  return { message: "Password updated. Please sign in with your new password." };
}
