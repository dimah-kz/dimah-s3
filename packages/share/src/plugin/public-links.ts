import type {
  LinkFilter,
  ListLinksInput,
  ShareLinkStore,
} from "@/store/link-store";
import type { ShareLink, ShareLinkTarget } from "@/types/link";
import { toShareLink } from "./to-client";

/**
 * `s3.share.links`: the `share_link` rows, for your routes, jobs, and admin
 * tools. No guard or `authorize` runs, and no scope is resolved: `list` and
 * `count` take the scope first, so they read any scope.
 */
export type ShareLinks = {
  find: (id: string) => Promise<ShareLink | null>;
  findByToken: (token: string) => Promise<ShareLink | null>;
  /** One page of a scope's links, newest first. */
  list: (
    scope: string,
    input?: ListLinksInput,
  ) => Promise<{ links: ShareLink[]; nextCursor: string | null }>;
  count: (scope: string, filter?: LinkFilter) => Promise<number>;
  /**
   * Turns a link off. Returns it, also when it was already revoked, or
   * `null` when there is none. `onRevoked` does not run.
   */
  revoke: (id: string) => Promise<ShareLink | null>;
  /**
   * Turns off every live link to one object or folder, such as before you
   * hide a file. Returns how many. `onRevoked` does not run.
   */
  revokeTarget: (target: ShareLinkTarget) => Promise<number>;
};

/** The public store over the plugin's link store. */
export function createPublicLinks(links: ShareLinkStore): ShareLinks {
  const nullable = (record: Awaited<ReturnType<ShareLinkStore["findById"]>>) =>
    record ? toShareLink(record) : null;
  return {
    find: async (id) => nullable(await links.findById(id)),
    findByToken: async (token) => nullable(await links.findByToken(token)),
    async list(scope, input) {
      const page = await links.list(scope, input);
      return {
        links: page.links.map(toShareLink),
        nextCursor: page.nextCursor,
      };
    },
    count: links.count,
    revoke: async (id) => nullable(await links.revoke(id)),
    revokeTarget: links.revokeTarget,
  };
}
