import { s3Error } from "@dimah-s3/core";
import type { ObjectRef, StorageObjectStore } from "@/store/object-store";
import type { DbQuota } from "@/types/client";
import type { DbQuotaOption } from "@/types/plugin";
import type { ResolvedScope } from "./scope";

/** An upload checked against the caps of its scope. */
export type QuotaInput = {
  /** Bytes the upload adds: the declared size, or the verified size at confirm. */
  size: number;
  /** The row the upload writes, left out of the usage. */
  excluding: ObjectRef;
};

/** The plugin's `quota` option, resolved per scope. */
export type Quota<TSession> = {
  /** Caps for the scope, or `null` when there are none. */
  limits: (scope: ResolvedScope<TSession>) => Promise<DbQuota | null>;
  /**
   * Checks that one more file of `size` bytes fits the caps. Usage counts
   * active rows and pending rows that have not expired.
   * @throws `QUOTA_EXCEEDED` with `limit: "files"` or `limit: "bytes"`.
   */
  assert: (scope: ResolvedScope<TSession>, input: QuotaInput) => Promise<void>;
};

/** Creates the quota checks over `objects`. Without `option`, nothing is capped. */
export function createQuota<TSession>(
  objects: Pick<StorageObjectStore, "getUsage">,
  option: DbQuotaOption<TSession> | undefined,
): Quota<TSession> {
  const limits = async (scope: ResolvedScope<TSession>) =>
    (typeof option === "function" ? await option(scope) : option) ?? null;

  return {
    limits,

    async assert(scope, input) {
      const caps = await limits(scope);
      if (
        !caps ||
        (caps.maxFiles === undefined && caps.maxBytes === undefined)
      ) {
        return;
      }
      const usage = await objects.getUsage(scope.scope, {
        excluding: input.excluding,
      });
      if (caps.maxFiles !== undefined && usage.objectCount >= caps.maxFiles) {
        throw s3Error("QUOTA_EXCEEDED", { limit: "files" });
      }
      if (
        caps.maxBytes !== undefined &&
        usage.totalBytes + input.size > caps.maxBytes
      ) {
        throw s3Error("QUOTA_EXCEEDED", { limit: "bytes" });
      }
    },
  };
}
