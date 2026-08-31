import type { DimahS3PluginHooks } from "@dimah-s3/server";
import { forbidden, unauthorized } from "@/errors";
import {
  type DimahS3DbClient,
  type StorageObjectStore,
} from "@/store/storage-object-store";
import type { ScopeResolver } from "@/types/storage-object";
import {
  createObjectAccessGuard,
  resolveStore,
} from "@/hooks/create-object-access-guard";

const DEFAULT_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type CreateDatabaseLifecycleHooksOptions = {
  client: DimahS3DbClient | StorageObjectStore;
  resolveScope: ScopeResolver;
  pendingTtlMs?: number;
  deleteMode?: "soft" | "hard";
};

/**
 * Internal lifecycle hooks for the `db` plugin.
 * Keep the `storage_object` table in sync with S3 and enforce scope ownership.
 */
export function createDatabaseLifecycleHooks(
  options: CreateDatabaseLifecycleHooksOptions,
): { objects: StorageObjectStore; hooks: DimahS3PluginHooks } {
  const objects = resolveStore(options.client);
  const pendingTtlMs = options.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS;
  const deleteMode = options.deleteMode ?? "soft";

  const scopeCache = new WeakMap<Request, string | null>();
  async function requireScope(request: Request): Promise<string> {
    let scope = scopeCache.get(request);
    if (scope === undefined) {
      scope = await options.resolveScope(request);
      scopeCache.set(request, scope);
    }
    if (scope === null) throw unauthorized();
    return scope;
  }

  async function guardKeyOwnership(context: {
    request: Request;
    bucket: string;
    key: string;
  }): Promise<void> {
    const scope = await requireScope(context.request);
    const existing = await objects.find({
      bucket: context.bucket,
      key: context.key,
    });
    if (existing && existing.scope !== scope) {
      throw forbidden("Key belongs to another scope");
    }
  }

  async function trackPending(context: {
    request: Request;
    bucket: string;
    key: string;
    contentType?: string;
    fileSize?: number;
    metadata?: Record<string, string>;
    acl?: string;
    fileName?: string;
    uploadId?: string;
  }): Promise<void> {
    const scope = await requireScope(context.request);
    await objects.upsertPending({
      scope,
      bucket: context.bucket,
      key: context.key,
      contentType: context.contentType ?? null,
      declaredSize: context.fileSize ?? null,
      metadata: context.metadata ?? null,
      acl: context.acl ?? null,
      filename: context.fileName ?? null,
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

  const ownedObjectGuard = createObjectAccessGuard({
    db: objects,
    resolveScope: options.resolveScope,
    requireStatus: "any",
  });
  const activeObjectGuard = createObjectAccessGuard({
    db: objects,
    resolveScope: options.resolveScope,
    requireStatus: "active",
  });

  return {
    objects,
    hooks: {
      upload: {
        guard: guardKeyOwnership,
        onPresigned: trackPending,
        confirmGuard: ownedObjectGuard,
        onConfirmed: trackConfirmed,
        multipart: {
          onInit: trackPending,
          sessionGuard: ownedObjectGuard,
          onAbort: async (context) => {
            await objects.deletePending({
              bucket: context.bucket,
              key: context.key,
            });
          },
        },
      },
      download: {
        guard: activeObjectGuard,
      },
      delete: {
        guard: ownedObjectGuard,
        onDeleted: async (context) => {
          const ref = { bucket: context.bucket, key: context.key };
          if (deleteMode === "hard") await objects.hardDelete(ref);
          else await objects.softDelete(ref);
        },
      },
    },
  };
}
