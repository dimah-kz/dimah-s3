import { sanitizeFileName } from "@dimah-s3/core";
import { errors } from "@/errors";
import type {
  GenerateKeyContext,
  KeyPolicy,
  ResolvedRoutePolicy,
} from "@/types";

export type { KeyPolicy };

/**
 * Normalize an object key: strip leading slashes, reject `.` / `..` segments,
 * NUL, and backslashes.
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

export function keyPolicyFor(
  route: ResolvedRoutePolicy,
  feature: "upload" | "download" | "delete" | "multipart",
): KeyPolicy {
  const feat = route[feature];
  return {
    prefix: feat?.prefix ?? route.prefix,
    resolveKey: feat?.resolveKey ?? route.resolveKey,
  };
}

async function resolvePrefixValue(
  prefix: KeyPolicy["prefix"],
  context: GenerateKeyContext,
): Promise<string | undefined> {
  if (prefix === undefined) return undefined;
  if (typeof prefix === "function") return prefix(context);
  return prefix;
}

/** Generate a key on upload / multipart init. */
export async function generateObjectKey(
  policy: KeyPolicy,
  context: GenerateKeyContext,
): Promise<string> {
  if (policy.resolveKey) {
    return assertSafeObjectKey(await policy.resolveKey(context));
  }
  const leaf = `${crypto.randomUUID()}/${sanitizeFileName(context.fileName)}`;
  const prefix = await resolvePrefixValue(policy.prefix, context);
  if (prefix) {
    return applyPrefix(prefix, leaf);
  }
  return assertSafeObjectKey(`${context.route}/${leaf}`);
}

/**
 * Confirm / download / delete / multipart follow-ups: trust the stored key,
 * but reject keys outside a string `prefix` namespace.
 */
export function assertStoredKey(policy: KeyPolicy, key: string): string {
  const safe = assertSafeObjectKey(key);
  if (typeof policy.prefix === "string") {
    const prefix = assertSafeObjectKey(policy.prefix);
    if (safe !== prefix && !safe.startsWith(`${prefix}/`)) {
      throw errors.invalidKey();
    }
  }
  return safe;
}

export function resolveRouteBucket(route: ResolvedRoutePolicy): string {
  return route.bucket;
}

export async function resolveUploadTarget(
  route: ResolvedRoutePolicy,
  context: Omit<GenerateKeyContext, "bucket">,
): Promise<{ key: string; bucket: string }> {
  const bucket = route.bucket;
  const key = await generateObjectKey(keyPolicyFor(route, "upload"), {
    ...context,
    bucket,
  });
  return { key, bucket };
}

export async function resolveMultipartInitTarget(
  route: ResolvedRoutePolicy,
  context: Omit<GenerateKeyContext, "bucket">,
): Promise<{ key: string; bucket: string }> {
  const bucket = route.bucket;
  const key = await generateObjectKey(keyPolicyFor(route, "multipart"), {
    ...context,
    bucket,
  });
  return { key, bucket };
}

export function resolveStoredTarget(
  route: ResolvedRoutePolicy,
  feature: "upload" | "download" | "delete" | "multipart",
  key: string,
): { key: string; bucket: string } {
  return {
    key: assertStoredKey(keyPolicyFor(route, feature), key),
    bucket: route.bucket,
  };
}
