import { s3Error } from "@dimah-s3/core";
import type { ObjectRef, StorageObjectStore } from "@/store/object-store";
import type { DbClientObject } from "@/types/client";
import type { DbPluginOptions } from "@/types/plugin";
import type { StorageObject } from "@/types/storage-object";
import type {
  ResolvedScope,
  ScopeCall,
  ScopeResolver,
  ScopeTarget,
} from "./scope";

export type CreateObjectAccessOptions<
  TSession,
  TAttributes,
  TClientAttributes,
> = Pick<
  DbPluginOptions<TSession, TAttributes, TClientAttributes>,
  "authorize"
> & {
  objects: Pick<StorageObjectStore<TAttributes>, "find">;
  resolveScope: ScopeResolver<TSession>;
  /** Maps a row to what `authorize` sees. */
  toClientObject: (
    object: StorageObject<TAttributes>,
  ) => DbClientObject<TClientAttributes>;
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
    target: ScopeTarget,
  ) => Promise<ResolvedScope<TSession>>;
  /**
   * Resolves the scope and loads the row at `ref`, which must belong to it.
   * @throws `UNAUTHORIZED`, `OBJECT_NOT_FOUND` when there is no row or it is
   * deleted, or `FORBIDDEN`.
   */
  object: (
    call: ScopeCall,
    target: ScopeTarget,
    ref: ObjectRef,
  ) => Promise<AccessibleObject<TSession, TAttributes>>;
  /**
   * Checks that `object` belongs to the scope, then runs `authorize` with it.
   * @throws `FORBIDDEN`.
   */
  assertOwner: (
    scope: ResolvedScope<TSession>,
    object: StorageObject<TAttributes>,
  ) => Promise<void>;
};

/**
 * Creates the access checks. A row belongs to the scope that wrote it, and
 * `authorize` can only narrow that: it runs after the ownership check.
 */
export function createObjectAccess<TSession, TAttributes, TClientAttributes>(
  options: CreateObjectAccessOptions<TSession, TAttributes, TClientAttributes>,
): ObjectAccess<TSession, TAttributes> {
  const authorize = async (
    scope: ResolvedScope<TSession>,
    object?: StorageObject<TAttributes>,
  ) => {
    if (!options.authorize) return;
    const allowed = await options.authorize(
      object ? { ...scope, object: options.toClientObject(object) } : scope,
    );
    if (!allowed) throw s3Error("FORBIDDEN");
  };

  const assertOwner = async (
    scope: ResolvedScope<TSession>,
    object: StorageObject<TAttributes>,
  ) => {
    if (object.scope !== scope.scope) throw s3Error("FORBIDDEN");
    await authorize(scope, object);
  };

  return {
    async scope(call, target) {
      const scope = await options.resolveScope(call, target);
      await authorize(scope);
      return scope;
    },

    async object(call, target, ref) {
      const scope = await options.resolveScope(call, target);
      const object = await options.objects.find(ref);
      if (!object || object.status === "deleted") {
        throw s3Error("OBJECT_NOT_FOUND");
      }
      await assertOwner(scope, object);
      return { scope, object };
    },

    assertOwner,
  };
}
