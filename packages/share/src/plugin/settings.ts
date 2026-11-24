import { s3Error } from "@dimah-s3/core";
import type { ShareLinkRecord, UpdateLinkInput } from "@/store/link-store";
import type { ShareLinkSettings, ShareOptions } from "@/types/options";
import { hashPassword } from "./password";
import type { CreateLinkBody, UpdateLinkBody } from "./schemas";

const DAY = 24 * 60 * 60;
const DEFAULT_EXPIRES_IN = 7 * DAY;
const DEFAULT_PASSWORD_MIN_LENGTH = 8;
const DEFAULT_DOWNLOAD_EXPIRES_IN = 300;
const DEFAULT_UNLOCK_EXPIRES_IN = 3600;

/** The plugin options after defaults, checked once at `share()`. */
export type SharePolicy = {
  /** Lifetime of a link created without `expiresAt`; `null` never expires. */
  defaultExpiresIn: number | null;
  /** Longest lifetime, when every link must expire. */
  maxExpiresIn?: number;
  passwordRequired: boolean;
  passwordMinLength: number;
  folders: boolean;
  downloadExpiresIn: number;
  unlockExpiresIn: number;
};

function positiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`[dimah-s3/share] ${name} must be a positive integer.`);
  }
  return value;
}

/**
 * Applies the defaults to the plugin options.
 * @throws when a lifetime or a length is not a positive integer.
 */
export function resolvePolicy(options: ShareOptions): SharePolicy {
  const max =
    options.expiration?.max === undefined
      ? undefined
      : positiveInteger("expiration.max", options.expiration.max);
  const configured =
    options.expiration?.default === undefined
      ? DEFAULT_EXPIRES_IN
      : options.expiration.default === null
        ? null
        : positiveInteger("expiration.default", options.expiration.default);
  // With a cap, a link that would never expire gets the longest lifetime.
  const defaultExpiresIn =
    max === undefined
      ? configured
      : configured === null
        ? max
        : Math.min(configured, max);
  return {
    defaultExpiresIn,
    ...(max !== undefined && { maxExpiresIn: max }),
    passwordRequired: options.password?.required === true,
    passwordMinLength: positiveInteger(
      "password.minLength",
      options.password?.minLength ?? DEFAULT_PASSWORD_MIN_LENGTH,
    ),
    folders: options.folders !== false,
    downloadExpiresIn: positiveInteger(
      "downloadExpiresIn",
      options.downloadExpiresIn ?? DEFAULT_DOWNLOAD_EXPIRES_IN,
    ),
    unlockExpiresIn: positiveInteger(
      "unlockExpiresIn",
      options.unlockExpiresIn ?? DEFAULT_UNLOCK_EXPIRES_IN,
    ),
  };
}

function invalid(field: string, issue: string): never {
  throw s3Error("VALIDATION_ERROR", { issue: `[body.${field}] ${issue}` });
}

/** Checks an expiry against the policy. `null` never expires. */
function checkExpiry(
  policy: SharePolicy,
  expiresAt: Date | null,
  now: Date,
): Date | null {
  if (expiresAt === null) {
    if (policy.maxExpiresIn !== undefined) invalid("expiresAt", "Required");
    return null;
  }
  if (expiresAt.getTime() <= now.getTime()) {
    invalid("expiresAt", "Must be in the future");
  }
  if (
    policy.maxExpiresIn !== undefined &&
    expiresAt.getTime() > now.getTime() + policy.maxExpiresIn * 1000
  ) {
    invalid("expiresAt", `Must be within ${policy.maxExpiresIn} seconds`);
  }
  return expiresAt;
}

/** Hashes a new password after the policy check. `null` removes it. */
async function checkPassword(
  policy: SharePolicy,
  password: string | null,
): Promise<string | null> {
  if (password === null) {
    if (policy.passwordRequired) invalid("password", "Required");
    return null;
  }
  if (password.length < policy.passwordMinLength) {
    invalid("password", `At least ${policy.passwordMinLength} characters`);
  }
  return hashPassword(password);
}

/** What a new link stores, with the settings `authorize` sees. */
export type CreateSettings = {
  expiresAt: Date | null;
  passwordHash: string | null;
  maxDownloads: number | null;
  label: string | null;
  settings: ShareLinkSettings;
};

/**
 * The settings of a new link: the body, with the policy's defaults.
 * @throws `VALIDATION_ERROR` when the body breaks a rule.
 */
export async function settingsForCreate(
  policy: SharePolicy,
  body: CreateLinkBody,
  now: Date,
): Promise<CreateSettings> {
  const expiresAt = checkExpiry(
    policy,
    body.expiresAt !== undefined
      ? body.expiresAt
      : policy.defaultExpiresIn === null
        ? null
        : new Date(now.getTime() + policy.defaultExpiresIn * 1000),
    now,
  );
  const passwordHash = await checkPassword(policy, body.password ?? null);
  const maxDownloads = body.maxDownloads ?? null;
  const label = body.label ?? null;
  return {
    expiresAt,
    passwordHash,
    maxDownloads,
    label,
    settings: {
      expiresAt,
      passwordProtected: passwordHash !== null,
      maxDownloads,
      label,
    },
  };
}

/** The changes an update makes, with the settings `authorize` sees. */
export type UpdateSettings = {
  patch: UpdateLinkInput;
  settings: ShareLinkSettings;
};

/**
 * The changes of an update. Omitted fields stay as they are.
 * @throws `VALIDATION_ERROR` when the body breaks a rule.
 */
export async function settingsForUpdate(
  policy: SharePolicy,
  body: UpdateLinkBody,
  current: ShareLinkRecord,
  now: Date,
): Promise<UpdateSettings> {
  const patch: UpdateLinkInput = {};
  if (body.expiresAt !== undefined) {
    patch.expiresAt = checkExpiry(policy, body.expiresAt, now);
  }
  if (body.password !== undefined) {
    patch.passwordHash = await checkPassword(policy, body.password);
  }
  if (body.maxDownloads !== undefined) patch.maxDownloads = body.maxDownloads;
  if (body.label !== undefined) patch.label = body.label;

  const passwordHash =
    patch.passwordHash === undefined
      ? current.passwordHash
      : patch.passwordHash;
  return {
    patch,
    settings: {
      expiresAt:
        patch.expiresAt === undefined ? current.expiresAt : patch.expiresAt,
      passwordProtected: passwordHash !== null,
      maxDownloads:
        patch.maxDownloads === undefined
          ? current.maxDownloads
          : patch.maxDownloads,
      label: patch.label === undefined ? current.label : patch.label,
    },
  };
}
