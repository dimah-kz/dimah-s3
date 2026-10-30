import { AbortMultipartUploadCommand, type S3Client } from "@aws-sdk/client-s3";
import type { DimahS3PluginHooks } from "@dimah-s3/server";
import { forbidden, unauthorized } from "@/errors";
import type {
  DimahS3DbClient,
  StorageObjectStore,
} from "@/store/storage-object-store";
import type { ScopeContext, ScopeResolver } from "@/types/storage-object";
import {
  createObjectAccessGuard,
  resolveStore,
} from "@/hooks/create-object-access-guard";
import { memoizeScopeResolver } from "./memoize-scope-resolver";

const DEFAULT_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type CreateDatabaseLifecycleHooksOptions = {
  client: DimahS3DbClient | StorageObjectStore;
  resolveScope: ScopeResolver;
  pendingTtlMs?: number;
  deleteMode?: "soft" | "hard";
  /**
   * S3 client for a route. Deleting a pending multipart row aborts its
   * upload through this client.
   */
  s3Client?: (route: string) => S3Client | undefined;
};

/**
 * Internal lifecycle hooks for the `db` plugin.
 * Keep the `storage_object` table in sync with S3 and enforce scope ownership.
 */
export function createDatabaseLifecycleHooks(
  options: CreateDatabaseLifecycleHooksOptions,
): {
  objects: StorageObjectStore;
  hooks: DimahS3PluginHooks;
  resolveScope: ScopeResolver;
} {
  const objects = resolveStore(options.client);
  const pendingTtlMs = options.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS;
  const deleteMode = options.deleteMode ?? "soft";
  const resolveScope = memoizeScopeResolver(options.resolveScope);

  async function requireScope(
    request: Request,
    context: ScopeContext,
  ): Promise<string> {
    const scope = await resolveScope(request, context);
    if (scope === null) throw unauthorized();
    return scope;
  }

  function uploadScope(context: {
    request: Request;
    route: string;
    key: string;
    clientMetadata?: Record<string, string>;
  }): Promise<string> {
    return requireScope(context.request, {
      operation: "upload",
      route: context.route,
      key: context.key,
      clientMetadata: context.clientMetadata,
    });
  }

  async function guardKeyOwnership(context: {
    request: Request;
    route: string;
    bucket: string;
    key: string;
    clientMetadata?: Record<string, string>;
  }): Promise<void> {
    const scope = await uploadScope(context);
    const existing = await objects.find({
      bucket: context.bucket,
      key: context.key,
    });
    if (existing && existing.status !== "deleted" && existing.scope !== scope) {
      throw forbidden("Key belongs to another scope");
    }
  }

  async function trackPending(context: {
    request: Request;
    route: string;
    bucket: string;
    key: string;
    file: { name: string; size?: number; type?: string };
    metadata?: Record<string, string>;
    clientMetadata?: Record<string, string>;
    acl?: string;
    uploadId?: string;
    replace?: "overwrite";
  }): Promise<void> {
    const scope = await uploadScope(context);
    if (context.replace === "overwrite") {
      const existing = await objects.find({
        bucket: context.bucket,
        key: context.key,
      });
      if (existing?.status === "active" && existing.scope === scope) {
        return;
      }
    }
    await objects.upsertPending({
      scope,
      bucket: context.bucket,
      key: context.key,
      route: context.route,
      contentType: context.file.type ?? null,
      declaredSize: context.file.size ?? null,
      metadata: context.metadata ?? null,
      acl: context.acl ?? null,
      filename: context.file.name,
      uploadId: context.uploadId ?? null,
      expiresAt: new Date(Date.now() + pendingTtlMs),
    });
  }

  async function trackConfirmed(context: {
    bucket: string;
    key: string;
    contentLength: number;
    eTag?: string;
    contentType?: string;
    acl?: string;
    fileName?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    await objects.markActive({
      bucket: context.bucket,
      key: context.key,
      size: context.contentLength,
      eTag: context.eTag ?? null,
      contentType: context.contentType,
      acl: context.acl,
      filename: context.fileName,
      metadata: context.metadata,
    });
  }

  /** Delete is idempotent, so the row may be a pending multipart upload. */
  async function abortPendingMultipart(context: {
    route: string;
    bucket: string;
    key: string;
  }): Promise<void> {
    const row = await objects.find({
      bucket: context.bucket,
      key: context.key,
    });
    if (row?.status !== "pending" || !row.uploadId) return;
    const s3 = options.s3Client?.(context.route);
    if (!s3) return;
    try {
      await s3.send(
        new AbortMultipartUploadCommand({
          Bucket: context.bucket,
          Key: context.key,
          UploadId: row.uploadId,
        }),
      );
    } catch {
      // Best-effort, like the purge job. A lifecycle rule catches the rest.
    }
  }

  const guardOptions = { client: objects, resolveScope };
  const pendingObjectGuard = createObjectAccessGuard({
    ...guardOptions,
    operation: "confirm",
    requireStatus: "pending",
  });
  const ownedObjectConfirmGuard = createObjectAccessGuard({
    ...guardOptions,
    operation: "confirm",
    requireStatus: "any",
  });
  const multipartSessionGuard = createObjectAccessGuard({
    ...guardOptions,
    operation: "multipart",
    requireStatus: "pending",
    requireUploadId: true,
  });
  const activeObjectGuard = createObjectAccessGuard({
    ...guardOptions,
    operation: "download",
    requireStatus: "active",
  });
  const ownedObjectDeleteGuard = createObjectAccessGuard({
    ...guardOptions,
    operation: "delete",
    requireStatus: "any",
  });

  return {
    objects,
    resolveScope,
    hooks: {
      upload: {
        guard: guardKeyOwnership,
        onPresigned: trackPending,
        confirmGuard: async (context) => {
          if (context.replace === "overwrite") {
            await ownedObjectConfirmGuard(context);
            return;
          }
          await pendingObjectGuard(context);
        },
        onConfirmed: trackConfirmed,
        multipart: {
          onInit: trackPending,
          guard: multipartSessionGuard,
          onAbort: async (context) => {
            await objects.deletePending({
              bucket: context.bucket,
              key: context.key,
              uploadId: context.uploadId,
            });
          },
        },
      },
      download: {
        guard: activeObjectGuard,
      },
      delete: {
        guard: ownedObjectDeleteGuard,
        onDeleted: async (context) => {
          if (!context.existed) await abortPendingMultipart(context);
          const ref = { bucket: context.bucket, key: context.key };
          if (deleteMode === "hard") await objects.hardDelete(ref);
          else await objects.softDelete(ref);
        },
      },
    },
  };
}
