/**
 * Stage 8.3 error-boundary tests: AppError.statusCode must be mapped onto the
 * HTTP response status, and everything the client can observe (message and
 * stack of the re-thrown error, which seroval serializes onto the wire) must
 * be sanitized — no stack frames, no configuration details, no driver errors.
 *
 * `setResponseStatus` from the request-context module is mocked so the tests
 * can capture the mapped status and simulate a missing request context.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

const control = {
  statuses: [] as number[],
  statusCallThrows: false,
};

mock.module("@tanstack/react-start/server", {
  namedExports: {
    setResponseStatus: (code?: number) => {
      if (control.statusCallThrows) throw new Error("no request context");
      control.statuses.push(code ?? 0);
    },
  },
});

const {
  GENERIC_ERROR_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
  mapErrorForClient,
  withErrorBoundary,
} = await import("./error-boundary");
const { ConfigurationError } = await import("./env");
const {
  DuplicateResourceError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} = await import("./errors");

beforeEach(() => {
  control.statuses = [];
  control.statusCallThrows = false;
});

async function captureError(run: () => Promise<unknown>): Promise<Error> {
  try {
    await withErrorBoundary(run);
  } catch (error) {
    return error as Error;
  }
  throw new assert.AssertionError({ message: "expected withErrorBoundary to throw" });
}

describe("error boundary → HTTP status mapping (Stage 8.3)", () => {
  it("maps every intentional AppError status onto the response", async () => {
    const cases: Array<[number, () => Error]> = [
      [400, () => new ValidationError("Enter a valid email address.")],
      [401, () => new UnauthorizedError("Invalid email or password.")],
      [404, () => new NotFoundError("User not found.")],
      [409, () => new DuplicateResourceError("A category with that name and type already exists.")],
      [429, () => new TooManyRequestsError("Too many attempts. Please try again later.")],
    ];

    for (const [expectedStatus, makeError] of cases) {
      const original = makeError();
      const thrown = await captureError(async () => {
        throw original;
      });
      assert.deepEqual(control.statuses, [expectedStatus]);
      assert.equal(thrown.message, original.message, "user-facing AppError messages pass through");
      control.statuses = [];
    }
  });

  it("maps configuration failures to 503 with a generic message", async () => {
    const thrown = await captureError(async () => {
      throw new ConfigurationError(
        "DATABASE_URL is not set. Refusing to serve database-backed requests in production.",
      );
    });

    assert.deepEqual(control.statuses, [503]);
    assert.equal(thrown.message, SERVICE_UNAVAILABLE_MESSAGE);
    assert.ok(!thrown.message.includes("DATABASE_URL"));
    assert.ok(!String(thrown.stack).includes("DATABASE_URL"));
  });

  it("turns unexpected errors into a generic 500 without detail leakage", async () => {
    const thrown = await captureError(async () => {
      throw new Error(
        'connect ECONNREFUSED postgres://spendwise:supersecret@db.internal:5432/app duplicate key value violates unique constraint "users_email_key"',
      );
    });

    assert.deepEqual(control.statuses, [500]);
    assert.equal(thrown.message, GENERIC_ERROR_MESSAGE);
    const wire = `${thrown.message}\n${String(thrown.stack)}`;
    for (const secret of ["ECONNREFUSED", "postgres://", "supersecret", "users_email_key", "db.internal"]) {
      assert.ok(!wire.includes(secret), `client-visible error must not contain "${secret}"`);
    }
  });

  it("handles non-Error throws as generic 500s", async () => {
    const thrown = await captureError(async () => {
      throw "raw string failure with /srv/app/secrets path";
    });

    assert.deepEqual(control.statuses, [500]);
    assert.equal(thrown.message, GENERIC_ERROR_MESSAGE);
  });

  it("strips stack frames and custom properties from what crosses the wire", async () => {
    const thrown = await captureError(async () => {
      throw new UnauthorizedError("Invalid email or password.");
    });

    assert.equal(thrown.name, "Error", "internal class names must not surface");
    assert.equal(thrown.stack, "Error: Invalid email or password.");
    assert.ok(!String(thrown.stack).includes("\n    at "), "no stack frames");
    assert.equal((thrown as unknown as { statusCode?: unknown }).statusCode, undefined);
    assert.equal((thrown as unknown as { code?: unknown }).code, undefined);
  });

  it("returns successful results untouched and sets no status", async () => {
    const result = await withErrorBoundary(async () => ({ ok: true }));
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(control.statuses, []);
  });

  it("still sanitizes when the response status cannot be set (no request context)", async () => {
    control.statusCallThrows = true;
    const thrown = await captureError(async () => {
      throw new Error("DATABASE_URL connection pool exhausted");
    });

    assert.equal(thrown.message, GENERIC_ERROR_MESSAGE);
    assert.deepEqual(control.statuses, []);
  });

  it("mapErrorForClient exposes the same contract without side effects", () => {
    assert.deepEqual(mapErrorForClient(new ValidationError("bad input")), {
      statusCode: 400,
      message: "bad input",
    });
    assert.deepEqual(mapErrorForClient(new ConfigurationError("internal detail")), {
      statusCode: 503,
      message: SERVICE_UNAVAILABLE_MESSAGE,
    });
    assert.deepEqual(mapErrorForClient(new Error("internal detail")), {
      statusCode: 500,
      message: GENERIC_ERROR_MESSAGE,
    });
    assert.deepEqual(control.statuses, []);
  });
});
