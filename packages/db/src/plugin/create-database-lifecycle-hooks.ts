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
import type { AccessTarget, ObjectAccess } from "./object-access";
import type { Quota } from "./quota";
import type { ScopeResolver } from "./scope";

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

/** What a hook on one object checks access for. */
function objectTarget(
  context: ObjectContext,
  operation: ScopeOperation,
): AccessTarget {
  return { operation, route: context.route, key: context.key };
}

/** What an upload checks access for, with its `clientMetadata.folder`. */
function uploadTarget(context: UploadGuardContext): AccessTarget {
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

/**
 * True once the row describes the bytes of `uploadToken`'s upload: that
 * upload confirmed it, or the row is active with the same ETag. The second
 * case is a retried confirm after a later overwrite started: the overwrite
 * replaced the row's token, but the object at the key still carries this
 * upload's marker (the server checked it), so the row still describes it.
 */
function confirmedBy<T>(
  object: StorageObject<T> | null,
  uploadToken: string,
  eTag?: string,
): boolean {
  if (object?.status !== "active") return false;
  if (object.uploadToken === uploadToken && !isUploading(object)) return true;
  return (
    eTag !== undefined && object.confirmedAt !== null && object.eTag === eTag
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
 *   upload, or a confirm it already finished; `onConfirmed` checks the quota
 *   against the verified size, marks the row active, and retires the row of
 *   the `previousKey` the server deletes next.
 * - `download.guard` and `delete.guard` check ownership; `onDeleted` aborts a
 *   multipart upload in flight and deletes the row. Deleting a deleted row
 *   again succeeds, like a plain delete.
 */
export function createDatabaseLifecycleHooks<TSession, TAttributes>(
  options: CreateDatabaseLifecycleHooksOptions<TSession, TAttributes>,
): DimahS3PluginHooks {
  const { objects, folders } = options.store;
  const { access, quota, resolveScope, routes } = options;
  const deleteMode = options.deleteMode ?? "soft";

  const removeRow = (ref: ObjectRef) =>
    deleteMode === "hard" ? objects.hardDelete(ref) : objects.softDelete(ref);

  /**
   * The row of the ticket's upload, checked for ownership. A row that is
   * missing, deleted, purging, or taken by another upload is
   * `OBJECT_NOT_FOUND`. With an `eTag`, a row the upload already confirmed
   * passes too, so a retried confirm or complete gets through.
   */
  const assertUploadRow = async (
    context: ObjectContext & { uploadToken: string },
    operation: ScopeOperation,
    replay?: { eTag?: string },
  ) => {
    const { object } = await access.object(
      context,
      objectTarget(context, operation),
      refOf(context),
    );
    const { uploadToken } = context;
    const live =
      (writtenBy(object, uploadToken) && isUploading(object)) ||
      (replay !== undefined && confirmedBy(object, uploadToken, replay.eTag));
    if (!live) throw s3Error("OBJECT_NOT_FOUND");
  };

  /**
   * What an upload writes to: the row at its key, and the access target. An
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
  const abortPendingMultipart = async (
    context: ObjectContext,
    row: StorageObject<TAttributes> | null,
  ) => {
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
          // `authorize` sees the object the upload replaces. The key is the
          // server's choice, so naming its owner reveals nothing.
          scope = await resolveScope(context, target);
          if (replaced.scope !== scope.scope) throw s3Error("FORBIDDEN");
          await access.assertOwner(scope, replaced, target);
        } else {
          scope = await access.scope(context, target);
          if (existing && existing.status !== "deleted") {
            if (existing.scope !== scope.scope) throw s3Error("FORBIDDEN");
            // Purge is cleaning the key up; a retry after it finishes succeeds.
            if (existing.status === "purging") throw s3Error("CONFLICT");
            if (existing.status === "active") throw s3Error("OBJECT_EXISTS");
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
          folder: target.folder ?? null,
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
        await assertUploadRow(context, "confirm", {
          eTag: context.object.eTag,
        });
      },

      async onConfirmed(context) {
        const ref = refOf(context);
        const row = await objects.find(ref);
        // A replay: the row already describes this object.
        if (confirmedBy(row, context.uploadToken, context.object.eTag)) return;

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

        // The server deletes the previous key next; its row goes first.
        if (context.previousKey !== undefined) {
          const previous = { bucket: context.bucket, key: context.previousKey };
          const old = await objects.find(previous);
          if (old?.status === "active" && old.scope === scope.scope) {
            await removeRow(previous);
          }
        }
      },

      multipart: {
        async guard(context) {
          if (context.action !== "abort") {
            await assertUploadRow(
              context,
              "multipart",
              // Complete is retried after it finished; the confirm step then
              // checks the ETag of what it finished.
              context.action === "complete" ? {} : undefined,
            );
            return;
          }
          // Abort accepts an expired ticket, so the row may be purged or
          // replaced. The abort touches only this upload, and onAbort
          // changes only this upload's row, so only that row is checked.
          const row = await objects.find(refOf(context));
          if (!writtenBy(row, context.uploadToken)) return;
          const target = objectTarget(context, "multipart");
          const scope = await resolveScope(context, target);
          await access.assertOwner(scope, row, target);
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
        // A deleted row of the caller's scope deletes again, as a no-op.
        await access.object(
          context,
          objectTarget(context, "delete"),
          refOf(context),
          { allowDeleted: true },
        );
      },

      async onDeleted(context) {
        const ref = refOf(context);
        await abortPendingMultipart(context, await objects.find(ref));
        await removeRow(ref);
      },
    },
  };
}
