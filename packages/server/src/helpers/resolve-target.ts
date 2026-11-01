import { normalizeObjectKey, s3Error, type S3ObjectAcl } from "@dimah-s3/core";
import { normalizeObjectS3 } from "@/helpers/object-s3";
import type {
  ObjectS3Headers,
  UploadObjectContext,
} from "@/types/hook-contexts";
import type { ResolvedRoute, ResolvedUpload } from "@/types/resolved";

type RouteKeyPrefix = ResolvedRoute["keyPrefix"];

/** Object identity for a new upload, from `upload.object()` and the route. */
export type UploadObject = ObjectS3Headers & {
  key: string;
  bucket: string;
  acl: S3ObjectAcl;
  /** User metadata from `upload.object()`, not yet encoded. */
  metadata?: Record<string, string>;
  /** Safe key under the route `keyPrefix` to delete after confirm. */
  previousKey?: string;
};

/**
 * Normalizes an object key: strips surrounding slashes and rejects empty,
 * `.` and `..` segments, NUL and backslashes with `KEY_INVALID`.
 */
export function assertSafeObjectKey(key: string): string {
  const normalized = normalizeObjectKey(key);
  if (!normalized) throw s3Error("KEY_INVALID");
  return normalized;
}

function applyPrefix(prefix: string, key: string): string {
  const p = assertSafeObjectKey(prefix);
  const k = assertSafeObjectKey(key);
  if (k.startsWith(`${p}/`)) return k;
  if (k === p) throw s3Error("KEY_INVALID");
  // Each half fits on its own; the joined key must fit the byte limit too.
  return assertSafeObjectKey(`${p}/${k}`);
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

/**
 * A stored key for confirm, download, delete and multipart calls: safe, and
 * inside the route namespace. Fails with `KEY_INVALID`.
 */
export function assertStoredKey(
  key: string,
  keyPrefix: RouteKeyPrefix,
): string {
  const safe = assertSafeObjectKey(key);
  if (keyPrefix === false) return safe;
  const root = assertSafeObjectKey(keyPrefix);
  if (safe.startsWith(`${root}/`)) return safe;
  throw s3Error("KEY_INVALID");
}

/** Characters an object key refuses: backslashes and control characters. */
const KEY_UNSAFE = /[\\\p{Cc}]/gu;

/**
 * Leaf name for a generated object key. Path segments (`../`, `/`) must
 * not become extra key folders or fail {@link assertSafeObjectKey}, and a
 * backslash or control character becomes `_`. `${` becomes `_{`, so a
 * key never carries the POST `${filename}` placeholder.
 */
function objectKeyFileName(fileName: string): string {
  const sanitized = fileName.replaceAll(KEY_UNSAFE, "_").replaceAll("${", "_{");
  const leaf = sanitized.split("/").findLast((part) => part.length > 0);
  if (!leaf || leaf === "." || leaf === "..") return "file";
  return leaf;
}

/** `{folder}/{uuid}/{sanitizedName}`. A `false` folder gives `{uuid}/{name}`. */
export function generateObjectKey(
  folder: string | false,
  fileName: string,
): string {
  const leaf = `${crypto.randomUUID()}/${objectKeyFileName(fileName)}`;
  if (folder === false) return assertSafeObjectKey(leaf);
  return applyPrefix(folder, leaf);
}

/**
 * Runs `upload.object()` and resolves the object it describes. `key` wins
 * over `keyFolder`, and both nest under the route `keyPrefix`. Without
 * either, the key is `{keyPrefix}/{uuid}/{name}`. Errors from `object()`
 * propagate unchanged.
 */
export async function resolveUploadObject(
  route: Pick<ResolvedRoute, "keyPrefix"> & { upload: ResolvedUpload },
  context: UploadObjectContext,
): Promise<UploadObject> {
  const info = (await route.upload.object?.(context)) ?? undefined;
  const { keyPrefix } = route;

  let key: string;
  if (info?.key) {
    key = nestKeyUnderPrefix(keyPrefix, info.key);
  } else {
    const folder = info?.keyFolder
      ? nestKeyUnderPrefix(keyPrefix, info.keyFolder)
      : keyPrefix;
    key = generateObjectKey(folder, context.file.name);
  }

  return {
    key,
    bucket: context.bucket,
    acl: info?.acl ?? route.upload.acl,
    ...(info?.metadata ? { metadata: info.metadata } : {}),
    ...(info?.previousKey
      ? { previousKey: nestKeyUnderPrefix(keyPrefix, info.previousKey) }
      : {}),
    ...normalizeObjectS3(info),
  };
}
