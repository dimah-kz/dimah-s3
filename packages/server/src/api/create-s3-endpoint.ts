import { createEndpoint, type EndpointOptions } from "better-call";
import * as z from "zod";
import { errors } from "@/errors";
import { s3ContextMiddleware } from "./create-s3-middleware";

const createEndpointWithContext = createEndpoint.create({
  use: [s3ContextMiddleware],
});

function compileIfZod<T>(schema: T): T {
  if (schema !== null && typeof schema === "object" && "_zod" in schema) {
    return z.compile(schema as unknown as z.ZodType) as T;
  }
  return schema;
}

function withS3Validation<O extends EndpointOptions>(options: O): O {
  return {
    ...options,
    ...(options.body !== undefined ? { body: compileIfZod(options.body) } : {}),
    ...(options.query !== undefined
      ? { query: compileIfZod(options.query) }
      : {}),
    onValidationError:
      options.onValidationError ??
      (({ message }: { message: string }) => {
        throw errors.validationError(message);
      }),
  };
}

type CreateS3Endpoint = typeof createEndpointWithContext;

/**
 * Typed endpoint for dimah-s3 plugins and core routes.
 *
 * Paths are absolute under `basePath` (e.g. `/db/objects`). Context
 * (`config`, `request`) is injected by the router / `s3.api`.
 * Zod failures throw `APIError` (`VALIDATION_ERROR`) via
 * better-call `onValidationError`. Zod `body` / `query` schemas are
 * compiled with `z.compile()` (Zod 4.5) so valid requests skip the
 * interpreter; unsupported schemas fall back to the runtime parser.
 *
 * ```ts
 * endpoints: {
 *   recent: createS3Endpoint("/audit/recent", { method: "GET" }, async (ctx) => {
 *     return { events: [] };
 *   }),
 * }
 * ```
 */
export const createS3Endpoint: CreateS3Endpoint = ((
  pathOrOptions: string | EndpointOptions,
  optionsOrHandler: EndpointOptions | ((...args: never[]) => unknown),
  maybeHandler?: (...args: never[]) => unknown,
) => {
  if (typeof pathOrOptions === "string") {
    return createEndpointWithContext(
      pathOrOptions,
      withS3Validation(optionsOrHandler as EndpointOptions),
      maybeHandler as never,
    );
  }
  return createEndpointWithContext(
    withS3Validation(pathOrOptions),
    optionsOrHandler as never,
  );
}) as unknown as CreateS3Endpoint;
