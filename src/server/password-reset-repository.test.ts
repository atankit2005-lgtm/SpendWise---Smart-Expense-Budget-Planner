import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";

import { passwordResetTokens } from "../../db/schema";
import {
  consumePasswordResetToken,
  replacePasswordResetToken,
  type PasswordResetTokenExecutor,
  type PasswordResetTokenRecord,
} from "./repositories/password-reset-tokens";
import {
  generatePasswordResetToken,
  type PasswordResetTokenHash,
} from "./password-reset-token";

function makeRecord(
  values: { userId: string; tokenHash: PasswordResetTokenHash; expiresAt: Date },
): PasswordResetTokenRecord {
  return {
    id: "reset-token-id",
    userId: values.userId,
    tokenHash: values.tokenHash,
    expiresAt: values.expiresAt,
    createdAt: new Date("2026-09-25T12:00:00.000Z"),
  };
}

function createFakeExecutor(initialRows: PasswordResetTokenRecord[] = []) {
  const rows = [...initialRows];
  const operations: string[] = [];
  const conditions: unknown[] = [];
  let insertedValues: Record<string, unknown> | undefined;

  const executor = {
    delete: () => ({
      where: (condition: unknown) => {
        operations.push("delete");
        conditions.push(condition);
        const deleted = [...rows];
        rows.length = 0;
        return {
          then: (resolve: (value: undefined) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(undefined).then(resolve, reject),
          returning: async () => deleted,
        };
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          operations.push("insert");
          insertedValues = values;
          const created = makeRecord(
            values as {
              userId: string;
              tokenHash: PasswordResetTokenHash;
              expiresAt: Date;
            },
          );
          rows.push(created);
          return [created];
        },
      }),
    }),
  } as unknown as PasswordResetTokenExecutor;

  return { executor, rows, operations, conditions, getInsertedValues: () => insertedValues };
}

describe("password reset token persistence", () => {
  it("replaces the user's prior row and persists only its digest and expiry", async () => {
    const previous = generatePasswordResetToken();
    const next = generatePasswordResetToken();
    const fake = createFakeExecutor([
      makeRecord({
        userId: "user-1",
        tokenHash: previous.tokenHash,
        expiresAt: previous.expiresAt,
      }),
    ]);

    const created = await replacePasswordResetToken(
      "user-1",
      next.tokenHash,
      next.expiresAt,
      fake.executor,
    );

    assert.deepEqual(fake.operations, ["delete", "insert"]);
    assert.equal(fake.rows.length, 1);
    assert.equal(created.userId, "user-1");
    assert.equal(created.tokenHash, next.tokenHash);
    assert.equal(created.expiresAt.getTime(), next.expiresAt.getTime());
    assert.notEqual(created.tokenHash, next.token);
    assert.deepEqual(fake.getInsertedValues(), {
      userId: "user-1",
      tokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
    });
  });

  it("consumes only an unexpired token digest", async () => {
    const generated = generatePasswordResetToken();
    const now = new Date("2026-09-25T12:00:00.000Z");
    const expected = makeRecord({
      userId: "user-1",
      tokenHash: generated.tokenHash,
      expiresAt: new Date("2026-09-25T12:30:00.000Z"),
    });
    const fake = createFakeExecutor([expected]);

    const consumed = await consumePasswordResetToken(generated.tokenHash, now, fake.executor);
    const query = new PgDialect().sqlToQuery(fake.conditions[0] as Parameters<PgDialect["sqlToQuery"]>[0]);

    assert.equal(consumed, expected);
    assert.match(query.sql, /"token_hash" = \$1/);
    assert.match(query.sql, /"expires_at" > \$2/);
    assert.deepEqual(query.params, [generated.tokenHash, now.toISOString()]);
  });

  it("declares the digest uniqueness, one-token-per-user constraint, expiry index, and cascading user foreign key", () => {
    const config = getTableConfig(passwordResetTokens);
    const tokenHashColumn = config.columns.find((column) => column.name === "token_hash");
    const userIndex = config.indexes.find(
      (index) => index.config.name === "password_reset_tokens_user_id_unique_idx",
    );
    const expiryIndex = config.indexes.find(
      (index) => index.config.name === "password_reset_tokens_user_expires_at_idx",
    );
    const foreignKey = config.foreignKeys[0];
    const indexColumnNames = (index: (typeof config.indexes)[number] | undefined) =>
      index?.config.columns.map((column) => ("name" in column ? column.name : null));

    assert.equal(tokenHashColumn?.isUnique, true);
    assert.equal(userIndex?.config.unique, true);
    assert.deepEqual(indexColumnNames(userIndex), ["user_id"]);
    assert.deepEqual(indexColumnNames(expiryIndex), ["user_id", "expires_at"]);
    assert.equal(foreignKey?.onDelete, "cascade");
    assert.deepEqual(
      foreignKey?.reference().foreignColumns.map((column) => column.name),
      ["id"],
    );
  });
});
