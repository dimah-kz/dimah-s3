import { APIError, S3_ERROR_CODES } from "@dimah-s3/core";
import { unauthorized } from "@/errors";
import { resolveStore } from "@/hooks/create-object-access-guard";
import type {
  DimahS3DbClient,
  StorageObjectStore,
} from "@/store/storage-object-store";
import type { ScopeResolver } from "@/types/storage-object";

export type CreateQuotaGuardOptions = {
  client: DimahS3DbClient | StorageObjectStore;
  resolveScope: ScopeResolver;
  maxBytes?: number;
  maxFiles?: number;
};

export type QuotaGuardContext = {
  request: Request;
  file?: { size?: number };
  replace?: "overwrite";
  key?: string;
  bucket?: string;
};

function quotaExceeded(message: string) {
  return APIError.from("PAYLOAD_TOO_LARGE", {
    ...S3_ERROR_CODES.QUOTA_EXCEEDED,
    message,
  });
}

/**
 * Reject uploads that would exceed scope usage.
 * Wire as `upload.guard` (after `db()` so ownership still runs), or pass
 * `quota` on {@link db}.
 */
export function createQuotaGuard(
  options: CreateQuotaGuardOptions,
): (context: QuotaGuardContext) => Promise<void> {
  const objects = resolveStore(options.client);

  return async (context) => {
    const scope = await options.resolveScope(context.request);
    if (scope === null) throw unauthorized();
    const usage = await objects.getScopeUsage(scope);
    const incoming = context.file?.size ?? 0;
    const replacing = context.replace === "overwrite";

    if (
      typeof options.maxFiles === "number" &&
      !replacing &&
      usage.objectCount >= options.maxFiles
    ) {
      throw quotaExceeded("File count quota exceeded");
    }
    if (typeof options.maxBytes === "number") {
      let projected = usage.totalBytes + incoming;
      if (replacing && context.key && context.bucket) {
        const existing = await objects.find({
          bucket: context.bucket,
          key: context.key,
        });
        const oldSize =
          existing && existing.status !== "deleted"
            ? (existing.size ?? existing.declaredSize ?? 0)
            : 0;
        projected = usage.totalBytes - oldSize + incoming;
      }
      if (projected > options.maxBytes) {
        throw quotaExceeded("Storage byte quota exceeded");
      }
    }
  };
}
