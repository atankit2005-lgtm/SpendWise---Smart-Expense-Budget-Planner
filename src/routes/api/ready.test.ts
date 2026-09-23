import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

// Mutable switchboard controlling the mocked database layer. Each test file
// runs in its own process under the node:test runner, so these mocks cannot
// leak into other suites.
const control: {
  configured: boolean;
  executeError: unknown;
  getDbError: unknown;
  executeCalls: number;
  getDbCalls: number;
} = {
  configured: true,
  executeError: undefined,
  getDbError: undefined,
  executeCalls: 0,
  getDbCalls: 0,
};

mock.module("../../server/db", {
  namedExports: {
    isDatabaseConfigured: () => control.configured,
    getDb: () => {
      control.getDbCalls += 1;
      if (control.getDbError) throw control.getDbError;
      return {
        execute: async () => {
          control.executeCalls += 1;
          if (control.executeError) throw control.executeError;
          return [{ "?column?": 1 }];
        },
      };
    },
  },
  defaultExport: undefined,
});

const { Route } = await import("./ready");

type ReadyRoute = {
  options: { server: { handlers: { GET: () => Promise<Response> } } };
};

const GET = (Route as unknown as ReadyRoute).options.server.handlers.GET;

const SENSITIVE_ERROR_MESSAGE =
  'FATAL: password authentication failed for user "admin" ' +
  "(postgres://admin:supersecret@db.internal.example:5432/spendwise)";

describe("GET /api/ready", () => {
  beforeEach(() => {
    control.configured = true;
    control.executeError = undefined;
    control.getDbError = undefined;
    control.executeCalls = 0;
    control.getDbCalls = 0;
  });

  it("responds 200 ready when the database answers, without any authentication", async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
    assert.deepEqual(JSON.parse(await response.text()), { status: "ready" });
    assert.equal(control.executeCalls, 1, "must probe the database exactly once");
  });

  it("responds 503 when DATABASE_URL is not configured and never touches the driver", async () => {
    control.configured = false;
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(await response.text()), { status: "unavailable" });
    assert.equal(control.getDbCalls, 0);
    assert.equal(control.executeCalls, 0);
  });

  it("responds 503 when the probe query fails", async () => {
    control.executeError = new Error(SENSITIVE_ERROR_MESSAGE);
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(await response.text()), { status: "unavailable" });
  });

  it("responds 503 when establishing the connection throws", async () => {
    control.getDbError = new Error(SENSITIVE_ERROR_MESSAGE);
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(await response.text()), { status: "unavailable" });
  });

  it("never leaks credentials, connection strings, or stack traces on failure", async () => {
    control.executeError = new Error(SENSITIVE_ERROR_MESSAGE);
    const response = await GET();
    const text = await response.text();
    for (const forbidden of [
      "supersecret",
      "postgres://",
      "postgresql://",
      "db.internal.example",
      "admin",
      "password",
      "DATABASE_URL",
      "stack",
      "Error:",
    ]) {
      assert.ok(!text.includes(forbidden), `response leaked "${forbidden}": ${text}`);
    }
  });

  it("disables caching so probes always see fresh status", async () => {
    const response = await GET();
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });
});
