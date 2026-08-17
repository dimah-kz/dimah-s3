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

function dimahErrorFromFetch(error: {
  status: number;
  statusText: string;
  message?: string;
  error?: unknown;
}): DimahS3Error {
  const payload = error.error as {
    message?: string;
    code?: string;
    params?: Record<string, string | number>;
  } | null;
  const message =
    (payload && typeof payload === "object" && payload.message) ||
    error.message ||
    error.statusText;
  return new DimahS3Error(message, error.status, {
    code:
      payload && typeof payload === "object" && typeof payload.code === "string"
        ? payload.code
        : undefined,
    params:
      payload && typeof payload === "object" && payload.params
        ? payload.params
        : undefined,
  });
}

/**
 * Shared `$fetch` for core routes and client plugins.
 * `base` is a normalized API prefix (e.g. `/api/s3`).
 *
 * Non-OK responses throw {@link DimahS3Error} — same class as server
 * endpoints, so client and server error shapes stay aligned.
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
