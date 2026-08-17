import type { S3Client } from "@aws-sdk/client-s3";
import { S3_API_BASE_PATH, S3_ERROR_CODES } from "@dimah-s3/core";
import { expect } from "vitest";
import { dimahS3 } from "../dimah-s3";
import type { DimahS3Config } from "../types";

export type TestS3 = ReturnType<typeof dimahS3>;

/** Minimal S3 client — override `send` per test. */
export function mockS3(
  send: S3Client["send"] = (async () => ({})) as S3Client["send"],
): S3Client {
  return { send } as S3Client;
}

export function createInstance(
  overrides: Partial<DimahS3Config> & {
    plugins?: DimahS3Config["plugins"];
  } = {},
) {
  const { s3, ...rest } = overrides;
  return dimahS3({
    s3: s3 ?? mockS3(),
    defaultBucket: "bucket",
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
  code: (typeof S3_ERROR_CODES)[keyof typeof S3_ERROR_CODES],
) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ code });
}
