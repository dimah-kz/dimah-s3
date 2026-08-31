import {
  normalizeObjectKey,
  sanitizeFileName,
  type S3ObjectAcl,
} from "@dimah-s3/core";
import { errors } from "@/errors";
import { runObjectHook } from "@/helpers/hooks";
import type {
  OpenedRoute,
  ResolvedRoute,
  UploadObjectContext,
  UploadObjectInfo,
} from "@/types";

export type ResolvedObject = {
  key: string;
  bucket: string;
  metadata?: Record<string, string>;
  acl: S3ObjectAcl;
};

type RouteKeyPrefix = ResolvedRoute["keyPrefix"];

/**
 * Strip leading/trailing slashes and reject `.` / `..` / empty segments,
 * NUL, and backslashes. Returns `null` when the key is unsafe.
 */
export { normalizeObjectKey };

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
  if (k.startsWith(`${p}/`)) return k;
  if (k === p) throw errors.invalidKey();
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
  if (safe.startsWith(`${root}/`)) return safe;
  throw errors.invalidKey();
}

/**
 * Leaf name for a generated object key. Path segments (`../`, `/`) must
 * not become extra key folders or fail {@link assertSafeObjectKey}.
 */
function objectKeyFileName(fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  const leaf = sanitized
    .split("/")
    .filter((part) => part.length > 0)
    .at(-1);
  if (!leaf || leaf === "." || leaf === "..") return "file";
  return leaf;
}

/** `{folder}/{uuid}/{sanitizedName}` — omit `folder` (`false`) for `{uuid}/{name}`. */
export function generateObjectKey(
  folder: string | false,
  fileName: string,
): string {
  const leaf = `${crypto.randomUUID()}/${objectKeyFileName(fileName)}`;
  if (folder === false) return assertSafeObjectKey(leaf);
  return applyPrefix(folder, leaf);
}

function resolveAcl(
  info: UploadObjectInfo | void,
  route: OpenedRoute<"upload" | "multipart">,
): ResolvedObject["acl"] {
  return info?.acl ?? route.upload.acl ?? "private";
}

export async function resolveUploadTarget(
  route: OpenedRoute<"upload" | "multipart">,
  context: Omit<UploadObjectContext, "bucket" | "keyPrefix">,
): Promise<ResolvedObject> {
  const bucket = route.bucket;
  const objectContext: UploadObjectContext = {
    ...context,
    bucket,
    keyPrefix: route.keyPrefix,
  };
  const info =
    (await runObjectHook(route.upload.object, objectContext)) ?? undefined;
  const key = info?.key
    ? nestKeyUnderPrefix(route.keyPrefix, info.key)
    : generateObjectKey(
        info?.folder != null && info.folder !== ""
          ? nestKeyUnderPrefix(route.keyPrefix, info.folder)
          : route.keyPrefix === false
            ? false
            : route.keyPrefix,
        context.file.name,
      );
  return {
    key,
    bucket,
    metadata: info?.metadata,
    acl: resolveAcl(info, route),
  };
}

export function resolveStoredTarget(
  route: ResolvedRoute,
  key: string,
): { key: string; bucket: string } {
  return {
    key: assertStoredKey(key, route.keyPrefix),
    bucket: route.bucket,
  };
}
