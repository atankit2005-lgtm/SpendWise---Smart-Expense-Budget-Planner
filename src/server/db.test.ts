import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isDatabaseConfigured } from "./db";

describe("database configuration", () => {
  it("does not require DATABASE_URL at import time", () => {
    assert.equal(typeof isDatabaseConfigured(), "boolean");
  });
});
