import type {
  DbPluginContext,
  StorageFolder,
  StorageObject,
} from "@dimah-s3/db";
import type { PluginInitEnv, PluginTokens } from "@dimah-s3/server/plugins";
import type { ShareLinkStore } from "@/store/link-store";
import type { ShareLink } from "@/types/link";
import type { ShareOptions, ShareResolvedTarget } from "@/types/options";
import type { SharePolicy } from "./settings";

/** What `dimahS3()` hands the plugin at `init`. */
export type ShareBindings = {
  env: PluginInitEnv<"share">;
  db: DbPluginContext<unknown, unknown>;
  /** Signs `access` proofs after a password check. */
  access: PluginTokens;
  /** Signs `/share/file` URLs in proxy mode. */
  grants: PluginTokens;
};

/** Everything the operations read: the store, the options, and the bindings. */
export type ShareRuntime = {
  links: ShareLinkStore;
  policy: SharePolicy;
  options: ShareOptions;
  /** @throws when `dimahS3()` has not initialized the plugin. */
  bound: () => ShareBindings;
};

/**
 * The object or folder a link points at, while it exists in the link's
 * scope: an active object, or a folder. `null` once it is gone.
 */
export async function loadTarget(
  db: DbPluginContext<unknown, unknown>,
  link: Pick<ShareLink, "scope" | "target">,
): Promise<StorageObject<unknown> | StorageFolder | null> {
  if (link.target.type === "object") {
    const object = await db.objects.findById(link.target.objectId);
    return object?.status === "active" && object.scope === link.scope
      ? object
      : null;
  }
  return db.folders.find(link.scope, link.target.folderId);
}

/** A loaded target with its type, or `undefined` when it is gone. */
export function resolvedTarget(
  link: Pick<ShareLink, "target">,
  loaded: StorageObject<unknown> | StorageFolder | null,
): ShareResolvedTarget | undefined {
  if (loaded === null) return undefined;
  return link.target.type === "object"
    ? { type: "object", object: loaded as StorageObject<unknown> }
    : { type: "folder", folder: loaded as StorageFolder };
}
