import type { BetterFetch } from "@better-fetch/fetch";

/**
 * Shared `$fetch` for core routes and client plugins.
 * Every failure throws {@link APIError}. A `{ code, message, params? }` body
 * keeps its code and HTTP status. Any other non-OK response becomes
 * `INTERNAL_ERROR` (status >= 500) or `UNKNOWN_ERROR` with the HTTP status.
 * A 2xx response whose body is not a JSON object or array (such as an SPA
 * fallback `index.html`) throws `UNKNOWN_ERROR` with its status.
 * A failed request becomes `NETWORK_ERROR`, except an aborted signal, which
 * rethrows the abort reason. Client headers apply first; per-call headers win.
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
 * @typeParam TServer — matching server plugin; `$InferServerPlugin` must share `id`.
 */
export type S3ClientPlugin<
  Id extends string = string,
  TMethods extends Record<string, unknown> = Record<string, unknown>,
  TServer extends { id: string } = { id: Id },
> = {
  id: Id;
  /**
   * Type-only pointer at the matching server plugin (`ReturnType<typeof db>`).
   * Constrains `id` to match the server plugin's `id`.
   */
  $InferServerPlugin?: TServer & { id: Id };
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
  "catalog",
  "delete",
  "deleteMany",
  "multipart",
  "$ERROR_CODES",
  "$fetch",
  "$Infer",
  "Provider",
  "useApi",
] as const;

export type ReservedClientKey = (typeof RESERVED_CLIENT_KEYS)[number];
