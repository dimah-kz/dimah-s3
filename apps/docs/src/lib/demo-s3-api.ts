import type { S3Api } from "@dimah-s3/core";
import { forgetDemoFile, getDemoFileUrl } from "@/lib/demo/client-object-store";
import { simulateDemoUpload } from "@/lib/demo/simulate-upload";

const unsupported = (action: string) =>
  Promise.reject(new Error(`Demo API does not support ${action}`));

const pendingUploadSizes = new Map<string, number>();
const objectSizes = new Map<string, number>();

async function removeDemoKey(key: string) {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  objectSizes.delete(key);
  pendingUploadSizes.delete(key);
  forgetDemoFile(key);
  return {
    success: true as const,
    bucket: "demo",
    key,
  };
}

type DemoS3Api = S3Api & { uploadTransport: typeof simulateDemoUpload };

function demoKey(route: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_") || "file";
  return `${route}/${crypto.randomUUID()}/${safe}`;
}

/** Client-side S3Api mock for docs demos. File bytes stay in the browser. */
export const demoS3Api: DemoS3Api = {
  uploadTransport: simulateDemoUpload,

  upload: async (payload) => {
    const fileSize = payload.fileSize;
    const contentType = payload.contentType || "application/octet-stream";
    const key = demoKey(payload.route, payload.fileName);
    pendingUploadSizes.set(key, fileSize);

    return {
      key,
      bucket: "demo",
      url: "local://demo",
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
      bucket: "demo",
      contentLength,
      metadata: {},
      eTag: '"demo"',
    };
  },

  download: async (payload) => {
    const { key } = payload;
    const localUrl = getDemoFileUrl(key);
    if (localUrl) {
      return {
        key,
        bucket: "demo",
        url: localUrl,
        expiresIn: 3600,
      };
    }

    const bytes = objectSizes.get(key) ?? 75 * 1024 * 1024;
    const params = new URLSearchParams({ key, bytes: String(bytes) });
    if (payload.fileName) params.set("name", payload.fileName);

    return {
      key,
      bucket: "demo",
      url: `/api/demo-download?${params}`,
      expiresIn: 3600,
    };
  },

  delete: async (payload) => removeDemoKey(payload.key),

  deleteMany: async (payload) => ({
    results: await Promise.all(
      payload.keys.map(async (key) => {
        try {
          await removeDemoKey(key);
          return { key, success: true as const };
        } catch {
          return {
            key,
            success: false,
            error: { code: "INTERNAL_ERROR", message: "Demo delete failed" },
          };
        }
      }),
    ),
  }),

  catalog: async () => ({
    routes: {
      avatar: {
        upload: {
          enabled: true as const,
          fileTypes: ["image/*"],
          maxFileSize: 2 * 1024 * 1024,
          multipart: false,
        },
        download: { enabled: true as const },
        delete: { enabled: true as const },
      },
      uploads: {
        upload: {
          enabled: true as const,
          fileTypes: ["image/*", "application/pdf", "video/*"],
          maxFileSize: 50 * 1024 * 1024,
          multipart: false,
        },
        download: { enabled: true as const },
        delete: { enabled: true as const },
      },
    },
  }),

  multipart: {
    init: () => unsupported("multipart.init"),
    signPart: () => unsupported("multipart.signPart"),
    listParts: () => unsupported("multipart.listParts"),
    complete: () => unsupported("multipart.complete"),
    abort: () => unsupported("multipart.abort"),
  },
};
