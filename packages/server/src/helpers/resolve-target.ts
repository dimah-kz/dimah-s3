import { sanitizeFileName } from "@dimah-s3/core";
import { errors } from "@/errors";
import type {
  KeyPrefix,
  ObjectContext,
  ObjectInfo,
  ResolvedRoutePolicy,
} from "@/types";

export type ResolvedObject = {
  key: string;
  bucket: string;
  metadata?: Record<string, string>;
  acl: NonNullable<ResolvedRoutePolicy["acl"]>;
};

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

async function resolvePrefixValue(
  prefix: KeyPrefix | undefined,
  context: ObjectContext,
): Promise<string | undefined> {
  if (prefix === undefined) return undefined;
  if (typeof prefix === "function") return prefix(context);
  return prefix;
}

/** Generate a key from `prefix` (or the route name) plus uuid/filename. */
export async function generateObjectKey(
  prefix: KeyPrefix | undefined,
  context: ObjectContext,
): Promise<string> {
  const leaf = `${crypto.randomUUID()}/${sanitizeFileName(context.file.name)}`;
  const folder = await resolvePrefixValue(prefix, context);
  if (folder) {
    return applyPrefix(folder, leaf);
  }
  return assertSafeObjectKey(`${context.route}/${leaf}`);
}

/**
 * Confirm / download / delete / multipart follow-ups: trust the stored key,
 * but reject keys outside a string `prefix` namespace.
 */
export function assertStoredKey(
  prefix: KeyPrefix | undefined,
  key: string,
): string {
  const safe = assertSafeObjectKey(key);
  if (typeof prefix === "string") {
    const folder = assertSafeObjectKey(prefix);
    if (safe !== folder && !safe.startsWith(`${folder}/`)) {
      throw errors.invalidKey();
    }
  }
  return safe;
}

export function resolveRouteBucket(route: ResolvedRoutePolicy): string {
  return route.bucket;
}

function resolveAcl(
  info: ObjectInfo | void,
  route: ResolvedRoutePolicy,
): ResolvedObject["acl"] {
  return info?.acl ?? route.acl ?? "private";
}

async function resolveObject(
  route: ResolvedRoutePolicy,
  context: Omit<ObjectContext, "bucket">,
): Promise<ResolvedObject> {
  const bucket = route.bucket;
  const objectContext: ObjectContext = { ...context, bucket };
  const info = (await route.object?.(objectContext)) ?? undefined;
  const key = info?.key
    ? assertSafeObjectKey(info.key)
    : await generateObjectKey(route.prefix, objectContext);
  return {
    key,
    bucket,
    metadata: info?.metadata,
    acl: resolveAcl(info, route),
  };
}

export async function resolveUploadTarget(
  route: ResolvedRoutePolicy,
  context: Omit<ObjectContext, "bucket">,
): Promise<ResolvedObject> {
  return resolveObject(route, context);
}

export async function resolveMultipartInitTarget(
  route: ResolvedRoutePolicy,
  context: Omit<ObjectContext, "bucket">,
): Promise<ResolvedObject> {
  return resolveObject(route, context);
}

export function resolveStoredTarget(
  route: ResolvedRoutePolicy,
  key: string,
): { key: string; bucket: string } {
  return {
    key: assertStoredKey(route.prefix, key),
    bucket: route.bucket,
  };
}
