import { base64UrlEncode } from "@dimah-s3/core";

/** Random bytes in a link token: 192 bits, so a token cannot be guessed. */
const TOKEN_BYTES = 24;

/** A new link token: 24 random bytes in base64url (32 characters). */
export function createLinkToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}
