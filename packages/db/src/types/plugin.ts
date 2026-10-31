import type { DimahS3Locals } from "@dimah-s3/server";
import type { DimahS3DbClient } from "@/fuma-db";
import type { StandardSchemaV1 } from "@/standard-schema";
import type { DbClientObject, DbQuota } from "./client";

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

/** What `resolveScope` and `authorize` know about the request. */
export type ScopeContext<TSession = undefined> = {
  request: Request;
  /** Locals the guards have set so far. */
  locals: DimahS3Locals;
  /** `getSession(request)`, resolved once per request. */
  session: TSession;
  operation: ScopeOperation;
  /** Named route. On `list`, set only when the client filters by route. */
  route?: string;
  /** Object key. Absent on `list` and the folder endpoints. */
  key?: string;
  /** Target folder of an upload, move, or folder endpoint. `null` is the root. */
  folder?: string | null;
  /** Client extras of the upload. Set on `upload` only. */
  clientMetadata?: Record<string, string>;
};

/** Per-route options under `plugins: { db: … }`. */
export type DbRouteOptions = {
  /**
   * `"overwrite"` lets an upload replace an active object at the same key.
   * Without it, that upload fails with `CONFLICT`.
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
   * Owning scope of the request. `null` rejects it with `UNAUTHORIZED`.
   * Runs once per call and target, so the guard and the lifecycle hooks of
   * one call share the result.
   */
  resolveScope: (
    context: ScopeContext<TSession>,
  ) => string | null | Promise<string | null>;
  /**
   * Runs after the scope is resolved. `object` is set when the request
   * targets a stored object, including an upload that overwrites an active
   * object; that upload's `folder` is the folder of the object it replaces.
   * `false` rejects it with `FORBIDDEN`.
   */
  authorize?: (
    context: ScopeContext<TSession> & {
      scope: string;
      object?: DbClientObject<TClientAttributes>;
    },
  ) => boolean | Promise<boolean>;
  /** Byte and file caps, checked at upload and again at confirm. */
  quota?: DbQuotaOption<TSession>;
  /** `"soft"` keeps a `deleted` row; `"hard"` removes it. @default "soft" */
  deleteMode?: "soft" | "hard";
  /** Enables `attributes` on `PATCH /db/object`. */
  attributes?: DbAttributesOptions<TAttributes, TClientAttributes>;
};
