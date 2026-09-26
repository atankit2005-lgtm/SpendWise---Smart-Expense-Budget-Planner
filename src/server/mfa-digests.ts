import { createHash, randomBytes } from "node:crypto";

export const MFA_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_RECOVERY_CODE_COUNT = 10;

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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

function encodeRecoveryCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let encoded = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += RECOVERY_CODE_ALPHABET[(value >>> bits) & 31];
    }
  }

  if (bits > 0) encoded += RECOVERY_CODE_ALPHABET[(value << (5 - bits)) & 31];
  return encoded;
}

/** Ten independent 80-bit codes; grouping improves readability without reducing entropy. */
export function generateRecoveryCodes(count = MFA_RECOVERY_CODE_COUNT): string[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new RangeError("Recovery code count must be between 1 and 100.");
  }

  const codes = new Set<string>();
  while (codes.size < count) {
    const raw = encodeRecoveryCode(randomBytes(10));
    codes.add(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`);
  }
  return [...codes];
}
