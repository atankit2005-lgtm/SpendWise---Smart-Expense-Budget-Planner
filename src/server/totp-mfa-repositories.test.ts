import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTableName } from "drizzle-orm";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";

import {
  pendingTotpMfaEnrollments,
  totpMfaConfigurations,
  totpMfaLoginChallenges,
  totpMfaRecoveryCodes,
} from "../../db/schema";
import {
  activateTotpMfa,
  advanceAcceptedTotpStep,
  getTotpMfaConfiguration,
  lockUserForTotpMfaEnrollment,
  type TotpMfaConfigurationExecutor,
} from "./repositories/totp-mfa-configurations";
import {
  replacePendingTotpMfaEnrollment,
  getUnexpiredPendingTotpMfaEnrollment,
  lockUnexpiredPendingTotpMfaEnrollment,
} from "./repositories/pending-totp-mfa-enrollments";
import {
  consumeTotpMfaRecoveryCode,
  replaceTotpMfaRecoveryCodeDigests,
} from "./repositories/totp-mfa-recovery-codes";
import {
  consumeTotpMfaLoginChallenge,
  createTotpMfaLoginChallenge,
  incrementTotpMfaLoginChallengeAttempts,
} from "./repositories/totp-mfa-login-challenges";
import { digestMfaValue } from "./mfa-digests";
import type { MfaDigest } from "./mfa-digests";
import { encryptTotpSecret } from "./totp-crypto";

interface CapturedOperation {
  kind: "delete" | "insert" | "select" | "update";
  table: string;
  where?: unknown;
  set?: Record<string, unknown>;
  values?: unknown;
  conflict?: unknown;
  forUpdate?: boolean;
}

function createExecutorSpy(options: { selectedRows?: unknown[]; updatedRows?: unknown[] } = {}) {
  const operations: CapturedOperation[] = [];
  const executor = {
    delete(table: unknown) {
      const operation: CapturedOperation = {
        kind: "delete",
        table: getTableName(table as Parameters<typeof getTableName>[0]),
      };
      operations.push(operation);
      const query = {
        where(condition: unknown) {
          operation.where = condition;
          return {
            then(resolve: (value: undefined) => unknown, reject: (error: unknown) => unknown) {
              return Promise.resolve(undefined).then(resolve, reject);
            },
            returning: async () => [],
          };
        },
      };
      return query;
    },
    insert(table: unknown) {
      const operation: CapturedOperation = {
        kind: "insert",
        table: getTableName(table as Parameters<typeof getTableName>[0]),
      };
      operations.push(operation);
      const builder = {
        onConflictDoUpdate(config: unknown) {
          operation.conflict = config;
          return builder;
        },
        onConflictDoNothing(config: unknown) {
          operation.conflict = config;
          return builder;
        },
        returning: async () => {
          const value =
            typeof operation.values === "object" && operation.values !== null
              ? operation.values
              : {};
          return [{ id: "new-record", ...value }];
        },
        then(resolve: (value: undefined) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve(undefined).then(resolve, reject);
        },
      };
      return {
        values(values: unknown) {
          operation.values = values;
          return builder;
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          const operation: CapturedOperation = {
            kind: "select",
            table: getTableName(table as Parameters<typeof getTableName>[0]),
          };
          operations.push(operation);
          return {
            where(condition: unknown) {
              operation.where = condition;
              return {
                for() {
                  operation.forUpdate = true;
                  return this;
                },
                then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
                  return Promise.resolve(options.selectedRows ?? []).then(resolve, reject);
                },
                limit: async () => options.selectedRows ?? [],
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      const operation: CapturedOperation = {
        kind: "update",
        table: getTableName(table as Parameters<typeof getTableName>[0]),
      };
      operations.push(operation);
      return {
        set(set: Record<string, unknown>) {
          operation.set = set;
          return {
            where(condition: unknown) {
              operation.where = condition;
              return {
                returning: async () => options.updatedRows ?? [],
              };
            },
          };
        },
      };
    },
  };
  return { executor: executor as never, operations };
}

function queryFor(condition: unknown): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

function assertUserForeignKey(table: Parameters<typeof getTableConfig>[0]): void {
  const config = getTableConfig(table);
  assert.equal(config.foreignKeys.length, 1);
  assert.equal(config.foreignKeys[0]?.onDelete, "cascade");
  assert.deepEqual(
    config.foreignKeys[0]?.reference().foreignColumns.map((column) => column.name),
    ["id"],
  );
}

describe("TOTP MFA repositories", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  const userId = "00000000-0000-4000-8000-000000000001";
  const otherUserId = "00000000-0000-4000-8000-000000000002";
  const digest = digestMfaValue("test-token");
  const encryptedSecret = encryptTotpSecret("JBSWY3DPEHPK3PXP", {
    key: Buffer.alloc(32, 0x55),
    keyId: "primary",
  });

  it("declares one active and pending configuration per user, globally unique digests, and cascading FKs", () => {
    assertUserForeignKey(totpMfaConfigurations);
    assertUserForeignKey(pendingTotpMfaEnrollments);
    assertUserForeignKey(totpMfaRecoveryCodes);
    assertUserForeignKey(totpMfaLoginChallenges);

    const active = getTableConfig(totpMfaConfigurations);
    const pending = getTableConfig(pendingTotpMfaEnrollments);
    const recovery = getTableConfig(totpMfaRecoveryCodes);
    const challenges = getTableConfig(totpMfaLoginChallenges);
    const indexColumns = (name: string, indexes: typeof active.indexes) =>
      indexes
        .find((index) => index.config.name === name)
        ?.config.columns.map((column) => ("name" in column ? column.name : null));

    assert.equal(
      indexColumns("totp_mfa_configurations_user_id_unique_idx", active.indexes)?.[0],
      "user_id",
    );
    assert.equal(
      indexColumns("totp_mfa_pending_enrollments_user_id_unique_idx", pending.indexes)?.[0],
      "user_id",
    );
    assert.deepEqual(
      indexColumns("totp_mfa_pending_enrollments_user_expires_at_idx", pending.indexes),
      ["user_id", "expires_at"],
    );
    assert.equal(recovery.columns.find((column) => column.name === "digest")?.isUnique, true);
    assert.equal(challenges.columns.find((column) => column.name === "digest")?.isUnique, true);
    assert.deepEqual(
      indexColumns("totp_mfa_recovery_codes_user_consumed_at_idx", recovery.indexes),
      ["user_id", "consumed_at"],
    );
    assert.deepEqual(
      indexColumns("totp_mfa_login_challenges_user_expires_consumed_idx", challenges.indexes),
      ["user_id", "expires_at", "consumed_at"],
    );
  });

  it("replaces only the current user's pending setup, filters expired rows, and rejects invalid expiry", async () => {
    const fake = createExecutorSpy();
    const created = await replacePendingTotpMfaEnrollment(
      userId,
      {
        secret: encryptedSecret,
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
      },
      fake.executor,
    );

    assert.deepEqual(
      fake.operations.map((operation) => operation.kind),
      ["delete", "insert"],
    );
    assert.deepEqual(queryFor(fake.operations[0]?.where).params, [userId]);
    assert.equal(created.userId, userId);
    const pendingValues = fake.operations[1]?.values as {
      userId: string;
      encryptedSecret: string;
      encryptionKeyId: string;
    };
    assert.equal(pendingValues.userId, userId);
    assert.equal(pendingValues.encryptedSecret, encryptedSecret.ciphertext);
    assert.equal(pendingValues.encryptionKeyId, encryptedSecret.keyId);

    const selected = createExecutorSpy();
    assert.equal(await getUnexpiredPendingTotpMfaEnrollment(userId, now, selected.executor), null);
    const lookup = queryFor(selected.operations[0]?.where);
    assert.match(lookup.sql, /"user_id" = \$1/);
    assert.match(lookup.sql, /"expires_at" > \$2/);
    assert.deepEqual(lookup.params, [userId, now.toISOString()]);

    const invalid = createExecutorSpy();
    await assert.rejects(
      replacePendingTotpMfaEnrollment(
        userId,
        { secret: encryptedSecret, expiresAt: now, createdAt: now },
        invalid.executor,
      ),
      RangeError,
    );
    assert.equal(invalid.operations.length, 0);

    const mismatchedKeyId = createExecutorSpy();
    await assert.rejects(
      replacePendingTotpMfaEnrollment(
        userId,
        {
          secret: { ...encryptedSecret, keyId: "other-key" },
          expiresAt: new Date(now.getTime() + 60_000),
          createdAt: now,
        },
        mismatchedKeyId.executor,
      ),
    );
    assert.equal(mismatchedKeyId.operations.length, 0);
    assert.notEqual(userId, otherUserId);
  });

  it("locks an unexpired pending row inside the caller's transaction", async () => {
    const fake = createExecutorSpy();
    assert.equal(await lockUnexpiredPendingTotpMfaEnrollment(userId, now, fake.executor), null);
    const operation = fake.operations[0];
    assert.equal(operation?.table, "totp_mfa_pending_enrollments");
    assert.equal(operation?.forUpdate, true);
    const where = queryFor(operation?.where);
    assert.match(where.sql, /"user_id" = \$1/);
    assert.match(where.sql, /"expires_at" > \$2/);
    assert.deepEqual(where.params, [userId, now.toISOString()]);
  });

  it("reads active MFA exclusively from the dedicated configuration table", async () => {
    const fake = createExecutorSpy();
    assert.equal(await getTotpMfaConfiguration(userId, fake.executor), null);
    assert.equal(fake.operations[0]?.table, "totp_mfa_configurations");
    assert.deepEqual(queryFor(fake.operations[0]?.where).params, [userId]);
  });

  it("locks the authenticated user's parent row to serialize enrollment changes", async () => {
    const fake = createExecutorSpy({
      selectedRows: [{ id: userId }],
    });
    assert.equal(await lockUserForTotpMfaEnrollment(userId, fake.executor), true);
    const lock = fake.operations[0];
    assert.equal(lock?.table, "users");
    assert.equal(lock?.forUpdate, true);
    assert.deepEqual(queryFor(lock?.where).params, [userId]);
  });

  it("activates in the supplied executor and advances the replay step only monotonically per user", async () => {
    const fake = createExecutorSpy();
    const active = await activateTotpMfa(
      userId,
      { secret: encryptedSecret, acceptedStep: 42, activatedAt: now },
      fake.executor as TotpMfaConfigurationExecutor,
    );
    assert.ok(active);
    assert.equal(active.userId, userId);
    assert.deepEqual(
      fake.operations.map((operation) => [operation.kind, operation.table]),
      [
        ["delete", "totp_mfa_pending_enrollments"],
        ["insert", "totp_mfa_configurations"],
      ],
    );
    assert.deepEqual(queryFor(fake.operations[0]?.where).params, [userId]);
    assert.ok(fake.operations[1]?.conflict);

    const updateSpy = createExecutorSpy();
    await advanceAcceptedTotpStep(userId, 42, now, updateSpy.executor);
    const update = updateSpy.operations[0];
    const watermark = queryFor(update?.where);
    assert.match(watermark.sql, /"user_id" = \$1/);
    assert.match(watermark.sql, /"last_accepted_step" is null/i);
    assert.match(watermark.sql, /"last_accepted_step" < \$2/);
    assert.deepEqual(watermark.params, [userId, 42]);
    await assert.rejects(advanceAcceptedTotpStep(userId, -1, now, updateSpy.executor), RangeError);
    assert.equal(updateSpy.operations.length, 1);
  });

  it("replaces and consumes recovery digests with user-scoped atomic updates", async () => {
    const fake = createExecutorSpy();
    await replaceTotpMfaRecoveryCodeDigests(userId, [digest], fake.executor, now);
    assert.deepEqual(
      fake.operations.map((operation) => operation.kind),
      ["delete", "insert"],
    );
    assert.deepEqual(queryFor(fake.operations[0]?.where).params, [userId]);
    assert.equal(
      (fake.operations[1]?.values as Array<{ userId: string; digest: MfaDigest }>)[0]?.userId,
      userId,
    );
    assert.equal(
      (fake.operations[1]?.values as Array<{ userId: string; digest: MfaDigest }>)[0]?.digest,
      digest,
    );

    const consumeSpy = createExecutorSpy();
    await consumeTotpMfaRecoveryCode(userId, digest, now, consumeSpy.executor);
    const consume = consumeSpy.operations[0];
    const condition = queryFor(consume?.where);
    assert.equal(consume?.kind, "update");
    assert.match(condition.sql, /"user_id" = \$1/);
    assert.match(condition.sql, /"digest" = \$2/);
    assert.match(condition.sql, /"consumed_at" is null/i);
    assert.deepEqual(condition.params, [userId, digest]);
  });

  it("enforces challenge expiry, attempt ceilings, single-use state, and user isolation", async () => {
    const fake = createExecutorSpy();
    const created = await createTotpMfaLoginChallenge(
      userId,
      { digest, expiresAt: new Date(now.getTime() + 60_000), createdAt: now },
      fake.executor,
    );
    assert.equal(created.userId, userId);
    const attempts = (fake.operations[0]?.values as { attempts?: number }).attempts;
    assert.equal(attempts, 0);
    assert.equal((fake.operations[0]?.values as { userId: string }).userId, userId);

    const consumeSpy = createExecutorSpy();
    await consumeTotpMfaLoginChallenge(userId, digest, now, consumeSpy.executor);
    const consume = queryFor(consumeSpy.operations[0]?.where);
    assert.match(consume.sql, /"user_id" = \$1/);
    assert.match(consume.sql, /"digest" = \$2/);
    assert.match(consume.sql, /"expires_at" > \$3/);
    assert.match(consume.sql, /"consumed_at" is null/i);
    assert.deepEqual(consume.params, [userId, digest, now.toISOString()]);

    const attemptSpy = createExecutorSpy();
    await incrementTotpMfaLoginChallengeAttempts(userId, digest, now, attemptSpy.executor);
    const attemptUpdate = attemptSpy.operations[0];
    assert.match(queryFor(attemptUpdate?.set?.["attempts"]).sql, /"attempts" \+ 1/);
    const attemptCondition = queryFor(attemptUpdate?.where);
    assert.deepEqual(attemptCondition.params, [userId, digest, now.toISOString()]);

    const invalid = createExecutorSpy();
    await assert.rejects(
      createTotpMfaLoginChallenge(
        userId,
        { digest, expiresAt: now, createdAt: now },
        invalid.executor,
      ),
      RangeError,
    );
    await assert.rejects(
      createTotpMfaLoginChallenge(
        userId,
        { digest, expiresAt: new Date(now.getTime() + 6 * 60_000), createdAt: now },
        invalid.executor,
      ),
      RangeError,
    );
    assert.equal(invalid.operations.length, 0);
    assert.notEqual(userId, otherUserId);
  });

  it("leaves replacement atomicity to the caller's transaction and propagates failures for rollback", async () => {
    const persisted = [{ userId, encryptedSecret: "old" }];
    async function transaction<T>(callback: (executor: never) => Promise<T>): Promise<T> {
      const staged = [...persisted];
      const transactionExecutor = {
        delete: () => ({
          where: () => {
            staged.length = 0;
            return {
              then(resolve: (value: undefined) => unknown, reject: (error: unknown) => unknown) {
                return Promise.resolve(undefined).then(resolve, reject);
              },
            };
          },
        }),
        insert: () => ({
          values: () => {
            throw new Error("simulated insert failure");
          },
        }),
      } as never;
      const result = await callback(transactionExecutor);
      persisted.splice(0, persisted.length, ...staged);
      return result;
    }

    await assert.rejects(
      transaction((executor) =>
        replacePendingTotpMfaEnrollment(
          userId,
          {
            secret: encryptedSecret,
            expiresAt: new Date(now.getTime() + 60_000),
            createdAt: now,
          },
          executor,
        ),
      ),
      /simulated insert failure/,
    );
    assert.deepEqual(persisted, [{ userId, encryptedSecret: "old" }]);
  });
});
