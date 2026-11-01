import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import type { MultipartInitResponse } from "@dimah-s3/core";
import type { multipartInitBodySchema } from "@dimah-s3/core/schema";
import type * as z from "zod";
import { abortMultipartBestEffort } from "@/helpers/best-effort";
import { runLifecycle } from "@/helpers/hooks";
import { objectCommandExtras } from "@/helpers/object-s3";
import { partLayout } from "@/helpers/part-layout";
import { openUploadTarget } from "@/helpers/open-target";
import { issueTicket } from "@/helpers/ticket";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";

/** Body of `POST /presign/multipart/init`, after validation. */
export type MultipartInitBody = z.output<typeof multipartInitBodySchema>;

/**
 * Starts a multipart upload (`POST /presign/multipart/init`,
 * `s3.api.multipart.init`).
 *
 * {@link openUploadTarget} checks the request and runs `upload.object()`
 * and `upload.guard`, and the part layout is picked. CreateMultipartUpload writes the type, the disposition,
 * the metadata and the upload marker, and asks for SHA-256 part checksums
 * when the route requires them. Then it issues the ticket and runs
 * `upload.onStart`. If either fails, the multipart upload is aborted.
 */
export function initMultipart(
  config: ResolvedConfig,
  body: MultipartInitBody,
  options: S3ServerCallOptions = {},
): Promise<MultipartInitResponse> {
  return runOperation(config, "multipart.init", options, async (call) => {
    const target = await openUploadTarget(
      config,
      call,
      {
        route: body.route,
        file: { name: body.name, size: body.size, type: body.type },
        clientMetadata: body.metadata,
      },
      "multipart",
    );
    const { route, context, object, uploadToken, ticketSubject } = target;
    const { multipart, checksum } = route.upload;
    const layout = partLayout(body.size, multipart.partSize);

    const { UploadId: uploadId } = await route.client.send(
      new CreateMultipartUploadCommand({
        Bucket: object.bucket,
        Key: object.key,
        ContentType: target.contentType,
        ContentDisposition: target.contentDisposition,
        ACL: object.acl,
        Metadata: target.s3Metadata,
        ChecksumAlgorithm: checksum ? "SHA256" : undefined,
        ...objectCommandExtras(object),
      }),
    );
    if (!uploadId) {
      throw new Error(
        `CreateMultipartUpload returned no UploadId for "${object.key}".`,
      );
    }

    try {
      const { ticket, expiresAt } = await issueTicket(
        config,
        {
          mode: "multipart",
          id: uploadToken,
          route: route.name,
          key: object.key,
          file: context.file,
          acl: object.acl,
          checksum,
          expiresAt: new Date(Date.now() + multipart.ticketExpiresIn * 1000),
          uploadId,
          partSize: layout.partSize,
          partCount: layout.partCount,
        },
        ticketSubject,
      );
      await runLifecycle(route.upload.onStart, {
        ...context,
        uploadToken,
        uploadId,
        expiresAt,
      });
      return {
        key: object.key,
        bucket: object.bucket,
        uploadId,
        ticket,
        partSize: layout.partSize,
        partCount: layout.partCount,
        checksum,
      };
    } catch (error) {
      await abortMultipartBestEffort(
        route.client,
        object.bucket,
        object.key,
        uploadId,
      );
      throw error;
    }
  });
}
