import { forbidden, notFound, unauthorized } from "../errors";
import {
  createStorageObjectStore,
  type DimahS3DbClient,
  type StorageObjectStore,
} from "../store/storage-object-store";
import type {
  ScopeResolver,
  StorageObject,
  StorageObjectStatus,
} from "../types/storage-object";

/** Minimal context the guard needs — matches every key-bearing server hook context. */
export type ObjectAccessGuardContext = {
  request: Request;
  key: string;
  bucket: string;
};

export type CreateObjectAccessGuardOptions = {
  db: DimahS3DbClient | StorageObjectStore;
  resolveScope: ScopeResolver;
  /**
   * Which rows count as accessible.
   * @default "active"
   */
  requireStatus?: StorageObjectStatus | "any";
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
  db: DimahS3DbClient | StorageObjectStore,
): StorageObjectStore {
  return "upsertPending" in db ? db : createStorageObjectStore(db);
}

/**
 * Guard that checks the requested object exists in the DB and belongs to the
 * caller's scope. Throws `DimahS3Error` (401 / 404 / 403) to reject.
 *
 * Usable as `download.presignGuard`, `delete.guard`,
 * `upload.confirmGuard`, or in your own routes.
 */
export function createObjectAccessGuard(
  options: CreateObjectAccessGuardOptions,
): (context: ObjectAccessGuardContext) => Promise<void> {
  const store = resolveStore(options.db);
  const requireStatus = options.requireStatus ?? "active";

  return async (context) => {
    const scope = await options.resolveScope(context.request);
    if (scope === null) throw unauthorized();

    const object = await store.find({
      bucket: context.bucket,
      key: context.key,
    });
    if (
      !object ||
      (requireStatus !== "any" && object.status !== requireStatus)
    ) {
      throw notFound();
    }

    const allowed = options.authorize
      ? await options.authorize(object, { ...context, scope })
      : object.scope === scope;
    if (!allowed) throw forbidden();
  };
}
