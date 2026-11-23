import { ConfigError } from "@/helpers/error-boundary";
import type { GuardContext } from "@/types/hook-contexts";
import type { DimahS3Locals, Guard, LifecycleHook } from "@/types/locals";
import type { HookList } from "@/types/resolved";

/**
 * A new null-prototype `locals` object for one call, seeded with trusted
 * in-process values.
 */
export function createLocals(seed?: Partial<DimahS3Locals>): DimahS3Locals {
  const locals: DimahS3Locals = Object.create(null);
  if (seed) mergeLocals(locals, seed);
  return locals;
}

/**
 * Runs guards in order. Each `{ locals }` result is copied into
 * `context.locals`, so later hooks in the call see it. A throw rejects the
 * call. Any other return value is a {@link ConfigError} and never allows.
 */
export async function runGuards<C extends GuardContext>(
  guards: HookList<Guard<C>>,
  context: C,
): Promise<void> {
  for (const { plugin, hook } of guards) {
    const result: unknown = await hook(context);
    if (result === undefined) continue;
    if (!isGuardResult(result)) {
      throw new ConfigError(
        `${guardName(plugin)} for "${context.operation}" returned ${describeValue(result)}. ` +
          "Return nothing or { locals } to allow, and throw to reject.",
      );
    }
    mergeLocals(context.locals, result.locals);
  }
}

export type RunLifecycleOptions = {
  /**
   * Runs when a plugin hook throws, before the error is rethrown. Use it to
   * undo the operation, for example to delete an object whose bookkeeping
   * failed.
   */
  onPluginError?: (error: unknown) => Promise<void> | void;
};

/**
 * Runs lifecycle hooks in order: plugins first, then the user hook. The
 * first throw stops the rest and is rethrown. A user hook failure leaves the
 * operation's effects in place.
 */
export async function runLifecycle<C>(
  hooks: HookList<LifecycleHook<C>>,
  context: C,
  options: RunLifecycleOptions = {},
): Promise<void> {
  for (const { plugin, hook } of hooks) {
    try {
      await hook(context);
    } catch (error) {
      if (plugin !== undefined) await options.onPluginError?.(error);
      throw error;
    }
  }
}

function mergeLocals(target: DimahS3Locals, source: object): void {
  for (const [key, value] of Object.entries(source)) {
    (target as Record<string, unknown>)[key] = value;
  }
}

/**
 * Exactly `{ locals: object }`: a plain object whose only key is `locals`,
 * holding an object that is not an array.
 */
export function isGuardResult(
  value: unknown,
): value is { locals: Partial<DimahS3Locals> } {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === "locals" &&
    typeof value.locals === "object" &&
    value.locals !== null &&
    !Array.isArray(value.locals)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function guardName(plugin: string | undefined): string {
  return plugin === undefined ? "A guard" : `The "${plugin}" plugin guard`;
}

function describeValue(value: unknown): string {
  switch (typeof value) {
    case "string":
      return "a string";
    case "function":
      return "a function";
    case "object":
      if (value === null) return "null";
      return Array.isArray(value)
        ? "an array"
        : "an object other than { locals }";
    default:
      return String(value);
  }
}
