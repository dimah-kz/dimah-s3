import type { S3Client } from "@aws-sdk/client-s3";
import { S3_API_BASE_PATH, type S3ErrorCode } from "@dimah-s3/core";
import { expect, vi } from "vitest";
import { dimahS3 } from "@/dimah-s3";
import { route } from "@/route";
import type { DimahS3Config, DimahS3RouteConfig } from "@/types";

export type TestS3 = ReturnType<typeof dimahS3>;

/** Minimal S3 client — override `send` per test. */
export function mockS3(
  send: S3Client["send"] = (async () => ({})) as S3Client["send"],
): S3Client {
  return { send } as S3Client;
}

/** Typical HeadObject payload used by confirm / download / delete. */
export function headResult(overrides: Record<string, unknown> = {}) {
  return {
    ContentType: "image/png",
    ContentLength: 10,
    ETag: '"abc"',
    Metadata: { source: "web" },
    ContentDisposition: 'attachment; filename="a.png"',
    ...overrides,
  };
}

/**
 * Dispatch `s3.send(command)` by `command.constructor.name`.
 * Values may be a result object or a function of the command.
 */
export function sendByCommand(handlers: Record<string, unknown>) {
  return vi.fn(async (command: { constructor: { name: string } }) => {
    const result = handlers[command.constructor.name];
    if (typeof result === "function") return result(command);
    if (result !== undefined) return result;
    return {};
  });
}

export const defaultUploadBody = {
  route: "uploads",
  fileName: "a.png",
  fileSize: 10,
  contentType: "image/png",
};

export function allFeaturesRoute(overrides: DimahS3RouteConfig = {}) {
  const { upload, ...rest } = overrides;
  return route({
    download: true,
    delete: true,
    ...rest,
    upload:
      upload === false
        ? false
        : {
            multipart: true,
            ...(typeof upload === "object" ? upload : {}),
          },
  });
}

export function createInstance(
  overrides: Partial<DimahS3Config> & {
    plugins?: DimahS3Config["plugins"];
  } = {},
) {
  const { client, routes, ...rest } = overrides;
  return dimahS3({
    client: client ?? mockS3(),
    bucket: "bucket",
    routes: routes ?? { uploads: allFeaturesRoute() },
    ...rest,
  });
}

export function apiUrl(path: string, basePath = S3_API_BASE_PATH) {
  return `http://localhost${basePath}${path}`;
}

export function jsonRequest(
  url: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
  } = {},
) {
  const { method = "POST", body, headers } = init;
  const hasBody = body !== undefined && method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

export async function expectErrorCode(
  response: Response,
  status: number,
  error: { code: S3ErrorCode | string },
) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ code: error.code });
}
