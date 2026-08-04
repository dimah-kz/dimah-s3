import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignResponse } from "@dimah-s3/core";
import { buildContentDisposition } from "@dimah-s3/core";
import { errors } from "../errors";
import { isAwsNotFound } from "../helpers";
import {
  normalizeExpiresIn,
  runHook,
  runLifecycleHook,
} from "../internal-helpers";
import type { DimahS3Config } from "../types";

export type DownloadInput = {
  key: string;
  bucket?: string;
  fileName?: string;
  expiresIn?: number;
};

export async function download(
  config: DimahS3Config,
  input: DownloadInput,
  request: Request,
): Promise<PresignResponse> {
  const key = input.key?.trim();
  if (!key) {
    throw errors.keyRequired();
  }

  const bucket = input.bucket?.trim() || config.defaultBucket;
  const expiresIn = normalizeExpiresIn(input.expiresIn);
  const fileName = input.fileName?.trim();

  await runHook(config.download?.presignGuard, {
    request,
    key,
    bucket,
    fileName: fileName || undefined,
  });

  try {
    await config.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: unknown) {
    if (isAwsNotFound(err)) {
      throw errors.objectNotFound();
    }
    throw err;
  }

  const url = await getSignedUrl(
    config.s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: fileName
        ? buildContentDisposition(fileName)
        : "attachment",
    }),
    { expiresIn },
  );

  await runLifecycleHook(config.download?.onPresigned, {
    request,
    key,
    bucket,
    fileName: fileName || undefined,
    url,
    expiresIn,
  });

  return { bucket, key, url, expiresIn };
}
