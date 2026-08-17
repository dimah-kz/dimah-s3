import type { BetterFetch } from "@better-fetch/fetch";

/**
 * Shared `$fetch` for core routes and client plugins.
 * Always created with `throw: true` — non-OK responses become {@link DimahS3Error}.
 */
export type S3Fetch = BetterFetch<{ throw: true }>;

/**
 * Optional fetch configuration for {@link createS3Client}.
 * Applied to core routes and every client plugin sharing the same `$fetch`.
 */
export type S3ClientFetchOptions = {
  /** Defaults to global `fetch` — override for SSR, tests, or logging. */
  fetch?: typeof fetch;
  /** e.g. `"include"` to send cookies cross-origin. */
  credentials?: RequestCredentials;
  /**
   * Static headers or a (possibly async) factory called per request —
   * useful for Authorization tokens.
   */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
};

/**
 * Browser / isomorphic client plugin — mirrors server `DimahS3Plugin`
 * (literal `id` + methods flattened onto the `createS3Client` result).
 *
 * @typeParam Id — unique plugin id; becomes `api[id]`.
 * @typeParam TMethods — methods returned by {@link S3ClientPlugin.getActions}.
 */
export type S3ClientPlugin<
  Id extends string = string,
  TMethods extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: Id;
  /**
   * Type-only pointer at the matching server plugin (`ReturnType<typeof db>`).
   * Not used at runtime.
   */
  $InferServerPlugin?: unknown;
  /** Build typed methods that call plugin endpoints via the shared `$fetch`. */
  getActions: ($fetch: S3Fetch) => TMethods;
};

/** Map client plugin ids → their method bags. */
export type ClientPluginMethodsMap<P extends readonly S3ClientPlugin[]> = {
  [K in P[number] as K["id"]]: K extends S3ClientPlugin<string, infer M>
    ? M
    : never;
};

/** Keys reserved on the `createS3Client` result — client plugins may not use these as ids. */
export const RESERVED_CLIENT_KEYS = [
  "upload",
  "confirm",
  "download",
  "delete",
  "multipart",
] as const;

export type ReservedClientKey = (typeof RESERVED_CLIENT_KEYS)[number];
