import { createHash, randomBytes } from "node:crypto";

export const MFA_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

declare const mfaDigestBrand: unique symbol;

export type MfaDigest = string & { readonly [mfaDigestBrand]: true };

export function digestMfaValue(value: string): MfaDigest {
  return createHash("sha256").update(value, "utf8").digest("hex") as MfaDigest;
}

export function generateLoginChallenge(now: Date = new Date()): {
  token: string;
  digest: MfaDigest;
  expiresAt: Date;
} {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid creation time is required.");
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    digest: digestMfaValue(token),
    expiresAt: new Date(now.getTime() + MFA_LOGIN_CHALLENGE_TTL_MS),
  };
}

export function digestRecoveryCode(code: string): MfaDigest {
  if (typeof code !== "string" || code.length < 8 || code.length > 128) {
    throw new TypeError("Recovery code must contain 8-128 characters.");
  }
  return digestMfaValue(code);
}
