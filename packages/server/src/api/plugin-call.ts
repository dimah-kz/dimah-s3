import type { Endpoint } from "better-call";
import type { PluginCall } from "@/types/hook-contexts";

/**
 * Endpoint context key of the plugin call. `Symbol.for` keeps one key
 * across the entry points, which are bundled separately.
 */
const PLUGIN_CALL: unique symbol = Symbol.for("dimah-s3.plugin-call");

/**
 * Wraps a plugin endpoint so every call carries `call` in its context, for
 * the guards to read. The endpoint object itself is left unchanged, so one
 * endpoint can be mounted by several instances.
 */
export function bindPluginCall<E extends Endpoint>(
  endpoint: E,
  call: PluginCall,
): E {
  const frozen = Object.freeze({ ...call });
  const bound = (input: { context?: object } = {}) =>
    endpoint({
      ...input,
      context: { ...input.context, [PLUGIN_CALL]: frozen },
    });
  return Object.assign(bound, {
    path: endpoint.path,
    options: endpoint.options,
  }) as unknown as E;
}

/** The plugin call in an endpoint context, when the endpoint is a plugin's. */
export function readPluginCall(context: object): PluginCall | undefined {
  return (context as { [PLUGIN_CALL]?: PluginCall })[PLUGIN_CALL];
}
