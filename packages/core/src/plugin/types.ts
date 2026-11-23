import type { BetterFetch } from "@better-fetch/fetch";
import type { S3ErrorCatalog } from "@/error-codes";

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
  /**
   * Defaults to global `fetch`. Override it for SSR, tests, or logging. Any
   * `(input, init) => Promise<Response>` works, so a plain wrapper type-checks
   * on every runtime.
   */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** e.g. `"include"` to send cookies cross-origin. */
  credentials?: RequestCredentials;
  /**
   * Static headers or a (possibly async) factory called per request —
   * useful for Authorization tokens.
   */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
};

/**
 * A server plugin endpoint as the client sees it. Structural, so core needs
 * no server types: every endpoint `createS3Endpoint` builds fits it.
 */
type ServerEndpoint = {
  path: string;
  options: { method: string | readonly string[] };
};

/** The endpoints of a server plugin type, or `never` when they are not known. */
type ServerEndpoints<TServer> = TServer extends { endpoints?: infer E }
  ? E extends Record<string, ServerEndpoint>
    ? string extends keyof E
      ? never
      : E
    : never
  : never;

type EndpointUnion<E> = E[keyof E];

type EndpointPath<E> =
  EndpointUnion<E> extends infer X
    ? X extends { path: infer P extends string }
      ? P
      : never
    : never;

type EndpointMethod<X> = X extends { options: { method: infer M } }
  ? M extends readonly (infer U)[]
    ? U
    : M
  : never;

type EndpointsAt<E, P> = Extract<EndpointUnion<E>, { path: P }>;

type EndpointAt<E, P, M> =
  EndpointsAt<E, P> extends infer X
    ? X extends unknown
      ? M extends EndpointMethod<X>
        ? X
        : never
      : never
    : never;

/** The input type of a Standard Schema. */
type SchemaInput<S> = S extends {
  readonly "~standard": { readonly types?: infer T };
}
  ? NonNullable<T> extends { readonly input: infer I }
    ? I
    : unknown
  : never;

/** `{ key: I }`, or `{ key?: I }` when every field of `I` is optional. */
type InputField<K extends string, I> =
  Record<string, never> extends I ? { [P in K]?: I } : { [P in K]: I };

/** The `query` and `body` an endpoint reads, from its schemas. */
type EndpointInput<X> = X extends { options: infer O }
  ? (O extends { query: infer Q }
      ? InputField<"query", SchemaInput<Q>>
      : unknown) &
      (O extends { body: infer B }
        ? InputField<"body", SchemaInput<B>>
        : unknown)
  : unknown;

/** What an endpoint handler resolves to. */
type EndpointOutput<X> = X extends (...args: never[]) => Promise<infer R>
  ? R
  : unknown;

/**
 * `$fetch` typed by a server plugin's endpoints. The path and method pick
 * the endpoint; `query` and `body` take its schema input, and the result is
 * its handler's return type. Each call also takes `signal` and `headers`.
 *
 * The client receives the JSON body, so a handler returns JSON values: an
 * ISO string, not a `Date`.
 */
export type S3EndpointFetch<E> = <
  P extends EndpointPath<E>,
  M extends EndpointMethod<EndpointsAt<E, P>>,
>(
  path: P,
  options: {
    method: M;
    signal?: AbortSignal;
    headers?: HeadersInit;
  } & EndpointInput<EndpointAt<E, P, M>>,
) => Promise<EndpointOutput<EndpointAt<E, P, M>>>;

/**
 * The `$fetch` a client plugin's `getActions` receives: typed by the server
 * plugin's endpoints when `$InferServerPlugin` names one, otherwise
 * {@link S3Fetch}.
 */
export type S3PluginFetch<TServer> = [ServerEndpoints<TServer>] extends [never]
  ? S3Fetch
  : S3EndpointFetch<ServerEndpoints<TServer>>;

/**
 * Browser / isomorphic client plugin — mirrors server `DimahS3Plugin`
 * (literal `id` + methods flattened onto the `createS3Client` result).
 *
 * @typeParam Id — unique plugin id; becomes `api[id]`.
 * @typeParam TMethods — methods returned by {@link S3ClientPlugin.getActions}.
 * @typeParam TServer — matching server plugin; `$InferServerPlugin` must share `id`.
 * @typeParam TErrorCodes — the plugin's `$ERROR_CODES`.
 */
export type S3ClientPlugin<
  Id extends string = string,
  TMethods extends Record<string, unknown> = Record<string, unknown>,
  TServer extends { id: string } = { id: Id },
  TErrorCodes extends S3ErrorCatalog = Record<never, never>,
> = {
  id: Id;
  /**
   * Type-only pointer at the matching server plugin (`ReturnType<typeof db>`).
   * Constrains `id` to match the server plugin's `id`, and types the
   * `$fetch` that {@link S3ClientPlugin.getActions} receives by that
   * plugin's endpoints. Never read at runtime.
   */
  $InferServerPlugin?: TServer & { id: Id };
  /**
   * Error codes the plugin's endpoints send, built with `defineErrorCodes`.
   * Merged into the client's `$ERROR_CODES`. A code another plugin or the
   * core catalog already has throws.
   */
  $ERROR_CODES?: TErrorCodes;
  /**
   * Build the methods on `api[id]`. They call the plugin's endpoints through
   * the shared `$fetch`, which is typed by the server plugin when
   * `$InferServerPlugin` is set.
   */
  getActions($fetch: S3PluginFetch<TServer>): TMethods;
};

/** Map client plugin ids → their method bags. */
export type ClientPluginMethodsMap<P extends readonly S3ClientPlugin[]> = {
  [K in P[number] as K["id"]]: K extends S3ClientPlugin<string, infer M>
    ? M
    : never;
};

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never;

/** Every client plugin's `$ERROR_CODES`, merged. */
export type ClientPluginErrorCodes<P extends readonly S3ClientPlugin[]> =
  UnionToIntersection<
    P[number] extends infer K
      ? K extends { $ERROR_CODES?: infer C }
        ? NonNullable<C>
        : never
      : never
  >;

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
