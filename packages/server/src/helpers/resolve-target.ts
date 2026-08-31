import { sanitizeFileName } from "@dimah-s3/core";
import { errors } from "@/errors";
import type {
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

/** Generate a key from an optional folder plus uuid/filename. */
export function generateObjectKey(
  prefix: string | undefined,
  context: ObjectContext,
): string {
  const leaf = `${crypto.randomUUID()}/${sanitizeFileName(context.file.name)}`;
  if (prefix) {
    return applyPrefix(prefix, leaf);
  }
  return assertSafeObjectKey(`${context.route}/${leaf}`);
}

/** Confirm / download / delete / multipart follow-ups: trust the stored key. */
export function assertStoredKey(key: string): string {
  return assertSafeObjectKey(key);
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
    : generateObjectKey(info?.prefix, objectContext);
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
    key: assertStoredKey(key),
    bucket: route.bucket,
  };
}
