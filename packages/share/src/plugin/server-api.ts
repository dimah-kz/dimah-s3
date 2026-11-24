import { s3Error } from "@dimah-s3/core";
import type { S3ServerCallOptions } from "@dimah-s3/server";
import type * as z from "zod";
import type { ShareClientActions } from "@/types/client";
import type { ShareCall } from "@/types/options";
import { listLinksQuery, listSharedQuery } from "@/wire";
import type { ShareOwnerOperations } from "./owner";
import type { ShareRuntime } from "./runtime";
import {
  createLinkBodySchema,
  downloadBodySchema,
  linkIdQuerySchema,
  listLinksQuerySchema,
  listSharedQuerySchema,
  openLinkQuerySchema,
  unlockLinkBodySchema,
  updateLinkBodySchema,
} from "./schemas";
import type { ShareVisitorOperations } from "./visitor";

/**
 * `s3.share.api`: every `shareClient()` action, in process. Each call runs
 * the instance guards as the share action, like the HTTP endpoint, with
 * the request from `options.request` or one built from `baseURL`.
 */
export type ShareServerApi = {
  [K in keyof ShareClientActions]: (
    input: Parameters<ShareClientActions[K]>[0],
    options?: S3ServerCallOptions,
  ) => ReturnType<ShareClientActions[K]>;
};

/**
 * Validates an in-process input the way the endpoint validates a request.
 * @throws `VALIDATION_ERROR` with the first issue.
 */
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  const path = issue.path.map(String).join(".");
  throw s3Error("VALIDATION_ERROR", {
    issue: path ? `[${path}] ${issue.message}` : issue.message,
  });
}

/** Creates `s3.share.api` over the operations. */
export function createServerApi(
  runtime: ShareRuntime,
  owner: ShareOwnerOperations,
  visitor: ShareVisitorOperations,
): ShareServerApi {
  const run =
    <T, R>(
      action: keyof ShareClientActions,
      schema: z.ZodType<T>,
      operation: (call: ShareCall, value: T) => Promise<R>,
    ) =>
    (input: unknown, options?: S3ServerCallOptions): Promise<R> =>
      runtime
        .bound()
        .env.runOperation({ action }, options, (context) =>
          operation(context, parse(schema, input)),
        );

  return {
    createLink: run("createLink", createLinkBodySchema, owner.createLink),
    listLinks: (input, options) =>
      run(
        "listLinks",
        listLinksQuerySchema,
        owner.listLinks,
      )(listLinksQuery(input), options),
    getLink: run("getLink", linkIdQuerySchema, owner.getLink),
    updateLink: run("updateLink", updateLinkBodySchema, owner.updateLink),
    revokeLink: run("revokeLink", linkIdQuerySchema, owner.revokeLink),
    openLink: run("openLink", openLinkQuerySchema, visitor.openLink),
    unlockLink: run("unlockLink", unlockLinkBodySchema, visitor.unlockLink),
    listShared: (input, options) =>
      run(
        "listShared",
        listSharedQuerySchema,
        visitor.listShared,
      )(listSharedQuery(input), options),
    downloadShared: run(
      "downloadShared",
      downloadBodySchema,
      visitor.downloadShared,
    ),
  };
}
