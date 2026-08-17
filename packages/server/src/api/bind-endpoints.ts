import { type Endpoint } from "better-call";
import type { S3EndpointContext } from "./context";
import { requestFromHeaders } from "../internal-helpers";

/**
 * Wrap better-call endpoints so `s3.api.upload({ body, headers })` injects
 * `routerContext` the same way HTTP `createRouter` does.
 */
export function bindEndpoints<E extends Record<string, Endpoint>>(
  endpoints: E,
  context: Pick<S3EndpointContext, "config">,
): E {
  const api = {} as E;

  for (const [key, endpoint] of Object.entries(endpoints)) {
    const bound = (async (input: Record<string, unknown> = {}) => {
      const headers = input.headers as HeadersInit | undefined;
      const request =
        (input.request as Request | undefined) ?? requestFromHeaders(headers);
      return endpoint({
        ...input,
        headers: headers ?? request.headers,
        request,
        context: {
          ...context,
          ...(typeof input.context === "object" && input.context !== null
            ? input.context
            : {}),
        },
      });
    }) as typeof endpoint;

    bound.path = endpoint.path;
    bound.options = endpoint.options;
    api[key as keyof E] = bound as E[keyof E];
  }

  return api;
}
