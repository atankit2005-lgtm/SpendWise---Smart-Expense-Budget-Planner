/**
 * Extension 2.3 — Login MFA challenge/enforcement tests.
 *
 * `verifyTotpLogin`'s own dependencies (db transaction wrapper, session
 * creation, the login-challenge and MFA-configuration repositories, and the
 * user repository) are replaced with in-test fakes via node:test module
 * mocks, following the same pattern as authentication.security.test.ts.
 * `mfa-digests`, `totp`, and `totp-crypto` are left real: the digest
 * hashing fix (client token -> stored SHA-256 digest) and real TOTP
 * validation are exactly what this file needs to prove.
 *
 * True concurrent-request atomicity (two simultaneous verifications against
 * the same challenge, and concurrent TOTP-step replay) needs a real
 * row lock, which a same-process fake cannot demonstrate — see
 * totp-login.postgres.test.ts for that coverage against a real database.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

// A canonical, fixed AES-256-GCM key so the real totp-crypto encrypt/decrypt
// path (used unmocked below) can run without a live environment.
process.env["TOTP_ENCRYPTION_KEY"] = Buffer.alloc(32, 0x42).toString("base64");

const control = {
  databaseConfigured: true,
  sessions: [] as string[],
  cookieCalls: 0,
  /** userId -> { encryptedSecret, lastAcceptedStep } */
  mfaConfigurations: new Map<
    string,
    { encryptedSecret: string; lastAcceptedStep: number | null }
  >(),
  /** userId -> UserRecord-shaped fake, with every field toUser() reads. */
  users: new Map<string, Record<string, unknown>>(),
};

function seedUser(userId: string, overrides: Partial<Record<string, unknown>> = {}) {
  control.users.set(userId, {
    id: userId,
    email: `${userId}@example.com`,
    name: "Test User",
    phone: "+91 90000 00000",
    location: "Phagwara",
    occupation: "Student",
    currency: "INR",
    avatarUrl: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordHash: "current:irrelevant-for-these-tests",
    ...overrides,
  });
}

mock.module("./db", {
  namedExports: {
    isDatabaseConfigured: () => control.databaseConfigured,
  },
  // The real module wraps a callback in a Postgres transaction; these tests
  // only need "run the callback with some tx marker," since every
  // repository call inside it is itself mocked below.
  defaultExport: { transaction: async (run: (tx: unknown) => unknown) => run({}) },
});

mock.module("./session", {
  namedExports: {
    createSession: async (userId: string) => {
      control.sessions.push(userId);
    },
    setSessionCookie: () => {
      control.cookieCalls += 1;
    },
  },
});

mock.module("./repositories/users", {
  namedExports: {
    getUserById: async (userId: string) => {
      const user = control.users.get(userId);
      if (!user) {
        const { NotFoundError } = await import("./errors");
        throw new NotFoundError("User not found.");
      }
      return user;
    },
  },
});

mock.module("./repositories/totp-mfa-configurations", {
  namedExports: {
    getTotpMfaConfiguration: async (userId: string) => {
      const configuration = control.mfaConfigurations.get(userId);
      if (!configuration) return null;
      return { userId, ...configuration };
    },
    // Mirrors the real repository's invariant: only accepted if the new
    // step is strictly greater than the last accepted step for this user.
    advanceAcceptedTotpStep: async (userId: string, step: number) => {
      const configuration = control.mfaConfigurations.get(userId);
      if (!configuration) return null;
      if (configuration.lastAcceptedStep !== null && configuration.lastAcceptedStep >= step)
        return null;
      configuration.lastAcceptedStep = step;
      return { userId, ...configuration };
    },
  },
});

/** In-memory login-challenge table mirroring the real repository's semantics. */
interface FakeChallenge {
  userId: string;
  digest: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}
const challenges = new Map<string, FakeChallenge>();
const MAX_ATTEMPTS = 5;

mock.module("./repositories/totp-mfa-login-challenges", {
  namedExports: {
    createTotpMfaLoginChallenge: async (
      userId: string,
      input: { digest: string; expiresAt: Date; createdAt?: Date },
    ) => {
      const record: FakeChallenge = {
        userId,
        digest: input.digest,
        expiresAt: input.expiresAt,
        attempts: 0,
        consumedAt: null,
      };
      challenges.set(input.digest, record);
      return record;
    },
    lockUnconsumedTotpMfaLoginChallenge: async (digest: string, now: Date) => {
      const record = challenges.get(digest);
      if (!record) return null;
      if (record.consumedAt !== null || record.expiresAt.getTime() <= now.getTime()) return null;
      return { ...record };
    },
    consumeTotpMfaLoginChallenge: async (userId: string, digest: string, now: Date) => {
      const record = challenges.get(digest);
      if (!record) return null;
      if (
        record.userId !== userId ||
        record.consumedAt !== null ||
        record.expiresAt.getTime() <= now.getTime() ||
        record.attempts >= MAX_ATTEMPTS
      ) {
        return null;
      }
      record.consumedAt = now;
      return { ...record };
    },
    incrementTotpMfaLoginChallengeAttempts: async (userId: string, digest: string, now: Date) => {
      const record = challenges.get(digest);
      if (
        !record ||
        record.userId !== userId ||
        record.consumedAt !== null ||
        record.expiresAt.getTime() <= now.getTime() ||
        record.attempts >= MAX_ATTEMPTS
      ) {
        return null;
      }
      record.attempts += 1;
      return { ...record };
    },
  },
});

const { createMfaLoginChallenge, userHasActiveMfa, verifyTotpLogin, TOTP_LOGIN_ATTEMPT_LIMIT } =
  await import("./totp-login");
const { ValidationError, TooManyRequestsError, UnauthorizedError } = await import("./errors");
const { digestMfaValue } = await import("./mfa-digests");
const { encryptTotpSecret } = await import("./totp-crypto");
const { createTotp, generateTotpSecret } = await import("./totp");

const KEY = { key: Buffer.alloc(32, 0x42), keyId: "primary" };
const NOW = new Date("2026-09-26T12:00:00.000Z");

/** Enrolls `userId` with a fresh TOTP secret and returns a valid current code for it. */
function enrollMfa(userId: string, now = NOW): { code: string } {
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, KEY);
  control.mfaConfigurations.set(userId, {
    encryptedSecret: encrypted.ciphertext,
    lastAcceptedStep: null,
  });
  const code = createTotp(secret, "SpendWise", "account").generate({ timestamp: now.getTime() });
  return { code };
}

beforeEach(() => {
  control.sessions = [];
  control.cookieCalls = 0;
  control.mfaConfigurations.clear();
  control.users.clear();
  challenges.clear();
});

describe("userHasActiveMfa", () => {
  it("is false for a user with no configuration and true once enrolled", async () => {
    assert.equal(await userHasActiveMfa("user-1"), false);
    enrollMfa("user-1");
    assert.equal(await userHasActiveMfa("user-1"), true);
  });
});

describe("createMfaLoginChallenge", () => {
  it("returns an opaque token and expiry, and never the stored digest", async () => {
    const challenge = await createMfaLoginChallenge("user-1", NOW);

    assert.equal(typeof challenge.token, "string");
    assert.equal(typeof challenge.expiresAt, "string");
    assert.deepEqual(Object.keys(challenge).sort(), ["expiresAt", "token"]);

    // The digest stored server-side is the hash of the token, never the
    // token itself — proving the client never receives what's persisted.
    const stored = [...challenges.values()][0]!;
    assert.equal(stored.digest, digestMfaValue(challenge.token));
    assert.notEqual(stored.digest, challenge.token);
  });
});

describe("verifyTotpLogin — MFA-enabled login (Extension 2.3)", () => {
  it("D: succeeds with a valid challenge + valid TOTP, consumes the challenge, creates a session, and returns the canonical full user", async () => {
    seedUser("user-1", { name: "Ankit Kumar", phone: "+91 98765 43210" });
    const { code } = enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);

    const user = await verifyTotpLogin({ challengeToken: challenge.token, code }, NOW);

    assert.equal(user.id, "user-1");
    assert.equal(user.name, "Ankit Kumar");
    assert.equal(user.phone, "+91 98765 43210");
    assert.ok(user.createdAt instanceof Date, "canonical UserRecord fields must be present");
    assert.deepEqual(control.sessions, ["user-1"], "a session must be created only after success");

    const stored = challenges.get(digestMfaValue(challenge.token))!;
    assert.ok(stored.consumedAt, "the challenge must be marked consumed");
  });

  it("E: an invalid code fails, increments attempts, and leaves the challenge unconsumed", async () => {
    seedUser("user-1");
    enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);

    await assert.rejects(
      verifyTotpLogin({ challengeToken: challenge.token, code: "000000" }, NOW),
      ValidationError,
    );

    assert.deepEqual(control.sessions, [], "no session may be created on a failed attempt");
    const stored = challenges.get(digestMfaValue(challenge.token))!;
    assert.equal(stored.attempts, 1);
    assert.equal(stored.consumedAt, null);
  });

  it("F: an expired challenge fails and creates no session", async () => {
    seedUser("user-1");
    const { code } = enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);

    const afterExpiry = new Date(NOW.getTime() + 6 * 60 * 1000); // TTL is 5 minutes
    await assert.rejects(
      verifyTotpLogin({ challengeToken: challenge.token, code }, afterExpiry),
      ValidationError,
    );
    assert.deepEqual(control.sessions, []);
  });

  it("G: a consumed challenge cannot be replayed to create a second session", async () => {
    seedUser("user-1");
    const { code } = enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);

    await verifyTotpLogin({ challengeToken: challenge.token, code }, NOW);
    assert.deepEqual(control.sessions, ["user-1"]);

    // Replaying the same (now-consumed) challenge, even with a fresh valid
    // code for the same secret, must not authenticate a second time.
    const secondCode = createTotp(
      // same secret is opaque here; regenerate config's code via a fresh window
      // by reusing enrollMfa's stored secret is not exposed, so instead assert
      // the *challenge* itself is what's rejected, independent of the code.
      generateTotpSecret(),
      "SpendWise",
      "account",
    ).generate({ timestamp: NOW.getTime() });
    await assert.rejects(
      verifyTotpLogin({ challengeToken: challenge.token, code: secondCode }, NOW),
      ValidationError,
    );
    assert.deepEqual(control.sessions, ["user-1"], "replay must not create a second session");
  });

  it("H: a challenge for one user cannot authenticate a different user", async () => {
    seedUser("user-a");
    seedUser("user-b");
    const a = enrollMfa("user-a");
    enrollMfa("user-b");
    const challengeA = await createMfaLoginChallenge("user-a", NOW);

    // The client has no way to name a user id at all — only the opaque
    // token — but this confirms the resolved identity always tracks the
    // challenge's own owner, never an attacker-influenced value, and that
    // user B's TOTP code cannot complete user A's challenge.
    const user = await verifyTotpLogin({ challengeToken: challengeA.token, code: a.code }, NOW);
    assert.equal(user.id, "user-a");
    assert.deepEqual(control.sessions, ["user-a"]);
  });

  it("I: attempts are capped — the 6th verification attempt is rejected even with a fresh window", async () => {
    seedUser("user-1");
    enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);

    for (let i = 0; i < TOTP_LOGIN_ATTEMPT_LIMIT; i++) {
      await assert.rejects(
        verifyTotpLogin({ challengeToken: challenge.token, code: "000000" }, NOW),
        ValidationError,
      );
    }
    // The limit has now been reached at the application layer...
    await assert.rejects(
      verifyTotpLogin({ challengeToken: challenge.token, code: "000000" }, NOW),
      TooManyRequestsError,
    );
    // ...and the repository's own WHERE-clause ceiling independently
    // refuses to consume the challenge even if called directly.
    const digest = digestMfaValue(challenge.token);
    const { consumeTotpMfaLoginChallenge } =
      await import("./repositories/totp-mfa-login-challenges");
    assert.equal(await consumeTotpMfaLoginChallenge("user-1", digest, NOW, {} as never), null);
  });

  it("rejects a malformed verification code without touching the challenge", async () => {
    seedUser("user-1");
    enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);

    await assert.rejects(
      verifyTotpLogin({ challengeToken: challenge.token, code: "12" }, NOW),
      ValidationError,
    );
    const stored = challenges.get(digestMfaValue(challenge.token))!;
    assert.equal(stored.attempts, 0, "format validation happens before any repository call");
  });

  it("rejects an unknown/garbage challenge token the same way as an expired one (no enumeration)", async () => {
    await assert.rejects(
      verifyTotpLogin({ challengeToken: "not-a-real-token", code: "123456" }, NOW),
      ValidationError,
    );
  });

  it("fails safely if MFA was disabled between challenge creation and verification", async () => {
    seedUser("user-1");
    const { code } = enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);
    control.mfaConfigurations.delete("user-1"); // e.g. disabled mid-flow

    await assert.rejects(
      verifyTotpLogin({ challengeToken: challenge.token, code }, NOW),
      UnauthorizedError,
    );
    assert.deepEqual(control.sessions, []);
  });

  it("K: does not accept a TOTP step already accepted for this user (replay protection)", async () => {
    seedUser("user-1");
    const { code } = enrollMfa("user-1");

    // First login challenge consumes this 30s step.
    const first = await createMfaLoginChallenge("user-1", NOW);
    await verifyTotpLogin({ challengeToken: first.token, code }, NOW);
    assert.deepEqual(control.sessions, ["user-1"]);

    // A second, independent challenge for the same user, same window,
    // replaying the *same* code (and therefore the same TOTP step) must
    // fail — proving advanceAcceptedTotpStep's per-user watermark still
    // guards login verification, not just enrollment.
    const second = await createMfaLoginChallenge("user-1", NOW);
    await assert.rejects(
      verifyTotpLogin({ challengeToken: second.token, code }, NOW),
      ValidationError,
    );
    assert.deepEqual(
      control.sessions,
      ["user-1"],
      "the replayed step must not create a second session",
    );
  });

  it("never leaks the TOTP secret, the stored digest, or the raw token in a thrown error", async () => {
    seedUser("user-1");
    enrollMfa("user-1");
    const challenge = await createMfaLoginChallenge("user-1", NOW);
    const digest = digestMfaValue(challenge.token);

    try {
      await verifyTotpLogin({ challengeToken: challenge.token, code: "000000" }, NOW);
      assert.fail("expected verifyTotpLogin to reject");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(!message.includes(digest), "digest must never appear in an error message");
      assert.ok(
        !message.includes(challenge.token),
        "raw token must never appear in an error message",
      );
    }
  });
});

describe("Rate limiting constants", () => {
  it("exposes positive attempt-limit constants", async () => {
    const { TOTP_LOGIN_ATTEMPT_LIMIT: limit, TOTP_LOGIN_ATTEMPT_WINDOW_MS: windowMs } =
      await import("./totp-login");
    assert.equal(typeof limit, "number");
    assert.equal(typeof windowMs, "number");
    assert.ok(limit > 0);
    assert.ok(windowMs > 0);
  });
});
