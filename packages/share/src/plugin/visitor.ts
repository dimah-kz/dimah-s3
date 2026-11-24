import { pluginPath, s3Error } from "@dimah-s3/core";
import type { StorageFolder, StorageObject } from "@dimah-s3/db";
import { SHARE_ERROR_CODES } from "@/error-codes";
import type { ShareLinkRecord } from "@/store/link-store";
import type {
  ShareDownloadResponse,
  ShareListSharedResponse,
  ShareOpenLinkResponse,
  ShareUnlockLinkResponse,
} from "@/types/client";
import { shareLinkStatus } from "@/types/link";
import type { ShareCall, ShareResolvedTarget } from "@/types/options";
import { passwordTag, verifyPassword } from "./password";
import { loadTarget, resolvedTarget, type ShareRuntime } from "./runtime";
import type {
  DownloadBody,
  FileQuery,
  ListSharedQuery,
  OpenLinkQuery,
  UnlockLinkBody,
} from "./schemas";
import {
  downloadsLeft,
  toShareLink,
  toVisitorFolder,
  toVisitorObject,
} from "./to-client";

/** The visitor actions: everything a link token unlocks, without a session. */
export type ShareVisitorOperations = {
  openLink: (
    call: ShareCall,
    query: OpenLinkQuery,
  ) => Promise<ShareOpenLinkResponse>;
  unlockLink: (
    call: ShareCall,
    body: UnlockLinkBody,
  ) => Promise<ShareUnlockLinkResponse>;
  listShared: (
    call: ShareCall,
    query: ListSharedQuery,
  ) => Promise<ShareListSharedResponse>;
  downloadShared: (
    call: ShareCall,
    body: DownloadBody,
  ) => Promise<ShareDownloadResponse>;
  /** Streams a file from a signed `/share/file` URL, in proxy mode. */
  sharedFile: (call: ShareCall, query: FileQuery) => Promise<Response>;
};

/** Fails a link that does not open: revoked, expired, or out of downloads. */
function assertOpen(record: ShareLinkRecord): void {
  switch (shareLinkStatus(record)) {
    case "revoked":
      throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_REVOKED);
    case "expired":
      throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_EXPIRED);
    case "exhausted":
      throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_EXHAUSTED);
    case "active":
  }
}

/** `""` and `null` are the top of the share. */
function wireFolderId(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === "" ? null : value;
}

/** Creates the visitor actions over the runtime. */
export function createVisitorOperations(
  runtime: ShareRuntime,
): ShareVisitorOperations {
  const { links, policy, options } = runtime;

  /** The link of a token, while it opens. */
  const visit = async (token: string): Promise<ShareLinkRecord> => {
    const record = await links.findByToken(token);
    if (!record) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_NOT_FOUND);
    assertOpen(record);
    return record;
  };

  /** True when the link has no password, or `access` proves it was entered. */
  const unlocked = async (
    record: ShareLinkRecord,
    access: string | undefined,
  ): Promise<boolean> => {
    if (record.passwordHash === null) return true;
    if (access === undefined) return false;
    const payload = await runtime.bound().access.verify(access);
    return (
      payload !== null &&
      payload.l === record.id &&
      payload.p === (await passwordTag(record.passwordHash))
    );
  };

  /** The link of a token, open and unlocked. */
  const enter = async (token: string, access: string | undefined) => {
    const record = await visit(token);
    if (!(await unlocked(record, access))) {
      throw s3Error(SHARE_ERROR_CODES.SHARE_PASSWORD_REQUIRED);
    }
    return record;
  };

  /** What the link shares, while it exists. */
  const liveTarget = async (
    record: ShareLinkRecord,
  ): Promise<ShareResolvedTarget> => {
    const target = resolvedTarget(
      record,
      await loadTarget(runtime.bound().db, record),
    );
    if (!target) throw s3Error(SHARE_ERROR_CODES.SHARE_TARGET_UNAVAILABLE);
    return target;
  };

  /**
   * The folders from below `root` down to `folderId`, `folderId` included.
   * Empty for the root itself.
   * @throws `FOLDER_NOT_FOUND` when the folder is not inside the share.
   */
  const trailInside = async (
    scope: string,
    root: StorageFolder,
    folderId: string,
  ): Promise<StorageFolder[]> => {
    if (folderId === root.id) return [];
    const { db } = runtime.bound();
    let trail: StorageFolder[];
    try {
      trail = await db.folders.trail(scope, folderId);
    } catch {
      throw s3Error("FOLDER_NOT_FOUND");
    }
    const index = trail.findIndex((folder) => folder.id === root.id);
    if (index === -1) throw s3Error("FOLDER_NOT_FOUND");
    return trail.slice(index + 1);
  };

  /**
   * A file of the share: the link's object, or an active object inside the
   * shared folder.
   * @throws `OBJECT_NOT_FOUND` for any other id.
   */
  const sharedObject = async (
    record: ShareLinkRecord,
    target: ShareResolvedTarget,
    id: string | undefined,
  ): Promise<StorageObject<unknown>> => {
    if (target.type === "object") {
      if (id !== undefined && id !== target.object.id) {
        throw s3Error("OBJECT_NOT_FOUND");
      }
      return target.object;
    }
    if (id === undefined) {
      throw s3Error("VALIDATION_ERROR", {
        issue: "[body.id] Required for a folder link",
      });
    }
    const object = await runtime.bound().db.objects.findById(id);
    if (
      object?.status !== "active" ||
      object.scope !== record.scope ||
      object.folderId === null
    ) {
      throw s3Error("OBJECT_NOT_FOUND");
    }
    try {
      await trailInside(record.scope, target.folder, object.folderId);
    } catch {
      throw s3Error("OBJECT_NOT_FOUND");
    }
    return object;
  };

  /** The route of a shared object, with downloads on. */
  const downloadRoute = (object: StorageObject<unknown>) => {
    const route = runtime.bound().env.routes[object.route];
    // The route was removed from the config: its objects cannot be sent.
    if (!route) throw s3Error(SHARE_ERROR_CODES.SHARE_TARGET_UNAVAILABLE);
    if (!route.download.enabled) {
      throw s3Error("FEATURE_DISABLED", { feature: "download" });
    }
    return { ...route, download: route.download };
  };

  return {
    async openLink(call, query) {
      const record = await visit(query.token);
      const base = {
        passwordProtected: record.passwordProtected,
        expiresAt: record.expiresAt?.toISOString() ?? null,
        downloadsLeft: downloadsLeft(record),
      };
      if (!(await unlocked(record, query.access))) {
        return {
          link: { ...base, type: record.target.type, locked: true },
        };
      }
      const target = await liveTarget(record);
      await links.countView(record);
      await options.onOpened?.({
        request: call.request,
        locals: call.locals,
        link: toShareLink(record),
        target,
      });
      return {
        link:
          target.type === "object"
            ? {
                ...base,
                type: "object",
                locked: false,
                // The file's own folder is the top of an object link.
                object: toVisitorObject(target.object, target.object.folderId),
              }
            : {
                ...base,
                type: "folder",
                locked: false,
                folder: toVisitorFolder(target.folder, target.folder.id),
              },
      };
    },

    async unlockLink(_call, body) {
      const record = await visit(body.token);
      const hash = record.passwordHash;
      if (hash !== null && !(await verifyPassword(body.password, hash))) {
        throw s3Error(SHARE_ERROR_CODES.SHARE_PASSWORD_INVALID);
      }
      const { unlockExpiresIn } = policy;
      const access = await runtime
        .bound()
        .access.sign(
          { l: record.id, p: hash === null ? "" : await passwordTag(hash) },
          { expiresIn: unlockExpiresIn },
        );
      return {
        access,
        expiresAt: new Date(Date.now() + unlockExpiresIn * 1000).toISOString(),
      };
    },

    async listShared(_call, query) {
      const record = await enter(query.token, query.access);
      const target = await liveTarget(record);
      if (target.type === "object") {
        return {
          objects: [toVisitorObject(target.object, target.object.folderId)],
          nextCursor: null,
        };
      }

      const { db } = runtime.bound();
      const { scope } = record;
      const root = target.folder;
      const requested = wireFolderId(query.folderId) ?? root.id;
      const trail = await trailInside(scope, root, requested);
      const current = trail.at(-1) ?? root;
      const sort = query.sort ?? { field: "name", direction: "asc" };
      const search = query.search;
      const visitorFolder = (folder: StorageFolder) =>
        toVisitorFolder(folder, root.id);

      if (search) {
        const filter = { folderId: current.id, recursive: true, search };
        const page = await db.objects.list(scope, {
          ...filter,
          sort,
          limit: query.limit,
          cursor: query.cursor,
        });
        const objects = page.objects.map((object) =>
          toVisitorObject(object, root.id),
        );
        // Below the root only: the folders above the share stay hidden.
        const below = (folders: readonly StorageFolder[]) =>
          folders.filter((folder) => folder.path.startsWith(`${root.path}/`));
        const located = page.objects.flatMap((object) =>
          object.folderId === null ? [] : [object.folderId],
        );
        if (!page.firstPage) {
          const locations = await db.folders.ancestors(scope, located);
          return {
            objects,
            nextCursor: page.nextCursor,
            locations: below(locations).map(visitorFolder),
          };
        }
        const [matches, total] = await Promise.all([
          db.folders.descendants(scope, current.id, { search }),
          db.objects.count(scope, filter),
        ]);
        const locations = await db.folders.ancestors(scope, [
          ...located,
          ...matches.flatMap((folder) =>
            folder.parentId === null ? [] : [folder.parentId],
          ),
        ]);
        return {
          objects,
          nextCursor: page.nextCursor,
          folders: matches.map(visitorFolder),
          trail: trail.map(visitorFolder),
          locations: below(locations).map(visitorFolder),
          total,
        };
      }

      const page = await db.objects.list(scope, {
        folderId: current.id,
        sort,
        limit: query.limit,
        cursor: query.cursor,
      });
      const objects = page.objects.map((object) =>
        toVisitorObject(object, root.id),
      );
      if (!page.firstPage) return { objects, nextCursor: page.nextCursor };
      const children = await db.folders.children(scope, current.id);
      return {
        objects,
        nextCursor: page.nextCursor,
        folders: children.map(visitorFolder),
        trail: trail.map(visitorFolder),
      };
    },

    async downloadShared(call, body) {
      const record = await enter(body.token, body.access);
      const target = await liveTarget(record);
      const object = await sharedObject(record, target, body.id);
      const route = downloadRoute(object);
      const { env, grants } = runtime.bound();
      const { downloadExpiresIn } = policy;

      // The URL first: a download is counted only once it can be handed out.
      let sent: Omit<ShareDownloadResponse, "downloadsLeft">;
      if (route.download.mode === "presign") {
        const signed = await env.download.presign({
          route: route.name,
          key: object.key,
          name: object.name,
          disposition: body.disposition,
          expiresIn: downloadExpiresIn,
          signal: call.request.signal,
        });
        sent = { mode: "presign", ...signed };
      } else {
        // Capped by the route, as a presigned URL is.
        const expiresIn = Math.min(
          downloadExpiresIn,
          route.download.maxExpiresIn,
        );
        const grant = await grants.sign(
          {
            l: record.id,
            o: object.id,
            ...(body.disposition !== undefined && { d: body.disposition }),
          },
          { expiresIn },
        );
        const params = new URLSearchParams({ grant });
        sent = {
          mode: "proxy",
          url: `${env.url(pluginPath("share", "file"))}?${params}`,
          expiresIn,
          disposition: body.disposition ?? route.download.disposition,
        };
      }

      const counted = await links.countDownload(record);
      await options.onDownloaded?.({
        request: call.request,
        locals: call.locals,
        link: toShareLink(counted),
        object,
      });
      return { ...sent, downloadsLeft: downloadsLeft(counted) };
    },

    async sharedFile(call, query) {
      const { env, grants } = runtime.bound();
      const payload = await grants.verify(query.grant);
      const linkId = payload?.l;
      const objectId = payload?.o;
      const disposition = payload?.d;
      if (
        typeof linkId !== "string" ||
        typeof objectId !== "string" ||
        (disposition !== undefined &&
          disposition !== "inline" &&
          disposition !== "attachment")
      ) {
        throw s3Error(SHARE_ERROR_CODES.SHARE_DOWNLOAD_URL_INVALID);
      }
      const record = await links.findById(linkId);
      if (!record) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_NOT_FOUND);
      // The download was counted when the URL was handed out.
      const status = shareLinkStatus(record);
      if (status === "revoked" || status === "expired") assertOpen(record);
      const target = await liveTarget(record);
      const object = await sharedObject(record, target, objectId);
      const route = downloadRoute(object);
      return env.download.serve(
        {
          route: route.name,
          key: object.key,
          name: object.name,
          disposition,
        },
        call.request,
      );
    },
  };
}
