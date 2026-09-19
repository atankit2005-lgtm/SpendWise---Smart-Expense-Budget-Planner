import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSessionToken, hashSessionToken, readSessionToken } from "./session";

describe("session tokens", () => {
  it("creates opaque tokens and stores deterministic non-reversible digests", () => {
    const token = createSessionToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(hashSessionToken(token), /^[a-f0-9]{64}$/);
    assert.notEqual(hashSessionToken(token), token);
  });

  it("reads only the named session cookie", () => {
    assert.equal(readSessionToken("theme=dark; spendwise_session=abc=def; another=value"), "abc=def");
    assert.equal(readSessionToken("theme=dark"), null);
  });
});
