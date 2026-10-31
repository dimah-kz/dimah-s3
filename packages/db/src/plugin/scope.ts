import { s3Error } from "@dimah-s3/core";
import type { DimahS3Locals } from "@dimah-s3/server";
import type { DbPluginOptions, ScopeContext } from "@/types/plugin";

/** The call a scope is resolved for: its request and the guards' `locals`. */
export type ScopeCall = {
  request: Request;
  locals: DimahS3Locals;
};

/** What the call targets. Passed on to `resolveScope`. */
export type ScopeTarget = Omit<ScopeContext, "request" | "locals" | "session">;

/** A {@link ScopeContext} whose scope is resolved. */
export type ResolvedScope<TSession = undefined> = ScopeContext<TSession> & {
  scope: string;
};

/**
 * Resolves the scope of a call.
 * @throws `UNAUTHORIZED` when `resolveScope` returns `null`.
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
 * most once per `Request`. `resolveScope` runs once per call and target. A
 * call is its `locals` object: the server creates one per operation and
 * hands it to every hook of that operation. So the guard and the lifecycle
 * hooks of one call share a scope, and it sees the `locals` of the first
 * hook that asked. Two `s3.api` calls never share one, even when they pass
 * the same `Request`.
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
      ...target,
    };
    // Object keys keep `folder: undefined` (not given) apart from `null` (root).
    const id = JSON.stringify({
      operation: target.operation,
      route: target.route,
      key: target.key,
      folder: target.folder,
      clientMetadata: target.clientMetadata,
    });
    const byTarget = perKey(scopes, call.locals, () => new Map());
    let scope = byTarget.get(id);
    if (scope === undefined) {
      scope = Promise.resolve(options.resolveScope(context));
      byTarget.set(id, scope);
    }
    const resolved = await scope;
    if (resolved === null) throw s3Error("UNAUTHORIZED");
    return { ...context, scope: resolved };
  };
}
