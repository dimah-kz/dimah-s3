import { sanitizeFileName, type S3ObjectAcl } from "@dimah-s3/core";
import { errors } from "@/errors";
import { runObjectHook } from "@/helpers/hooks";
import type { ObjectContext, ObjectInfo, ResolvedRoutePolicy } from "@/types";

export type ResolvedObject = {
  key: string;
  bucket: string;
  metadata?: Record<string, string>;
  acl: S3ObjectAcl;
};

export type RouteKeyPrefix = string | false;

/**
 * Strip leading/trailing slashes and reject `.` / `..` / empty segments,
 * NUL, and backslashes. Returns `null` when the key is unsafe.
 */
export function normalizeObjectKey(key: string): string | null {
  const trimmed = key.replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (!trimmed) return null;
  if (trimmed.includes("\\") || trimmed.includes("\0")) return null;
  const parts = trimmed.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }
  return parts.join("/");
}

/**
 * Normalize an object key: strip leading slashes, reject `.` / `..` segments,
 * NUL, and backslashes.
 */
export function assertSafeObjectKey(key: string): string {
  const normalized = normalizeObjectKey(key);
  if (!normalized) throw errors.invalidKey();
  return normalized;
}

function applyPrefix(prefix: string, key: string): string {
  const p = assertSafeObjectKey(prefix);
  const k = assertSafeObjectKey(key);
  if (k === p || k.startsWith(`${p}/`)) return k;
  return `${p}/${k}`;
}

/** Nest `key` under `keyPrefix`. `false` leaves a safe key unchanged. */
export function nestKeyUnderPrefix(
  keyPrefix: RouteKeyPrefix,
  key: string,
): string {
  const safe = assertSafeObjectKey(key);
  if (keyPrefix === false) return safe;
  return applyPrefix(keyPrefix, safe);
}

/** Confirm / download / delete / multipart follow-ups: stored key + namespace. */
export function assertStoredKey(
  key: string,
  keyPrefix: RouteKeyPrefix,
): string {
  const safe = assertSafeObjectKey(key);
  if (keyPrefix === false) return safe;
  const root = assertSafeObjectKey(keyPrefix);
  if (safe === root || safe.startsWith(`${root}/`)) return safe;
  throw errors.invalidKey();
}

/** Generate a key from an optional folder plus uuid/filename. */
export function generateObjectKey(
  prefix: string | undefined,
  context: ObjectContext,
  keyPrefix: RouteKeyPrefix = context.keyPrefix,
): string {
  const leaf = `${crypto.randomUUID()}/${sanitizeFileName(context.file.name)}`;
  const folder =
    prefix != null && prefix !== ""
      ? nestKeyUnderPrefix(keyPrefix, prefix)
      : keyPrefix === false
        ? context.route
        : keyPrefix;
  return applyPrefix(folder, leaf);
}

function resolveAcl(
  info: ObjectInfo | void,
  route: ResolvedRoutePolicy,
): ResolvedObject["acl"] {
  return info?.acl ?? route.upload?.acl ?? "private";
}

async function resolveObject(
  route: ResolvedRoutePolicy,
  context: Omit<ObjectContext, "bucket" | "keyPrefix">,
): Promise<ResolvedObject> {
  const bucket = route.bucket;
  const objectContext: ObjectContext = {
    ...context,
    bucket,
    keyPrefix: route.keyPrefix,
  };
  const info =
    (await runObjectHook(route.upload?.object, objectContext)) ?? undefined;
  const key = info?.key
    ? nestKeyUnderPrefix(route.keyPrefix, info.key)
    : generateObjectKey(info?.prefix, objectContext, route.keyPrefix);
  return {
    key,
    bucket,
    metadata: info?.metadata,
    acl: resolveAcl(info, route),
  };
}

export async function resolveUploadTarget(
  route: ResolvedRoutePolicy,
  context: Omit<ObjectContext, "bucket" | "keyPrefix">,
): Promise<ResolvedObject> {
  return resolveObject(route, context);
}

export function resolveStoredTarget(
  route: ResolvedRoutePolicy,
  key: string,
): { key: string; bucket: string } {
  return {
    key: assertStoredKey(key, route.keyPrefix),
    bucket: route.bucket,
  };
}
