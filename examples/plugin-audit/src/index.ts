import { pluginPath, s3Error } from "@dimah-s3/core";
import type { S3ServerCallOptions } from "@dimah-s3/server";
import {
  createS3Endpoint,
  definePlugin,
  type PluginInitEnv,
} from "@dimah-s3/server/plugins";
import * as z from "zod";
import { AUDIT_ERROR_CODES } from "./error-codes";
import { memoryAuditStore, type AuditStore } from "./store";

export { AUDIT_ERROR_CODES } from "./error-codes";
export {
  memoryAuditStore,
  type AuditEvent,
  type AuditEventInput,
  type AuditEventType,
  type AuditQuery,
  type AuditStore,
} from "./store";

/** Per-route options under `plugins: { audit: … }`. */
export type AuditRouteOptions = {
  /** Also record presigned downloads. Off by default: they are frequent. */
  downloads?: boolean;
};

declare module "@dimah-s3/server" {
  interface DimahS3RoutePluginOptions {
    /** `false` stops auditing the route. */
    audit?: false | AuditRouteOptions;
  }
}

export type AuditOptions = {
  /** Where events are kept. @default memoryAuditStore() */
  store?: AuditStore;
};

/** Query of `GET /audit/events`. */
const listQuerySchema = z.object({
  route: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const DEFAULT_LIMIT = 50;

/**
 * Records confirmed uploads and deletes, and presigned downloads on routes
 * that ask for them. Mounts `GET /audit/events` for `auditClient()`, and
 * adds `s3.audit.events()` and `s3.audit.note()` on the server.
 *
 * ```ts
 * const s3 = dimahS3({
 *   client,
 *   bucket,
 *   plugins: [audit()],
 *   routes: {
 *     invoices: route({ upload: true, download: true, plugins: { audit: { downloads: true } } }),
 *     avatars: route({ upload: true, plugins: { audit: false } }),
 *   },
 * });
 * ```
 */
export function audit(options: AuditOptions = {}) {
  const store = options.store ?? memoryAuditStore();
  let env: PluginInitEnv<"audit"> | undefined;

  /** The env `dimahS3()` handed to `init`. */
  const initialized = (): PluginInitEnv<"audit"> => {
    if (!env) {
      throw new Error("[audit] used before dimahS3() initialized the plugin.");
    }
    return env;
  };

  /** Throws unless `route` exists and records events. */
  const assertAudited = (route: string): void => {
    const routes = initialized().routes;
    if (!routes[route]) throw s3Error("ROUTE_NOT_FOUND", { route });
    if (routes[route].options === false) {
      throw s3Error(AUDIT_ERROR_CODES.AUDIT_ROUTE_UNTRACKED, { route });
    }
  };

  return definePlugin({
    id: "audit",
    $ERROR_CODES: AUDIT_ERROR_CODES,
    init(initEnv) {
      env = initEnv;
      const routes = Object.values(initEnv.routes);
      if (routes.every((route) => route.options === false)) {
        initEnv.logger.warn?.(
          "[audit] Every route sets plugins: { audit: false }, so nothing is recorded.",
        );
      }
    },
    // A route with `plugins: { audit: false }` skips these hooks.
    hooks: {
      upload: {
        onConfirmed: async ({ route, key, object }) => {
          await store.add({ type: "upload", route, key, size: object.size });
        },
      },
      download: {
        onPresigned: async ({ route, key }) => {
          const routeOptions = initialized().routeOptions(route);
          if (routeOptions && routeOptions.downloads) {
            await store.add({ type: "download", route, key });
          }
        },
      },
      delete: {
        onDeleted: async ({ route, key }) => {
          await store.add({ type: "delete", route, key });
        },
      },
    },
    endpoints: {
      /** Newest events first. Guards see `plugin.action: "listEvents"`. */
      listEvents: createS3Endpoint(
        pluginPath("audit", "events"),
        { method: "GET", query: listQuerySchema },
        async (ctx) => {
          const { route, limit = DEFAULT_LIMIT } = ctx.query;
          if (route !== undefined) assertAudited(route);
          return { events: await store.list({ route, limit }) };
        },
      ),
    },
    context: {
      /** Newest events first. Server code only: no guard runs. */
      events: (query: { route?: string; limit?: number } = {}) =>
        store.list({ route: query.route, limit: query.limit ?? DEFAULT_LIMIT }),
      /**
       * Records a note on an object as the caller: every instance guard and
       * the route guard run first, with `plugin.action: "note"`.
       */
      note: (
        input: { route: string; key: string; message: string },
        call?: S3ServerCallOptions,
      ) =>
        initialized().runOperation(
          { action: "note", route: input.route },
          call,
          async () => {
            assertAudited(input.route);
            return store.add({
              type: "note",
              route: input.route,
              key: input.key,
              message: input.message,
            });
          },
        ),
    },
  });
}
