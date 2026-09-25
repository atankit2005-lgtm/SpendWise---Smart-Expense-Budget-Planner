import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const control = {
  apiKey: "resend-secret-test-key",
  fromEmail: "SpendWise <no-reply@example.com>",
  appBaseUrl: new URL("https://canonical.spendwise.example"),
  sendCalls: [] as Array<Record<string, unknown>>,
  providerFailure: false,
};

mock.module("./env", {
  namedExports: {
    requirePasswordResetEmailConfiguration: () => ({
      apiKey: control.apiKey,
      fromEmail: control.fromEmail,
      appBaseUrl: control.appBaseUrl,
    }),
  },
});

mock.module("resend", {
  namedExports: {
    Resend: class {
      emails = {
        send: async (message: Record<string, unknown>) => {
          control.sendCalls.push(message);
          if (control.providerFailure) {
            return { data: null, error: { message: "provider secret and request details" } };
          }
          return { data: { id: "email-id" }, error: null };
        },
      };
    },
  },
});

const { sendPasswordResetEmail } = await import("./password-reset-email");

describe("password reset email provider", () => {
  it("sends a branded message with the canonical reset URL and expiry", async () => {
    const token = "secure-raw-token";
    const expiresAt = new Date("2026-09-25T23:30:00.000Z");

    await sendPasswordResetEmail("person@example.com", token, expiresAt);

    const message = control.sendCalls[0]!;
    assert.equal(message["from"], control.fromEmail);
    assert.equal(message["to"], "person@example.com");
    assert.equal(message["subject"], "Reset your SpendWise password");
    const text = String(message["text"]);
    const html = String(message["html"]);
    const resetUrl = new URL(text.match(/https:\/\/\S+/)![0]!);

    assert.equal(resetUrl.origin, control.appBaseUrl.origin);
    assert.equal(resetUrl.pathname, "/reset-password");
    assert.equal(resetUrl.searchParams.get("token"), token);
    assert.match(text, /30 minutes|Sep 25, 2026/);
    assert.match(text, /If you did not request this reset, you can ignore this email\./);
    assert.match(html, /SpendWise password reset/);
    assert.match(html, /https:\/\/canonical\.spendwise\.example\/reset-password\?token=secure-raw-token/);
    assert.equal((text.match(/secure-raw-token/g) ?? []).length, 1);
    assert.equal((html.match(/secure-raw-token/g) ?? []).length, 1);
  });

  it("sanitizes provider errors without logging or surfacing provider details", async () => {
    control.providerFailure = true;
    const errors: string[] = [];
    const originalError = console.error;
    console.error = ((...args: unknown[]) => errors.push(args.map(String).join(" "))) as typeof console.error;

    try {
      await assert.rejects(
        () => sendPasswordResetEmail("person@example.com", "raw-token-secret", new Date()),
        (error: unknown) =>
          error instanceof Error &&
          error.message === "Password reset email delivery failed." &&
          !error.message.includes("raw-token-secret"),
      );
      assert.deepEqual(errors, []);
      assert.ok(!errors.join(" ").includes(control.apiKey));
    } finally {
      console.error = originalError;
    }
  });
});
