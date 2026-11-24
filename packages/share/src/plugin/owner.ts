import { s3Error } from "@dimah-s3/core";
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

  return {
    async createLink(call, body) {
      const action = "createLink";
      const { db, env } = runtime.bound();
      let scope: string;
      let target: ShareResolvedTarget;
      if (body.target.type === "object") {
        const bucket = resolveBucket(
          new Set(Object.values(env.routes).map((route) => route.bucket)),
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
      await options.onCreated?.({ ...ownerCall(call, scope), link });
      return respond(
        link,
        target.type === "object" ? target.object : target.folder,
      );
    },

    async listLinks(call, query) {
      const action = "listLinks";
      const { db, env } = runtime.bound();
      const caller = await db.access.scope(call, accessTarget(action));
      await authorize({ ...ownerCall(call, caller.scope), action });

      let objectId: string | undefined;
      if (query.key !== undefined) {
        const bucket = resolveBucket(
          new Set(Object.values(env.routes).map((route) => route.bucket)),
          query.bucket,
          "query.bucket",
        );
        const object = await db.objects.find({ bucket, key: query.key });
        // No object of the caller's at the key: none of their links point at it.
        if (!object || object.scope !== caller.scope) {
          return { links: [], nextCursor: null };
        }
        objectId = object.id;
      }

      const page = await links.list(caller.scope, {
        objectId,
        folderId: query.folderId,
        includeRevoked: query.includeRevoked,
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
        target: resolvedTarget(previous, loaded),
        settings,
      });
      if (Object.keys(patch).length === 0) return respond(previous, loaded);

      const updated = await links.update(record.id, patch);
      // Revoked meanwhile: a revoked link keeps its settings.
      if (!updated) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_REVOKED);
      const link = toShareLink(updated);
      await options.onUpdated?.({ ...ownerCall(call, scope), link, previous });
      return respond(link, loaded);
    },

    async revokeLink(call, { id }) {
      const action = "revokeLink";
      const { db } = runtime.bound();
      const { scope, record } = await owned(call, action, id);
      const current = toShareLink(record);
      const loaded = await loadTarget(db, current);
      await authorize({
        ...ownerCall(call, scope),
        action,
        link: current,
        target: resolvedTarget(current, loaded),
      });
      if (record.revokedAt !== null) return respond(current, loaded);

      const revoked = await links.revoke(record.id);
      if (!revoked) throw s3Error(SHARE_ERROR_CODES.SHARE_LINK_NOT_FOUND);
      const link = toShareLink(revoked);
      await options.onRevoked?.({ ...ownerCall(call, scope), link });
      return respond(link, loaded);
    },
  };
}
