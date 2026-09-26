import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";
import { URI } from "otpauth";

import {
  DuplicateResourceError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { resetRateLimitState } from "./rate-limit";
import { createTotp } from "./totp";
import { ConfigurationError } from "./env";
import { digestRecoveryCode } from "./mfa-digests";

interface PendingRow {
  id: string;
  userId: string;
  encryptedSecret: string;
  encryptionKeyId: string;
  expiresAt: Date;
  createdAt: Date;
}

interface ActiveRow {
  id: string;
  userId: string;
  encryptedSecret: string;
  encryptionKeyId: string;
  lastAcceptedStep: number;
}

interface AccountState {
  active: ActiveRow | null;
  pending: PendingRow | null;
  recoveryDigests: string[];
}

const control = {
  configured: true,
  currentUserId: "user-a",
  accountEmails: new Map([
    ["user-a", "a@example.com"],
    ["user-b", "b@example.com"],
  ]),
  accounts: new Map<string, AccountState>(),
  sessions: [
    { id: "session-a1", userId: "user-a" },
    { id: "session-a2", userId: "user-a" },
    { id: "session-b1", userId: "user-b" },
  ],
  failRecoveryWrite: false,
  nextId: 1,
  transactionTail: Promise.resolve(),
  clearCookieCalls: 0,
};

function stateFor(userId: string): AccountState {
  let state = control.accounts.get(userId);
  if (!state) {
    state = { active: null, pending: null, recoveryDigests: [] };
    control.accounts.set(userId, state);
  }
  return state;
}

function cloneAccounts(): Map<string, AccountState> {
  return new Map(
    [...control.accounts].map(([id, state]) => [
      id,
      {
        active: state.active ? { ...state.active } : null,
        pending: state.pending
          ? { ...state.pending, expiresAt: new Date(state.pending.expiresAt) }
          : null,
        recoveryDigests: [...state.recoveryDigests],
      },
    ]),
  );
}

function restoreAccounts(snapshot: Map<string, AccountState>): void {
  control.accounts.clear();
  for (const [userId, state] of snapshot) control.accounts.set(userId, state);
}

const transactionExecutor = {};
const fakeDb = {
  transaction: async <T>(
    callback: (executor: typeof transactionExecutor) => Promise<T>,
  ): Promise<T> => {
    const previous = control.transactionTail;
    let release = () => {};
    control.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const accounts = cloneAccounts();
    const sessions = control.sessions.map((session) => ({ ...session }));
    try {
      return await callback(transactionExecutor);
    } catch (error) {
      restoreAccounts(accounts);
      control.sessions = sessions;
      throw error;
    } finally {
      release();
    }
  },
};

mock.module("./db", {
  namedExports: {
    db: fakeDb,
    getDb: () => fakeDb,
    isDatabaseConfigured: () => control.configured,
  },
  defaultExport: fakeDb,
});

mock.module("./authentication", {
  namedExports: {
    reauthenticateCurrentUser: async (password: unknown) => {
      if (typeof password !== "string" || password !== "correct horse battery") {
        throw new UnauthorizedError("Current password is incorrect.");
      }
      const email = control.accountEmails.get(control.currentUserId);
      if (!email) throw new UnauthorizedError("You must be signed in to access SpendWise.");
      return { userId: control.currentUserId, email };
    },
    requireSessionUserId: async () => {
      if (!control.accountEmails.has(control.currentUserId)) {
        throw new UnauthorizedError("You must be signed in to access SpendWise.");
      }
      return control.currentUserId;
    },
  },
});

mock.module("./session", {
  namedExports: {
    clearSessionCookie: () => {
      control.clearCookieCalls += 1;
    },
  },
});

mock.module("./repositories/totp-mfa-configurations", {
  namedExports: {
    lockUserForTotpMfaEnrollment: async (userId: string) => control.accountEmails.has(userId),
    getTotpMfaConfiguration: async (userId: string) => stateFor(userId).active,
    activateTotpMfa: async (
      userId: string,
      input: { secret: { ciphertext: string; keyId: string }; acceptedStep: number },
    ) => {
      const state = stateFor(userId);
      if (state.active) return null;
      state.active = {
        id: `active-${control.nextId++}`,
        userId,
        encryptedSecret: input.secret.ciphertext,
        encryptionKeyId: input.secret.keyId,
        lastAcceptedStep: input.acceptedStep,
      };
      state.pending = null;
      return state.active;
    },
  },
});

mock.module("./repositories/pending-totp-mfa-enrollments", {
  namedExports: {
    replacePendingTotpMfaEnrollment: async (
      userId: string,
      input: { secret: { ciphertext: string; keyId: string }; expiresAt: Date; createdAt: Date },
    ) => {
      const state = stateFor(userId);
      state.pending = {
        id: `pending-${control.nextId++}`,
        userId,
        encryptedSecret: input.secret.ciphertext,
        encryptionKeyId: input.secret.keyId,
        expiresAt: input.expiresAt,
        createdAt: input.createdAt,
      };
      return state.pending;
    },
    lockUnexpiredPendingTotpMfaEnrollment: async (userId: string, now: Date) => {
      const pending = stateFor(userId).pending;
      return pending && pending.expiresAt.getTime() > now.getTime() ? pending : null;
    },
  },
});

mock.module("./repositories/totp-mfa-recovery-codes", {
  namedExports: {
    replaceTotpMfaRecoveryCodeDigests: async (userId: string, digests: string[]) => {
      if (control.failRecoveryWrite) throw new Error("simulated recovery persistence failure");
      stateFor(userId).recoveryDigests = [...digests];
    },
  },
});

mock.module("./repositories/sessions", {
  namedExports: {
    revokeAllSessionsForUser: async (userId: string) => {
      const before = control.sessions.length;
      control.sessions = control.sessions.filter((session) => session.userId !== userId);
      return before - control.sessions.length;
    },
  },
});

const {
  beginTotpMfaEnrollment,
  confirmTotpMfaEnrollment,
  getTotpMfaStatus,
  TOTP_ENROLLMENT_ATTEMPT_LIMIT,
  TOTP_PENDING_ENROLLMENT_TTL_MS,
} = await import("./totp-enrollment");
const { decryptTotpSecret } = await import("./totp-crypto");

const originalEncryptionKey = process.env["TOTP_ENCRYPTION_KEY"];
const originalEncryptionKeyId = process.env["TOTP_ENCRYPTION_KEY_ID"];

beforeEach(() => {
  control.configured = true;
  control.currentUserId = "user-a";
  control.accounts.clear();
  control.sessions = [
    { id: "session-a1", userId: "user-a" },
    { id: "session-a2", userId: "user-a" },
    { id: "session-b1", userId: "user-b" },
  ];
  control.failRecoveryWrite = false;
  control.nextId = 1;
  control.transactionTail = Promise.resolve();
  control.clearCookieCalls = 0;
  process.env["TOTP_ENCRYPTION_KEY"] = Buffer.alloc(32, 0x73).toString("base64");
  process.env["TOTP_ENCRYPTION_KEY_ID"] = "enrollment-test";
  resetRateLimitState();
});

after(() => {
  if (originalEncryptionKey === undefined) delete process.env["TOTP_ENCRYPTION_KEY"];
  else process.env["TOTP_ENCRYPTION_KEY"] = originalEncryptionKey;
  if (originalEncryptionKeyId === undefined) delete process.env["TOTP_ENCRYPTION_KEY_ID"];
  else process.env["TOTP_ENCRYPTION_KEY_ID"] = originalEncryptionKeyId;
});

describe("TOTP enrollment", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");

  it("requires an authenticated account and current-password reauthentication", async () => {
    await assert.rejects(
      beginTotpMfaEnrollment({ currentPassword: "incorrect password" }, now),
      UnauthorizedError,
    );
    control.currentUserId = "missing-user";
    await assert.rejects(
      beginTotpMfaEnrollment({ currentPassword: "correct horse battery" }, now),
      UnauthorizedError,
    );
    await assert.rejects(confirmTotpMfaEnrollment({ code: "123456" }, now), UnauthorizedError);
  });

  it("stores only encrypted pending data and returns SpendWise OTPAuth provisioning for the account email", async () => {
    const result = await beginTotpMfaEnrollment({ currentPassword: "correct horse battery" }, now);
    const pending = stateFor("user-a").pending;
    assert.ok(pending);
    assert.equal(stateFor("user-a").active, null);
    assert.equal(pending.expiresAt.getTime(), now.getTime() + TOTP_PENDING_ENROLLMENT_TTL_MS);
    assert.notEqual(pending.encryptedSecret, result.secret);
    assert.equal(pending.encryptedSecret.includes(result.secret), false);
    assert.equal(pending.encryptionKeyId, "enrollment-test");
    assert.equal(decryptTotpSecret(pending.encryptedSecret), result.secret);
    assert.equal(result.expiresAt, pending.expiresAt.toISOString());

    const provisioning = URI.parse(result.provisioningUri);
    assert.equal(provisioning.issuer, "SpendWise");
    assert.equal(provisioning.label, "a@example.com");
    assert.equal(provisioning.secret.base32, result.secret);
  });

  it("replaces an earlier pending enrollment safely and isolates each user's setup", async () => {
    const first = await beginTotpMfaEnrollment({ currentPassword: "correct horse battery" }, now);
    const firstPending = stateFor("user-a").pending;
    const second = await beginTotpMfaEnrollment({ currentPassword: "correct horse battery" }, now);
    assert.notEqual(first.secret, second.secret);
    assert.notEqual(firstPending?.id, stateFor("user-a").pending?.id);
    assert.equal(stateFor("user-a").active, null);

    control.currentUserId = "user-b";
    await beginTotpMfaEnrollment({ currentPassword: "correct horse battery" }, now);
    assert.notEqual(
      stateFor("user-a").pending?.encryptedSecret,
      stateFor("user-b").pending?.encryptedSecret,
    );
  });

  it("rejects a begin request when MFA is already active without replacing it", async () => {
    const existing: ActiveRow = {
      id: "already-active",
      userId: "user-a",
      encryptedSecret: "existing-ciphertext",
      encryptionKeyId: "old-key",
      lastAcceptedStep: 1,
    };
    stateFor("user-a").active = existing;
    await assert.rejects(
      beginTotpMfaEnrollment({ currentPassword: "correct horse battery" }, now),
      DuplicateResourceError,
    );
    assert.deepEqual(stateFor("user-a").active, existing);
    assert.equal(stateFor("user-a").pending, null);
  });

  it("reports status from the dedicated active-configuration store only", async () => {
    assert.deepEqual(await getTotpMfaStatus(), { enabled: false });
    stateFor("user-a").active = {
      id: "active",
      userId: "user-a",
      encryptedSecret: "ciphertext",
      encryptionKeyId: "key",
      lastAcceptedStep: 1,
    };
    assert.deepEqual(await getTotpMfaStatus(), { enabled: true });
    control.configured = false;
    await assert.rejects(getTotpMfaStatus(), ConfigurationError);
  });

  it("rejects malformed, incorrect, expired, and missing confirmations without partial writes", async () => {
    await assert.rejects(confirmTotpMfaEnrollment(null, now), ValidationError);
    await assert.rejects(confirmTotpMfaEnrollment({ code: "abc123" }, now), ValidationError);

    const created = await beginTotpMfaEnrollment({ currentPassword: "correct horse battery" }, now);
    const wrongCode = String(
      (Number(
        createTotp(created.secret, "SpendWise", "a@example.com").generate({
          timestamp: now.getTime(),
        }),
      ) +
        1) %
        1_000_000,
    ).padStart(6, "0");
    await assert.rejects(confirmTotpMfaEnrollment({ code: wrongCode }, now), ValidationError);
    assert.equal(stateFor("user-a").active, null);
    assert.ok(stateFor("user-a").pending);
    assert.deepEqual(stateFor("user-a").recoveryDigests, []);

    const expired = stateFor("user-a").pending!;
    expired.expiresAt = new Date(now.getTime());
    await assert.rejects(confirmTotpMfaEnrollment({ code: "123456" }, now), ValidationError);
    stateFor("user-a").pending = null;
    await assert.rejects(confirmTotpMfaEnrollment({ code: "123456" }, now), ValidationError);
  });

  it("activates only after successful proof, records the accepted step, persists digests, and revokes only this user's sessions", async () => {
    const enrollment = await beginTotpMfaEnrollment(
      { currentPassword: "correct horse battery" },
      now,
    );
    const code = createTotp(enrollment.secret, "SpendWise", "a@example.com").generate({
      timestamp: now.getTime(),
    });

    const result = await confirmTotpMfaEnrollment({ code }, now);
    const state = stateFor("user-a");
    assert.equal(state.active?.lastAcceptedStep, Math.floor(now.getTime() / 30_000));
    assert.equal(state.pending, null);
    assert.equal(state.recoveryDigests.length, 10);
    assert.equal(new Set(result.recoveryCodes).size, 10);
    assert.deepEqual(state.recoveryDigests, result.recoveryCodes.map(digestRecoveryCode));
    assert.ok(
      result.recoveryCodes.every((recoveryCode) =>
        /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(recoveryCode),
      ),
    );
    assert.deepEqual(
      control.sessions.map((session) => session.userId),
      ["user-b"],
    );
    assert.equal(control.clearCookieCalls, 1);
  });

  it("rejects replayed enrollment codes and never reveals recovery codes a second time", async () => {
    const enrollment = await beginTotpMfaEnrollment(
      { currentPassword: "correct horse battery" },
      now,
    );
    const code = createTotp(enrollment.secret, "SpendWise", "a@example.com").generate({
      timestamp: now.getTime(),
    });
    const first = await confirmTotpMfaEnrollment({ code }, now);
    assert.equal(first.recoveryCodes.length, 10);
    await assert.rejects(confirmTotpMfaEnrollment({ code }, now), DuplicateResourceError);
    assert.deepEqual(stateFor("user-a").recoveryDigests.length, 10);
    assert.equal(control.clearCookieCalls, 1);
  });

  it("rolls back active MFA, pending consumption, recovery hashes, and session revocation on transaction failure", async () => {
    const enrollment = await beginTotpMfaEnrollment(
      { currentPassword: "correct horse battery" },
      now,
    );
    const code = createTotp(enrollment.secret, "SpendWise", "a@example.com").generate({
      timestamp: now.getTime(),
    });
    control.failRecoveryWrite = true;

    await assert.rejects(
      confirmTotpMfaEnrollment({ code }, now),
      /simulated recovery persistence failure/,
    );
    assert.equal(stateFor("user-a").active, null);
    assert.ok(stateFor("user-a").pending);
    assert.deepEqual(stateFor("user-a").recoveryDigests, []);
    assert.deepEqual(
      control.sessions.map((session) => session.userId),
      ["user-a", "user-a", "user-b"],
    );
    assert.equal(control.clearCookieCalls, 0);
  });

  it("serializes concurrent confirmations so only one can activate and receive codes", async () => {
    const enrollment = await beginTotpMfaEnrollment(
      { currentPassword: "correct horse battery" },
      now,
    );
    const code = createTotp(enrollment.secret, "SpendWise", "a@example.com").generate({
      timestamp: now.getTime(),
    });
    const results = await Promise.allSettled([
      confirmTotpMfaEnrollment({ code }, now),
      confirmTotpMfaEnrollment({ code }, now),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(stateFor("user-a").recoveryDigests.length, 10);
  });

  it("limits repeated enrollment verification attempts per authenticated user", async () => {
    const enrollment = await beginTotpMfaEnrollment(
      { currentPassword: "correct horse battery" },
      now,
    );
    const validCode = createTotp(enrollment.secret, "SpendWise", "a@example.com").generate({
      timestamp: now.getTime(),
    });
    const invalidCode = String((Number(validCode) + 1) % 1_000_000).padStart(6, "0");
    for (let attempt = 0; attempt < TOTP_ENROLLMENT_ATTEMPT_LIMIT; attempt += 1) {
      await assert.rejects(confirmTotpMfaEnrollment({ code: invalidCode }, now), ValidationError);
    }
    await assert.rejects(
      confirmTotpMfaEnrollment({ code: invalidCode }, now),
      TooManyRequestsError,
    );
  });
});
