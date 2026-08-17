import { vi } from "vitest";
import type { S3Api } from "@dimah-s3/core";

const bucket = "bucket";

/**
 * Typed `S3Api` stub. Override individual methods (or `multipart.*`) per test.
 * Default implementations succeed with stable fixture values.
 */
export function fakeS3Api(
  overrides: Omit<Partial<S3Api>, "multipart"> & {
    multipart?: Partial<S3Api["multipart"]>;
  } = {},
): S3Api {
  const { multipart, ...rest } = overrides;

  return {
    upload: vi.fn(async (payload) => ({
      bucket: payload.bucket ?? bucket,
      key: payload.key,
      url: "https://s3.test/post",
      expiresIn: 600,
      method: "POST" as const,
      fields: { key: payload.key, Policy: "p" },
    })),
    confirm: vi.fn(async (payload) => ({
      key: payload.key,
      bucket: payload.bucket ?? bucket,
      contentLength: 1,
      metadata: {},
      eTag: "abc",
    })),
    download: vi.fn(async (key) => ({
      bucket,
      key,
      url: "https://s3.test/dl",
      expiresIn: 600,
    })),
    delete: vi.fn(async (key) => ({
      success: true,
      bucket,
      key,
    })),
    multipart: {
      init: vi.fn(async (payload) => ({
        bucket: payload.bucket ?? bucket,
        key: payload.key,
        uploadId: "up-1",
      })),
      signPart: vi.fn(async (payload) => ({
        presignedUrl: "https://s3.test/part",
        partNumber: payload.partNumber,
        uploadId: payload.uploadId,
        bucket: payload.bucket ?? bucket,
        expiresIn: 600,
      })),
      listParts: vi.fn(async () => ({ parts: [] })),
      complete: vi.fn(async (payload) => ({
        bucket: payload.bucket ?? bucket,
        key: payload.key,
        uploadId: payload.uploadId,
        contentLength: 1,
        eTag: "abc",
        metadata: {},
      })),
      abort: vi.fn(async (payload) => ({
        aborted: true,
        bucket: payload.bucket ?? bucket,
        key: payload.key,
        uploadId: payload.uploadId,
      })),
      ...multipart,
    },
    ...rest,
  };
}
