import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;
const KEY_LENGTH = 64;

/**
 * Explicit scrypt cost parameters for NEW hashes (Stage 8.3). Previously the
 * Node defaults were used implicitly; they are now pinned and encoded in the
 * stored string so verification never depends on runtime defaults:
 *   N = 2^15 = 32768 (CPU/memory cost — 128 × N × r = 32 MiB per hash),
 *   r = 8 (block size), p = 1 (parallelization).
 * maxmem is raised to 64 MiB because 32 MiB of working memory plus overhead
 * exceeds Node's 32 MiB default budget.
 */
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/**
 * Node's scrypt defaults, which pre-Stage-8.3 hashes were created with.
 * Legacy format `scrypt$<saltHex>$<hashHex>` verifies with these parameters
 * forever — existing users are never invalidated and never forced to reset.
 */
const LEGACY_PARAMS = { N: 16_384, r: 8, p: 1 };

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/**
 * Self-describing salted scrypt encoding for the users.password_hash column:
 *   new:    scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 *   legacy: scrypt$<saltHex>$<hashHex>            (Node default params)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

function parseEncoded(encoded: string): { params: ScryptParams; salt: string; hash: string } | null {
  const parts = encoded.split("$");
  if (parts[0] !== "scrypt") return null;

  if (parts.length === 6) {
    const [n, r, p, salt, hash] = [parts[1], parts[2], parts[3], parts[4], parts[5]];
    const params = { N: Number(n), r: Number(r), p: Number(p) };
    // Bounds keep a tampered hash string from requesting absurd work/memory.
    if (!Number.isInteger(params.N) || params.N < 1_024 || params.N > 2 ** 22) return null;
    if (!Number.isInteger(params.r) || params.r < 1 || params.r > 16) return null;
    if (!Number.isInteger(params.p) || params.p < 1 || params.p > 16) return null;
    if (!salt || !hash) return null;
    return { params, salt, hash };
  }

  if (parts.length === 3) {
    const [, salt, hash] = parts;
    if (!salt || !hash) return null;
    return { params: LEGACY_PARAMS, salt, hash };
  }

  return null;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!encoded) return false;
  const parsed = parseEncoded(encoded);
  if (!parsed) return false;

  const expected = Buffer.from(parsed.hash, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = (await scrypt(password, parsed.salt, KEY_LENGTH, {
    ...parsed.params,
    maxmem: SCRYPT_MAXMEM,
  })) as Buffer;
  return timingSafeEqual(actual, expected);
}

/**
 * True when a stored hash does not use the current explicit parameters
 * (legacy Node-default hashes, malformed values, or null). Callers may use
 * this to transparently upgrade a hash after a successful login.
 */
export function needsRehash(encoded: string | null): boolean {
  if (!encoded) return true;
  const parsed = parseEncoded(encoded);
  if (!parsed) return true;
  return (
    parsed.params.N !== SCRYPT_N || parsed.params.r !== SCRYPT_R || parsed.params.p !== SCRYPT_P
  );
}
