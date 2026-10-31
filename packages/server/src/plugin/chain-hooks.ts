import type {
  DimahS3Locals,
  Guard,
  GuardResult,
  LifecycleHook,
} from "@/types/locals";

/**
 * Composes hooks into one that awaits each in order and stops at the first
 * throw. `undefined` entries are skipped, so optional hooks compose:
 *
 * ```ts
 * upload: {
 *   guard: chainHooks(requireUser, checkQuota),
 * }
 * ```
 *
 * Chained guards behave like separate ones: each `{ locals }` result is
 * copied into `context.locals` before the next hook runs. Any other return
 * value is passed on after the chain, so the server still rejects it as a
 * config error.
 */
export function chainHooks<C>(
  ...hooks: (LifecycleHook<C> | undefined)[]
): LifecycleHook<C>;
export function chainHooks<C extends { locals: DimahS3Locals }>(
  ...hooks: (Guard<C> | undefined)[]
): Guard<C>;
export function chainHooks<C>(...hooks: (Guard<C> | undefined)[]): Guard<C> {
  return async (context) => {
    let unexpected: GuardResult;
    for (const hook of hooks) {
      if (!hook) continue;
      const result = await hook(context);
      if (result === undefined) continue;
      const locals = contextLocals(context);
      if (locals && isLocalsResult(result)) {
        Object.assign(locals, result.locals);
      } else {
        unexpected ??= result;
      }
    }
    return unexpected;
  };
}

/** The `locals` of a hook context. Every dimah-s3 hook context has one. */
function contextLocals(context: unknown): object | undefined {
  if (typeof context !== "object" || context === null) return undefined;
  if (!("locals" in context)) return undefined;
  const { locals } = context;
  return typeof locals === "object" && locals !== null ? locals : undefined;
}

/** Same shape rule as the server's guard check: exactly `{ locals: object }`. */
function isLocalsResult(value: unknown): value is { locals: object } {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "locals") return false;
  const { locals } = value as { locals: unknown };
  return (
    typeof locals === "object" && locals !== null && !Array.isArray(locals)
  );
}
