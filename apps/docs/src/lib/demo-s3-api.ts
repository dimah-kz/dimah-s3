import type { S3Api } from "@dimah-s3/core";
import { forgetDemoFile, getDemoFileUrl } from "@/lib/demo/client-object-store";

const unsupported = (action: string) =>
  Promise.reject(new Error(`Demo API does not support ${action}`));

const pendingUploadSizes = new Map<string, number>();
const objectSizes = new Map<string, number>();

function uploadUrl(key: string, fileSize: number) {
  const params = new URLSearchParams({
    key,
    bytes: String(fileSize),
  });
  return `/api/demo-upload?${params}`;
}

/** Client-side S3Api mock for docs demos — presigns to local upload/download routes. */
export const demoS3Api: S3Api = {
  upload: async (payload) => {
    const fileSize = payload.fileSize ?? 0;
    const contentType = payload.contentType || "application/octet-stream";
    pendingUploadSizes.set(payload.key, fileSize);

    return {
      key: payload.key,
      bucket: payload.bucket ?? "demo",
      url: uploadUrl(payload.key, fileSize),
      expiresIn: 3600,
      method: "PUT",
      headers: { "Content-Type": contentType },
    };
  },

  confirm: async (payload) => {
    const contentLength = pendingUploadSizes.get(payload.key) ?? 0;
    pendingUploadSizes.delete(payload.key);
    objectSizes.set(payload.key, contentLength);

    return {
      key: payload.key,
      bucket: payload.bucket ?? "demo",
      contentLength,
      metadata: {},
      eTag: '"demo"',
    };
  },

  download: async (key, options) => {
    const localUrl = getDemoFileUrl(key);
    if (localUrl) {
      return {
        key,
        bucket: "demo",
        url: localUrl,
        expiresIn: 3600,
      };
    }

    const bytes = objectSizes.get(key) ?? 40_000_000;
    const params = new URLSearchParams({ key, bytes: String(bytes) });
    if (options?.fileName) params.set("name", options.fileName);

    return {
      key,
      bucket: "demo",
      url: `/api/demo-download?${params}`,
      expiresIn: 3600,
    };
  },

  delete: async (key, options) => {
    objectSizes.delete(key);
    pendingUploadSizes.delete(key);
    forgetDemoFile(key);
    void fetch(`/api/demo-upload?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    return {
      success: true,
      bucket: options?.bucket ?? "demo",
      key,
    };
  },

  multipart: {
    init: () => unsupported("multipart.init"),
    signPart: () => unsupported("multipart.signPart"),
    listParts: () => unsupported("multipart.listParts"),
    complete: () => unsupported("multipart.complete"),
    abort: () => unsupported("multipart.abort"),
  },
};
