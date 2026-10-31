import type { S3Client } from "@aws-sdk/client-s3";
import {
  createPresignedPost,
  type PresignedPost,
  type PresignedPostOptions,
} from "@aws-sdk/s3-presigned-post";
import {
  buildContentDisposition,
  s3Error,
  S3_MAX_POST_OBJECT_BYTES,
  type uploadBodySchema,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import type * as z from "zod";
import { assertChecksumConfig } from "@/helpers/checksum-config";
import { runGuards, runLifecycle } from "@/helpers/hooks";
import { objectPutHeaders } from "@/helpers/object-s3";
import { presignPut, type PresignPutInput } from "@/helpers/presign-put";
import { getRoute, openUploadTarget } from "@/helpers/resolve-route";
import { issueTicket } from "@/helpers/ticket";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { UploadKind } from "@/types/hook-contexts";
import type { ResolvedConfig, ResolvedRoute } from "@/types/resolved";

/** Body of `POST /presign/upload`, after validation. */
export type UploadBody = z.output<typeof uploadBodySchema>;

/** Content type written when the client declares none. */
export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Presigns a single-shot upload (`POST /presign/upload`, `s3.api.upload`).
 *
 * It opens the route, runs `upload.object()` and `upload.guard`, and signs a
 * PUT URL or a POST policy. The signature pins the size, the type, the
 * metadata, the upload marker and, when sent, the checksum. Then it issues
 * the upload ticket and runs `upload.onStart`. A throw from `onStart`
 * returns its error, and nothing has been written to S3 yet.
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
      },
      kind,
    );
    const { route, context, object, uploadToken, ticketSubject } = target;
    if (route.upload.checksum && !body.checksum) {
      throw s3Error("CHECKSUM_REQUIRED");
    }
    assertSingleUploadSize(body.size);
    await runGuards(route.upload.guard, context);

    const { expiresIn, confirmWindow } = route.upload;
    const urlExpiresAt = new Date(Date.now() + expiresIn * 1000);
    const { ticket, expiresAt } = await issueTicket(
      config,
      {
        mode: "single",
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
      contentType: body.type ?? DEFAULT_CONTENT_TYPE,
      contentDisposition: buildContentDisposition(body.name),
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
export function presignKind(
  route: ResolvedRoute,
): Extract<UploadKind, "post" | "put"> {
  return route.upload.enabled && route.upload.method === "POST"
    ? "post"
    : "put";
}

/**
 * Fails with `FILE_TOO_LARGE` above 5 GiB, the most S3 takes in one POST or
 * PutObject. Larger files need multipart.
 */
export function assertSingleUploadSize(size: number): void {
  if (size > S3_MAX_POST_OBJECT_BYTES) {
    throw s3Error("FILE_TOO_LARGE", {
      size,
      maxFileSize: S3_MAX_POST_OBJECT_BYTES,
    });
  }
}

type PolicyCondition = NonNullable<PresignedPostOptions["Conditions"]>[number];

/** The POST form placeholder that S3 replaces with the uploaded file name. */
const POST_FILENAME_PLACEHOLDER = "${filename}";

/**
 * Presigns a POST form upload. Every field is an exact-match policy
 * condition, the key is pinned with an `eq` condition, the size is pinned
 * with `content-length-range`, and a checksum adds the `x-amz-checksum-*`
 * fields with explicit `eq` conditions.
 *
 * A key that contains the `${filename}` placeholder fails with
 * `KEY_INVALID`: the SDK would sign it as a `starts-with` condition, and the
 * client would pick the object key.
 */
async function presignPost(
  client: S3Client,
  input: PresignPutInput,
): Promise<PresignedPost> {
  if (input.key.includes(POST_FILENAME_PLACEHOLDER)) {
    throw s3Error("KEY_INVALID");
  }
  await assertChecksumConfig(client);
  const checksumFields: Record<string, string> = input.checksum
    ? {
        "x-amz-checksum-algorithm": "SHA256",
        "x-amz-checksum-sha256": input.checksum,
      }
    : {};
  const conditions: PolicyCondition[] = [
    ["eq", "$key", input.key],
    ["content-length-range", input.size, input.size],
    ...Object.entries(checksumFields).map(([name, value]): PolicyCondition => [
      "eq",
      `$${name}`,
      value,
    ]),
  ];
  return createPresignedPost(client, {
    Bucket: input.bucket,
    Key: input.key,
    Conditions: conditions,
    Fields: {
      acl: input.acl,
      "Content-Type": input.contentType,
      "Content-Disposition": input.contentDisposition,
      ...objectPutHeaders(input),
      ...Object.fromEntries(
        Object.entries(input.metadata).map(([key, value]) => [
          `x-amz-meta-${key}`,
          value,
        ]),
      ),
      ...checksumFields,
    },
    Expires: input.expiresIn,
  });
}
