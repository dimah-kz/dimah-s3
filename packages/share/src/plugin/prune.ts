import type { StorageFolder, StorageObject } from "@dimah-s3/db";
import { loadTarget, type ShareRuntime } from "./runtime";
import type { PruneLinksResult } from "./share";

/**
 * Removes dead links: revoked or expired before `olderThan`, and live links
 * created before it whose object or folder is gone. It walks the older
 * live links by id, one batch at a time, and loads each target once.
 */
export async function pruneLinks(
  runtime: ShareRuntime,
  olderThan: Date,
): Promise<PruneLinksResult> {
  const { links } = runtime;
  const { db } = runtime.bound();
  const dead = await links.prune(olderThan);

  let orphaned = 0;
  let after: string | null = null;
  for (;;) {
    const batch = await links.listOld(olderThan, after);
    if (batch.length === 0) break;
    const targets = new Map<
      string,
      Promise<StorageObject<unknown> | StorageFolder | null>
    >();
    const gone: string[] = [];
    for (const link of batch) {
      const key =
        link.target.type === "object"
          ? `o:${link.target.objectId}`
          : `f:${link.scope}:${link.target.folderId}`;
      let target = targets.get(key);
      if (!target) {
        target = loadTarget(db, link);
        targets.set(key, target);
      }
      if ((await target) === null) gone.push(link.id);
    }
    orphaned += await links.deleteMany(gone);
    after = batch.at(-1)?.id ?? null;
  }
  return { pruned: dead + orphaned, orphaned };
}
