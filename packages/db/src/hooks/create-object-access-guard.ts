import { forbidden, notFound, unauthorized } from "@/errors";
import {
  createStorageObjectStore,
  type DimahS3DbClient,
  type StorageObjectStore,
} from "@/store/storage-object-store";
import type {
  ScopeResolver,
  StorageObject,
  StorageObjectStatus,
} from "@/types/storage-object";

/** Minimal context the guard needs — matches every key-bearing server hook context. */
export type ObjectAccessGuardContext = {
  request: Request;
  key: string;
  bucket: string;
  /** Multipart session id — required when {@link CreateObjectAccessGuardOptions.requireUploadId} is set. */
  uploadId?: string;
};

export type CreateObjectAccessGuardOptions = {
  /** FumaDB client (`DimahS3DB.client(adapter)`) or a prebuilt objects store. */
  client: DimahS3DbClient | StorageObjectStore;
  resolveScope: ScopeResolver;
  /**
   * Which rows count as accessible.
   * `"any"` means pending or active (not deleted).
   * @default "active"
   */
  requireStatus?: StorageObjectStatus | "any";
  /**
   * Require `context.uploadId` to match the pending row's `uploadId`.
   * Use for `upload.multipart.guard`.
   */
  requireUploadId?: boolean;
  /**
   * Replace the default `object.scope === scope` ownership check —
   * e.g. also allow objects whose metadata marks them public.
   */
  authorize?: (
    object: StorageObject,
    context: ObjectAccessGuardContext & { scope: string },
  ) => boolean | Promise<boolean>;
};

export function resolveStore(
  client: DimahS3DbClient | StorageObjectStore,
): StorageObjectStore {
  return "upsertPending" in client ? client : createStorageObjectStore(client);
}

/**
 * Guard that checks the requested object exists in the DB and belongs to the
 * caller's scope. Throws `DimahS3Error` (401 / 404 / 403) to reject.
 *
 * Usable as `download.guard`, `delete.guard`,
 * `upload.confirmGuard`, `upload.multipart.guard`, or in your own routes.
 */
export function createObjectAccessGuard(
  options: CreateObjectAccessGuardOptions,
): (context: ObjectAccessGuardContext) => Promise<void> {
  const store = resolveStore(options.client);
  const requireStatus = options.requireStatus ?? "active";

  return async (context) => {
    const scope = await options.resolveScope(context.request);
    if (scope === null) throw unauthorized();

    const object = await store.find({
      bucket: context.bucket,
      key: context.key,
    });
    if (!object || object.status === "deleted") throw notFound();

    const allowed = options.authorize
      ? await options.authorize(object, { ...context, scope })
      : object.scope === scope;
    if (!allowed) throw forbidden();

    const statusOk =
      requireStatus === "any" ? true : object.status === requireStatus;
    if (!statusOk) throw notFound();

    if (options.requireUploadId) {
      if (!context.uploadId || object.uploadId !== context.uploadId) {
        throw forbidden("Upload session does not match");
      }
    }
  };
}
