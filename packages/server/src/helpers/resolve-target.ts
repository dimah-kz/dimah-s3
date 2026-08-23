import { errors } from "../errors";
import type {
  KeyPolicy,
  ResolvedDimahS3Config,
  ResolveKeyContext,
} from "../types";

export type { KeyPolicy };

/**
 * Normalize a client-proposed object key: strip leading slashes, reject
 * `.` / `..` segments, NUL, and backslashes.
 */
export function assertSafeObjectKey(key: string): string {
  const trimmed = key.replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (!trimmed) {
    throw errors.invalidKey();
  }
  if (trimmed.includes("\\") || trimmed.includes("\0")) {
    throw errors.invalidKey();
  }
  const parts = trimmed.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw errors.invalidKey();
  }
  return parts.join("/");
}

function applyPrefix(prefix: string, key: string): string {
  const p = assertSafeObjectKey(prefix);
  const k = assertSafeObjectKey(key);
  if (k === p || k.startsWith(`${p}/`)) return k;
  return `${p}/${k}`;
}

export async function resolveObjectKey(
  policy: KeyPolicy | undefined,
  context: ResolveKeyContext,
): Promise<string> {
  if (policy?.resolveKey) {
    return assertSafeObjectKey(await policy.resolveKey(context));
  }
  const prefix =
    typeof policy?.prefix === "function"
      ? await policy.prefix(context)
      : policy?.prefix;
  if (prefix) {
    return applyPrefix(prefix, context.proposedKey);
  }
  return assertSafeObjectKey(context.proposedKey);
}

export function resolveBucket(
  config: ResolvedDimahS3Config,
  requested?: string,
): string {
  if (!requested) return config.bucket;
  if (config.allowClientBucket) return requested;
  if (config.buckets?.length) {
    if (config.buckets.includes(requested)) return requested;
    throw errors.invalidBucket(requested);
  }
  return config.bucket;
}

export async function resolveRequestTarget(
  config: ResolvedDimahS3Config,
  policy: KeyPolicy | undefined,
  input: {
    request: Request;
    key: string;
    bucket?: string;
    fileName?: string;
    contentType?: string;
  },
): Promise<{ key: string; bucket: string }> {
  const bucket = resolveBucket(config, input.bucket);
  const key = await resolveObjectKey(policy, {
    request: input.request,
    proposedKey: input.key,
    fileName: input.fileName,
    contentType: input.contentType,
    bucket,
  });
  return { key, bucket };
}
