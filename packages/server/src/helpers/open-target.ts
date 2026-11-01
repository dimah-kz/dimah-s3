import { buildContentDisposition, s3Error } from "@dimah-s3/core";
import {
  assertFileConstraints,
  assertSingleUploadSize,
} from "@/helpers/constraints";
import { runGuards } from "@/helpers/hooks";
import { buildObjectMetadata } from "@/helpers/object-meta";
import {
  assertStoredKey,
  resolveUploadObject,
  type UploadObject,
} from "@/helpers/resolve-target";
import {
  assertTicketSubject,
  createUploadToken,
  readTicket,
  type TicketEnv,
  type UploadTicket,
} from "@/helpers/ticket";
import type {
  GuardContext,
  ObjectContext,
  RouteGuardContext,
  UploadFile,
  UploadGuardContext,
  UploadKind,
} from "@/types/hook-contexts";
import type {
  OpenedRoute,
  ResolvedConfig,
  ResolvedRoute,
  RouteFeature,
} from "@/types/resolved";

/*
 * Every operation after the instance guard: find the route, check that the
 * feature is on, run the route guard, then resolve the object the call is
 * about. Each step extends the call context; `locals` stays one object.
 */

type RouteConfig = Pick<ResolvedConfig, "routes">;

export type OpenedRouteContext<F extends RouteFeature> = {
  route: OpenedRoute<F>;
  context: RouteGuardContext;
};

export type OpenedObject<F extends RouteFeature> = {
  route: OpenedRoute<F>;
  context: ObjectContext;
};

/** The named route. Fails with `UNKNOWN_ROUTE`. */
export function getRoute(config: RouteConfig, name: string): ResolvedRoute {
  if (!Object.hasOwn(config.routes, name)) {
    throw s3Error("UNKNOWN_ROUTE", { route: name });
  }
  return config.routes[name];
}

/** Fails with `FEATURE_DISABLED` unless `feature` is on for the route. */
export function assertFeature<F extends RouteFeature>(
  route: ResolvedRoute,
  feature: F,
): asserts route is OpenedRoute<F> {
  if (!isFeatureEnabled(route, feature)) {
    throw s3Error("FEATURE_DISABLED", { feature });
  }
}

function isFeatureEnabled(route: ResolvedRoute, feature: RouteFeature) {
  switch (feature) {
    case "multipart":
      return route.upload.multipart.enabled;
    case "proxy":
      return route.download.enabled && route.download.mode === "proxy";
    default:
      return route[feature].enabled;
  }
}

/** Looks up the route, checks the feature and runs the route guard. */
export async function openRoute<F extends RouteFeature>(
  config: RouteConfig,
  context: GuardContext,
  name: string,
  feature: F,
): Promise<OpenedRouteContext<F>> {
  const route = getRoute(config, name);
  assertFeature(route, feature);
  const routeContext: RouteGuardContext = { ...context, route: route.name };
  await runGuards(route.guard, routeContext);
  return { route, context: routeContext };
}

/**
 * {@link openRoute} for a stored object (download, `/file`, delete): the key
 * must be inside the route namespace (`KEY_INVALID`).
 */
export async function openObject<F extends RouteFeature>(
  config: RouteConfig,
  context: GuardContext,
  input: { route: string; key: string },
  feature: F,
): Promise<OpenedObject<F>> {
  const opened = await openRoute(config, context, input.route, feature);
  const key = assertStoredKey(input.key, opened.route.keyPrefix);
  return {
    route: opened.route,
    context: { ...opened.context, key, bucket: opened.route.bucket },
  };
}

export type UploadTargetInput = {
  route: string;
  file: UploadFile;
  /** Client extras. Never written to S3 automatically. */
  clientMetadata?: Record<string, string>;
  /** SHA-256 the client sent. A presign needs one when the route requires it. */
  checksum?: string;
  /** S3 metadata written over `upload.object().metadata` (`s3.put`). */
  metadata?: Record<string, string>;
};

export type OpenedUploadTarget<F extends "upload" | "multipart"> = {
  route: OpenedRoute<F>;
  /** Context `upload.guard` ran with, and the base of `onStart`. */
  context: UploadGuardContext;
  object: UploadObject;
  /** New upload token: the marker value and the ticket id. */
  uploadToken: string;
  /**
   * Subject to bind the ticket to, resolved after the instance and route
   * guards, the same point at which {@link openTicket} checks it. `s3.put`
   * has no ticket, so it never has one.
   */
  ticketSubject?: string;
  /** S3 user metadata to write: encoded, with the marker and previous key. */
  s3Metadata: Record<string, string>;
  /** `Content-Type` to write: the declared type, else `application/octet-stream`. */
  contentType: string;
  /** `Content-Disposition` to write, with the declared name. */
  contentDisposition: string;
};

/** Content type written when the client declares none. */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Opens a new upload (presign, multipart init or `s3.put`), in this order:
 *
 * 1. The route, with `upload` on (`upload.multipart` for multipart), and
 *    the route guard.
 * 2. The ticket subject (none for `s3.put`).
 * 3. The declared file against `fileTypes`, `maxFileSize` and, for a
 *    single PUT, POST or `s3.put`, S3's 5 GiB cap. A presign must send a
 *    checksum when the route requires one (`CHECKSUM_REQUIRED`).
 * 4. `upload.object()` and the S3 metadata, whose size is checked here.
 * 5. `upload.guard`, with the key that will be written.
 *
 * The cheap checks come first, so a bad request never reaches your
 * `upload.object()` or guard. The caller then writes or presigns, and runs
 * `upload.onStart`.
 */
export async function openUploadTarget<K extends UploadKind>(
  config: RouteConfig & Pick<TicketEnv, "ticketSubject">,
  context: GuardContext,
  input: UploadTargetInput,
  kind: K,
): Promise<OpenedUploadTarget<K extends "multipart" ? "multipart" : "upload">> {
  type F = K extends "multipart" ? "multipart" : "upload";
  const feature = (kind === "multipart" ? "multipart" : "upload") as F;
  const { route, context: routeContext } = await openRoute(
    config,
    context,
    input.route,
    feature,
  );
  const ticketSubject =
    kind === "server" ? undefined : await config.ticketSubject?.(routeContext);
  assertFileConstraints(route.upload, input.file);
  if (kind !== "multipart") assertSingleUploadSize(input.file.size);
  if ((kind === "post" || kind === "put") && route.upload.checksum) {
    if (!input.checksum) throw s3Error("CHECKSUM_REQUIRED");
  }

  const object = await resolveUploadObject(route, {
    ...routeContext,
    file: input.file,
    bucket: route.bucket,
    keyPrefix: route.keyPrefix,
    clientMetadata: input.clientMetadata,
  });
  const metadata = input.metadata
    ? { ...object.metadata, ...input.metadata }
    : object.metadata;
  const uploadToken = createUploadToken();
  const s3Metadata = buildObjectMetadata({
    metadata,
    uploadToken,
    previousKey: object.previousKey,
  });

  const guardContext: UploadGuardContext = {
    ...routeContext,
    key: object.key,
    bucket: object.bucket,
    kind,
    file: input.file,
    acl: object.acl,
    metadata,
    clientMetadata: input.clientMetadata,
    storageClass: object.storageClass,
    cacheControl: object.cacheControl,
    tagging: object.tagging,
  };
  await runGuards(route.upload.guard, guardContext);

  return {
    route,
    context: guardContext,
    object: { ...object, ...(metadata ? { metadata } : {}) },
    uploadToken,
    ticketSubject,
    s3Metadata,
    contentType: input.file.type ?? DEFAULT_CONTENT_TYPE,
    contentDisposition: buildContentDisposition(input.file.name),
  };
}

export type OpenedTicket<F extends "upload" | "multipart"> = {
  route: OpenedRoute<F>;
  ticket: UploadTicket<F extends "multipart" ? "multipart" : "single">;
  context: ObjectContext;
};

/**
 * Opens a call that carries an upload ticket: confirm (`upload`) or a
 * multipart call (`multipart`). The ticket is verified first, then its route
 * must exist with the feature on and its key must be inside the route
 * namespace, else `UPLOAD_TICKET_INVALID`. The route guard runs next, and a
 * bound ticket must then match the subject of this call.
 */
export async function openTicket<F extends "upload" | "multipart">(
  config: RouteConfig & TicketEnv,
  context: GuardContext,
  token: string,
  feature: F,
): Promise<OpenedTicket<F>> {
  type M = F extends "multipart" ? "multipart" : "single";
  const mode = (feature === "multipart" ? "multipart" : "single") as M;
  const ticket = await readTicket(config, token, {
    mode,
    operation: context.operation,
  });

  if (!Object.hasOwn(config.routes, ticket.route)) {
    throw s3Error("UPLOAD_TICKET_INVALID");
  }
  const route = config.routes[ticket.route];
  assertFeature(route, feature);
  let key: string;
  try {
    key = assertStoredKey(ticket.key, route.keyPrefix);
  } catch {
    throw s3Error("UPLOAD_TICKET_INVALID");
  }

  const routeContext: RouteGuardContext = { ...context, route: route.name };
  await runGuards(route.guard, routeContext);
  await assertTicketSubject(config, ticket, routeContext);
  return {
    route,
    ticket,
    context: { ...routeContext, key, bucket: route.bucket },
  };
}
