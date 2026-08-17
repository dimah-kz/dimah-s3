import { createEndpoint, type EndpointOptions } from "better-call";
import { errors } from "../errors";
import { s3ContextMiddleware } from "./create-s3-middleware";

const createEndpointWithContext = createEndpoint.create({
  use: [s3ContextMiddleware],
});

function withS3Validation<O extends EndpointOptions>(options: O): O {
  return {
    ...options,
    onValidationError:
      options.onValidationError ??
      (({ message }: { message: string }) => {
        throw errors.validationError(message);
      }),
  };
}

/**
 * Typed endpoint for dimah-s3 plugins and core routes.
 *
 * Paths are absolute under `basePath` (e.g. `/db/objects`). Context
 * (`config`, `errors`, `request`) is injected by the router / `s3.api`.
 * Zod failures throw `DimahS3Error` (`VALIDATION_ERROR`) via
 * better-call `onValidationError`.
 *
 * ```ts
 * endpoints: {
 *   recent: createS3Endpoint("/audit/recent", { method: "GET" }, async (ctx) => {
 *     return { events: [] };
 *   }),
 * }
 * ```
 */
export const createS3Endpoint = ((
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
}) as unknown as typeof createEndpointWithContext;
