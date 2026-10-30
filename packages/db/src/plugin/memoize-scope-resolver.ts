import type { ScopeContext, ScopeResolver } from "@/types/storage-object";

/**
 * Resolve each (request, operation, route, key) once. Presign runs the
 * ownership guard, the quota guard, and `onPresigned` on one request; they
 * share a single `resolveScope` call. A batch delete still resolves per key.
 */
export function memoizeScopeResolver(resolve: ScopeResolver): ScopeResolver {
  const cache = new WeakMap<Request, Map<string, ReturnType<ScopeResolver>>>();
  return (request: Request, context: ScopeContext) => {
    let byContext = cache.get(request);
    if (!byContext) {
      byContext = new Map();
      cache.set(request, byContext);
    }
    const id = JSON.stringify([
      context.operation,
      context.route ?? null,
      context.key ?? null,
    ]);
    let scope = byContext.get(id);
    if (scope === undefined) {
      scope = resolve(request, context);
      byContext.set(id, scope);
    }
    return scope;
  };
}
