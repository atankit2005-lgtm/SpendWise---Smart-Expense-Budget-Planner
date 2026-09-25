import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getResetTokenFromSearch,
  validateForgotPasswordEmail,
  validateResetPasswordFields,
} from "./password-reset-form";

describe("password reset form validation", () => {
  it("accepts valid email input and rejects invalid addresses", () => {
    assert.equal(validateForgotPasswordEmail(" person@example.com "), null);
    assert.equal(validateForgotPasswordEmail("bad-address"), "Enter a valid email address.");
  });

  it("extracts only a string reset token without transforming it", () => {
    assert.equal(getResetTokenFromSearch({ token: "raw-token+/" }), "raw-token+/");
    assert.equal(getResetTokenFromSearch({ token: 42 }), undefined);
    assert.equal(getResetTokenFromSearch({}), undefined);
  });

  it("validates the existing password minimum and matching confirmation", () => {
    assert.deepEqual(validateResetPasswordFields("short", "short"), {
      password: "Use at least 8 characters.",
    });
    assert.deepEqual(validateResetPasswordFields("long-enough", "different"), {
      confirmation: "Passwords do not match.",
    });
    assert.deepEqual(validateResetPasswordFields("long-enough", "long-enough"), {});
  });
});
