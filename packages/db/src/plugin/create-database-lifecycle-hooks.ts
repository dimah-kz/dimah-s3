import { AbortMultipartUploadCommand, type S3Client } from "@aws-sdk/client-s3";
import { s3Error } from "@dimah-s3/core";
import type {
  ObjectContext,
  RouteGuardContext,
  S3Operation,
  UploadGuardContext,
} from "@dimah-s3/server";
import type { DimahS3PluginHooks } from "@dimah-s3/server/plugins";
import { parseFolder } from "@/folder-path";
import type { DbStore } from "@/store/create-db-store";
import { isUploading, type ObjectRef } from "@/store/object-store";
import type { ScopeOperation } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import type { ObjectAccess } from "./object-access";
import type { Quota } from "./quota";
import type { ScopeResolver, ScopeTarget } from "./scope";

/** What the hooks read from the dimah-s3 config, once `init` has run. */
export type DbRoutes = {
  /** False when the route sets `plugins: { db: false }`. */
  tracked: (route: string) => boolean;
  /** The route's `plugins.db.replace`. */
  replace: (route: string) => "overwrite" | undefined;
  /** S3 client of the route. */
  client: (route: string) => S3Client | undefined;
};

export type CreateDatabaseLifecycleHooksOptions<TSession, TAttributes> = {
  store: Pick<DbStore<TAttributes>, "objects" | "folders">;
  resolveScope: ScopeResolver<TSession>;
  access: ObjectAccess<TSession, TAttributes>;
  quota: Quota<TSession>;
  /** @default "soft" */
  deleteMode?: "soft" | "hard";
  routes: DbRoutes;
};

/** Scope operation of each server operation that can carry an upload ticket. */
const TICKET_OPERATIONS: Partial<Record<S3Operation, ScopeOperation>> = {
  upload: "upload",
  "multipart.init": "upload",
  confirm: "confirm",
  "multipart.signPart": "multipart",
  "multipart.listParts": "multipart",
  "multipart.complete": "multipart",
  "multipart.abort": "multipart",
};

/** The `(bucket, key)` of a hook context. */
function refOf(context: ObjectContext): ObjectRef {
  return { bucket: context.bucket, key: context.key };
}

/** What a hook on one object resolves the scope for. */
function objectTarget(
  context: ObjectContext,
  operation: ScopeOperation,
): ScopeTarget {
  return { operation, route: context.route, key: context.key };
}

/** What an upload resolves the scope for, with its `clientMetadata.folder`. */
function uploadTarget(context: UploadGuardContext) {
  return {
    ...objectTarget(context, "upload"),
    folder: parseFolder(context.clientMetadata?.folder ?? ""),
    clientMetadata: context.clientMetadata,
  };
}

/** True while the row is the one `uploadToken`'s upload wrote. */
function writtenBy<T>(
  object: StorageObject<T> | null,
  uploadToken: string,
): object is StorageObject<T> {
  return object !== null && object.uploadToken === uploadToken;
}

/** True once `uploadToken`'s upload is confirmed on the row. */
function confirmedBy<T>(
  object: StorageObject<T> | null,
  uploadToken: string,
): boolean {
  return (
    writtenBy(object, uploadToken) &&
    object.status === "active" &&
    !isUploading(object)
  );
}

/**
 * The `db` plugin's server hooks. They keep `storage_object` in step with
 * S3 and check that every call acts on rows of its own scope:
 *
 * - `ticketSubject` binds upload tickets to the scope.
 * - `upload.guard` checks the folder, ownership of the key, `authorize`
 *   (with the object an overwrite replaces), and the quota; `onStart` writes
 *   the pending row, then its folders. An overwrite leaves the active row in
 *   place until it is confirmed.
 * - `confirmGuard` and `multipart.guard` accept only the row of the ticket's
 *   upload; `onConfirmed` checks the quota against the verified size and
 *   marks the row active.
 * - `download.guard` and `delete.guard` check ownership; `onDeleted` aborts a
 *   multipart upload in flight and deletes the row.
 */
export function createDatabaseLifecycleHooks<TSession, TAttributes>(
  options: CreateDatabaseLifecycleHooksOptions<TSession, TAttributes>,
): DimahS3PluginHooks {
  const { objects, folders } = options.store;
  const { access, quota, resolveScope, routes } = options;
  const deleteMode = options.deleteMode ?? "soft";

  /**
   * The row of the ticket's upload, checked for ownership. A row that is
   * missing, deleted, purging, or taken by another upload is
   * `OBJECT_NOT_FOUND`. `replayable` also accepts the row once the upload
   * is confirmed, so a retried confirm or complete gets through.
   */
  const assertUploadRow = async (
    context: ObjectContext & { uploadToken: string },
    operation: ScopeOperation,
    replayable: boolean,
  ) => {
    const { object } = await access.object(
      context,
      objectTarget(context, operation),
      refOf(context),
    );
    const { uploadToken } = context;
    const live =
      (writtenBy(object, uploadToken) && isUploading(object)) ||
      (replayable && confirmedBy(object, uploadToken));
    if (!live) throw s3Error("OBJECT_NOT_FOUND");
  };

  /**
   * What an upload writes to: the row at its key, and the scope target. An
   * overwrite keeps the active row's folder, so that folder is the target.
   */
  const uploadWrite = async (context: UploadGuardContext) => {
    const target = uploadTarget(context);
    const existing = await objects.find(refOf(context));
    if (
      existing?.status !== "active" ||
      routes.replace(context.route) !== "overwrite"
    ) {
      return { target, existing, replaced: null };
    }
    return {
      target: { ...target, folder: existing.folder },
      existing,
      replaced: existing,
    };
  };

  /** Aborts the multipart upload in flight on the row. Best-effort. */
  const abortPendingMultipart = async (context: ObjectContext) => {
    const row = await objects.find(refOf(context));
    const client = routes.client(context.route);
    if (!row || !isUploading(row) || !row.uploadId || !client) return;
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: context.bucket,
          Key: context.key,
          UploadId: row.uploadId,
        }),
      );
    } catch {
      // The upload may be gone already; purge and S3 lifecycle rules catch the rest.
    }
  };

  return {
    async ticketSubject(context: RouteGuardContext) {
      const operation = TICKET_OPERATIONS[context.operation];
      if (!operation || !routes.tracked(context.route)) return undefined;
      const { scope } = await resolveScope(context, {
        operation,
        route: context.route,
      });
      return scope;
    },

    upload: {
      async guard(context) {
        const { target, existing, replaced } = await uploadWrite(context);
        let scope;
        if (replaced) {
          // `authorize` sees the object the upload replaces.
          scope = await resolveScope(context, target);
          await access.assertOwner(scope, replaced);
        } else {
          scope = await access.scope(context, target);
          if (existing && existing.status !== "deleted") {
            if (existing.scope !== scope.scope) throw s3Error("FORBIDDEN");
            // Purge is cleaning the key up; a retry after it finishes succeeds.
            if (existing.status === "purging") throw s3Error("CONFLICT");
            if (existing.status === "active") throw s3Error("CONFLICT");
          }
        }
        await quota.assert(scope, {
          size: context.file.size,
          excluding: refOf(context),
        });
      },

      async onStart(context) {
        const { target } = await uploadWrite(context);
        const { scope } = await resolveScope(context, target);
        const row = await objects.upsertPending({
          ...refOf(context),
          scope,
          route: context.route,
          folder: target.folder,
          filename: context.file.name,
          contentType: context.file.type ?? null,
          declaredSize: context.file.size,
          acl: context.acl,
          uploadId: context.uploadId ?? null,
          uploadToken: context.uploadToken,
          expiresAt: context.expiresAt,
          overwrite: routes.replace(context.route) === "overwrite",
        });
        // After the row, so a folder delete in between sees it or is undone.
        // An overwrite keeps the row's folder.
        await folders.ensure(scope, row.folder);
      },

      async confirmGuard(context) {
        await assertUploadRow(context, "confirm", true);
      },

      async onConfirmed(context) {
        const ref = refOf(context);
        const row = await objects.find(ref);
        if (!confirmedBy(row, context.uploadToken)) {
          const scope = await resolveScope(
            context,
            objectTarget(context, "confirm"),
          );
          try {
            await quota.assert(scope, {
              size: context.object.size,
              excluding: ref,
            });
          } catch (error) {
            // The server deletes the object; its row goes with it.
            await objects.discardUpload({
              ...ref,
              uploadToken: context.uploadToken,
            });
            throw error;
          }
        }
        // A replay returns the stored row.
        await objects.markActive({
          ...ref,
          uploadToken: context.uploadToken,
          size: context.object.size,
          eTag: context.object.eTag ?? null,
          contentType: context.object.type,
          filename: context.object.name,
          s3Metadata: context.object.metadata,
          acl: context.acl,
        });
      },

      multipart: {
        async guard(context) {
          if (context.action !== "abort") {
            await assertUploadRow(
              context,
              "multipart",
              context.action === "complete",
            );
            return;
          }
          // Abort accepts an expired ticket, so the row may be purged or
          // replaced. The abort touches only this upload, and onAbort
          // changes only this upload's row, so only that row is checked.
          const row = await objects.find(refOf(context));
          if (!writtenBy(row, context.uploadToken)) return;
          const scope = await resolveScope(
            context,
            objectTarget(context, "multipart"),
          );
          await access.assertOwner(scope, row);
        },

        async onAbort(context) {
          await objects.cancelUpload({
            ...refOf(context),
            uploadToken: context.uploadToken,
          });
        },
      },
    },

    download: {
      async guard(context) {
        const { object } = await access.object(
          context,
          objectTarget(context, "download"),
          refOf(context),
        );
        if (object.status !== "active") throw s3Error("OBJECT_NOT_FOUND");
      },
    },

    delete: {
      async guard(context) {
        await access.object(
          context,
          objectTarget(context, "delete"),
          refOf(context),
        );
      },

      async onDeleted(context) {
        await abortPendingMultipart(context);
        const ref = refOf(context);
        if (deleteMode === "hard") await objects.hardDelete(ref);
        else await objects.softDelete(ref);
      },
    },
  };
}
