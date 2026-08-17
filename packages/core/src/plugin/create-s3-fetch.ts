import { createFetch } from "@better-fetch/fetch";
import { DimahS3Error } from "../error";
import type { S3ClientFetchOptions, S3Fetch } from "./types";

async function resolveHeaders(
  headers: S3ClientFetchOptions["headers"],
): Promise<HeadersInit | undefined> {
  if (headers == null) return undefined;
  if (typeof headers === "function") return headers();
  return headers;
}

type FetchErrorPayload = {
  message?: string;
  code?: string;
  params?: Record<string, string | number>;
};

function payloadOf(value: unknown): FetchErrorPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as FetchErrorPayload;
}

function dimahErrorFromFetch(error: {
  status: number;
  statusText: string;
  message?: string;
  code?: string;
  params?: Record<string, string | number>;
  error?: unknown;
}): DimahS3Error {
  const nested = payloadOf(error.error);
  const message = nested?.message || error.message || error.statusText;
  const code = nested?.code ?? error.code;
  const params = nested?.params ?? error.params;
  return new DimahS3Error(message, error.status, {
    ...(typeof code === "string" ? { code } : {}),
    ...(params ? { params } : {}),
  });
}

/**
 * Shared `$fetch` for core routes and client plugins.
 * `base` is a normalized API prefix (e.g. `/api/s3`).
 *
 * Non-OK responses throw {@link DimahS3Error} (same class as server
 * endpoints). better-fetch `throw: true` surfaces a `BetterFetchError`;
 * `onError` maps the JSON body onto {@link DimahS3Error}.
 */
export function createS3Fetch(
  base: string,
  options?: S3ClientFetchOptions,
): S3Fetch {
  return createFetch({
    baseURL: base,
    throw: true,
    customFetchImpl: options?.fetch,
    credentials: options?.credentials,
    onRequest: async (ctx) => {
      const extra = await resolveHeaders(options?.headers);
      if (!extra) return ctx;
      const headers = new Headers(ctx.headers);
      new Headers(extra).forEach((value, key) => {
        headers.set(key, value);
      });
      return { ...ctx, headers };
    },
    onError: (ctx) => {
      throw dimahErrorFromFetch(ctx.error);
    },
  });
}
