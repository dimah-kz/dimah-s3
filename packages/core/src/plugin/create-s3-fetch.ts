import { createFetch } from "@better-fetch/fetch";
import type { Status } from "better-call/error";
import { DimahS3Error } from "../error";
import { s3FetchErrorSchema } from "../schema/error";
import type { S3ClientFetchOptions, S3Fetch } from "./types";

async function resolveHeaders(
  headers: S3ClientFetchOptions["headers"],
): Promise<HeadersInit | undefined> {
  if (headers == null) return undefined;
  if (typeof headers === "function") return headers();
  return headers;
}

function fallbackMessage(error: {
  statusText: string;
  error?: unknown;
}): string {
  if (typeof error.error === "string" && error.error.trim()) {
    return error.error;
  }
  return error.statusText || "Request failed";
}

/**
 * better-fetch `onError` receives the JSON body spread with `status` /
 * `statusText` — not a `BetterFetchError` instance.
 */
function dimahErrorFromFetch(error: {
  status: number;
  statusText: string;
  error?: unknown;
}): DimahS3Error {
  const status = error.status as Status;
  const parsed = s3FetchErrorSchema.safeParse(error);
  if (parsed.success) {
    const { message, code, params } = parsed.data;
    return new DimahS3Error(status, {
      message,
      ...(code !== undefined ? { code } : {}),
      ...(params !== undefined ? { params } : {}),
    });
  }
  return new DimahS3Error(status, { message: fallbackMessage(error) });
}

/**
 * Shared `$fetch` for core routes and client plugins.
 * `base` is a normalized API prefix (e.g. `/api/s3`).
 *
 * Non-OK JSON matching {@link s3FetchErrorSchema} throws {@link DimahS3Error}.
 * `throw: true` is the better-fetch flag; `onError` maps onto the same class
 * the server throws so `instanceof DimahS3Error` works in the browser.
 */
export function createS3Fetch(
  base: string,
  options?: S3ClientFetchOptions,
): S3Fetch {
  return createFetch({
    baseURL: base,
    throw: true,
    errorSchema: s3FetchErrorSchema,
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
