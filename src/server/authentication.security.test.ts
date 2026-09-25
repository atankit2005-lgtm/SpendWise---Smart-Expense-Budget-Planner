/**
 * Stage 8.3 authentication hardening tests: rate limiting (both dimensions +
 * casing), signup enumeration prevention, login timing equalization for
 * unknown users, transparent rehash-on-success, and configuration failures.
 *
 * Database, password, session, users-repository, and request-IP dependencies
 * are replaced with in-test fakes via node:test module mocks; the real
 * rate limiter, env, and errors modules stay intact.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

const control = {
  databaseConfigured: true,
  ip: "203.0.113.7",
  /** Stored users keyed by normalized email. passwordHash uses fake encodings. */
  users: new Map<string, { id: string; email: string; name: string; passwordHash: string | null }>(),
  sessions: [] as string[],
  rehashed: [] as Array<{ userId: string; passwordHash: string }>,
  revokedOtherSessions: [] as string[],
  verifyCalls: [] as Array<{ password: string; encoded: string | null }>,
  nextUserId: 1,
};

mock.module("@tanstack/react-start/server", {
  namedExports: {
    getRequestIP: () => control.ip,
  },
});

const fakeDb = {
  insert: () => ({
    values: async () => [],
  }),
};

mock.module("./db", {
  namedExports: {
    isDatabaseConfigured: () => control.databaseConfigured,
    getDb: () => fakeDb,
    db: fakeDb,
  },
  defaultExport: fakeDb,
});

mock.module("./password", {
  namedExports: {
    // Fake but format-faithful encodings keep the tests fast and deterministic.
    hashPassword: async (password: string) => `current:${password}`,
    verifyPassword: async (password: string, encoded: string | null) => {
      control.verifyCalls.push({ password, encoded });
      return typeof encoded === "string" && encoded.endsWith(`:${password}`);
    },
    needsRehash: (encoded: string | null) =>
      encoded == null || encoded.startsWith("legacy:"),
  },
});

mock.module("./session", {
  namedExports: {
    createSession: async (userId: string) => {
      control.sessions.push(userId);
    },
    destroyCurrentSession: async () => {},
    destroyOtherSessions: async (userId: string) => {
      control.revokedOtherSessions.push(userId);
    },
    getSessionUserId: async () => control.sessions[0] ?? null,
  },
});

mock.module("./repositories/users", {
  namedExports: {
    getUserByEmail: async (email: string) => control.users.get(email.trim().toLowerCase()) ?? null,
    getUserById: async (userId: string) => {
      for (const user of control.users.values()) if (user.id === userId) return user;
      throw new Error("not found");
    },
    createUser: async (input: { email: string; name: string; passwordHash?: string | null }) => {
      const email = input.email.trim().toLowerCase();
      if (control.users.has(email)) {
        const { DuplicateResourceError } = await import("./errors");
        throw new DuplicateResourceError("A user with that email already exists.");
      }
      const user = {
        id: `user-${control.nextUserId++}`,
        email,
        name: input.name,
        passwordHash: input.passwordHash ?? null,
      };
      control.users.set(email, user);
      return user;
    },
    updateUserPasswordHash: async (userId: string, passwordHash: string) => {
      control.rehashed.push({ userId, passwordHash });
      for (const user of control.users.values()) {
        if (user.id === userId) user.passwordHash = passwordHash;
      }
    },
  },
});

const {
  changeCurrentUserPassword,
  enforceAuthRateLimit,
  logIn,
  signOutOtherSessions,
  signUp,
} = await import("./authentication");
const { resetRateLimitState, listRateLimitKeys } = await import("./rate-limit");
const { ConfigurationError } = await import("./env");
const { TooManyRequestsError, UnauthorizedError, ValidationError } = await import("./errors");

function seedUser(email: string, password: string, legacy = false): void {
  const normalized = email.toLowerCase();
  control.users.set(normalized, {
    id: `user-${control.nextUserId++}`,
    email: normalized,
    name: "Existing User",
    passwordHash: `${legacy ? "legacy" : "current"}:${password}`,
  });
}

describe("authenticated account operations (Stage 9.3A)", () => {
  it("rejects password changes without an authenticated session", async () => {
    await assert.rejects(
      () =>
        changeCurrentUserPassword({
          currentPassword: "correct horse battery",
          newPassword: "new correct password",
        }),
      UnauthorizedError,
    );
  });

  it("verifies and hashes a new password without revoking the current session", async () => {
    seedUser("owner@example.com", "correct horse battery");
    control.sessions = ["user-1"];

    await changeCurrentUserPassword({
      currentPassword: "correct horse battery",
      newPassword: "new correct password",
    });

    assert.equal(control.rehashed.length, 1);
    assert.equal(control.rehashed[0]!.userId, "user-1");
    assert.equal(control.rehashed[0]!.passwordHash, "current:new correct password");
    assert.deepEqual(control.sessions, ["user-1"]);
    assert.deepEqual(control.revokedOtherSessions, []);
  });

  it("rejects an incorrect current password and never persists the replacement", async () => {
    seedUser("owner@example.com", "correct horse battery");
    control.sessions = ["user-1"];

    await assert.rejects(
      () =>
        changeCurrentUserPassword({
          currentPassword: "wrong password",
          newPassword: "new correct password",
        }),
      (error: unknown) =>
        error instanceof UnauthorizedError &&
        !(error as Error).message.includes("wrong password") &&
        !(error as Error).message.includes("new correct password"),
    );
    assert.equal(control.rehashed.length, 0);
  });

  it("validates the replacement password before updating it", async () => {
    seedUser("owner@example.com", "correct horse battery");
    control.sessions = ["user-1"];

    await assert.rejects(
      () =>
        changeCurrentUserPassword({
          currentPassword: "correct horse battery",
          newPassword: "short",
        }),
      ValidationError,
    );
    assert.equal(control.rehashed.length, 0);
  });

  it("revokes only other sessions for the authenticated user", async () => {
    control.sessions = ["user-1"];

    await signOutOtherSessions();

    assert.deepEqual(control.revokedOtherSessions, ["user-1"]);
    assert.deepEqual(control.sessions, ["user-1"]);
  });
});

beforeEach(() => {
  control.databaseConfigured = true;
  control.ip = "203.0.113.7";
  control.users.clear();
  control.sessions = [];
  control.rehashed = [];
  control.revokedOtherSessions = [];
  control.verifyCalls = [];
  control.nextUserId = 1;
  resetRateLimitState();
});

describe("authentication rate limiting (Stage 8.3)", () => {
  it("limits repeated login attempts for the same email", () => {
    for (let i = 0; i < 5; i++) enforceAuthRateLimit("login", "user@example.com");
    assert.throws(() => enforceAuthRateLimit("login", "user@example.com"), TooManyRequestsError);
  });

  it("does not let email casing bypass the per-email limit", () => {
    enforceAuthRateLimit("login", "user@example.com");
    enforceAuthRateLimit("login", "USER@Example.COM");
    enforceAuthRateLimit("login", "  user@example.com  ");
    enforceAuthRateLimit("login", "User@EXAMPLE.com");
    enforceAuthRateLimit("login", "user@example.com");
    assert.throws(() => enforceAuthRateLimit("login", "user@EXAMPLE.com"), TooManyRequestsError);
  });

  it("limits by IP across many different emails", () => {
    for (let i = 0; i < 20; i++) enforceAuthRateLimit("login", `user${i}@example.com`);
    assert.throws(() => enforceAuthRateLimit("login", "brand-new@example.com"), TooManyRequestsError);
  });

  it("limits signup more aggressively than login", () => {
    // Per-email: 3 signup attempts allowed, 4th throws.
    for (let i = 0; i < 3; i++) enforceAuthRateLimit("signup", "spammer@example.com");
    assert.throws(() => enforceAuthRateLimit("signup", "spammer@example.com"), TooManyRequestsError);

    // Per-IP: 10 distinct-email signups allowed, 11th throws.
    resetRateLimitState();
    for (let i = 0; i < 10; i++) enforceAuthRateLimit("signup", `signup${i}@example.com`);
    assert.throws(() => enforceAuthRateLimit("signup", "signup10@example.com"), TooManyRequestsError);
  });

  it("429s surface through logIn once the limiter is exhausted", async () => {
    seedUser("victim@example.com", "correct horse battery");
    for (let i = 0; i < 5; i++) enforceAuthRateLimit("login", "victim@example.com");

    await assert.rejects(async () => {
      enforceAuthRateLimit("login", "victim@example.com");
      await logIn({ email: "victim@example.com", password: "correct horse battery" });
    }, TooManyRequestsError);
  });

  it("never stores the password in limiter keys", () => {
    enforceAuthRateLimit("login", "secret-person@example.com");
    enforceAuthRateLimit("signup", "another-person@example.com");
    const keys = listRateLimitKeys().join(" ");
    assert.ok(!keys.includes("correct horse"), "passwords must never be a limiter key");
    assert.ok(keys.includes("secret-person@example.com"), "normalized email is the key");
  });
});

describe("signup enumeration prevention (Stage 8.3)", () => {
  it("rejects an existing email with a generic message, not a duplicate/existence signal", async () => {
    seedUser("taken@example.com", "correct horse battery");

    const error = await signUp({
      name: "New Person",
      email: "taken@example.com",
      password: "correct horse battery",
    }).then(
      () => null,
      (caught: unknown) => caught,
    );

    assert.ok(error instanceof ValidationError, "must be a generic 400, not a 409 duplicate");
    assert.ok(!(error instanceof UnauthorizedError));
    const message = (error as Error).message;
    assert.ok(!message.toLowerCase().includes("already exists"), `leaks existence: ${message}`);
    assert.ok(!message.toLowerCase().includes("taken"), "must not echo the email");
  });

  it("returns the same generic message regardless of casing of an existing email", async () => {
    seedUser("taken@example.com", "correct horse battery");
    await assert.rejects(
      () => signUp({ name: "New Person", email: "TAKEN@example.com", password: "correct horse battery" }),
      (error: unknown) => error instanceof ValidationError,
    );
  });

  it("still creates a genuinely new account and logs the user in", async () => {
    const user = await signUp({
      name: "Brand New",
      email: "brand-new@example.com",
      password: "correct horse battery",
    });
    assert.equal(user.email, "brand-new@example.com");
    assert.deepEqual(control.sessions, [user.id], "signup auto-logs-in via a session");
    assert.ok(user.passwordHash?.startsWith("current:"), "password stored hashed, never plaintext");
  });
});

describe("login hardening (Stage 8.3)", () => {
  it("rejects a wrong password with the same message as an unknown user", async () => {
    seedUser("real@example.com", "correct horse battery");

    const wrongPassword = await logIn({ email: "real@example.com", password: "wrong password!!" }).then(
      () => null,
      (e: unknown) => e,
    );
    const unknownUser = await logIn({ email: "ghost@example.com", password: "wrong password!!" }).then(
      () => null,
      (e: unknown) => e,
    );

    assert.ok(wrongPassword instanceof UnauthorizedError);
    assert.ok(unknownUser instanceof UnauthorizedError);
    assert.equal((wrongPassword as Error).message, (unknownUser as Error).message);
    assert.equal((unknownUser as Error).message, "Invalid email or password.");
  });

  it("performs a scrypt verification even for an unknown user (timing equalization)", async () => {
    control.verifyCalls = [];
    await logIn({ email: "ghost@example.com", password: "whatever123" }).catch(() => {});

    assert.equal(control.verifyCalls.length, 1, "one verification must run even without a user");
    const encoded = control.verifyCalls[0]!.encoded;
    assert.ok(encoded && encoded.startsWith("scrypt$"), "dummy hash used to burn equal time");
  });

  it("upgrades a legacy hash to current parameters on a successful login", async () => {
    seedUser("legacy@example.com", "correct horse battery", true);

    const user = await logIn({ email: "legacy@example.com", password: "correct horse battery" });

    assert.equal(control.rehashed.length, 1);
    assert.equal(control.rehashed[0]!.userId, user.id);
    assert.ok(control.rehashed[0]!.passwordHash.startsWith("current:"));
    assert.equal(user.passwordHash, "current:correct horse battery");
  });

  it("does not rehash an already-current hash", async () => {
    seedUser("current@example.com", "correct horse battery", false);
    await logIn({ email: "current@example.com", password: "correct horse battery" });
    assert.equal(control.rehashed.length, 0);
  });
});

describe("configuration failure handling (Stage 8.3)", () => {
  it("signUp and logIn throw ConfigurationError when persistence is absent", async () => {
    control.databaseConfigured = false;

    await assert.rejects(
      () => signUp({ name: "New Person", email: "x@example.com", password: "correct horse battery" }),
      ConfigurationError,
    );
    await assert.rejects(
      () => logIn({ email: "x@example.com", password: "correct horse battery" }),
      ConfigurationError,
    );
  });
});
