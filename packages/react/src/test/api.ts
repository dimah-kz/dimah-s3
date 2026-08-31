import { vi } from "vitest";
import type { S3Api } from "@dimah-s3/core";

const bucket = "bucket";

function generatedKey(payload: { route: string; fileName?: string }) {
  return `${payload.route}/${payload.fileName ?? "file"}`;
}

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
      bucket,
      key: generatedKey(payload),
      url: "https://s3.test/post",
      expiresIn: 600,
      method: "POST" as const,
      fields: { key: generatedKey(payload), Policy: "p" },
    })),
    confirm: vi.fn(async (payload) => ({
      key: payload.key,
      bucket,
      contentLength: 1,
      metadata: {},
      eTag: "abc",
    })),
    download: vi.fn(async (payload) => ({
      bucket,
      key: payload.key,
      url: "https://s3.test/dl",
      expiresIn: 600,
    })),
    delete: vi.fn(async (payload) => ({
      success: true,
      bucket,
      key: payload.key,
    })),
    multipart: {
      init: vi.fn(async (payload) => ({
        bucket,
        key: generatedKey(payload),
        uploadId: "up-1",
      })),
      signPart: vi.fn(async (payload) => ({
        url: "https://s3.test/part",
        partNumber: payload.partNumber,
        uploadId: payload.uploadId,
        bucket,
        expiresIn: 600,
        partSize: payload.partSize,
      })),
      listParts: vi.fn(async () => ({ parts: [] })),
      complete: vi.fn(async (payload) => ({
        bucket,
        key: payload.key,
        uploadId: payload.uploadId,
        contentLength: 1,
        eTag: "abc",
        metadata: {},
      })),
      abort: vi.fn(async (payload) => ({
        aborted: true,
        bucket,
        key: payload.key,
        uploadId: payload.uploadId,
      })),
      ...multipart,
    },
    ...rest,
  };
}
