/**
 * Optional fetch configuration for {@link createFetcher} / {@link createS3Client}.
 * Applied to core routes and every client plugin sharing the same fetcher.
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
 * Shared HTTP helper used by core `S3Api` methods and client plugins.
 * Built once by {@link createFetcher} / {@link createS3Client}.
 */
export type S3ClientFetcher = {
  get<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T>;
};

/**
 * Browser / isomorphic client plugin — mirrors server `DimahS3Plugin`
 * (literal `id` + methods flattened onto the `createS3Client` result).
 *
 * @typeParam Id — unique plugin id; becomes `api[id]`.
 * @typeParam TMethods — methods returned by {@link createMethods}.
 */
export type S3ClientPlugin<
  Id extends string = string,
  TMethods extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: Id;
  /** Build typed methods that call plugin endpoints via the shared fetcher. */
  createMethods: (fetcher: S3ClientFetcher) => TMethods;
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
