import { base64UrlDecode, base64UrlEncode, s3Error } from "@dimah-s3/core";
import * as z from "zod";
import { ConfigError } from "@/helpers/error-boundary";
import type {
  RouteGuardContext,
  S3Operation,
  UploadFile,
} from "@/types/hook-contexts";
import type { ResolvedConfig } from "@/types/resolved";

/*
 * Upload tickets: `v1.<b64url(JSON payload)>.<b64url(HMAC-SHA256)>`. The
 * HMAC key is derived from the secret with HKDF-SHA256. Tickets are
 * stateless: confirm and every multipart call after init carry one instead
 * of the route, key and upload id.
 */

const VERSION = "v1";
const HKDF_INFO = "dimah-s3/upload/v1";
const SECRET_ENV = "DIMAH_S3_SECRET";
const MIN_SECRET_LENGTH = 32;
/** Same cap as `uploadTicketSchema` in `@dimah-s3/core`. */
const MAX_TICKET_LENGTH = 8192;
/** How long `abort` still accepts an expired ticket. */
const ABORT_GRACE_SECONDS = 7 * 24 * 60 * 60;
const SUBJECT_HASH_LENGTH = 22;
const DEV_SECRET = Symbol.for("dimah-s3.dev-secret");

const encoder = new TextEncoder();

/** Ticket fields and how a ticket call reads secrets and the subject. */
export type TicketEnv = Pick<
  ResolvedConfig,
  "secret" | "ticketSubject" | "logger"
>;

export type TicketMode = "single" | "multipart";

type TicketBase = {
  /** Upload token: the marker value, and `uploadToken` in hooks. */
  id: string;
  route: string;
  key: string;
  /** File declared at presign or init. */
  file: UploadFile;
  /** Whether every upload request must carry a SHA-256 checksum. */
  checksum: boolean;
  expiresAt: Date;
};

export type SingleTicket = TicketBase & { mode: "single" };

export type MultipartTicket = TicketBase & {
  mode: "multipart";
  uploadId: string;
  partSize: number;
  partCount: number;
};

/** What a ticket carries, as {@link issueTicket} takes it. */
export type UploadTicketInput = SingleTicket | MultipartTicket;

/** A verified ticket, as {@link readTicket} returns it. */
export type UploadTicket<M extends TicketMode = TicketMode> = Extract<
  UploadTicketInput,
  { mode: M }
> & {
  issuedAt: Date;
  /** Keyed hash of the subject the ticket is bound to. */
  subjectHash?: string;
};

const payloadBase = {
  id: z.string().min(1),
  r: z.string().min(1),
  k: z.string().min(1),
  n: z.string().min(1),
  s: z.int().nonnegative(),
  t: z.string().optional(),
  c: z.union([z.literal(0), z.literal(1)]),
  sb: z.string().length(SUBJECT_HASH_LENGTH).optional(),
  iat: z.int(),
  exp: z.int(),
};

const payloadSchema = z.discriminatedUnion("m", [
  z.strictObject({ ...payloadBase, m: z.literal("single") }),
  z.strictObject({
    ...payloadBase,
    m: z.literal("multipart"),
    u: z.string().min(1),
    ps: z.int().positive(),
    pc: z.int().positive(),
  }),
]);

type TicketPayload = z.output<typeof payloadSchema>;

/** A new upload token: 16 random bytes in base64url. */
export function createUploadToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Checks the `secret` option when `dimahS3()` runs. Every value must have
 * at least 32 characters. Returns `undefined` when it is not set, so the
 * environment is read on first use.
 */
export function parseSecretOption(
  secret: string | readonly string[] | undefined,
): readonly string[] | undefined {
  if (secret === undefined) return undefined;
  const secrets = typeof secret === "string" ? [secret] : [...secret];
  if (secrets.length === 0) {
    throw new Error("dimahS3: secret must not be an empty array.");
  }
  if (secrets.some((value) => value.length < MIN_SECRET_LENGTH)) {
    throw new Error(
      `dimahS3: every secret must have at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }
  return secrets;
}

/**
 * Signs a ticket. With a `subject`, the ticket is bound to it. Returns the
 * ticket and its expiry, rounded down to the second as the ticket stores it.
 */
export async function issueTicket(
  env: TicketEnv,
  input: UploadTicketInput,
  subject?: string,
): Promise<{ ticket: string; expiresAt: Date }> {
  const [key] = await ticketKeys(env);
  const payload: TicketPayload = {
    id: input.id,
    r: input.route,
    k: input.key,
    n: input.file.name,
    s: input.file.size,
    t: input.file.type,
    c: input.checksum ? 1 : 0,
    sb: subject === undefined ? undefined : await subjectHash(key, subject),
    iat: epochSeconds(new Date()),
    exp: epochSeconds(input.expiresAt),
    ...(input.mode === "multipart"
      ? {
          m: "multipart",
          u: input.uploadId,
          ps: input.partSize,
          pc: input.partCount,
        }
      : { m: "single" }),
  };

  const body = `${VERSION}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const ticket = `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
  if (ticket.length > MAX_TICKET_LENGTH) {
    throw new ConfigError(
      `The upload ticket for key "${input.key}" is ${ticket.length} characters; ` +
        `the limit is ${MAX_TICKET_LENGTH}. Use a shorter object key.`,
    );
  }
  return { ticket, expiresAt: new Date(payload.exp * 1000) };
}

/**
 * Verifies a ticket for one operation. The signature is checked against
 * every rotation key, then the payload, the mode and the expiry. `abort`
 * accepts a ticket for 7 days after it expires.
 *
 * Fails with `UPLOAD_TICKET_INVALID` or `UPLOAD_TICKET_EXPIRED`. The route,
 * the key and the subject are checked by the caller.
 */
export async function readTicket<M extends TicketMode>(
  env: TicketEnv,
  ticket: string,
  options: { mode: M; operation: S3Operation },
): Promise<UploadTicket<M>> {
  const keys = await ticketKeys(env);
  const payload = await verifyPayload(keys, ticket);
  if (payload?.m !== options.mode) throw s3Error("UPLOAD_TICKET_INVALID");

  const grace =
    options.operation === "multipart.abort" ? ABORT_GRACE_SECONDS : 0;
  if (epochSeconds(new Date()) > payload.exp + grace) {
    throw s3Error("UPLOAD_TICKET_EXPIRED");
  }
  return fromPayload(payload) as UploadTicket<M>;
}

/**
 * Checks that a bound ticket is used by the same subject. The subject is
 * recomputed for `context`; a ticket without a subject passes.
 */
export async function assertTicketSubject(
  env: TicketEnv,
  ticket: UploadTicket,
  context: RouteGuardContext,
): Promise<void> {
  if (ticket.subjectHash === undefined) return;
  const subject = await env.ticketSubject?.(context);
  if (subject !== undefined) {
    for (const key of await ticketKeys(env)) {
      if (equal(await subjectHash(key, subject), ticket.subjectHash)) return;
    }
  }
  throw s3Error("UPLOAD_TICKET_INVALID");
}

async function verifyPayload(
  keys: readonly CryptoKey[],
  ticket: string,
): Promise<TicketPayload | undefined> {
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return undefined;
  const [, payloadPart, signaturePart] = parts;

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlDecode(signaturePart);
  } catch {
    return undefined;
  }
  const body = encoder.encode(`${VERSION}.${payloadPart}`);
  let verified = false;
  for (const key of keys) {
    if (await crypto.subtle.verify("HMAC", key, signature, body)) {
      verified = true;
      break;
    }
  }
  if (!verified) return undefined;

  try {
    const json: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadPart)),
    );
    const parsed = payloadSchema.safeParse(json);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function fromPayload(payload: TicketPayload): UploadTicket {
  const base = {
    id: payload.id,
    route: payload.r,
    key: payload.k,
    file: { name: payload.n, size: payload.s, type: payload.t },
    checksum: payload.c === 1,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: new Date(payload.exp * 1000),
    subjectHash: payload.sb,
  };
  return payload.m === "multipart"
    ? {
        ...base,
        mode: "multipart",
        uploadId: payload.u,
        partSize: payload.ps,
        partCount: payload.pc,
      }
    : { ...base, mode: "single" };
}

async function subjectHash(key: CryptoKey, subject: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`sub\0${subject}`),
  );
  return base64UrlEncode(new Uint8Array(mac)).slice(0, SUBJECT_HASH_LENGTH);
}

/** Compares two strings without stopping at the first difference. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Secrets and keys
// ---------------------------------------------------------------------------

const keyCache = new Map<string, Promise<CryptoKey>>();

/** HMAC keys for every secret. The first one signs. */
function ticketKeys(env: TicketEnv): Promise<CryptoKey[]> {
  return Promise.all(ticketSecrets(env).map(deriveKey));
}

function deriveKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle
      .importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
      .then((material) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(),
            info: encoder.encode(HKDF_INFO),
          },
          material,
          { name: "HMAC", hash: "SHA-256", length: 256 },
          false,
          ["sign", "verify"],
        ),
      );
    keyCache.set(secret, key);
  }
  return key;
}

/**
 * The configured secrets, else `DIMAH_S3_SECRET`. With neither, a random
 * secret is used when `NODE_ENV` is exactly `development` or `test`, and
 * any other environment is a config error.
 */
function ticketSecrets(env: TicketEnv): readonly string[] {
  if (env.secret) return env.secret;

  const fromEnv = readEnv(SECRET_ENV);
  if (fromEnv) {
    if (fromEnv.length < MIN_SECRET_LENGTH) {
      throw new ConfigError(
        `${SECRET_ENV} must have at least ${MIN_SECRET_LENGTH} characters.`,
      );
    }
    return [fromEnv];
  }

  const nodeEnv = readEnv("NODE_ENV");
  if (nodeEnv === "development" || nodeEnv === "test") {
    return [developmentSecret(env)];
  }
  throw new ConfigError(
    `Set ${SECRET_ENV} (at least ${MIN_SECRET_LENGTH} characters, the same on ` +
      "every instance) or dimahS3({ secret }) to sign upload tickets.",
  );
}

/**
 * A random secret kept on `globalThis`, so it survives hot reloads. Tickets
 * stop verifying when the process restarts.
 */
function developmentSecret(env: TicketEnv): string {
  const store = globalThis as { [DEV_SECRET]?: string };
  let secret = store[DEV_SECRET];
  if (secret === undefined) {
    secret = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    store[DEV_SECRET] = secret;
    env.logger.warn?.(
      `${SECRET_ENV} is not set, so upload tickets use a random development ` +
        "secret. Set it before deploying.",
    );
  }
  return secret;
}

function readEnv(name: string): string | undefined {
  return globalThis.process?.env?.[name] || undefined;
}
