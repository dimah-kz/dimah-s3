import type { ResolvedConfig } from "@/types/resolved";

/**
 * Request for an in-process call that did not pass one: a GET to the API
 * base URL (`baseURL`, else `http://localhost` plus `basePath`) carrying the
 * call headers and signal.
 */
export function syntheticRequest(
  config: Pick<ResolvedConfig, "basePath" | "baseURL">,
  init: { headers?: HeadersInit; signal?: AbortSignal } = {},
): Request {
  return new Request(config.baseURL ?? `http://localhost${config.basePath}`, {
    headers: init.headers,
    signal: init.signal,
  });
}
