import { ROUTE_NAME_PATTERN } from "@/schema/shared";

/**
 * Build a plugin HTTP path under `basePath`.
 * Server endpoints and client `getActions` share this so URLs never diverge.
 *
 * @example
 * pluginPath("db", "objects") // "/db/objects"
 */
export function pluginPath(pluginId: string, path: string): string {
  if (!ROUTE_NAME_PATTERN.test(pluginId)) {
    throw new Error(`Invalid plugin id "${pluginId}"`);
  }
  return `/${pluginId}/${path.replace(/^\/+/, "")}`;
}
