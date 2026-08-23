import type {
  DownloadConfig,
  DeleteConfig,
  FeatureToggle,
  MultipartConfig,
  ResolvedDimahS3Config,
  UploadConfig,
} from "@/types";

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
        acl: next.multipart.acl ?? next.upload.acl,
        allowClientAcl:
          next.multipart.allowClientAcl ?? next.upload.allowClientAcl,
        requireFileSize:
          next.multipart.requireFileSize ?? next.upload.requireFileSize,
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

/**
 * `allowClientBucket` (any bucket) and `buckets` (allowlist) are exclusive.
 */
export function assertExclusiveBucketFlags(config: {
  allowClientBucket?: boolean;
  buckets?: string[];
}): void {
  if (config.allowClientBucket && config.buckets?.length) {
    throw new Error(
      "dimahS3: set either allowClientBucket or buckets, not both. allowClientBucket honors any client-sent bucket; buckets is an allowlist.",
    );
  }
}
