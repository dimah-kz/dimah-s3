import { s3Error } from "@dimah-s3/core";
import type { DimahS3Locals } from "@dimah-s3/server";
import { characterCount } from "@/folder-path";
import { SCOPE_MAX_LENGTH } from "@/schema/schema";
import type { DbPluginOptions, ScopeContext } from "@/types/plugin";

/** The call a scope is resolved for: its request and the guards' `locals`. */
export type ScopeCall = {
  request: Request;
  locals: DimahS3Locals;
};

/** What a scope is resolved for: the operation and, when known, the route. */
export type ScopeTarget = Pick<ScopeContext, "operation" | "route">;

/** A {@link ScopeContext} whose scope is resolved. */
export type ResolvedScope<TSession = undefined> = ScopeContext<TSession> & {
  scope: string;
};

/**
 * Resolves the scope of a call.
 * @throws `UNAUTHORIZED` when `resolveScope` returns `null`.
 * @throws a config error when the scope is longer than
 * {@link SCOPE_MAX_LENGTH} characters.
 */
export type ScopeResolver<TSession = undefined> = (
  call: ScopeCall,
  target: ScopeTarget,
) => Promise<ResolvedScope<TSession>>;

export type CreateScopeResolverOptions<TSession> = Pick<
  DbPluginOptions<TSession>,
  "getSession" | "resolveScope"
>;

/** The `WeakMap` entry for `key`, created on first use. */
function perKey<K extends object, V>(
  cache: WeakMap<K, V>,
  key: K,
  create: () => V,
): V {
  let value = cache.get(key);
  if (value === undefined) {
    value = create();
    cache.set(key, value);
  }
  return value;
}

/**
 * Wraps the plugin's `getSession` and `resolveScope`. `getSession` runs at
 * most once per `Request`. `resolveScope` runs once per call, operation,
 * and route. A call is its `locals` object: the server creates one per
 * operation and hands it to every hook of that operation. So the guard and
 * the lifecycle hooks of one call share a scope, and it sees the `locals`
 * of the first hook that asked. Two `s3.api` calls never share one, even
 * when they pass the same `Request`. Each key of a `deleteMany` gets its
 * own `locals`, so its guard's `locals` reach the scope too.
 */
export function createScopeResolver<TSession>(
  options: CreateScopeResolverOptions<TSession>,
): ScopeResolver<TSession> {
  const sessions = new WeakMap<Request, Promise<TSession>>();
  const scopes = new WeakMap<
    DimahS3Locals,
    Map<string, Promise<string | null>>
  >();

  const getSession = (request: Request): Promise<TSession> => {
    const { getSession: load } = options;
    // Without `getSession`, `TSession` is its default, `undefined`.
    if (!load) return Promise.resolve(undefined as TSession);
    return perKey(sessions, request, async () => load(request));
  };

  return async (call, target) => {
    const session = await getSession(call.request);
    const context: ScopeContext<TSession> = {
      request: call.request,
      locals: call.locals,
      session,
      operation: target.operation,
      ...(target.route !== undefined && { route: target.route }),
    };
    // Route names never contain `:`.
    const id = `${target.operation}:${target.route ?? ""}`;
    const byTarget = perKey(scopes, call.locals, () => new Map());
    let scope = byTarget.get(id);
    if (scope === undefined) {
      scope = Promise.resolve(options.resolveScope(context));
      byTarget.set(id, scope);
    }
    const resolved = await scope;
    if (resolved === null) throw s3Error("UNAUTHORIZED");
    const length = characterCount(resolved);
    if (length > SCOPE_MAX_LENGTH) {
      // A config error: the insert would fail on PostgreSQL and MySQL, and
      // SQLite would store it.
      throw new Error(
        `[dimah-s3/db] resolveScope returned a scope of ${length} characters. A scope holds at most ${SCOPE_MAX_LENGTH}.`,
      );
    }
    return { ...context, scope: resolved };
  };
}
