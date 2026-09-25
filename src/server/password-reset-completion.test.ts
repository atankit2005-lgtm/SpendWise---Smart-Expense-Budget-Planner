import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { sessions, users } from "../../db/schema";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "./password-reset-token";

interface State {
  resetTokens: Array<{ id: string; userId: string; tokenHash: string; expiresAt: Date }>;
  users: Map<string, { passwordHash: string }>;
  sessions: Array<{ id: string; userId: string }>;
}

const control: {
  state: State;
  databaseConfigured: boolean;
  failAt: "" | "update" | "session-after-delete";
  transactionCalls: number;
  transactionTail: Promise<void>;
  cookieHeaders: string[];
} = {
  state: { resetTokens: [], users: new Map(), sessions: [] },
  databaseConfigured: true,
  failAt: "",
  transactionCalls: 0,
  transactionTail: Promise.resolve(),
  cookieHeaders: [],
};

function cloneState(state: State): State {
  return {
    resetTokens: state.resetTokens.map((row) => ({ ...row, expiresAt: new Date(row.expiresAt) })),
    users: new Map([...state.users].map(([id, user]) => [id, { ...user }])),
    sessions: state.sessions.map((session) => ({ ...session })),
  };
}

function makeTransactionExecutor() {
  const dialect = new PgDialect();

  return {
    delete(table: unknown) {
      return {
        where(condition: unknown) {
          let execution: Promise<Array<Record<string, unknown>>> | undefined;
          const execute = () => {
            if (execution) return execution;
            execution = Promise.resolve().then(() => {
              const tableName = String(getTableName(table as typeof sessions));
              const query = dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
              if (tableName === "password_reset_tokens") {
                const [tokenHash, expiry] = query.params;
                const rowIndex = control.state.resetTokens.findIndex(
                  (row) => row.tokenHash === tokenHash && row.expiresAt > new Date(String(expiry)),
                );
                if (rowIndex === -1) return [];
                return [control.state.resetTokens.splice(rowIndex, 1)[0]!];
              }
              if (tableName === "sessions") {
                const userId = query.params[0];
                const deleted = control.state.sessions.filter((session) => session.userId === userId);
                control.state.sessions = control.state.sessions.filter(
                  (session) => session.userId !== userId,
                );
                if (control.failAt === "session-after-delete") {
                  throw new Error("simulated session database failure");
                }
                return deleted;
              }
              throw new Error(`Unexpected table ${tableName}`);
            });
            return execution;
          };

          return {
            then: (
              resolve: (value: unknown) => unknown,
              reject: (error: unknown) => unknown,
            ) => execute().then(resolve, reject),
            returning: () => execute(),
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(condition: unknown) {
              return {
                returning: async () => {
                  if (control.failAt === "update") {
                    throw new Error("simulated password database failure");
                  }
                  if (String(getTableName(table as typeof users)) !== "users") {
                    throw new Error("Unexpected update table");
                  }
                  const query = dialect.sqlToQuery(
                    condition as Parameters<PgDialect["sqlToQuery"]>[0],
                  );
                  const userId = String(query.params[0]);
                  const user = control.state.users.get(userId);
                  if (!user) return [];
                  user.passwordHash = String(values["passwordHash"]);
                  return [{ id: userId }];
                },
              };
            },
          };
        },
      };
    },
  };
}

const fakeDb = {
  transaction: async <T>(run: (executor: ReturnType<typeof makeTransactionExecutor>) => Promise<T>) => {
    control.transactionCalls += 1;
    const previous = control.transactionTail;
    let release = () => {};
    control.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const snapshot = cloneState(control.state);
    try {
      return await run(makeTransactionExecutor());
    } catch (error) {
      control.state = snapshot;
      throw error;
    } finally {
      release();
    }
  },
};

mock.module("@tanstack/react-start/server", {
  namedExports: {
    getRequestIP: () => "203.0.113.50",
    getRequestHeader: () => "spendwise_session=current-browser-session",
    setResponseHeader: (_name: string, value: string) => control.cookieHeaders.push(value),
  },
});

mock.module("./db", {
  defaultExport: fakeDb,
  namedExports: {
    db: fakeDb,
    getDb: () => fakeDb,
    isDatabaseConfigured: () => control.databaseConfigured,
  },
});

const { completePasswordReset } = await import("./password-reset");
const { hashPassword, verifyPassword } = await import("./password");
const { resetRateLimitState } = await import("./rate-limit");
const { UnauthorizedError, ValidationError } = await import("./errors");

const OLD_PASSWORD = "old-secure-password";
const NEW_PASSWORD = "new-secure-password";
const OTHER_PASSWORD = "other-account-password";
const RESET_TIME = new Date();
const originalConsoleError = console.error;

async function seedResetState(options: { expiresAt?: Date } = {}) {
  const token = generatePasswordResetToken(RESET_TIME);
  const oldHash = await hashPassword(OLD_PASSWORD);
  const otherHash = await hashPassword(OTHER_PASSWORD);
  control.state = {
    resetTokens: [
      {
        id: "reset-token-1",
        userId: "user-1",
        tokenHash: token.tokenHash,
        expiresAt: options.expiresAt ?? token.expiresAt,
      },
    ],
    users: new Map([
      ["user-1", { passwordHash: oldHash }],
      ["user-2", { passwordHash: otherHash }],
    ]),
    sessions: [
      { id: "session-1", userId: "user-1" },
      { id: "session-2", userId: "user-1" },
      { id: "session-3", userId: "user-2" },
    ],
  };
  return { token, oldHash, otherHash };
}

beforeEach(() => {
  control.state = { resetTokens: [], users: new Map(), sessions: [] };
  control.databaseConfigured = true;
  control.failAt = "";
  control.transactionCalls = 0;
  control.transactionTail = Promise.resolve();
  control.cookieHeaders = [];
  resetRateLimitState();
  console.error = () => {};
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("password reset completion", () => {
  it("rejects malformed tokens before database work and uses one generic token error", async () => {
    const malformed = await completePasswordReset({ token: "bad-token", newPassword: NEW_PASSWORD }).then(
      () => null,
      (error: unknown) => error,
    );

    assert.ok(malformed instanceof UnauthorizedError);
    assert.equal((malformed as Error).message, "This password reset link is invalid or expired.");
    assert.equal(control.transactionCalls, 0);
  });

  it("rejects expired, unknown, and consumed tokens with the same safe response", async () => {
    const { token } = await seedResetState({ expiresAt: new Date(RESET_TIME.getTime() - 1) });
    const expired = await completePasswordReset({ token: token.token, newPassword: NEW_PASSWORD }).then(
      () => null,
      (error: unknown) => error,
    );
    control.state.resetTokens = [];
    const unknown = await completePasswordReset({ token: token.token, newPassword: NEW_PASSWORD }).then(
      () => null,
      (error: unknown) => error,
    );

    assert.ok(expired instanceof UnauthorizedError);
    assert.ok(unknown instanceof UnauthorizedError);
    assert.equal((expired as Error).message, (unknown as Error).message);
  });

  it("rejects invalid new passwords without touching tokens, hashes, sessions, or cookies", async () => {
    const { token, oldHash } = await seedResetState();
    await assert.rejects(
      () => completePasswordReset({ token: token.token, newPassword: "short" }),
      ValidationError,
    );

    assert.equal(control.transactionCalls, 0);
    assert.equal(control.state.resetTokens.length, 1);
    assert.equal(control.state.users.get("user-1")?.passwordHash, oldHash);
    assert.equal(control.state.sessions.length, 3);
    assert.deepEqual(control.cookieHeaders, []);
  });

  it("updates the password, consumes the token, revokes only that user's sessions, and clears the cookie", async () => {
    const { token, oldHash, otherHash } = await seedResetState();

    const result = await completePasswordReset({ token: token.token, newPassword: NEW_PASSWORD });

    assert.deepEqual(result, {
      message: "Password updated. Please sign in with your new password.",
    });
    assert.equal(control.transactionCalls, 1);
    assert.equal(control.state.resetTokens.length, 0);
    const newHash = control.state.users.get("user-1")!.passwordHash;
    assert.notEqual(newHash, oldHash);
    assert.equal(await verifyPassword(OLD_PASSWORD, newHash), false);
    assert.equal(await verifyPassword(NEW_PASSWORD, newHash), true);
    assert.equal(control.state.users.get("user-2")?.passwordHash, otherHash);
    assert.deepEqual(control.state.sessions, [{ id: "session-3", userId: "user-2" }]);
    assert.equal(control.cookieHeaders.length, 1);
    assert.match(control.cookieHeaders[0]!, /^spendwise_session=;/);
    assert.match(control.cookieHeaders[0]!, /Max-Age=0/);
  });

  it("rolls token consumption back when the password update fails", async () => {
    const { token, oldHash } = await seedResetState();
    control.failAt = "update";

    await assert.rejects(
      () => completePasswordReset({ token: token.token, newPassword: NEW_PASSWORD }),
      /Password reset could not be completed\./,
    );

    assert.equal(control.state.resetTokens.length, 1);
    assert.equal(control.state.users.get("user-1")?.passwordHash, oldHash);
    assert.equal(control.state.sessions.length, 3);
    assert.deepEqual(control.cookieHeaders, []);
  });

  it("rolls token consumption and password update back when session revocation fails", async () => {
    const { token, oldHash } = await seedResetState();
    control.failAt = "session-after-delete";

    await assert.rejects(
      () => completePasswordReset({ token: token.token, newPassword: NEW_PASSWORD }),
      /Password reset could not be completed\./,
    );

    assert.equal(control.state.resetTokens.length, 1);
    assert.equal(control.state.users.get("user-1")?.passwordHash, oldHash);
    assert.equal(control.state.sessions.length, 3);
    assert.deepEqual(control.cookieHeaders, []);
  });

  it("allows at most one concurrent redemption and rejects replay with the generic token response", async () => {
    const { token } = await seedResetState();

    const outcomes = await Promise.allSettled([
      completePasswordReset({ token: token.token, newPassword: NEW_PASSWORD }),
      completePasswordReset({ token: token.token, newPassword: "another-new-password" }),
    ]);

    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.ok(rejected.reason instanceof UnauthorizedError);
    assert.equal((rejected.reason as Error).message, "This password reset link is invalid or expired.");
    assert.equal(control.state.resetTokens.length, 0);
    assert.equal(control.state.sessions.filter((session) => session.userId === "user-1").length, 0);
    assert.equal(control.cookieHeaders.length, 1);
  });

  it("does not log raw tokens, passwords, or password hashes on database failure", async () => {
    const { token, oldHash } = await seedResetState();
    const logs: string[] = [];
    console.error = ((...args: unknown[]) => logs.push(args.map(String).join(" "))) as typeof console.error;
    control.failAt = "update";

    await assert.rejects(() => completePasswordReset({ token: token.token, newPassword: NEW_PASSWORD }));

    const emitted = logs.join(" ");
    assert.ok(!emitted.includes(token.token));
    assert.ok(!emitted.includes(token.tokenHash));
    assert.ok(!emitted.includes(NEW_PASSWORD));
    assert.ok(!emitted.includes(oldHash));
    assert.deepEqual(logs, []);
  });
});
