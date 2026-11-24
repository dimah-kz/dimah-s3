import { base64UrlDecode, base64UrlEncode } from "@dimah-s3/core";

/*
 * Link passwords: PBKDF2-HMAC-SHA256 through Web Crypto, so it runs on Node,
 * Bun, Deno, and edge runtimes. Stored as
 * `pbkdf2-sha256$<iterations>$<salt>$<hash>` (base64url), so a later
 * version can raise the iteration count and still verify old hashes.
 */

const ALGORITHM = "pbkdf2-sha256";
/** OWASP's 2023 figure for PBKDF2-HMAC-SHA256. */
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
/** Iteration counts a stored hash may claim, so a forged row cannot stall a request. */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;

const encoder = new TextEncoder();

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Compares two byte arrays without stopping at the first difference. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a[index] ^ b[index];
  return diff === 0;
}

/** Hashes a link password with a fresh salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return [
    ALGORITHM,
    String(ITERATIONS),
    base64UrlEncode(salt),
    base64UrlEncode(hash),
  ].join("$");
}

/** Whether `password` matches a hash from {@link hashPassword}. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, rounds, saltPart, hashPart, ...rest] = stored.split("$");
  const iterations = Number(rounds);
  if (
    algorithm !== ALGORITHM ||
    rest.length > 0 ||
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_ITERATIONS ||
    iterations > MAX_ITERATIONS
  ) {
    return false;
  }
  let salt: Uint8Array<ArrayBuffer>;
  let expected: Uint8Array<ArrayBuffer>;
  try {
    salt = base64UrlDecode(saltPart);
    expected = base64UrlDecode(hashPart);
  } catch {
    return false;
  }
  return equalBytes(await derive(password, salt, iterations), expected);
}

/**
 * A short one-way tag of a stored hash, bound into each `access` proof, so
 * a new password ends every proof made under the old one. A proof is
 * readable, so the tag is a digest that reveals nothing of the hash.
 */
export async function passwordTag(stored: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`share-access\0${stored}`),
  );
  return base64UrlEncode(new Uint8Array(digest)).slice(0, 16);
}
