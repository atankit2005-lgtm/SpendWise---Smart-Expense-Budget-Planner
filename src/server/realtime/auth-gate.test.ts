import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { UnauthorizedError } from "@/server/errors";
import { resolveRealtimeAuth } from "./auth-gate";

describe("realtime auth gate", () => {
  it("passes through the resolved user id when the session is valid", async () => {
    const result = await resolveRealtimeAuth(async () => "user-123");

    assert.deepEqual(result, { ok: true, userId: "user-123" });
  });

  it("rejects with a 401 Response when there is no valid session", async () => {
    const result = await resolveRealtimeAuth(async () => {
      throw new UnauthorizedError("You must be signed in to access SpendWise.");
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 401);
    }
  });

  it("does not swallow unrelated errors as an auth failure", async () => {
    await assert.rejects(
      () =>
        resolveRealtimeAuth(async () => {
          throw new Error("database unreachable");
        }),
      /database unreachable/,
    );
  });
});
