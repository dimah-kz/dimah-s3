import { HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { fitFileName, s3Error } from "@dimah-s3/core";
import { fileNameSchema } from "@dimah-s3/core/schema";
import type { S3ServerCallOptions } from "@dimah-s3/server";
import {
  assertFileConstraints,
  assertStoredKey,
  isAwsNotFound,
  readObjectMetadata,
  type FileConstraints,
  type PluginInitEnv,
  type PluginRoute,
} from "@dimah-s3/server/plugins";
import type { DbStore } from "@/store/create-db-store";
import type { StorageObject } from "@/types/storage-object";
import type { ObjectAccess } from "./object-access";
import type { Quota } from "./quota";
import type { ScopeResolver } from "./scope";

/**
 * An object already in the bucket, to record as a row. The app put the
 * bytes there itself: a copy, an import, or another writer. dimah-s3 does
 * not copy them and does not delete them.
 */
export type RecordObjectInput = {
  /** Named route whose namespace holds `key`. */
  route: string;
  /**
   * Object key the app wrote, inside the route namespace. A key outside it
   * is `KEY_INVALID`.
   */
  key: string;
  /**
   * Folder that holds the object. `null` and `""` are the root. A missing
   * id is `FOLDER_NOT_FOUND`.
   */
  folderId?: string | null;
  /**
   * Display name, under the rule of an uploaded file name: 1 to 255 UTF-8
   * bytes, no control or bidi characters. Defaults to the last segment of
   * `key`, fitted to that rule.
   */
  name?: string;
};

/**
 * Who is recording: the same options as an in-process `s3.api` call.
 * Every instance guard, then the route guard, runs first with
 * `operation: "plugin"` and `plugin: { id: "db", action: "record" }`.
 * `locals` seeds them. `request` wins over `headers` and `signal`.
 */
export type RecordObjectCall = Pick<
  S3ServerCallOptions,
  "request" | "headers" | "signal" | "locals"
>;

export type CreateRecordOptions<TSession, TAttributes> = {
  store: Pick<DbStore<TAttributes>, "objects" | "folders">;
  resolveScope: ScopeResolver<TSession>;
  access: ObjectAccess<TSession, TAttributes>;
  quota: Quota<TSession>;
  /** Set in `init`. `record` before `dimahS3()` returns cannot run. */
  env: () => PluginInitEnv<"db"> | undefined;
};

/**
 * Records an object the app already put in the bucket. The size, type, and
 * eTag come from HeadObject. The guards run first through the plugin's
 * `runOperation`, then `resolveScope` and `authorize` with
 * `operation: "record"`, then the route's `fileTypes` and `maxFileSize`,
 * then the quota. Every failure is an `APIError`, as from `s3.api`.
 *
 * A second call for the same bytes (the same eTag and size, in the same
 * scope) returns the row. A different object at that key is
 * `OBJECT_EXISTS`. A row an upload or purge holds is `CONFLICT`. A deleted
 * row is replaced. A refusal leaves the object where it is.
 */
export function createRecord<TSession, TAttributes>(
  options: CreateRecordOptions<TSession, TAttributes>,
) {
  const { store, resolveScope, access, quota } = options;

  return async (
    input: RecordObjectInput,
    call: RecordObjectCall = {},
  ): Promise<StorageObject<TAttributes>> => {
    const env = options.env();
    if (!env) {
      throw new Error(
        "[dimah-s3/db] s3.db.record ran before the plugin was initialized.",
      );
    }
    if (env.routeOptions(input.route) === false) {
      throw s3Error("VALIDATION_ERROR", {
        issue: `[route] "${input.route}" does not track objects`,
      });
    }

    // A missing route is `ROUTE_NOT_FOUND`, after the instance guards.
    return env.runOperation(
      { action: "record", route: input.route },
      call,
      async (context) => {
        const route = env.routes[context.route];
        const scopeCall = { request: context.request, locals: context.locals };
        const key = assertStoredKey(input.key, route.keyPrefix);
        const name =
          input.name === undefined
            ? fitFileName(key.slice(key.lastIndexOf("/") + 1))
            : fileName(input.name);
        const folderId = rootId(input.folderId);
        const peeked = await resolveScope(scopeCall, {
          operation: "record",
          route: route.name,
        });
        let folderPath: string | null = null;
        if (folderId !== null) {
          const folder = await store.folders.find(peeked.scope, folderId);
          if (!folder) throw s3Error("FOLDER_NOT_FOUND");
          folderPath = folder.path;
        }
        const scope = await access.scope(scopeCall, {
          operation: "record",
          route: route.name,
          key,
          folderId,
          folder: folderPath,
        });

        const ref = { bucket: route.bucket, key };
        const existing = await store.objects.find(ref);
        if (existing && existing.status !== "deleted") {
          if (existing.scope !== scope.scope) throw s3Error("FORBIDDEN");
          if (existing.status !== "active") throw s3Error("CONFLICT");
        }

        const head = await headStored(
          route.client,
          route.bucket,
          key,
          context.request.signal,
        );
        assertFileConstraints(uploadConstraints(route), {
          name,
          size: head.size,
          type: head.contentType ?? undefined,
        });
        if (
          existing?.status === "active" &&
          head.eTag !== null &&
          existing.eTag === head.eTag &&
          existing.size === head.size
        ) {
          return existing;
        }
        if (existing?.status === "active") throw s3Error("OBJECT_EXISTS");

        await quota.assert(scope, { size: head.size, excluding: ref });
        const row = await store.objects.insertActive({
          ...ref,
          scope: scope.scope,
          route: route.name,
          folderId,
          name,
          contentType: head.contentType,
          size: head.size,
          eTag: head.eTag,
          s3Metadata: head.metadata,
        });
        if (folderId !== null) {
          const folder = await store.folders.find(scope.scope, folderId);
          if (folder) await store.folders.retain(folder);
        }
        return row;
      },
    );
  };
}

/** `fileTypes` and `maxFileSize` when the route's upload sets them. */
function uploadConstraints(route: PluginRoute): FileConstraints {
  const { upload } = route;
  if (!upload.enabled) return {};
  return { fileTypes: upload.fileTypes, maxFileSize: upload.maxFileSize };
}

/** `""` is the root, the same as `null`. */
function rootId(folderId: string | null | undefined): string | null {
  return folderId === undefined || folderId === "" ? null : folderId;
}

/**
 * A display name under the rule of an uploaded file name, the one
 * `PATCH /db/object` checks too. Otherwise `VALIDATION_ERROR`.
 */
function fileName(name: string): string {
  const parsed = fileNameSchema.safeParse(name);
  if (!parsed.success) {
    throw s3Error("VALIDATION_ERROR", {
      issue: `[name] ${parsed.error.issues[0]?.message ?? "File name is invalid"}`,
    });
  }
  return parsed.data;
}

type HeadedObject = {
  size: number;
  contentType: string | null;
  /** Stored eTag, without the quotes HeadObject sends. */
  eTag: string | null;
  metadata: Record<string, string> | null;
};

async function headStored(
  client: S3Client,
  bucket: string,
  key: string,
  signal: AbortSignal,
): Promise<HeadedObject> {
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal: signal },
    );
    if (typeof head.ContentLength !== "number") {
      throw new TypeError(`HeadObject returned no ContentLength for "${key}".`);
    }
    const metadata = readObjectMetadata(head.Metadata).metadata;
    return {
      size: head.ContentLength,
      contentType: head.ContentType || null,
      eTag: head.ETag ? head.ETag.replaceAll('"', "") : null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    };
  } catch (error) {
    if (isAwsNotFound(error)) throw s3Error("OBJECT_NOT_FOUND");
    throw error;
  }
}
