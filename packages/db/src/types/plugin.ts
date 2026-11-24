import type { DimahS3Locals } from "@dimah-s3/server";
import type { DimahS3DbClient } from "@/fuma-db";
import type { StandardSchemaV1 } from "@/standard-schema";
import type { DbQuota } from "./client";
import type { StorageFolder, StorageObject } from "./storage-object";

/**
 * What a scope is resolved for.
 * - `upload`: presign, multipart init, and `s3.put`
 * - `confirm`: confirm, and the confirm step of multipart complete
 * - `multipart`: part, list, abort, and complete
 * - `download`: presigned download and `GET /file`
 * - `delete`: delete, and each key of `deleteMany`
 * - `list`: `GET /db/objects`
 * - `read`: `GET /db/object`
 * - `update`: `PATCH /db/object`
 * - `folder.create`: `POST /db/folder`
 * - `folder.update`: `PATCH /db/folder`, a rename or a move
 * - `folder.delete`: `DELETE /db/folder`
 * - `record`: `s3.db.record`, an object the app already put in the bucket
 * - `plugin`: a call of another plugin through `s3.db.access`, such as a
 *   share link; `plugin` names it
 */
export type ScopeOperation =
  | "upload"
  | "confirm"
  | "multipart"
  | "download"
  | "delete"
  | "list"
  | "read"
  | "update"
  | "folder.create"
  | "folder.update"
  | "folder.delete"
  | "record"
  | "plugin";

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
   * by route; `read`, `update`, and the folder operations have none.
   */
  route?: string;
  /**
   * The plugin and its action, on `operation: "plugin"` only, such as
   * `{ id: "share", action: "createLink" }`.
   */
  plugin?: { id: string; action: string };
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
  /** Object key. Absent on `list` and the folder operations. */
  key?: string;
  /**
   * Where the target is now, as a folder path. `null` is the root. For an
   * object it is the folder that holds it, also on download, delete, and a
   * move. For a folder that is renamed, moved, or deleted it is that folder.
   * For an upload, a `record`, and a new folder it is the folder they go
   * into, and for a `list` the folder it opens. Absent when the folder of a
   * stored object no longer exists.
   */
  folder?: string | null;
  /** Id of the folder `folder` names. `null` is the root. */
  folderId?: string | null;
  /**
   * Where the call puts the target, when it moves or creates one. For an
   * object move: the folder it moves into. For a folder that is created,
   * renamed, or moved: `folder` is its new path, and `folderId` the id of
   * the folder that will hold it. `null` is the root.
   */
  destination?: { folder: string | null; folderId: string | null };
  /**
   * `true` when a `list` also covers every folder below `folder`, as a
   * search across folders and a flat listing do. Deny it to keep listings
   * to one folder.
   */
  recursive?: boolean;
  /** Client extras of the upload. Set on `upload` only. */
  clientMetadata?: Record<string, string>;
  /**
   * The stored row, when the call targets one, including the active object
   * an overwrite replaces. It is the server view: `scope`, `s3Metadata`, and
   * the attributes as stored.
   */
  object?: StorageObject<TAttributes>;
};

/**
 * A change a db endpoint saved: the caller's resolved scope context, with
 * the `operation` of the call.
 */
export type DbChangeContext<TSession = undefined> = ScopeContext<TSession> & {
  scope: string;
};

/** Context of `onObjectUpdated`: `PATCH /db/object`. */
export type DbObjectUpdatedContext<
  TSession = undefined,
  TAttributes = never,
> = DbChangeContext<TSession> & {
  /** The row before the change. */
  before: StorageObject<TAttributes>;
  /** The row after it: a new `name`, `folderId`, or `attributes`. */
  after: StorageObject<TAttributes>;
};

/** Context of `onFolderCreated`: `POST /db/folder`. */
export type DbFolderCreatedContext<TSession = undefined> =
  DbChangeContext<TSession> & { folder: StorageFolder };

/** Context of `onFolderUpdated`: `PATCH /db/folder`, a rename or a move. */
export type DbFolderUpdatedContext<TSession = undefined> =
  DbChangeContext<TSession> & {
    /** The folder before the change. */
    before: StorageFolder;
    /**
     * The folder after it. The folders below it keep their ids; their paths
     * follow it.
     */
    after: StorageFolder;
  };

/** Context of `onFolderDeleted`: `DELETE /db/folder`. */
export type DbFolderDeletedContext<TSession = undefined> =
  DbChangeContext<TSession> & {
    /** The folder the call removed. */
    folder: StorageFolder;
    /** `true` when the empty folders below it went too. */
    recursive: boolean;
  };

/**
 * A hook that runs after a db endpoint saved its change. A throw fails the
 * call; the change stays.
 */
export type DbHook<C> = (context: C) => void | Promise<void>;

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
  /** `DimahS3Db.client(adapter)`. */
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
   * replaces. `folder` is where the target is now, and `destination` where
   * a move or a new folder puts it. `false` rejects the call with
   * `FORBIDDEN`.
   */
  authorize?: (
    context: AuthorizeContext<TSession, TAttributes>,
  ) => boolean | Promise<boolean>;
  /**
   * Byte and file caps, checked at upload and again at confirm, and the
   * folder cap, checked when a folder is created.
   */
  quota?: DbQuotaOption<TSession>;
  /** `"soft"` keeps a `deleted` row; `"hard"` removes it. @default "soft" */
  deleteMode?: "soft" | "hard";
  /** Enables `attributes` on `PATCH /db/object`. */
  attributes?: DbAttributesOptions<TAttributes, TClientAttributes>;
  /**
   * After `PATCH /db/object` renamed, moved, or set the attributes of an
   * object. The db endpoint hooks run once the change is saved, for calls
   * from `dbClient()`. `s3.db.objects` and `s3.db.folders` do not run them:
   * those are your own writes. A throw fails the call; the change stays.
   */
  onObjectUpdated?: DbHook<DbObjectUpdatedContext<TSession, TAttributes>>;
  /** After `POST /db/folder` created a folder. */
  onFolderCreated?: DbHook<DbFolderCreatedContext<TSession>>;
  /** After `PATCH /db/folder` renamed or moved a folder. A call that changes nothing does not run it. */
  onFolderUpdated?: DbHook<DbFolderUpdatedContext<TSession>>;
  /**
   * After `DELETE /db/folder` removed a folder. A missing folder does not
   * run it; two calls at once for the same folder can each run it, so key
   * what it writes by the folder's `id`.
   */
  onFolderDeleted?: DbHook<DbFolderDeletedContext<TSession>>;
};
