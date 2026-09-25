import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { ConfigurationError, requireTotpEncryptionConfiguration } from "./env";

const ENVELOPE_FORMAT = "sw-totp";
const ENVELOPE_VERSION = "v1";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class TotpSecretEncryptionError extends Error {
  constructor() {
    super("TOTP secret encryption data is invalid or could not be authenticated.");
    this.name = "TotpSecretEncryptionError";
  }
}

export interface EncryptedTotpSecret {
  ciphertext: string;
  keyId: string;
}

export type TotpKeyResolver = (keyId: string) => Uint8Array;

function assertKeyId(keyId: string): void {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) throw new TotpSecretEncryptionError();
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TotpSecretEncryptionError();
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new TotpSecretEncryptionError();
  return decoded;
}

function additionalData(keyId: string): Buffer {
  return Buffer.from(`${ENVELOPE_FORMAT}:${ENVELOPE_VERSION}:${keyId}`, "utf8");
}

export function validateEncryptedTotpSecret(secret: EncryptedTotpSecret): void {
  assertKeyId(secret.keyId);
  const parts = secret.ciphertext.split(":");
  if (
    parts.length !== 6 ||
    parts[0] !== ENVELOPE_FORMAT ||
    parts[1] !== ENVELOPE_VERSION ||
    parts[2] !== secret.keyId
  ) {
    throw new TotpSecretEncryptionError();
  }
  const nonce = decodeBase64Url(parts[3] ?? "");
  const tag = decodeBase64Url(parts[4] ?? "");
  const ciphertext = decodeBase64Url(parts[5] ?? "");
  if (
    nonce.byteLength !== NONCE_BYTES ||
    tag.byteLength !== AUTH_TAG_BYTES ||
    ciphertext.byteLength === 0
  ) {
    throw new TotpSecretEncryptionError();
  }
}

export function encryptTotpSecret(
  secret: string,
  configuration = requireTotpEncryptionConfiguration(),
): EncryptedTotpSecret {
  if (!secret || !configuration || configuration.key.byteLength !== 32) {
    throw new ConfigurationError("A configured 32-byte TOTP encryption key is required.");
  }
  assertKeyId(configuration.keyId);

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", configuration.key, nonce);
  cipher.setAAD(additionalData(configuration.keyId));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const envelope = [
    ENVELOPE_FORMAT,
    ENVELOPE_VERSION,
    configuration.keyId,
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");

  return { ciphertext: envelope, keyId: configuration.keyId };
}

function currentKeyForId(keyId: string): Uint8Array {
  const configuration = requireTotpEncryptionConfiguration();
  if (configuration.keyId !== keyId) throw new TotpSecretEncryptionError();
  return configuration.key;
}

export function decryptTotpSecret(
  envelope: string,
  keyResolver: TotpKeyResolver = currentKeyForId,
): string {
  if (typeof envelope !== "string") throw new TotpSecretEncryptionError();
  const parts = envelope.split(":");
  if (parts.length !== 6) throw new TotpSecretEncryptionError();

  const [format, version, keyId, nonceText, tagText, ciphertextText] = parts;
  if (format !== ENVELOPE_FORMAT || version !== ENVELOPE_VERSION || !keyId) {
    throw new TotpSecretEncryptionError();
  }
  assertKeyId(keyId);

  const nonce = decodeBase64Url(nonceText ?? "");
  const tag = decodeBase64Url(tagText ?? "");
  const ciphertext = decodeBase64Url(ciphertextText ?? "");
  if (
    nonce.byteLength !== NONCE_BYTES ||
    tag.byteLength !== AUTH_TAG_BYTES ||
    ciphertext.byteLength === 0
  ) {
    throw new TotpSecretEncryptionError();
  }

  const key = keyResolver(keyId);
  if (key.byteLength !== 32) throw new TotpSecretEncryptionError();

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(additionalData(keyId));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
    if (!plaintext) throw new TotpSecretEncryptionError();
    return plaintext;
  } catch (error) {
    if (error instanceof TotpSecretEncryptionError) throw error;
    throw new TotpSecretEncryptionError();
  }
}
