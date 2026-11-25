import { isS3ErrorCode, s3Error } from "@dimah-s3/core";
import type {
  DbAccessTarget,
  StorageFolder,
  StorageObject,
} from "@dimah-s3/db";
import type { ShareOwnerAction } from "@/constants";
import { SHARE_ERROR_CODES } from "@/error-codes";
import type { ShareLinkRecord } from "@/store/link-store";
import type {
  ShareClientLink,
  ShareLinkResponse,
  ShareListLinksResponse,
} from "@/types/client";
import type { ShareLink } from "@/types/link";
import type {
  ShareAuthorizeContext,
  ShareCall,
  ShareOwnerCall,
  ShareResolvedTarget,
} from "@/types/options";
import { loadTarget, resolvedTarget, type ShareRuntime } from "./runtime";
import type { CreateLinkBody, ListLinksQuery, UpdateLinkBody } from "./schemas";
import { settingsForCreate, settingsForUpdate } from "./settings";
import { toClientLink, toClientTarget, toShareLink } from "./to-client";
import { createLinkToken } from "./token";

/** What db's checks see for one share action. */
function accessTarget(action: ShareOwnerAction): DbAccessTarget {
  return { plugin: { id: "share", action } };
}

/** The request, the guards' locals, and the owner's scope. */
function ownerCall(call: ShareCall, scope: string): ShareOwnerCall {
  return { request: call.request, locals: call.locals, scope };
}

/** Every bucket the routes use. */
function routeBuckets(
  routes: Readonly<Record<string, { bucket: string }>>,
): Set<string> {
  return new Set(Object.values(routes).map((route) => route.bucket));
}

/**
 * The bucket a call names: `bucket` when a route uses it, or the only bucket
 * the routes use when it is omitted.
 * @throws `VALIDATION_ERROR` for another bucket, or when `bucket` is
 * omitted and the routes use several.
 */
function resolveBucket(
  buckets: ReadonlySet<string>,
  bucket: string | undefined,
  field: string,
): string {
  if (bucket === undefined) {
    const [only] = buckets;
    if (only !== undefined && buckets.size === 1) return only;
    throw s3Error("VALIDATION_ERROR", {
      issue: `[${field}] Required when the routes use several buckets`,
    });
  }
  if (!buckets.has(bucket)) {
    throw s3Error("VALIDATION_ERROR", {
      issue: `[${field}] No route uses this bucket`,
    });
  }
  return bucket;
}

/** The owner actions on links. Each one resolves the caller's db scope. */
export type ShareOwnerOperations = {
  createLink: (
    call: ShareCall,
    body: CreateLinkBody,
  ) => Promise<ShareLinkResponse>;
  listLinks: (
    call: ShareCall,
    query: ListLinksQuery,
  ) => Promise<ShareListLinksResponse>;
  getLink: (
    call: ShareCall,
    query: { id: string },
  ) => Promise<ShareLinkResponse>;
  updateLink: (
    call: ShareCall,
    body: UpdateLinkBody,
  ) => Promise<ShareLinkResponse>;
  revokeLink: (
    call: ShareCall,
    query: { id: string },
  ) => Promise<ShareLinkResponse>;
};

/** Creates the owner actions over the runtime. */
export function createOwnerOperations(
  runtime: ShareRuntime,
): ShareOwnerOperations {
  const { links, policy, options } = runtime;

  const authorize = async (context: ShareAuthorizeContext) => {
    if (options.authorize && !(await options.authorize(context))) {
      throw s3Error("FORBIDDEN");
    }
  };

  const respond = (
    link: ShareLink,
    loaded: StorageObject<unknown> | StorageFolder | null,
  ): ShareLinkResponse => ({
    link: toClientLink(link, toClientTarget(link, loaded), options.url),
  });

  /**
   * The caller's link `id`. A link of another scope is not found, the same
   * as no link.
   */
  const owned = async (
    call: ShareCall,
    action: ShareOwnerAction,
    id: string,
  ): Promise<{ scope: string; record: ShareLinkRecord }> => {
    const { db } = runtime.bound();
    const caller = await db.access.scope(call, accessTarget(action));
    const record = await links.findById(id);
    if (!record || record.scope !== caller.scope) {
      throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_NOT_FOUND);
    }
    return { scope: caller.scope, record };
  };

  /**
   * The caller's scope and, for a `listLinks` filtered by `key` or
   * `folderId`, the object or folder it names, once db's checks saw it.
   * `null` when the filter names no active object or folder of the caller's.
   */
  const listTarget = async (
    call: ShareCall,
    query: ListLinksQuery,
  ): Promise<{ scope: string; target?: ShareResolvedTarget } | null> => {
    const { db, env } = runtime.bound();
    const target = accessTarget("listLinks");
    try {
      if (query.key !== undefined) {
        const bucket = resolveBucket(
          routeBuckets(env.routes),
          query.bucket,
          "query.bucket",
        );
        const { caller, object } = await db.access.object(call, target, {
          bucket,
          key: query.key,
        });
        return { scope: caller.scope, target: { type: "object", object } };
      }
      if (query.folderId !== undefined) {
        const { caller, folder } = await db.access.folder(
          call,
          target,
          query.folderId,
        );
        if (!folder) return null;
        return { scope: caller.scope, target: { type: "folder", folder } };
      }
    } catch (error) {
      if (
        isS3ErrorCode(error, "OBJECT_NOT_FOUND") ||
        isS3ErrorCode(error, "FOLDER_NOT_FOUND")
      ) {
        return null;
      }
      throw error;
    }
    const caller = await db.access.scope(call, target);
    return { scope: caller.scope };
  };

  return {
    async createLink(call, body) {
      const action = "createLink";
      const { db, env } = runtime.bound();
      let scope: string;
      let target: ShareResolvedTarget;
      if (body.target.type === "object") {
        const bucket = resolveBucket(
          routeBuckets(env.routes),
          body.target.bucket,
          "body.target.bucket",
        );
        const { caller, object } = await db.access.object(
          call,
          accessTarget(action),
          { bucket, key: body.target.key },
        );
        // A link to an object nobody can download would never open.
        if (!env.routes[object.route]?.download.enabled) {
          throw s3Error("FEATURE_DISABLED", { feature: "download" });
        }
        scope = caller.scope;
        target = { type: "object", object };
      } else {
        if (!policy.folders) {
          throw s3Error(SHARE_ERROR_CODES.SHARE_FOLDER_LINKS_DISABLED);
        }
        const { caller, folder } = await db.access.folder(
          call,
          accessTarget(action),
          body.target.folderId,
        );
        // `folderId` is a non-empty id, so the folder is never the root.
        if (!folder) throw s3Error("FOLDER_NOT_FOUND");
        scope = caller.scope;
        target = { type: "folder", folder };
      }

      const created = await settingsForCreate(policy, body, new Date());
      await authorize({
        ...ownerCall(call, scope),
        action,
        target,
        settings: created.settings,
      });

      const record = await links.create({
        token: createLinkToken(),
        scope,
        target:
          target.type === "object"
            ? { type: "object", objectId: target.object.id }
            : { type: "folder", folderId: target.folder.id },
        label: created.label,
        passwordHash: created.passwordHash,
        expiresAt: created.expiresAt,
        maxDownloads: created.maxDownloads,
      });
      const link = toShareLink(record);
      await options.onCreated?.({ ...ownerCall(call, scope), link, target });
      return respond(
        link,
        target.type === "object" ? target.object : target.folder,
      );
    },

    async listLinks(call, query) {
      const action = "listLinks";
      const { db } = runtime.bound();
      const filtered = await listTarget(call, query);
      // No object or folder of the caller's there: no link of theirs points at it.
      if (filtered === null) return { links: [], nextCursor: null };
      const { scope, target } = filtered;
      await authorize({
        ...ownerCall(call, scope),
        action,
        ...(target !== undefined && { target }),
      });

      const page = await links.list(scope, {
        objectId: target?.type === "object" ? target.object.id : undefined,
        folderId: target?.type === "folder" ? target.folder.id : undefined,
        includeRevoked: query.includeRevoked,
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      });
      // Links to the same target load it once.
      const targets = new Map<
        string,
        Promise<StorageObject<unknown> | StorageFolder | null>
      >();
      const result: ShareClientLink[] = await Promise.all(
        page.links.map(async (record) => {
          const link = toShareLink(record);
          const id =
            link.target.type === "object"
              ? `o:${link.target.objectId}`
              : `f:${link.target.folderId}`;
          let loaded = targets.get(id);
          if (!loaded) {
            loaded = loadTarget(db, link);
            targets.set(id, loaded);
          }
          return respond(link, await loaded).link;
        }),
      );
      return { links: result, nextCursor: page.nextCursor };
    },

    async getLink(call, { id }) {
      const action = "getLink";
      const { db } = runtime.bound();
      const { scope, record } = await owned(call, action, id);
      const link = toShareLink(record);
      const loaded = await loadTarget(db, link);
      await authorize({
        ...ownerCall(call, scope),
        action,
        link,
        target: resolvedTarget(link, loaded),
      });
      return respond(link, loaded);
    },

    async updateLink(call, body) {
      const action = "updateLink";
      const { db } = runtime.bound();
      const { scope, record } = await owned(call, action, body.id);
      if (record.revokedAt !== null) {
        throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_REVOKED);
      }
      const previous = toShareLink(record);
      const loaded = await loadTarget(db, previous);
      const target = resolvedTarget(previous, loaded);
      const { patch, settings } = await settingsForUpdate(
        policy,
        body,
        record,
        new Date(),
      );
      await authorize({
        ...ownerCall(call, scope),
        action,
        link: previous,
        target,
        settings,
      });
      if (Object.keys(patch).length === 0) return respond(previous, loaded);

      const updated = await links.update(record.id, patch);
      // Revoked meanwhile: a revoked link keeps its settings.
      if (!updated) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_REVOKED);
      const link = toShareLink(updated);
      await options.onUpdated?.({
        ...ownerCall(call, scope),
        link,
        previous,
        ...(target !== undefined && { target }),
      });
      return respond(link, loaded);
    },

    async revokeLink(call, { id }) {
      const action = "revokeLink";
      const { db } = runtime.bound();
      const { scope, record } = await owned(call, action, id);
      const current = toShareLink(record);
      const loaded = await loadTarget(db, current);
      const target = resolvedTarget(current, loaded);
      await authorize({
        ...ownerCall(call, scope),
        action,
        link: current,
        target,
      });
      if (record.revokedAt !== null) return respond(current, loaded);

      const result = await links.revoke(record.id);
      if (!result) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_NOT_FOUND);
      const link = toShareLink(result.record);
      // A concurrent revoke that landed first ran the hook already.
      if (result.revoked) {
        await options.onRevoked?.({
          ...ownerCall(call, scope),
          link,
          ...(target !== undefined && { target }),
        });
      }
      return respond(link, loaded);
    },
  };
}
