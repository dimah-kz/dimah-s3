import { s3Error } from "@dimah-s3/core";
import type { DimahS3Locals } from "@dimah-s3/server";
import type { StorageFolderStore } from "@/store/folder-store";
import type { ObjectRef, StorageObjectStore } from "@/store/object-store";
import type { StorageFolder, StorageObject } from "@/types/storage-object";
import type { AccessTarget, ObjectAccess } from "./object-access";
import type { ResolvedScope, ScopeResolver } from "./scope";

/**
 * The call a plugin acts for: its request and the guards' `locals`, as a
 * plugin endpoint reads them from `ctx.context`.
 */
export type DbAccessCall = {
  request: Request;
  locals: DimahS3Locals;
};

/**
 * What a plugin's call is. `resolveScope` and `authorize` see it as
 * `operation: "plugin"` with this `plugin`.
 */
export type DbAccessTarget = {
  /** The plugin and its action, such as `{ id: "share", action: "createLink" }`. */
  plugin: { id: string; action: string };
  /** Named route the call is about, when there is one. */
  route?: string;
};

/** A caller whose scope is resolved: the scope context and the `scope`. */
export type DbCaller<TSession = undefined> = ResolvedScope<TSession>;

/**
 * `s3.db.access`: the scope and ownership checks the db endpoints run, for
 * a plugin built on db, such as share links. Each method resolves the
 * caller's scope with your `resolveScope`, checks that the target belongs
 * to it, then runs your `authorize` with the target, as
 * `operation: "plugin"`. A row of another scope is not found, the same as
 * no row.
 *
 * ```ts
 * const { caller, object } = await s3.db.access.object(
 *   ctx.context,
 *   { plugin: { id: "share", action: "createLink" } },
 *   { bucket, key },
 * );
 * ```
 */
export type DbAccess<TSession = undefined, TAttributes = never> = {
  /**
   * The caller, after `authorize` ran with no target.
   * @throws `UNAUTHORIZED` when `resolveScope` returns `null`, or
   * `FORBIDDEN` from `authorize`.
   */
  scope: (
    call: DbAccessCall,
    target: DbAccessTarget,
  ) => Promise<DbCaller<TSession>>;
  /**
   * The active object at `ref`, by `(bucket, key)` or by `id`, after
   * `authorize` saw it and the folder it is in.
   * @throws `UNAUTHORIZED`, `OBJECT_NOT_FOUND` when the row is missing, not
   * active, or another scope's, or `FORBIDDEN` from `authorize`.
   */
  object: (
    call: DbAccessCall,
    target: DbAccessTarget,
    ref: ObjectRef | { id: string },
  ) => Promise<{
    caller: DbCaller<TSession>;
    object: StorageObject<TAttributes>;
  }>;
  /**
   * A folder of the caller's scope, after `authorize` saw it. `null` is the
   * root, which every scope has.
   * @throws `UNAUTHORIZED`, `FOLDER_NOT_FOUND`, or `FORBIDDEN` from
   * `authorize`.
   */
  folder: (
    call: DbAccessCall,
    target: DbAccessTarget,
    folderId: string | null,
  ) => Promise<{ caller: DbCaller<TSession>; folder: StorageFolder | null }>;
};

export type CreatePublicAccessOptions<TSession, TAttributes> = {
  objects: Pick<StorageObjectStore<TAttributes>, "find" | "findById">;
  folders: Pick<StorageFolderStore, "find">;
  resolveScope: ScopeResolver<TSession>;
  access: ObjectAccess<TSession, TAttributes>;
};

/** What `resolveScope` and `authorize` see for a plugin call. */
function pluginTarget(target: DbAccessTarget): AccessTarget {
  return {
    operation: "plugin",
    plugin: { id: target.plugin.id, action: target.plugin.action },
    ...(target.route !== undefined && { route: target.route }),
  };
}

/** Creates {@link DbAccess} over the plugin's stores and checks. */
export function createPublicAccess<TSession, TAttributes>(
  options: CreatePublicAccessOptions<TSession, TAttributes>,
): DbAccess<TSession, TAttributes> {
  const { access, resolveScope, objects, folders } = options;

  return {
    scope: (call, target) => access.scope(call, pluginTarget(target)),

    async object(call, target, ref) {
      const accessTarget = pluginTarget(target);
      const caller = await resolveScope(call, accessTarget);
      const object =
        "id" in ref ? await objects.findById(ref.id) : await objects.find(ref);
      // A row that is not active is not there yet, or not anymore.
      if (object?.status !== "active") throw s3Error("OBJECT_NOT_FOUND");
      await access.assertOwner(caller, object, {
        ...accessTarget,
        key: object.key,
      });
      return { caller, object };
    },

    async folder(call, target, folderId) {
      const accessTarget = pluginTarget(target);
      const peeked = await resolveScope(call, accessTarget);
      let folder: StorageFolder | null = null;
      if (folderId !== null) {
        folder = await folders.find(peeked.scope, folderId);
        if (!folder) throw s3Error("FOLDER_NOT_FOUND");
      }
      const caller = await access.scope(call, {
        ...accessTarget,
        folder: folder?.path ?? null,
        folderId: folder?.id ?? null,
      });
      return { caller, folder };
    },
  };
}
