import { S3_API_ROUTES, s3Error } from "@dimah-s3/core";
import {
  createEndpoint,
  type Endpoint,
  type EndpointBaseOptions,
  type EndpointHandler,
  type StandardSchemaV1,
} from "better-call";
import * as z from "zod";
import { toAPIError } from "@/helpers/error-boundary";
import type { S3EndpointContext } from "./context";
import {
  coreContextMiddleware,
  s3ContextMiddleware,
} from "./create-s3-middleware";
import { resolvedConfig } from "./router-context";

/** HTTP methods a dimah-s3 endpoint can use. */
export type S3EndpointMethod = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Options of {@link createS3Endpoint}. `GET` and `DELETE` read the `query`.
 * `POST` and `PATCH` read a JSON `body`.
 */
export type S3EndpointOptions = Omit<EndpointBaseOptions, "disableBody"> &
  (
    | { method: "GET"; body?: never }
    | { method: "DELETE"; body?: never }
    | { method: "POST" | "PATCH"; body?: StandardSchemaV1 }
  );

const createPluginEndpoint = createEndpoint.create({
  use: [s3ContextMiddleware],
});

// Core operations run the guards themselves, with their own operation name.
const createCoreEndpoint = createEndpoint.create({
  use: [coreContextMiddleware],
});

/** The endpoint {@link createS3Endpoint} returns for a path, options and result. */
export type S3Endpoint<
  Path extends string,
  Options extends S3EndpointOptions,
  R,
> = ReturnType<typeof createPluginEndpoint<Path, Options, R>>;

/** Body endpoints accept only JSON, so a cross-site form post is refused. */
const BODY_MEDIA_TYPES = ["application/json"];

const CORE_PATHS: ReadonlySet<string> = new Set(Object.values(S3_API_ROUTES));

/**
 * Creates an endpoint for a plugin's `endpoints`. The path is under
 * `basePath`, such as `/audit/recent`.
 *
 * - `GET` and `DELETE` read the `query`. `POST` and `PATCH` read a JSON
 *   `body`; any other content type returns `415 UNSUPPORTED_MEDIA_TYPE`.
 * - The instance guards run first (operation `"plugin"`), and the `locals`
 *   they return are on `ctx.context.locals`, next to `config` and `request`.
 * - A schema failure returns `400 VALIDATION_ERROR`. An `APIError` passes
 *   through; anything else is logged, passed to `onError`, and returns
 *   `500 INTERNAL_ERROR`.
 *
 * ```ts
 * endpoints: {
 *   recent: createS3Endpoint(
 *     "/audit/recent",
 *     { method: "GET", query: z.object({ limit: z.coerce.number().optional() }) },
 *     async (ctx) => ({ events: await audit.recent(ctx.context.locals, ctx.query) }),
 *   ),
 * }
 * ```
 */
export function createS3Endpoint<
  Path extends string,
  Options extends S3EndpointOptions,
  R,
>(
  path: Path,
  options: Options,
  handler: EndpointHandler<Path, Options, R, S3EndpointContext>,
): S3Endpoint<Path, Options, R> {
  const create = CORE_PATHS.has(path)
    ? createCoreEndpoint
    : createPluginEndpoint;
  const endpoint = create(path, endpointOptions(path, options), async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      const apiError = toAPIError(
        error,
        resolvedConfig(ctx.context),
        ctx.context.request,
      );
      // better-call answers a thrown error with the endpoint's response
      // headers and drops the error's own, such as `Content-Range` on a 416.
      new Headers(apiError.headers).forEach((value, name) => {
        ctx.setHeader(name, value);
      });
      throw apiError;
    }
  });
  return withCallContext(endpoint);
}

function endpointOptions<Options extends S3EndpointOptions>(
  path: string,
  options: Options,
): Options {
  const { method } = options;
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
    throw new Error(
      `createS3Endpoint("${path}"): method must be GET, POST, PATCH or DELETE.`,
    );
  }
  const readsBody = method === "POST" || method === "PATCH";
  if (!readsBody && options.body !== undefined) {
    throw new Error(
      `createS3Endpoint("${path}"): ${method} reads the query, so it cannot have a body schema.`,
    );
  }
  return {
    ...options,
    ...(options.body !== undefined ? { body: compileIfZod(options.body) } : {}),
    ...(options.query !== undefined
      ? { query: compileIfZod(options.query) }
      : {}),
    metadata: readsBody
      ? { ...options.metadata, allowedMediaTypes: BODY_MEDIA_TYPES }
      : options.metadata,
    // A DELETE is never parsed for a body, so a form post cannot reach it.
    ...(method === "DELETE" ? { disableBody: true } : {}),
    // The router reads the body before the hooks run. Reading a clone keeps
    // the original request readable for guards.
    ...(readsBody && options.cloneRequest === undefined
      ? { cloneRequest: true }
      : {}),
    onValidationError:
      options.onValidationError ??
      (({ message }) => {
        throw s3Error("VALIDATION_ERROR", { issue: message });
      }),
  };
}

/**
 * Compiles a Zod schema with `z.compile()`, so valid input skips the
 * interpreter. A schema it cannot compile, or a runtime without
 * `new Function`, keeps the regular parser.
 */
function compileIfZod<T extends StandardSchemaV1>(schema: T): T {
  if ("_zod" in schema) {
    return z.compile(schema as unknown as z.ZodType) as unknown as T;
  }
  return schema;
}

/**
 * Gives every call its own copy of the router context. better-call merges
 * middleware results into `ctx.context`, and the router passes the same
 * object to every request, so without the copy concurrent calls would see
 * each other's `request` and `locals`.
 */
function withCallContext<E extends Endpoint>(endpoint: E): E {
  const call = (input: { context?: object } = {}) =>
    endpoint({ ...input, context: { ...input.context } });
  return Object.assign(call, {
    path: endpoint.path,
    options: endpoint.options,
  }) as E;
}
