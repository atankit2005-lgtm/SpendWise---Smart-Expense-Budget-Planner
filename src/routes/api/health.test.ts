import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Route } from "./health";

type HealthRoute = {
  options: { server: { handlers: { GET: () => Promise<Response> } } };
};

const GET = (Route as unknown as HealthRoute).options.server.handlers.GET;

describe("GET /api/health", () => {
  it("responds 200 without any authentication", async () => {
    // No session, no cookies, no auth mocks in this file at all: the
    // handler must succeed for anonymous callers.
    const response = await GET();
    assert.equal(response.status, 200);
  });

  it("returns a small fixed JSON payload", async () => {
    const response = await GET();
    assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
    const text = await response.text();
    assert.ok(text.length <= 100, `payload unexpectedly large: ${text.length} bytes`);
    assert.deepEqual(JSON.parse(text), { status: "ok" });
  });

  it("never includes secrets, environment values, or stack traces", async () => {
    const response = await GET();
    const text = await response.text();
    assert.doesNotMatch(text, /DATABASE_URL|password|secret|token|postgres(ql)?:\/\//i);
    assert.doesNotMatch(text, /at .*\(.*:\d+:\d+\)/);
  });

  it("disables caching so probes always see fresh status", async () => {
    const response = await GET();
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });
});
