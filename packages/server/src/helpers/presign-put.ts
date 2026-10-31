import {
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3ObjectAcl } from "@dimah-s3/core";
import { assertChecksumConfig } from "@/helpers/checksum-config";
import { objectCommandExtras, objectPutHeaders } from "@/helpers/object-s3";
import type { ObjectS3Headers } from "@/types/hook-contexts";

/**
 * Plain headers to sign. The presigner leaves `content-type` and
 * `cache-control` unsigned unless listed, and `content-length` pins the body
 * size. Every other header we send is an `x-amz-*` header kept out of the
 * query string.
 */
const SIGNABLE_HEADERS: ReadonlySet<string> = new Set([
  "content-type",
  "content-disposition",
  "cache-control",
  "content-length",
]);

/** Signed headers a browser sets itself and must not send. */
const FORBIDDEN_HEADERS: ReadonlySet<string> = new Set([
  "content-length",
  "host",
]);

/** A presigned request. Send exactly `headers` with it. */
export type PresignedRequest = { url: string; headers: Record<string, string> };

export type PresignPutInput = ObjectS3Headers & {
  bucket: string;
  key: string;
  /** Exact body size. It is signed. */
  size: number;
  contentType: string;
  contentDisposition: string;
  /** S3 user metadata, already encoded. */
  metadata: Record<string, string>;
  acl: S3ObjectAcl;
  /** Base64 SHA-256 of the body. S3 rejects any other body. */
  checksum?: string;
  expiresIn: number;
};

/**
 * Presigns PutObject. Every header the upload needs is signed, including
 * `x-amz-meta-*`, the ACL, tagging, storage class and checksum, so the URL
 * cannot be used to write anything else.
 */
export function presignPut(
  client: S3Client,
  input: PresignPutInput,
): Promise<PresignedRequest> {
  const objectS3 = {
    storageClass: input.storageClass,
    cacheControl: input.cacheControl,
    tagging: input.tagging,
  };
  const headers: Record<string, string> = {
    "content-type": input.contentType,
    "content-disposition": input.contentDisposition,
    ...lowercaseKeys(objectPutHeaders(objectS3)),
    "x-amz-acl": input.acl,
    ...Object.fromEntries(
      Object.entries(input.metadata).map(([key, value]) => [
        `x-amz-meta-${key.toLowerCase()}`,
        value,
      ]),
    ),
    ...(input.checksum ? { "x-amz-checksum-sha256": input.checksum } : {}),
  };
  const command = new PutObjectCommand({
    Bucket: input.bucket,
    Key: input.key,
    ContentLength: input.size,
    ContentType: input.contentType,
    ContentDisposition: input.contentDisposition,
    ACL: input.acl,
    Metadata: input.metadata,
    ...objectCommandExtras(objectS3),
    ...(input.checksum ? { ChecksumSHA256: input.checksum } : {}),
  });
  return presign(client, headers, (options) =>
    getSignedUrl(client, command, { ...options, expiresIn: input.expiresIn }),
  );
}

export type PresignUploadPartInput = {
  bucket: string;
  key: string;
  uploadId: string;
  partNumber: number;
  /** Exact part size from the part layout. It is signed. */
  size: number;
  /** Base64 SHA-256 of the part. */
  checksum?: string;
  expiresIn: number;
};

/** Presigns UploadPart with its size and checksum signed. */
export function presignUploadPart(
  client: S3Client,
  input: PresignUploadPartInput,
): Promise<PresignedRequest> {
  const command = new UploadPartCommand({
    Bucket: input.bucket,
    Key: input.key,
    UploadId: input.uploadId,
    PartNumber: input.partNumber,
    ContentLength: input.size,
    ...(input.checksum ? { ChecksumSHA256: input.checksum } : {}),
  });
  const headers: Record<string, string> = input.checksum
    ? { "x-amz-checksum-sha256": input.checksum }
    : {};
  return presign(client, headers, (options) =>
    getSignedUrl(client, command, { ...options, expiresIn: input.expiresIn }),
  );
}

type HeaderOptions = {
  signableHeaders: Set<string>;
  unhoistableHeaders: Set<string>;
};

/**
 * Signs with every header in `headers` signed and none of them moved to the
 * query string, then checks the URL's `X-Amz-SignedHeaders` against that
 * list. A mismatch means the SDK added or dropped a header, and the upload
 * would fail at S3, so it throws instead.
 */
async function presign(
  client: S3Client,
  headers: Record<string, string>,
  sign: (options: HeaderOptions) => Promise<string>,
): Promise<PresignedRequest> {
  await assertChecksumConfig(client);
  const names = Object.keys(headers);
  const url = await sign({
    // Only headers we send; UploadPart would otherwise sign the SDK's
    // default content-type.
    signableHeaders: new Set(
      [...names, "content-length"].filter((name) => SIGNABLE_HEADERS.has(name)),
    ),
    unhoistableHeaders: new Set(
      names.filter((name) => name.startsWith("x-amz-")),
    ),
  });

  const signed = new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "";
  const expected = [...names, ...FORBIDDEN_HEADERS].sort().join(";");
  if (signed !== expected) {
    throw new Error(
      `The presigned URL signs "${signed}"; expected "${expected}".`,
    );
  }
  return { url, headers };
}

function lowercaseKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
  );
}
