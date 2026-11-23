import { ROUTE_NAME_PATTERN } from "@/limits";

/** `path` without its leading slashes. */
type TrimLeadingSlashes<P extends string> = P extends `/${infer Rest}`
  ? TrimLeadingSlashes<Rest>
  : P;

/**
 * The path {@link pluginPath} returns, kept literal so a typed client
 * `$fetch` can match it to the server endpoint: `PluginPath<"db", "objects">`
 * is `"/db/objects"`.
 */
export type PluginPath<
  Id extends string,
  Path extends string,
> = `/${Id}/${TrimLeadingSlashes<Path>}`;

/**
 * Build a plugin HTTP path under `basePath`.
 * Server endpoints and client `getActions` share this so URLs never diverge.
 *
 * @example
 * pluginPath("db", "objects") // "/db/objects"
 */
export function pluginPath<const Id extends string, const Path extends string>(
  pluginId: Id,
  path: Path,
): PluginPath<Id, Path> {
  if (!ROUTE_NAME_PATTERN.test(pluginId)) {
    throw new Error(`Invalid plugin id "${pluginId}"`);
  }
  return `/${pluginId}/${path.replaceAll(/^\/+/g, "")}` as PluginPath<Id, Path>;
}
