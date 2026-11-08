import type { DimahS3Locals } from "@dimah-s3/server";
import type { DimahS3DbClient } from "@/fuma-db";
import type { StandardSchemaV1 } from "@/standard-schema";
import type { DbQuota } from "./client";
import type { StorageObject } from "./storage-object";

/**
 * What a scope is resolved for.
 * - `upload`: presign, multipart init, and `s3.put`
 * - `confirm`: confirm, and the confirm step of multipart complete
 * - `multipart`: part, list, abort, and complete
 * - `download`: presigned download and `GET /file`
 * - `delete`: delete, and each key of `deleteMany`
 * - `list`: `GET /db/objects`
 * - `read`: `GET /db/object`
 * - `update`: `PATCH /db/object` and the folder endpoints
 */
export type ScopeOperation =
  | "upload"
  | "confirm"
  | "multipart"
  | "download"
  | "delete"
  | "list"
  | "read"
  | "update";

/**
 * Who is calling: what `resolveScope` and a `quota` function see. The
 * scope comes from the caller alone, never from the target, so the same
 * caller gets the same scope when a ticket is bound, used, and confirmed.
 */
export type ScopeContext<TSession = undefined> = {
  request: Request;
  /** Locals the guards have set so far. */
  locals: DimahS3Locals;
  /** `getSession(request)`, resolved once per request. */
  session: TSession;
  operation: ScopeOperation;
  /**
   * Named route of the call. `list` has one only when the client filters
   * by route; `read`, `update`, and the folder endpoints have none.
   */
  route?: string;
};

/**
 * What `authorize` checks: the caller's resolved scope, and what the call
 * targets.
 */
export type AuthorizeContext<
  TSession = undefined,
  TAttributes = never,
> = ScopeContext<TSession> & {
  scope: string;
  /** Object key. Absent on `list` and the folder endpoints. */
  key?: string;
  /**
   * Path of the target folder. `null` is the root. Absent when the call is
   * not aimed at one folder. A rename or move reports the destination.
   */
  folder?: string | null;
  /** Id of the target folder. `null` is the root. */
  folderId?: string | null;
  /** Client extras of the upload. Set on `upload` only. */
  clientMetadata?: Record<string, string>;
  /**
   * The stored row, when the call targets one, including the active object
   * an overwrite replaces. It is the server view: `scope`, `s3Metadata`, and
   * the attributes as stored.
   */
  object?: StorageObject<TAttributes>;
};

/** Per-route options under `plugins: { db: … }`. */
export type DbRouteOptions = {
  /**
   * `"overwrite"` lets an upload replace an active object at the same key.
   * Without it, that upload fails with `OBJECT_EXISTS`.
   */
  replace?: "overwrite";
};

declare module "@dimah-s3/server" {
  interface DimahS3RoutePluginOptions {
    /** `false` turns db tracking and every db hook off for the route. */
    db?: false | DbRouteOptions;
  }
}

/** Typed app attributes for `PATCH /db/object`. */
export type DbAttributesOptions<
  TAttributes,
  TClientAttributes = TAttributes,
> = {
  /** Validates the `attributes` of a PATCH body. */
  schema: StandardSchemaV1<unknown, TAttributes>;
  /** Maps stored attributes to what the browser sees. Defaults to all of them. */
  toClient?: (attributes: TAttributes) => TClientAttributes;
  /** Largest JSON size of the attributes, in bytes. @default 16_384 */
  maxBytes?: number;
};

/** Caps for a scope, or a function that returns them per request. */
export type DbQuotaOption<TSession = undefined> =
  | DbQuota
  | ((
      context: ScopeContext<TSession> & { scope: string },
    ) => DbQuota | null | Promise<DbQuota | null>);

/**
 * Options of the `db()` plugin. Without `attributes.toClient`, the browser
 * sees the stored attributes, so `TClientAttributes` defaults to them.
 */
export type DbPluginOptions<
  TSession = undefined,
  TAttributes = never,
  TClientAttributes = TAttributes,
> = {
  /** `DimahS3DB.client(adapter)`. */
  client: DimahS3DbClient;
  /** Loads the session for a request. Called at most once per `Request`. */
  getSession?: (request: Request) => TSession | Promise<TSession>;
  /**
   * Owning scope of the caller, such as `user:123`, at most 255 characters.
   * `null` rejects the call with `UNAUTHORIZED`, and a longer scope fails it
   * as a config error. It runs once per call and route, so the guard and the
   * lifecycle hooks of one call share the result.
   */
  resolveScope: (
    context: ScopeContext<TSession>,
  ) => string | null | Promise<string | null>;
  /**
   * Runs after the scope is resolved and, for a stored object, after the
   * ownership check, so it can only narrow access. `object` is set when the
   * call targets a stored row, including the active object an overwrite
   * replaces; that upload's `folder` is the folder of the object it
   * replaces. `false` rejects the call with `FORBIDDEN`.
   */
  authorize?: (
    context: AuthorizeContext<TSession, TAttributes>,
  ) => boolean | Promise<boolean>;
  /** Byte and file caps, checked at upload and again at confirm. */
  quota?: DbQuotaOption<TSession>;
  /** `"soft"` keeps a `deleted` row; `"hard"` removes it. @default "soft" */
  deleteMode?: "soft" | "hard";
  /** Enables `attributes` on `PATCH /db/object`. */
  attributes?: DbAttributesOptions<TAttributes, TClientAttributes>;
};
