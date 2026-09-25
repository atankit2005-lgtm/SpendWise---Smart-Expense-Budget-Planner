import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPersistedUpdate } from "./settings-persistence";

describe("settings and profile persistence lifecycle", () => {
  it("retains the server-confirmed settings value", async () => {
    let value = false;

    await applyPersistedUpdate(false, true, async () => true, (next) => {
      value = next;
    });

    assert.equal(value, true);
  });

  it("restores the previous settings value after persistence fails", async () => {
    let value = false;

    await assert.rejects(
      () =>
        applyPersistedUpdate(false, true, async () => {
          throw new Error("settings write failed");
        }, (next) => {
          value = next;
        }),
      /settings write failed/,
    );

    assert.equal(value, false);
  });

  it("retains the server-confirmed profile value", async () => {
    let value = "old name";

    await applyPersistedUpdate("old name", "new name", async () => "saved name", (next) => {
      value = next;
    });

    assert.equal(value, "saved name");
  });

  it("restores the previous profile value after persistence fails", async () => {
    let value = "old name";

    await assert.rejects(
      () =>
        applyPersistedUpdate("old name", "new name", async () => {
          throw new Error("profile write failed");
        }, (next) => {
          value = next;
        }),
      /profile write failed/,
    );

    assert.equal(value, "old name");
  });
});
