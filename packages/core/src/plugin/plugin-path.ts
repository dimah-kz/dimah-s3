/**
 * Build a plugin HTTP path under `basePath`.
 * Server endpoints and client `getActions` share this so URLs never diverge.
 *
 * @example
 * pluginPath("db", "objects") // "/db/objects"
 */
export function pluginPath(pluginId: string, path: string): string {
  return `/${pluginId}/${path.replace(/^\/+/, "")}`;
}
