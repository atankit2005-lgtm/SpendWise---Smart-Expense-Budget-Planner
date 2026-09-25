import * as OTPAuth from "otpauth";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_VALIDATION_WINDOW = 1;

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function createTotp(secret: string, issuer: string, label: string): OTPAuth.TOTP {
  if (!/^[A-Z2-7]+$/.test(secret)) throw new TypeError("TOTP secret must be unpadded base32.");
  return new OTPAuth.TOTP({
    issuer,
    label,
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  });
}

export function createTotpUri(secret: string, issuer: string, label: string): string {
  return createTotp(secret, issuer, label).toString();
}

/** Returns the matched 30-second counter, or null for a malformed/invalid code. */
export function validateTotpCode(
  secret: string,
  token: string,
  now: Date = new Date(),
): number | null {
  if (!/^\d{6}$/.test(token) || !Number.isFinite(now.getTime())) return null;

  const totp = createTotp(secret, "SpendWise", "account");
  const delta = totp.validate({
    token,
    timestamp: now.getTime(),
    window: TOTP_VALIDATION_WINDOW,
  });

  return delta === null ? null : totp.counter({ timestamp: now.getTime() }) + delta;
}
