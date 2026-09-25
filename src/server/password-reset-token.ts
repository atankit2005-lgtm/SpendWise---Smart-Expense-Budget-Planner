import { createHash, randomBytes } from "node:crypto";

const PASSWORD_RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

declare const passwordResetTokenHashBrand: unique symbol;

export type PasswordResetTokenHash = string & {
  readonly [passwordResetTokenHashBrand]: true;
};

export interface GeneratedPasswordResetToken {
  token: string;
  tokenHash: PasswordResetTokenHash;
  expiresAt: Date;
}

export function hashPasswordResetToken(token: string): PasswordResetTokenHash {
  return createHash("sha256").update(token).digest("hex") as PasswordResetTokenHash;
}

export function isValidPasswordResetToken(token: unknown): token is string {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const decoded = Buffer.from(token, "base64url");
  return decoded.byteLength === PASSWORD_RESET_TOKEN_BYTES && decoded.toString("base64url") === token;
}

export function generatePasswordResetToken(now = new Date()): GeneratedPasswordResetToken {
  const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
}
