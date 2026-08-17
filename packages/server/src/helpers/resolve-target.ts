import { errors } from "../errors";
import type {
  DownloadConfig,
  DeleteConfig,
  FeatureToggle,
  KeyPrefix,
  MultipartConfig,
  ResolvedDimahS3Config,
  ResolveKeyContext,
  UploadConfig,
} from "../types";

type KeyPolicy = {
  prefix?: KeyPrefix;
  resolveKey?: (context: ResolveKeyContext) => string | Promise<string>;
};

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

export function normalizeFeature<T extends { enabled?: boolean }>(
  value: FeatureToggle<T> | undefined,
): (T & { enabled: boolean }) | undefined {
  if (value === undefined) return undefined;
  if (value === false) return { enabled: false } as T & { enabled: boolean };
  if (value === true) return { enabled: true } as T & { enabled: boolean };
  return { ...value, enabled: value.enabled ?? true };
}

export function isFeatureEnabled(
  config: ResolvedDimahS3Config,
  feature: "upload" | "download" | "delete" | "multipart",
): boolean {
  return config[feature]?.enabled === true;
}

export function applyMultipartDefault(
  config: ResolvedDimahS3Config,
  multipartInput: FeatureToggle<MultipartConfig> | undefined,
): ResolvedDimahS3Config {
  let next = config;
  if (multipartInput === undefined && config.upload?.enabled) {
    next = {
      ...config,
      multipart: { ...config.multipart, enabled: true },
    };
  }
  if (next.multipart && next.upload) {
    next = {
      ...next,
      multipart: {
        ...next.multipart,
        prefix: next.multipart.prefix ?? next.upload.prefix,
        resolveKey: next.multipart.resolveKey ?? next.upload.resolveKey,
      },
    };
  }
  return next;
}

export type NormalizedFeatures = {
  upload?: UploadConfig & { enabled: boolean };
  download?: DownloadConfig & { enabled: boolean };
  delete?: DeleteConfig & { enabled: boolean };
  multipart?: MultipartConfig & { enabled: boolean };
};

export function normalizeFeatures(config: {
  upload?: FeatureToggle<UploadConfig>;
  download?: FeatureToggle<DownloadConfig>;
  delete?: FeatureToggle<DeleteConfig>;
  multipart?: FeatureToggle<MultipartConfig>;
}): NormalizedFeatures {
  return {
    upload: normalizeFeature(config.upload),
    download: normalizeFeature(config.download),
    delete: normalizeFeature(config.delete),
    multipart: normalizeFeature(config.multipart),
  };
}
