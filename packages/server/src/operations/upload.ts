import type { UploadPresignResponse } from "@dimah-s3/core";
import type { uploadBodySchema } from "@dimah-s3/core/schema";
import type * as z from "zod";
import { runLifecycle } from "@/helpers/hooks";
import { getRoute, openUploadTarget } from "@/helpers/open-target";
import {
  presignPost,
  presignPut,
  type PresignPutInput,
} from "@/helpers/presign";
import { issueTicket } from "@/helpers/ticket";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { UploadKind } from "@/types/hook-contexts";
import type { ResolvedConfig, ResolvedRoute } from "@/types/resolved";

/** Body of `POST /presign/upload`, after validation. */
export type UploadBody = z.output<typeof uploadBodySchema>;

/**
 * Presigns a single-shot upload (`POST /presign/upload`, `s3.api.upload`).
 *
 * {@link openUploadTarget} checks the request and runs `upload.object()`
 * and `upload.guard`. Then a PUT URL or a POST policy is signed: it pins
 * the size, the type, the metadata, the upload marker and, when sent, the
 * checksum. Then the upload ticket is issued and `upload.onStart` runs. A
 * throw from `onStart` returns its error, and nothing has been written to
 * S3 yet.
 */
export function presignUpload(
  config: ResolvedConfig,
  body: UploadBody,
  options: S3ServerCallOptions = {},
): Promise<UploadPresignResponse> {
  return runOperation(config, "upload", options, async (call) => {
    const kind = presignKind(getRoute(config, body.route));
    const target = await openUploadTarget(
      config,
      call,
      {
        route: body.route,
        file: { name: body.name, size: body.size, type: body.type },
        clientMetadata: body.metadata,
        checksum: body.checksum,
      },
      kind,
    );
    const { route, context, object, uploadToken, ticketSubject } = target;

    const { expiresIn, confirmWindow } = route.upload;
    const urlExpiresAt = new Date(Date.now() + expiresIn * 1000);
    const { ticket, expiresAt } = await issueTicket(
      config,
      {
        mode: "single",
        kind,
        id: uploadToken,
        route: route.name,
        key: object.key,
        file: context.file,
        acl: object.acl,
        checksum: route.upload.checksum,
        expiresAt: new Date(urlExpiresAt.getTime() + confirmWindow * 1000),
      },
      ticketSubject,
    );

    const input: PresignPutInput = {
      bucket: object.bucket,
      key: object.key,
      size: body.size,
      contentType: target.contentType,
      contentDisposition: target.contentDisposition,
      metadata: target.s3Metadata,
      acl: object.acl,
      checksum: body.checksum,
      expiresIn,
      storageClass: object.storageClass,
      cacheControl: object.cacheControl,
      tagging: object.tagging,
    };
    const presigned =
      kind === "post"
        ? {
            method: "POST" as const,
            ...(await presignPost(route.client, input)),
          }
        : {
            method: "PUT" as const,
            ...(await presignPut(route.client, input)),
          };

    await runLifecycle(route.upload.onStart, {
      ...context,
      uploadToken,
      url: presigned.url,
      urlExpiresAt,
      expiresAt,
    });

    return {
      key: object.key,
      bucket: object.bucket,
      expiresIn,
      ticket,
      ...presigned,
    };
  });
}

/** The upload kind a presign on this route produces, from `upload.method`. */
function presignKind(
  route: ResolvedRoute,
): Extract<UploadKind, "post" | "put"> {
  return route.upload.enabled && route.upload.method === "POST"
    ? "post"
    : "put";
}
