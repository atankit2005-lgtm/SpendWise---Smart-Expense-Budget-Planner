import { categories, userSettings } from "../../db/schema";
import { getRequestIP } from "@tanstack/react-start/server";
import { defaultCategories } from "@/data/default-categories";
import db, { isDatabaseConfigured } from "./db";
import { ConfigurationError } from "./env";
import {
  DuplicateResourceError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { validatePassword } from "./password-policy";
import { consumeRateLimit } from "./rate-limit";
import {
  createSession,
  createSessionRecord,
  destroyCurrentSession,
  destroyOtherSessions,
  getSessionUserId,
  setSessionCookie,
} from "./session";
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserPasswordHash,
  type UserRecord,
} from "./repositories/users";

/**
 * Generic signup rejection. Deliberately does NOT confirm whether the email
 * is already registered — an unauthenticated caller cannot distinguish
 * "taken" from any other non-creatable case. Legitimate users who typo'd an
 * existing address still get a useful hint ("try logging in").
 *
 * Note: because successful signup auto-logs-in and returns a user, a
 * *successful* signup still implies the email was free. Fully closing that
 * would require an email-confirmation flow SpendWise does not have; that is
 * out of scope for this hardening step and documented in the stage report.
 */
const SIGNUP_REJECTED_MESSAGE =
  "We couldn't create that account. If you already have one, try logging in.";

/**
 * Authentication rate limits (Stage 8.3). Conservative thresholds for a
 * single-instance portfolio app; see rate-limit.ts for the process-local
 * limitation. Two dimensions are enforced per attempt: the request origin IP
 * and the normalized email (lowercased so casing cannot bypass it).
 */
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LIMITS = {
  login: { perIp: 20, perEmail: 5 },
  signup: { perIp: 10, perEmail: 3 },
} as const;

/**
 * Best-effort request IP. `getRequestIP` needs a live request context; outside
 * one (unit tests, background calls) it throws, and we fall back to a shared
 * "unknown" bucket so the email dimension still applies. Render sits behind a
 * proxy, so X-Forwarded-For is the real client IP.
 */
function requestIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Consume one attempt against both the IP and normalized-email buckets and
 * throw 429 if either is exhausted. Never stores the password — only the
 * IP/email counters created by `consumeRateLimit`.
 */
export function enforceAuthRateLimit(action: "login" | "signup", rawEmail: string): void {
  const limits = AUTH_LIMITS[action];
  const ip = requestIp();
  const emailKey = normalizeEmail(rawEmail);

  const byIp = consumeRateLimit(`auth:${action}:ip:${ip}`, limits.perIp, AUTH_WINDOW_MS);
  const byEmail = consumeRateLimit(
    `auth:${action}:email:${emailKey}`,
    limits.perEmail,
    AUTH_WINDOW_MS,
  );

  if (!byIp.allowed || !byEmail.allowed) {
    throw new TooManyRequestsError("Too many attempts. Please try again later.");
  }
}

function validateCredentials(email: string, password: string): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("Enter a valid email address.");
  validatePassword(password);
}

function requireDatabase(): void {
  if (!isDatabaseConfigured()) {
    // Detailed reason stays in server logs (error-boundary re-logs the original);
    // the client only ever sees the sanitized 503 SERVICE_UNAVAILABLE_MESSAGE.
    throw new ConfigurationError("Database persistence is not configured.");
  }
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<UserRecord> {
  requireDatabase();
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length < 2) throw new ValidationError("Enter your full name.");
  validateCredentials(email, input.password);

  if (await getUserByEmail(email)) throw new ValidationError(SIGNUP_REJECTED_MESSAGE);

  let user: UserRecord;
  let sessionToken: string;
  try {
    const result = await db.transaction(async (tx) => {
      let createdUser: UserRecord;
      try {
        createdUser = await createUser(
          { name, email, passwordHash: await hashPassword(input.password) },
          tx,
        );
      } catch (error) {
        // A concurrent-signup race surfaces as DuplicateResourceError from the
        // repository's own pre-check; keep the client-facing message generic.
        if (error instanceof DuplicateResourceError) {
          throw new ValidationError(SIGNUP_REJECTED_MESSAGE);
        }
        throw error;
      }

      await tx.insert(userSettings).values({ userId: createdUser.id });
      await tx.insert(categories).values(
        defaultCategories.map((category) => ({
          userId: createdUser.id,
          name: category.name,
          type: category.type,
          color: category.color,
          icon: category.icon,
        })),
      );
      const token = await createSessionRecord(createdUser.id, tx);
      return { user: createdUser, token };
    });
    user = result.user;
    sessionToken = result.token;
  } catch (error) {
    if (error instanceof DuplicateResourceError) {
      throw new ValidationError(SIGNUP_REJECTED_MESSAGE);
    }
    throw error;
  }

  setSessionCookie(sessionToken);
  return user;
}

/**
 * A fixed dummy hash so a login for a non-existent user still performs one
 * scrypt verification. Without it, "no such user" returns much faster than
 * "wrong password", leaking account existence via timing.
 */
const DUMMY_PASSWORD_HASH =
  `scrypt$32768$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function logIn(input: { email: string; password: string }): Promise<UserRecord> {
  requireDatabase();
  const email = normalizeEmail(input.email);
  validateCredentials(email, input.password);

  const user = await getUserByEmail(email);
  // Always run exactly one verification, whether or not the user exists.
  const passwordValid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordValid) {
    throw new UnauthorizedError("Invalid email or password.");
  }

  // Transparently upgrade legacy (Node-default) hashes to the current
  // explicit parameters on a successful login. Best-effort: a failure here
  // must never lock the user out — the existing hash stays valid.
  if (needsRehash(user.passwordHash)) {
    try {
      const upgraded = await hashPassword(input.password);
      await updateUserPasswordHash(user.id, upgraded);
      user.passwordHash = upgraded;
    } catch (error) {
      console.error("Password rehash on login failed; keeping existing hash.", error);
    }
  }

  await createSession(user.id);
  return user;
}

export async function logOut(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await destroyCurrentSession();
}

export async function changeCurrentUserPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  requireDatabase();
  const userId = await requireSessionUserId();
  validatePassword(input.currentPassword);
  validatePassword(input.newPassword);

  const user = await getUserById(userId);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new UnauthorizedError("Current password is incorrect.");
  }

  await updateUserPasswordHash(userId, await hashPassword(input.newPassword));
}

/** Reauthenticate the signed-in account without accepting caller-selected identities. */
export async function reauthenticateCurrentUser(currentPassword: unknown): Promise<{
  userId: string;
  email: string;
}> {
  requireDatabase();
  const userId = await requireSessionUserId();
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length < 8 ||
    currentPassword.length > 1024
  ) {
    throw new UnauthorizedError("Current password is incorrect.");
  }

  let user: UserRecord;
  try {
    user = await getUserById(userId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new UnauthorizedError("Current password is incorrect.");
    }
    throw error;
  }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new UnauthorizedError("Current password is incorrect.");
  }

  return { userId, email: normalizeEmail(user.email) };
}

export async function signOutOtherSessions(): Promise<void> {
  requireDatabase();
  const userId = await requireSessionUserId();
  await destroyOtherSessions(userId);
}

export async function getCurrentSessionUser(): Promise<UserRecord | null> {
  if (!isDatabaseConfigured()) return null;
  const userId = await getSessionUserId();
  return userId ? getUserById(userId) : null;
}

export async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new UnauthorizedError("You must be signed in to access SpendWise.");
  return userId;
}
