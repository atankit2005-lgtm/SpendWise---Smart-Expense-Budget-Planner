import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

const control = {
  cookie: "",
  deleteCalls: 0,
};

mock.module("@tanstack/react-start/server", {
  namedExports: {
    getRequestHeader: (name: string) => (name === "cookie" ? control.cookie : undefined),
    setResponseHeader: () => {},
  },
});

const fakeDb = {
  delete: () => ({
    where: async () => {
      control.deleteCalls += 1;
    },
  }),
};

mock.module("./db", {
  defaultExport: fakeDb,
  namedExports: { db: fakeDb, getDb: () => fakeDb, isDatabaseConfigured: () => true },
});

const { destroyOtherSessions, hashSessionToken } = await import("./session");
const { UnauthorizedError } = await import("./errors");

beforeEach(() => {
  control.cookie = "";
  control.deleteCalls = 0;
});

describe("other-session revocation (Stage 9.3A)", () => {
  it("rejects when the current session cookie is missing", async () => {
    await assert.rejects(() => destroyOtherSessions("user-1"), UnauthorizedError);
    assert.equal(control.deleteCalls, 0);
  });

  it("performs one user-scoped deletion while preserving the current token hash", async () => {
    const token = "current-session-token";
    control.cookie = `spendwise_session=${token}`;

    await destroyOtherSessions("user-1");

    assert.equal(control.deleteCalls, 1);
    assert.match(hashSessionToken(token), /^[a-f0-9]{64}$/);
  });

  it("is safe to repeat when there are no other sessions", async () => {
    control.cookie = "spendwise_session=current-session-token";

    await destroyOtherSessions("user-1");
    await destroyOtherSessions("user-1");

    assert.equal(control.deleteCalls, 2);
  });
});
