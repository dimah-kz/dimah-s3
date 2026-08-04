/**
 * Build the relative path for a plugin HTTP endpoint under `basePath`.
 * Server mounts and client fetchers share this so URLs never diverge.
 *
 * @example
 * pluginEndpointPath("db", "objects") // "plugins/db/objects"
 */
export function pluginEndpointPath(pluginId: string, path: string): string {
  return `plugins/${pluginId}/${path.replace(/^\/+/, "")}`;
}
