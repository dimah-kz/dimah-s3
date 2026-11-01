import { s3Error } from "@dimah-s3/core";
import type { ObjectRef, StorageObjectStore } from "@/store/object-store";
import type { AuthorizeContext, DbPluginOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import type {
  ResolvedScope,
  ScopeCall,
  ScopeResolver,
  ScopeTarget,
} from "./scope";

/** What a call targets: its scope target, plus what `authorize` checks. */
export type AccessTarget = ScopeTarget &
  Pick<AuthorizeContext, "key" | "folder" | "clientMetadata">;

export type CreateObjectAccessOptions<TSession, TAttributes> = Pick<
  DbPluginOptions<TSession, TAttributes>,
  "authorize"
> & {
  objects: Pick<StorageObjectStore<TAttributes>, "find">;
  resolveScope: ScopeResolver<TSession>;
};

/** A row the call may act on, with the scope it was checked against. */
export type AccessibleObject<TSession, TAttributes> = {
  scope: ResolvedScope<TSession>;
  object: StorageObject<TAttributes>;
};

/** Scope and ownership checks shared by the db hooks and endpoints. */
export type ObjectAccess<TSession, TAttributes> = {
  /**
   * Resolves the scope and runs `authorize` with no object: uploads,
   * listings, and folder changes.
   * @throws `UNAUTHORIZED` or `FORBIDDEN`.
   */
  scope: (
    call: ScopeCall,
    target: AccessTarget,
  ) => Promise<ResolvedScope<TSession>>;
  /**
   * Resolves the scope and loads the row at `ref`, which must belong to it.
   * A row of another scope is `OBJECT_NOT_FOUND`, the same as no row, so a
   * caller cannot learn which keys other scopes hold. A `deleted` row is
   * `OBJECT_NOT_FOUND` too, unless `allowDeleted` is set.
   * @throws `UNAUTHORIZED`, `OBJECT_NOT_FOUND`, or `FORBIDDEN` from
   * `authorize`.
   */
  object: (
    call: ScopeCall,
    target: AccessTarget,
    ref: ObjectRef,
    options?: { allowDeleted?: boolean },
  ) => Promise<AccessibleObject<TSession, TAttributes>>;
  /**
   * Checks that `object` belongs to the scope (`OBJECT_NOT_FOUND`
   * otherwise), then runs `authorize` with it.
   */
  assertOwner: (
    scope: ResolvedScope<TSession>,
    object: StorageObject<TAttributes>,
    target?: AccessTarget,
  ) => Promise<void>;
};

/**
 * Creates the access checks. A row belongs to the scope that wrote it, and
 * `authorize` can only narrow that: it runs after the ownership check.
 */
export function createObjectAccess<TSession, TAttributes>(
  options: CreateObjectAccessOptions<TSession, TAttributes>,
): ObjectAccess<TSession, TAttributes> {
  const authorize = async (
    scope: ResolvedScope<TSession>,
    target: AccessTarget | undefined,
    object?: StorageObject<TAttributes>,
  ) => {
    if (!options.authorize) return;
    const allowed = await options.authorize({
      ...scope,
      ...(target?.key !== undefined && { key: target.key }),
      ...(target?.folder !== undefined && { folder: target.folder }),
      ...(target?.clientMetadata !== undefined && {
        clientMetadata: target.clientMetadata,
      }),
      ...(object !== undefined && { object }),
    });
    if (!allowed) throw s3Error("FORBIDDEN");
  };

  const assertOwner = async (
    scope: ResolvedScope<TSession>,
    object: StorageObject<TAttributes>,
    target?: AccessTarget,
  ) => {
    if (object.scope !== scope.scope) throw s3Error("OBJECT_NOT_FOUND");
    await authorize(scope, target ?? { operation: scope.operation }, object);
  };

  return {
    async scope(call, target) {
      const scope = await options.resolveScope(call, target);
      await authorize(scope, target);
      return scope;
    },

    async object(call, target, ref, { allowDeleted = false } = {}) {
      const scope = await options.resolveScope(call, target);
      const object = await options.objects.find(ref);
      if (!object || (object.status === "deleted" && !allowDeleted)) {
        throw s3Error("OBJECT_NOT_FOUND");
      }
      await assertOwner(scope, object, target);
      return { scope, object };
    },

    assertOwner,
  };
}
