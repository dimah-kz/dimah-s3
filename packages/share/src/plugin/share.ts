import type { DbPluginContext } from "@dimah-s3/db";
import { definePlugin } from "@dimah-s3/server/plugins";
import { createShareStore } from "@/store/create-share-store";
import type { ShareOptions } from "@/types/options";
import { createShareEndpoints } from "./endpoints";
import { createOwnerOperations } from "./owner";
import { createPublicLinks, type ShareLinks } from "./public-links";
import type { ShareBindings, ShareRuntime } from "./runtime";
import { createServerApi, type ShareServerApi } from "./server-api";
import { pruneLinks } from "./prune";
import { resolvePolicy } from "./settings";
import { createVisitorOperations } from "./visitor";

/** Options of `s3.share.pruneLinks`. */
export type PruneLinksOptions = {
  /**
   * Links revoked or expired before this time are removed, and so are
   * links created before it whose object or folder is gone (a `Date` or
   * epoch milliseconds).
   */
  olderThan: Date | number;
};

/** What one `s3.share.pruneLinks` run removed. */
export type PruneLinksResult = {
  /** Every link removed. */
  pruned: number;
  /** Of those, links whose object or folder no longer exists. */
  orphaned: number;
};

/** What `share()` exposes on `s3.share` and `s3.context.share`. */
export type SharePluginContext = {
  /** Every `shareClient()` action, in process, with the guards. */
  api: ShareServerApi;
  /** The `share_link` rows, without guards: for jobs and admin tools. */
  links: ShareLinks;
  /**
   * Removes links revoked or expired before `olderThan`, and links created
   * before it whose object or folder was deleted: an id is never reused,
   * so such a link never opens again. It reads every older live link, so
   * run it from a job.
   */
  pruneLinks: (options: PruneLinksOptions) => Promise<PruneLinksResult>;
  /**
   * Throws unless the database is at the share schema this version needs.
   * Call it at startup to fail fast; the first query runs the same check.
   */
  checkSchema: () => Promise<void>;
};

/**
 * Share-link plugin for `dimahS3()`, on top of `db()` from `@dimah-s3/db`.
 * An owner creates a link to one object or one folder of their db scope;
 * anyone holding the link can open it, list the folder, and download
 * files, without a session, until it expires, reaches its download limit,
 * or the owner revokes it. A link can need a password.
 *
 * Owner actions resolve the caller's scope with db's `resolveScope`, and
 * db's `authorize` sees them as `operation: "plugin"`. Visitor downloads
 * follow the route's download mode: a short-lived presigned URL, or a
 * signed `/share/file` URL that streams through the server.
 *
 * ```ts
 * const s3 = dimahS3({
 *   client: awsS3,
 *   bucket,
 *   plugins: [
 *     db({ client: dimahS3Db, resolveScope }),
 *     share({
 *       client: DimahS3Share.client(adapter),
 *       url: (token) => `https://app.example.com/s/${token}`,
 *     }),
 *   ],
 *   routes: { files: route({ upload: true, download: true, delete: true }) },
 * });
 * ```
 */
export function share(options: ShareOptions) {
  const policy = resolvePolicy(options);
  const store = createShareStore(options.client);
  let bindings: ShareBindings | undefined;
  const runtime: ShareRuntime = {
    links: store.links,
    policy,
    options,
    bound: () => {
      if (!bindings) {
        throw new Error(
          "[dimah-s3/share] share() was used before dimahS3() initialized it. Pass it in dimahS3({ plugins }).",
        );
      }
      return bindings;
    },
  };
  const owner = createOwnerOperations(runtime);
  const visitor = createVisitorOperations(runtime);
  const context: SharePluginContext = {
    api: createServerApi(runtime, owner, visitor),
    links: createPublicLinks(store.links),
    pruneLinks: ({ olderThan }) => pruneLinks(runtime, new Date(olderThan)),
    checkSchema: store.checkSchema,
  };

  return definePlugin({
    id: "share",
    dependsOn: ["db"],
    init(env) {
      const db = env.getPlugin("db")?.context as
        DbPluginContext<unknown, unknown> | undefined;
      if (!db?.access) {
        throw new Error(
          "[dimah-s3/share] share() needs db() from the same @dimah-s3/db version in dimahS3({ plugins }).",
        );
      }
      bindings = {
        env,
        db,
        access: env.tokens("access"),
        grants: env.tokens("file"),
      };
    },
    endpoints: createShareEndpoints(owner, visitor),
    context,
  });
}
