import type { PluginEndpoint } from "./types";

/**
 * Build a plugin HTTP endpoint for {@link DimahS3Plugin.endpoints}.
 *
 * Paths are relative under `plugins/{pluginId}/` — use the same relative
 * segment with {@link pluginEndpointPath} on the client.
 *
 * ```ts
 * endpoints: {
 *   objects: createEndpoint("objects", { method: "GET" }, async (ctx) => {
 *     return { objects: [] };
 *   }),
 * }
 * ```
 */
export function createEndpoint(
  path: string,
  options: { method: PluginEndpoint["method"]; status?: number },
  handler: PluginEndpoint["handler"],
): PluginEndpoint {
  return {
    path,
    method: options.method,
    status: options.status,
    handler,
  };
}
