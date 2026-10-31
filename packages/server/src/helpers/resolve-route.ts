import { s3Error } from "@dimah-s3/core";
import { assertFileConstraints } from "@/helpers/constraints";
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
  const enabled =
    feature === "multipart"
      ? route.upload.multipart.enabled
      : route[feature as Exclude<RouteFeature, "multipart">].enabled;
  if (!enabled) throw s3Error("FEATURE_DISABLED", { feature });
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
};

export type OpenedUploadTarget<F extends "upload" | "multipart"> = {
  route: OpenedRoute<F>;
  /** Context for `upload.guard`, which the caller runs. */
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
};

/**
 * Opens a new upload (presign, multipart init or `s3.put`): the route, the
 * ticket subject, the declared file against `fileTypes` and `maxFileSize`,
 * `upload.object()`, and the S3 metadata, whose size is checked here.
 * Multipart kinds need `upload.multipart` on.
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

  const object = await resolveUploadObject(route, {
    ...routeContext,
    file: input.file,
    bucket: route.bucket,
    keyPrefix: route.keyPrefix,
    clientMetadata: input.clientMetadata,
  });
  const uploadToken = createUploadToken();
  const s3Metadata = buildObjectMetadata({
    metadata: object.metadata,
    uploadToken,
    previousKey: object.previousKey,
  });

  return {
    route,
    context: {
      ...routeContext,
      key: object.key,
      bucket: object.bucket,
      kind,
      file: input.file,
      acl: object.acl,
      metadata: object.metadata,
      clientMetadata: input.clientMetadata,
      storageClass: object.storageClass,
      cacheControl: object.cacheControl,
      tagging: object.tagging,
    },
    object,
    uploadToken,
    ticketSubject,
    s3Metadata,
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
