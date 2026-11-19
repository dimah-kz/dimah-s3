import { HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { normalizeObjectKey, s3Error } from "@dimah-s3/core";
import type {
  DimahS3Config,
  DimahS3Locals,
  S3ServerCallOptions,
} from "@dimah-s3/server";
import {
  deleteObjectIfMatch,
  isAwsNotFound,
  readObjectMetadata,
  type PluginInitEnv,
} from "@dimah-s3/server/plugins";
import { isFolderName } from "@/folder-path";
import type { DbStore } from "@/store/create-db-store";
import type { StorageObject } from "@/types/storage-object";
import type { ObjectAccess } from "./object-access";
import type { Quota } from "./quota";
import type { ScopeCall, ScopeResolver } from "./scope";

/** An object the app already put in the bucket, to record as a row. */
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
  /** Display name, one path segment, at most 255 characters. */
  name: string;
};

/**
 * Who is recording: the same options as an in-process `s3.api` call.
 * `resolveScope` and `authorize` see it. `record` does not run the route
 * guard, so pass the `request`, `headers`, or `locals` that `resolveScope`
 * reads. `request` wins over `headers` and `signal`.
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
  env: () => PluginInitEnv | undefined;
};

/**
 * Records an object the app put in the bucket itself, such as a `CopyObject`
 * made with the app's own `S3Client`. dimah-s3 does not copy the bytes.
 *
 * The size, type, and eTag come from HeadObject. `resolveScope` and
 * `authorize` run with `operation: "record"`, then the quota. An empty
 * object is `FILE_EMPTY`. An object that does not fit the quota is deleted
 * and no row is written, the same as a confirm that no longer fits. An
 * active row at the key is `OBJECT_EXISTS`. A row an upload or purge holds
 * is `CONFLICT`. A deleted row is replaced.
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
    const located = locateRoute(env.config, input.route);
    if (!located) throw s3Error("UNKNOWN_ROUTE", { route: input.route });
    if (env.routeOptions(input.route) === false) {
      throw s3Error("VALIDATION_ERROR", {
        issue: `[route] "${input.route}" does not track objects`,
      });
    }
    const key = routeKey(input.key, located.keyPrefix);
    const filename = fileName(input.name);
    const folderId = rootId(input.folderId);
    const scopeCall = scopeCallOf(env.config, call);
    const peeked = await resolveScope(scopeCall, {
      operation: "record",
      route: input.route,
    });
    let folderPath: string | null = null;
    if (folderId !== null) {
      const folder = await store.folders.find(peeked.scope, folderId);
      if (!folder) throw s3Error("FOLDER_NOT_FOUND");
      folderPath = folder.path;
    }
    const scope = await access.scope(scopeCall, {
      operation: "record",
      route: input.route,
      key,
      folderId,
      folder: folderPath,
    });

    const ref = { bucket: located.bucket, key };
    const existing = await store.objects.find(ref);
    if (existing && existing.status !== "deleted") {
      if (existing.scope !== scope.scope) throw s3Error("FORBIDDEN");
      if (existing.status === "active") throw s3Error("OBJECT_EXISTS");
      throw s3Error("CONFLICT");
    }

    const client = routeClient(env, input.route);
    const head = await headStored(
      client,
      located.bucket,
      key,
      scopeCall.request.signal,
    );
    if (head.size === 0) {
      await removeRefused(client, located.bucket, key, head.rawETag);
      throw s3Error("FILE_EMPTY");
    }
    try {
      await quota.assert(scope, { size: head.size, excluding: ref });
    } catch (error) {
      await removeRefused(client, located.bucket, key, head.rawETag);
      throw error;
    }

    const row = await store.objects.insertActive({
      ...ref,
      scope: scope.scope,
      route: input.route,
      folderId,
      filename,
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
  };
}

type LocatedRoute = {
  bucket: string;
  keyPrefix: string | false;
};

/** The route's bucket and key namespace, or `null` when the route is absent. */
function locateRoute(config: DimahS3Config, name: string): LocatedRoute | null {
  const route = Object.hasOwn(config.routes, name)
    ? config.routes[name]
    : undefined;
  if (!route) return null;
  const bucket = route.bucket ?? config.bucket;
  if (!bucket) return null;
  if (route.keyPrefix === false) return { bucket, keyPrefix: false };
  const keyPrefix = normalizeObjectKey(route.keyPrefix ?? name);
  if (!keyPrefix) return null;
  return { bucket, keyPrefix };
}

/** A safe key inside the route namespace. Otherwise `KEY_INVALID`. */
function routeKey(key: string, keyPrefix: string | false): string {
  const safe = normalizeObjectKey(key);
  if (!safe) throw s3Error("KEY_INVALID");
  if (keyPrefix === false) return safe;
  if (safe.startsWith(`${keyPrefix}/`)) return safe;
  throw s3Error("KEY_INVALID");
}

/** `""` is the root, the same as `null`. */
function rootId(folderId: string | null | undefined): string | null {
  return folderId === undefined || folderId === "" ? null : folderId;
}

/** One display-name segment. Otherwise `VALIDATION_ERROR`. */
function fileName(name: string): string {
  if (!name.isWellFormed()) {
    throw s3Error("VALIDATION_ERROR", {
      issue: "[name] File name is invalid",
    });
  }
  const normalized = name.normalize("NFC");
  if (!isFolderName(normalized) || normalized.includes("\\")) {
    throw s3Error("VALIDATION_ERROR", {
      issue: "[name] File name is invalid",
    });
  }
  return normalized;
}

function scopeCallOf(config: DimahS3Config, call: RecordObjectCall): ScopeCall {
  const request =
    call.request ??
    new Request(requestUrl(config), {
      headers: call.headers,
      signal: call.signal,
    });
  const locals = Object.assign(
    Object.create(null),
    call.locals,
  ) as DimahS3Locals;
  return { request, locals };
}

function requestUrl(config: DimahS3Config): string {
  if (config.baseURL) return config.baseURL;
  return new URL(config.basePath ?? "/api/s3", "http://localhost").href;
}

function routeClient(env: PluginInitEnv, route: string): S3Client {
  const { routes, client } = env.config;
  const config = Object.hasOwn(routes, route) ? routes[route] : undefined;
  const resolved = config?.client ?? client;
  if (!resolved) {
    throw new Error(`[dimah-s3/db] Route "${route}" has no S3 client.`);
  }
  return resolved;
}

type HeadedObject = {
  size: number;
  contentType: string | null;
  /** Stored eTag, without the quotes HeadObject sends. */
  eTag: string | null;
  /** HeadObject ETag as returned, for a conditional delete. */
  rawETag: string | undefined;
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
      rawETag: head.ETag,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    };
  } catch (error) {
    if (isAwsNotFound(error)) throw s3Error("OBJECT_NOT_FOUND");
    throw error;
  }
}

/** Deletes an object this call refuses to record. A failure stays quiet. */
async function removeRefused(
  client: S3Client,
  bucket: string,
  key: string,
  eTag: string | undefined,
): Promise<void> {
  try {
    await deleteObjectIfMatch(client, { bucket, key, eTag });
  } catch {
    // The refusal still stands. An object left behind is the app's to delete.
  }
}
