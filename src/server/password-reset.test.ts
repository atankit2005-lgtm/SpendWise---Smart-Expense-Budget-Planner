import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

const control = {
  ip: "203.0.113.10",
  users: new Map<string, { id: string; email: string }>(),
  transactionCalls: 0,
  transactionFailure: false,
  replacements: [] as Array<{
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    executor: object;
  }>,
  emailCalls: [] as Array<{ email: string; token: string; expiresAt: Date }>,
  emailFailure: false,
  warnings: [] as string[],
};

const fakeTransaction = {};

mock.module("@tanstack/react-start/server", {
  namedExports: {
    getRequestIP: () => control.ip,
    getRequestHeader: () => undefined,
    setResponseHeader: () => {},
  },
});

mock.module("./db", {
  defaultExport: {
    transaction: async (run: (executor: object) => Promise<unknown>) => {
      control.transactionCalls += 1;
      if (control.transactionFailure) throw new Error("database transaction failed");
      return run(fakeTransaction);
    },
  },
  namedExports: {
    isDatabaseConfigured: () => true,
  },
});

mock.module("./repositories/users", {
  namedExports: {
    getUserByEmail: async (email: string) => control.users.get(email) ?? null,
    updateUserPasswordHash: async () => true,
  },
});

mock.module("./repositories/password-reset-tokens", {
  namedExports: {
    consumePasswordResetToken: async () => null,
    replacePasswordResetToken: async (
      userId: string,
      tokenHash: string,
      expiresAt: Date,
      executor: object,
    ) => {
      control.replacements.push({ userId, tokenHash, expiresAt, executor });
    },
  },
});

mock.module("./password-reset-email", {
  namedExports: {
    sendPasswordResetEmail: async (email: string, token: string, expiresAt: Date) => {
      control.emailCalls.push({ email, token, expiresAt });
      if (control.emailFailure) {
        throw new Error(`private provider error includes token=${token} reset URL=https://private.test/?token=${token}`);
      }
    },
  },
});

const { requestPasswordReset } = await import("./password-reset");
const { resetRateLimitState, listRateLimitKeys } = await import("./rate-limit");
const { hashPasswordResetToken } = await import("./password-reset-token");
const { TooManyRequestsError, ValidationError } = await import("./errors");
const originalWarn = console.warn;

const EXPECTED_RESPONSE = {
  message: "If an account exists for that email, password reset instructions will be sent shortly.",
};

function seedUser(email = "person@example.com"): void {
  control.users.set(email, { id: "user-1", email });
}

beforeEach(() => {
  control.ip = "203.0.113.10";
  control.users.clear();
  control.transactionCalls = 0;
  control.transactionFailure = false;
  control.replacements = [];
  control.emailCalls = [];
  control.emailFailure = false;
  control.warnings = [];
  resetRateLimitState();
  console.warn = ((message?: unknown) => {
    control.warnings.push(String(message));
  }) as typeof console.warn;
});

afterEach(() => {
  console.warn = originalWarn;
});

describe("password reset request", () => {
  it("normalizes email, replaces the prior token in a transaction, and sends the raw token only to the mail boundary", async () => {
    seedUser();

    const response = await requestPasswordReset({ email: "  PERSON@Example.com " });

    assert.deepEqual(response, EXPECTED_RESPONSE);
    assert.equal(control.transactionCalls, 1);
    assert.equal(control.replacements.length, 1);
    assert.equal(control.replacements[0]!.userId, "user-1");
    assert.equal(control.replacements[0]!.executor, fakeTransaction);
    assert.equal(control.emailCalls.length, 1);
    assert.equal(control.emailCalls[0]!.email, "person@example.com");
    assert.equal(control.replacements[0]!.tokenHash, hashPasswordResetToken(control.emailCalls[0]!.token));
    assert.notEqual(control.replacements[0]!.tokenHash, control.emailCalls[0]!.token);
    assert.equal(
      control.replacements[0]!.expiresAt.getTime(),
      control.emailCalls[0]!.expiresAt.getTime(),
    );
    assert.ok(
      Math.abs(control.replacements[0]!.expiresAt.getTime() - (Date.now() + 30 * 60 * 1000)) < 2000,
    );
  });

  it("returns the same response for known and unknown addresses and creates no token for an unknown account", async () => {
    seedUser();
    const knownResponse = await requestPasswordReset({ email: "person@example.com" });
    const unknownResponse = await requestPasswordReset({ email: "unknown@example.com" });

    assert.deepEqual(knownResponse, unknownResponse);
    assert.deepEqual(knownResponse, EXPECTED_RESPONSE);
    assert.equal(control.transactionCalls, 1);
    assert.equal(control.replacements.length, 1);
    assert.equal(control.emailCalls.length, 1);
  });

  it("rejects malformed addresses before database or email work", async () => {
    await assert.rejects(() => requestPasswordReset({ email: "not-an-email" }), ValidationError);
    assert.equal(control.transactionCalls, 0);
    assert.equal(control.emailCalls.length, 0);
  });

  it("applies both IP and normalized account-key limits", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await requestPasswordReset({ email: "person@example.com" });
    }
    await assert.rejects(
      () => requestPasswordReset({ email: "PERSON@example.com" }),
      TooManyRequestsError,
    );

    resetRateLimitState();
    control.users.clear();
    control.ip = "203.0.113.99";
    for (let attempt = 0; attempt < 10; attempt++) {
      await requestPasswordReset({ email: `unknown${attempt}@example.com` });
    }
    await assert.rejects(
      () => requestPasswordReset({ email: "another-unknown@example.com" }),
      TooManyRequestsError,
    );
  });

  it("keeps limiter keys free of passwords and raw reset tokens", async () => {
    seedUser();
    await requestPasswordReset({ email: "person@example.com" });
    const keys = listRateLimitKeys().join("|");
    const rawToken = control.emailCalls[0]!.token;

    assert.ok(keys.includes("auth:password-reset:ip:"));
    assert.ok(keys.includes("auth:password-reset:email:person@example.com"));
    assert.ok(!keys.includes("correct-horse-battery"));
    assert.ok(!keys.includes(rawToken));
  });

  it("keeps transaction failures generic and sends no email when replacement rolls back", async () => {
    seedUser();
    control.transactionFailure = true;

    const response = await requestPasswordReset({ email: "person@example.com" });

    assert.deepEqual(response, EXPECTED_RESPONSE);
    assert.equal(control.replacements.length, 0);
    assert.equal(control.emailCalls.length, 0);
    assert.deepEqual(control.warnings, ["Password reset token issuance failed."]);
  });

  it("keeps provider failure private and returns the same generic response without logging secrets", async () => {
    seedUser();
    control.emailFailure = true;

    const response = await requestPasswordReset({ email: "person@example.com" });

    assert.deepEqual(response, EXPECTED_RESPONSE);
    assert.deepEqual(control.warnings, ["Password reset email delivery failed."]);
    const logs = control.warnings.join(" ");
    assert.ok(!logs.includes(control.emailCalls[0]!.token));
    assert.ok(!logs.includes("private.test"));
    assert.ok(!logs.includes("private provider error"));
  });
});
