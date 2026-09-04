import type { StorageClass } from "@aws-sdk/client-s3";
import { errors } from "@/errors";
import type { ObjectS3Headers } from "@/types";

const MAX_S3_TAGS = 10;
const MAX_TAG_KEY_CHARS = 128;
const MAX_TAG_VALUE_CHARS = 256;

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertTagEntry(key: string, value: string): void {
  if (key.length === 0) {
    throw errors.validationError("S3 object tag keys cannot be empty");
  }
  if (key.length > MAX_TAG_KEY_CHARS) {
    throw errors.validationError(
      `S3 object tag keys cannot exceed ${MAX_TAG_KEY_CHARS} characters`,
    );
  }
  if (value.length > MAX_TAG_VALUE_CHARS) {
    throw errors.validationError(
      `S3 object tag values cannot exceed ${MAX_TAG_VALUE_CHARS} characters`,
    );
  }
}

/** URL-encoded `key=value&…` for the S3 `Tagging` / `x-amz-tagging` field. */
export function encodeObjectTagging(tagging: Record<string, string>): string {
  const entries = Object.entries(tagging);
  if (entries.length > MAX_S3_TAGS) {
    throw errors.validationError(
      `S3 object tagging allows at most ${MAX_S3_TAGS} tags`,
    );
  }
  return entries
    .map(([key, value]) => {
      assertTagEntry(key, value);
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");
}

function taggingHeader(tagging: Record<string, string> | undefined) {
  if (!tagging || Object.keys(tagging).length === 0) return undefined;
  return encodeObjectTagging(tagging);
}

/**
 * Drop blank `storageClass` / `cacheControl` / empty `tagging`, and reject
 * invalid tags before they are signed.
 */
export function normalizeObjectS3(
  info: ObjectS3Headers | undefined,
): ObjectS3Headers {
  const storageClass = present(info?.storageClass);
  const cacheControl = present(info?.cacheControl);
  const tagging =
    info?.tagging && Object.keys(info.tagging).length > 0
      ? info.tagging
      : undefined;
  if (tagging) encodeObjectTagging(tagging);
  return {
    ...(storageClass ? { storageClass } : {}),
    ...(cacheControl ? { cacheControl } : {}),
    ...(tagging ? { tagging } : {}),
  };
}

/** Fields for `PutObject` / `CreateMultipartUpload`. */
export function objectCommandExtras(opts: ObjectS3Headers) {
  const tagging = taggingHeader(opts.tagging);
  return {
    ...(opts.storageClass
      ? { StorageClass: opts.storageClass as StorageClass }
      : {}),
    ...(opts.cacheControl ? { CacheControl: opts.cacheControl } : {}),
    ...(tagging ? { Tagging: tagging } : {}),
  };
}

/**
 * Headers the browser must send on a signed PUT — same names as presigned
 * POST form fields.
 */
export function objectPutHeaders(
  opts: ObjectS3Headers,
): Record<string, string> {
  const tagging = taggingHeader(opts.tagging);
  return {
    ...(opts.cacheControl ? { "Cache-Control": opts.cacheControl } : {}),
    ...(opts.storageClass ? { "x-amz-storage-class": opts.storageClass } : {}),
    ...(tagging ? { "x-amz-tagging": tagging } : {}),
  };
}
