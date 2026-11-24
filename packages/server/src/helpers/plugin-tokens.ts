import { base64UrlDecode, base64UrlEncode } from "@dimah-s3/core";
import { instanceSecrets, type SecretEnv } from "./ticket";

/*
 * Plugin tokens: `<b64url(JSON payload)>.<b64url(HMAC-SHA256)>`. The payload
 * carries `exp` (epoch seconds) next to the plugin's fields. The HMAC key is
 * derived from each instance secret with HKDF-SHA256, under an info string
 * that names the plugin and the purpose, so a token signed for one purpose
 * never verifies for another, and never as an upload ticket.
 */

const HKDF_INFO_PREFIX = "dimah-s3/plugin/v1";
/** Longest token `verify` reads. */
const MAX_TOKEN_LENGTH = 4096;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Fields a plugin token carries. `exp` is reserved for the expiry. */
export type PluginTokenPayload = Record<string, unknown>;

/**
 * Signs and verifies short-lived tokens for one purpose, with the instance
 * secret (the same one upload tickets use). The first secret signs; every
 * secret verifies, so a rotation keeps tokens valid until they expire.
 */
export type PluginTokens = {
  /**
   * Signs `payload` for `expiresIn` seconds. The payload is readable by
   * anyone who holds the token: sign ids and flags, never secrets.
   * @throws `TypeError` when the payload has an `exp` field, or
   * `expiresIn` is not a positive integer.
   */
  sign: (
    payload: PluginTokenPayload,
    options: { expiresIn: number },
  ) => Promise<string>;
  /**
   * The payload of a token this purpose signed, without `exp`. `null` when
   * the token is malformed, signed for another purpose or with an unknown
   * secret, or expired. Validate the fields before you use them.
   */
  verify: (token: string) => Promise<PluginTokenPayload | null>;
};

const keyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(secret: string, info: string): Promise<CryptoKey> {
  const cacheKey = `${info}\0${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = crypto.subtle
      .importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
      .then((material) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(),
            info: encoder.encode(info),
          },
          material,
          { name: "HMAC", hash: "SHA-256", length: 256 },
          false,
          ["sign", "verify"],
        ),
      );
    keyCache.set(cacheKey, key);
  }
  return key;
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function isPayload(value: unknown): value is PluginTokenPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The tokens of `purpose` for plugin `pluginId`. Keys are derived on first
 * use, so a missing secret fails the first `sign` or `verify`, the same way
 * it fails the first upload.
 * @throws `TypeError` when `purpose` is empty or contains `/` or NUL.
 */
export function createPluginTokens(
  env: SecretEnv,
  pluginId: string,
  purpose: string,
): PluginTokens {
  if (typeof purpose !== "string" || purpose === "" || /[\0/]/.test(purpose)) {
    throw new TypeError(
      `dimahS3: plugin "${pluginId}" asked for tokens with an invalid purpose. Use a non-empty name without "/".`,
    );
  }
  const info = `${HKDF_INFO_PREFIX}/${pluginId}/${purpose}`;
  const keys = () =>
    Promise.all(instanceSecrets(env).map((secret) => deriveKey(secret, info)));

  return {
    async sign(payload, { expiresIn }) {
      if (!isPayload(payload) || Object.hasOwn(payload, "exp")) {
        throw new TypeError(
          `dimahS3: plugin "${pluginId}" signed a token payload that is not an object, or has an "exp" field.`,
        );
      }
      if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
        throw new TypeError(
          `dimahS3: plugin "${pluginId}" signed a token with an expiresIn that is not a positive integer.`,
        );
      }
      const [key] = await keys();
      const exp = epochSeconds(new Date()) + expiresIn;
      const body = base64UrlEncode(JSON.stringify({ ...payload, exp }));
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(body),
      );
      return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
    },

    async verify(token) {
      if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
        return null;
      }
      const parts = token.split(".");
      if (parts.length !== 2) return null;
      const [body, signaturePart] = parts;
      let signature: Uint8Array<ArrayBuffer>;
      try {
        signature = base64UrlDecode(signaturePart);
      } catch {
        return null;
      }
      const signed = encoder.encode(body);
      let verified = false;
      for (const key of await keys()) {
        if (await crypto.subtle.verify("HMAC", key, signature, signed)) {
          verified = true;
          break;
        }
      }
      if (!verified) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(decoder.decode(base64UrlDecode(body)));
      } catch {
        return null;
      }
      if (!isPayload(parsed)) return null;
      const { exp, ...payload } = parsed;
      if (typeof exp !== "number" || epochSeconds(new Date()) > exp) {
        return null;
      }
      return payload;
    },
  };
}
