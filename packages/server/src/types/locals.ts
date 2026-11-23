/**
 * Values that guards hand to later hooks in the same call. Augment it to
 * type them:
 *
 * ```ts
 * declare module "@dimah-s3/server" {
 *   interface DimahS3Locals {
 *     userId: string;
 *   }
 * }
 * ```
 *
 * Each call gets its own null-prototype object. HTTP requests never set it.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- consumers augment this interface
export interface DimahS3Locals {}

/**
 * Per-route plugin options under {@link DimahS3RouteConfig.plugins}, keyed
 * by plugin id. Plugins augment it (`db?: false | DbRouteOptions`). `false`
 * turns the plugin off for the route.
 */
export interface DimahS3RoutePluginOptions {
  [pluginId: string]: false | object | undefined;
}

/**
 * What a guard returns. Return nothing to allow, `{ locals }` to allow and
 * pass values to later hooks, and throw to reject. Any other value is a
 * config error: it is logged, the call returns `500`, and it never allows.
 */
export type GuardResult = void | undefined | { locals: Partial<DimahS3Locals> };

/** Authorization hook. See {@link GuardResult}. */
export type Guard<C> = (context: C) => GuardResult | Promise<GuardResult>;

/** Lifecycle `on*` hook. It runs after plugin hooks for the same slot. */
export type LifecycleHook<C> = (context: C) => void | Promise<void>;
