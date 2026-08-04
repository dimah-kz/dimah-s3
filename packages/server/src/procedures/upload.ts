import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { UploadPresignResponse } from "@dimah-s3/core";
import { buildContentDisposition } from "@dimah-s3/core";
import { errors, requireString } from "../errors";
import {
  normalizeExpiresIn,
  runHook,
  runLifecycleHook,
} from "../internal-helpers";
import type { DimahS3Config } from "../types";

export type UploadInput = {
  key: string;
  contentType?: string;
  fileSize?: number;
  metadata?: Record<string, string>;
  bucket?: string;
  expiresIn?: number;
  acl?: "private" | "public-read";
  fileName?: string;
};

export async function upload(
  config: DimahS3Config,
  input: UploadInput,
  request: Request,
): Promise<UploadPresignResponse> {
  const key = requireString(input.key, "key");
  const bucket = input.bucket?.trim() || config.defaultBucket;
  const expiresIn = normalizeExpiresIn(input.expiresIn);
  const acl = input.acl === "public-read" ? "public-read" : "private";
  const contentType = input.contentType?.trim() || "application/octet-stream";
  const fileSize =
    typeof input.fileSize === "number" && input.fileSize > 0
      ? Math.floor(input.fileSize)
      : null;

  await runHook(config.upload?.presignGuard, {
    request,
    key,
    bucket,
    contentType: input.contentType,
    fileSize: fileSize ?? undefined,
    metadata: input.metadata,
    acl,
    fileName: input.fileName,
  });

  const method = config.upload?.method ?? "POST";

  if (method === "PUT" && config.upload?.requireFileSize && fileSize === null) {
    throw errors.fileSizeRequiredUpload();
  }

  if (method === "PUT") {
    const putHeaders: Record<string, string> = {
      "Content-Type": contentType,
    };
    if (input.fileName) {
      putHeaders["Content-Disposition"] = buildContentDisposition(
        input.fileName,
      );
    }

    const url = await getSignedUrl(
      config.s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ACL: acl,
        ...(input.fileName
          ? { ContentDisposition: buildContentDisposition(input.fileName) }
          : {}),
        ...(fileSize !== null ? { ContentLength: fileSize } : {}),
      }),
      {
        expiresIn,
        ...(fileSize !== null
          ? { signableHeaders: new Set(["content-length"]) }
          : {}),
      },
    );

    await runLifecycleHook(config.upload?.onPresigned, {
      request,
      key,
      bucket,
      contentType: input.contentType,
      fileSize: fileSize ?? undefined,
      metadata: input.metadata,
      acl,
      fileName: input.fileName,
      url,
      expiresIn,
    });

    return {
      bucket,
      key,
      url,
      headers: putHeaders,
      expiresIn,
      method: "PUT",
    };
  }

  const fields: Record<string, string> = { acl, "Content-Type": contentType };

  if (input.fileName) {
    fields["Content-Disposition"] = buildContentDisposition(input.fileName);
  }

  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      fields[`x-amz-meta-${k}`] = v;
    }
  }

  const rangeMin = fileSize ?? 1;
  const rangeMax = fileSize ?? undefined;

  const { url, fields: signedFields } = await createPresignedPost(config.s3, {
    Bucket: bucket,
    Key: key,
    Conditions:
      rangeMax !== undefined
        ? [["content-length-range", rangeMin, rangeMax]]
        : [["content-length-range", rangeMin, Number.MAX_SAFE_INTEGER]],
    Fields: fields,
    Expires: expiresIn,
  });

  await runLifecycleHook(config.upload?.onPresigned, {
    request,
    key,
    bucket,
    contentType: input.contentType,
    fileSize: fileSize ?? undefined,
    metadata: input.metadata,
    acl,
    fileName: input.fileName,
    url,
    expiresIn,
  });

  return {
    bucket,
    key,
    url,
    fields: signedFields,
    expiresIn,
    method: "POST",
  };
}
