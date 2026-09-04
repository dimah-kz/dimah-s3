import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { ConfirmedObjectResponse, S3RouteName } from "@dimah-s3/core";
import { requestFromHeaders } from "@/helpers/request";
import {
  finalizeConfirmedObject,
  headObjectOrNotFound,
  normalizeObjectS3,
  objectCommandExtras,
  openUploadTarget,
  runHook,
} from "@/helpers";
import type { ResolvedDimahS3Config } from "@/types";

export type PutObjectInput = {
  route: S3RouteName;
  fileName: string;
  contentType?: string;
  body: Uint8Array | ArrayBuffer | string;
  metadata?: Record<string, string>;
  headers?: HeadersInit;
};

function toBytes(body: PutObjectInput["body"]): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return body;
}

/**
 * Server-side upload through the same route policy as presign + confirm.
 */
export async function putObject(
  config: ResolvedDimahS3Config,
  input: PutObjectInput,
): Promise<ConfirmedObjectResponse> {
  const body = toBytes(input.body);
  const request = requestFromHeaders(input.headers);
  await runHook(config.guard, { request });
  const fileSize = body.byteLength;
  const {
    route,
    key,
    bucket,
    metadata,
    acl,
    storageClass,
    cacheControl,
    tagging,
    stored,
  } = await openUploadTarget(
    config,
    {
      route: input.route,
      fileName: input.fileName,
      fileSize,
      contentType: input.contentType,
      metadata: input.metadata,
    },
    request,
    "upload",
  );

  const objectS3 = normalizeObjectS3({ storageClass, cacheControl, tagging });

  await runHook(route.upload.guard, {
    ...stored,
    file: {
      name: input.fileName,
      size: fileSize,
      type: input.contentType,
    },
    metadata,
    clientMetadata: input.metadata,
    acl,
    ...objectS3,
    replace: route.upload.replace,
  });

  await route.client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: input.contentType,
      ContentLength: fileSize,
      Metadata: metadata,
      ACL: acl,
      ...objectCommandExtras(objectS3),
    }),
  );

  const head = await headObjectOrNotFound(route.client, bucket, key);
  return finalizeConfirmedObject(route.client, bucket, key, {
    config,
    route,
    stored,
    head,
    acl,
  });
}
