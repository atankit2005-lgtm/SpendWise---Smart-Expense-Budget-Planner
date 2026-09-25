import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPersistedUpdate } from "./settings-persistence";

describe("settings and profile persistence lifecycle", () => {
  it("retains the server-confirmed settings value", async () => {
    let value = false;

    await applyPersistedUpdate(false, async () => true, (next) => {
      value = next;
    });

    assert.equal(value, true);
  });

  it("restores the previous settings value after persistence fails", async () => {
    let value = false;

    await assert.rejects(
      () =>
        applyPersistedUpdate(false, async () => {
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

    await applyPersistedUpdate("old name", async () => "saved name", (next) => {
      value = next;
    });

    assert.equal(value, "saved name");
  });

  it("restores the previous profile value after persistence fails", async () => {
    let value = "old name";

    await assert.rejects(
      () =>
        applyPersistedUpdate("old name", async () => {
          throw new Error("profile write failed");
        }, (next) => {
          value = next;
        }),
      /profile write failed/,
    );

    assert.equal(value, "old name");
  });

  it("does not change settings before persistence resolves", async () => {
    let value = false;
    let resolve!: (confirmed: boolean) => void;
    const pending = applyPersistedUpdate(
      false,
      () => new Promise<boolean>((finish) => {
        resolve = finish;
      }),
      (next) => {
        value = next;
      },
    );

    assert.equal(value, false);
    resolve(true);
    await pending;
    assert.equal(value, true);
  });

  it("does not allow an older preference response to overwrite a newer one", async () => {
    let value = false;
    let currentRequest = 0;
    const resolvers: Array<(confirmed: boolean) => void> = [];
    const persist = () =>
      new Promise<boolean>((resolve) => {
        resolvers.push(resolve);
      });
    const request = () => {
      const generation = ++currentRequest;
      return applyPersistedUpdate(
        value,
        persist,
        (next) => {
          value = next;
        },
        () => generation === currentRequest,
      );
    };

    const older = request();
    const newer = request();
    resolvers[1]!(true);
    await newer;
    resolvers[0]!(false);
    await older;

    assert.equal(value, true);
  });
});
