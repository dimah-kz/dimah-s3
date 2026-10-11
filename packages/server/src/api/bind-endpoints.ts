import type { Endpoint } from "better-call";
import { normalizeS3ApiBasePath, S3_API_BASE_PATH } from "@dimah-s3/core";
import { requestFromDirectCall } from "@/helpers/request";
import type { S3EndpointContext } from "./context";

/**
 * Wrap better-call endpoints so `s3.api.upload({ body, headers })` injects
 * `routerContext` the same way HTTP `createRouter` does.
 *
 * The synthetic `Request` includes method, pathname, `query`, and a JSON
 * `body`, so guards see the same request an HTTP call would. A `request`
 * argument is passed through unchanged.
 */
export function bindEndpoints<E extends Record<string, Endpoint>>(
  endpoints: E,
  context: Pick<S3EndpointContext, "config">,
): E {
  const api = {} as E;

  for (const [key, endpoint] of Object.entries(endpoints)) {
    const bound = (async (input: Record<string, unknown> = {}) => {
      const headers = input.headers as HeadersInit | undefined;
      const provided = input.request as Request | undefined;
      const request =
        provided ??
        requestFromDirectCall({
          method: endpointMethod(endpoint),
          pathname: endpointPathname(endpoint, context.config.basePath),
          headers,
          query: input.query,
          body: input.body,
        });
      return endpoint({
        ...input,
        headers: provided ? (headers ?? request.headers) : request.headers,
        request,
        context,
      });
    }) as typeof endpoint;

    bound.path = endpoint.path;
    bound.options = endpoint.options;
    api[key as keyof E] = bound as E[keyof E];
  }

  return api;
}

function endpointMethod(endpoint: Endpoint): string {
  const method = endpoint.options?.method;
  if (Array.isArray(method)) return method[0] ?? "GET";
  if (typeof method === "string" && method !== "*") return method;
  return "GET";
}

function endpointPathname(
  endpoint: Endpoint,
  basePath: string | undefined,
): string {
  const prefix = normalizeS3ApiBasePath(basePath ?? S3_API_BASE_PATH);
  const path = endpoint.path ?? "/";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${suffix}` || "/";
}
