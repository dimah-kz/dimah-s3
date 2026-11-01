import {
  GetObjectCommand,
  type GetObjectCommandInput,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { isAPIError, s3Error } from "@dimah-s3/core";
import type { fileQuerySchema } from "@dimah-s3/core/schema";
import type * as z from "zod";
import { headObjectOrNotFound } from "@/helpers/head-object";
import { authorizeDownload } from "@/helpers/authorize-download";
import { resolveObjectDisposition } from "@/helpers/inline-types";
import { awsStatus, isAwsNotFound } from "@/helpers/aws-errors";
import { openObject } from "@/helpers/open-target";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ObjectContext } from "@/types/hook-contexts";
import type { OpenedRoute, ResolvedConfig } from "@/types/resolved";

/** Query of `GET /file`, after validation. */
export type FileQuery = z.output<typeof fileQuerySchema>;

/** `Cache-Control` of `/file` unless `download.resolve` returns one. */
const FILE_CACHE_CONTROL = "private, no-cache";

/**
 * Sent on every `/file` response. The bytes come from the API origin, so
 * they must never run as a page there: the CSP sandboxes them, and the
 * browser must not guess another type.
 */
const FILE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Accept-Ranges": "bytes",
};

/** One `bytes=a-b`, `bytes=a-` or `bytes=-n` range. */
const SINGLE_RANGE = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/i;

/**
 * Streams an object through the API (`GET /file`). Proxy-mode download URLs
 * point here, and there is no `s3.api` method for it. Only a route with
 * `download.mode: "proxy"` is served; any other fails with
 * `FEATURE_DISABLED` (`feature: "proxy"`), so the server never streams
 * objects the route did not opt in for.
 *
 * Guards run first: the route guard, then `download.guard` with the values
 * from `download.resolve`. Then a single GetObject runs with the request's
 * Range and conditional headers and its abort signal, and the response
 * carries the hardening headers, `ETag` and `Last-Modified`.
 *
 * - Only one byte range is forwarded. A multi-range or malformed `Range` is
 *   ignored, so the response is a 200.
 * - `If-Match`, `If-None-Match`, `If-Modified-Since` and
 *   `If-Unmodified-Since` are forwarded. S3's 304 becomes a bare 304, and
 *   its 412 becomes `PRECONDITION_FAILED`.
 * - `If-Range` is checked against the ranged response. When the object
 *   changed, the range is dropped and the whole object is fetched again.
 * - A range S3 cannot satisfy fails with `RANGE_NOT_SATISFIABLE` and a
 *   `Content-Range` that names the object size.
 *
 * Error responses carry the hardening headers too, with the default
 * `Cache-Control`, so a shared cache never keeps a refusal for others.
 */
export async function serveFile(
  config: ResolvedConfig,
  query: FileQuery,
  options: S3ServerCallOptions = {},
): Promise<Response> {
  try {
    return await runOperation(config, "file", options, async (call) => {
      const { route, context } = await openObject(config, call, query, "proxy");
      const { download } = route;
      const authorized = await authorizeDownload(config, route, context, {
        mode: "proxy",
        name: query.name,
        disposition: query.disposition,
      });
      const { resolved } = authorized;
      const { name, disposition } = authorized.context;

      const headers = fileHeaders(resolved?.cacheControl);
      let output: GetObjectCommandOutput;
      try {
        output = await getObject(route, context, call.request);
      } catch (error) {
        if (awsStatus(error) === 304) return notModified(error, headers);
        throw await getObjectError(error, route, context, call.request.signal);
      }

      const sent = resolveObjectDisposition(download.inlineTypes, {
        key: context.key,
        name,
        requested: disposition,
        contentType: output.ContentType,
        contentDisposition: output.ContentDisposition,
      });
      headers.set(
        "Content-Type",
        sent.contentType ?? output.ContentType ?? "application/octet-stream",
      );
      headers.set("Content-Disposition", sent.header);
      if (output.ContentLength !== undefined) {
        headers.set("Content-Length", String(output.ContentLength));
      }
      if (output.ContentRange) {
        headers.set("Content-Range", output.ContentRange);
      }
      // A gzip object must say so, or the browser shows the raw bytes.
      if (output.ContentEncoding) {
        headers.set("Content-Encoding", output.ContentEncoding);
      }
      if (output.ContentLanguage) {
        headers.set("Content-Language", output.ContentLanguage);
      }
      setValidators(headers, output.ETag, output.LastModified?.toUTCString());
      return new Response(output.Body?.transformToWebStream() ?? null, {
        status: output.ContentRange ? 206 : 200,
        headers,
      });
    });
  } catch (error) {
    throw withFileHeaders(error);
  }
}

/** The hardening headers and `Cache-Control`. */
function fileHeaders(cacheControl = FILE_CACHE_CONTROL): Headers {
  const headers = new Headers(FILE_HEADERS);
  headers.set("Cache-Control", cacheControl);
  return headers;
}

/**
 * GetObject with the request's Range and conditional headers. A ranged
 * response that fails `If-Range` is discarded, and the whole object is
 * fetched again with the same conditions.
 */
async function getObject(
  route: OpenedRoute<"download">,
  context: ObjectContext,
  request: Request,
): Promise<GetObjectCommandOutput> {
  const range = singleRange(request.headers.get("range"));
  const ifRange = range ? request.headers.get("if-range") : null;
  const send = (Range: string | undefined) =>
    route.client.send(
      new GetObjectCommand({
        Bucket: context.bucket,
        Key: context.key,
        Range,
        ...conditionalInput(request.headers),
      }),
      { abortSignal: request.signal },
    );

  const output = await send(range);
  if (ifRange === null || !output.ContentRange) return output;
  if (ifRangeMatches(ifRange, output)) return output;
  await output.Body?.transformToWebStream().cancel();
  return send(undefined);
}

/** The `Range` header when it names one byte range, else `undefined`. */
function singleRange(header: string | null): string | undefined {
  const match = header ? SINGLE_RANGE.exec(header.trim()) : null;
  if (!match) return undefined;
  const [, first, last, suffix] = match;
  if (suffix !== undefined) return `bytes=-${suffix}`;
  if (last !== "" && Number(last) < Number(first)) return undefined;
  return `bytes=${first}-${last}`;
}

/** GetObject preconditions from the request. Invalid dates are ignored. */
function conditionalInput(
  headers: Headers,
): Pick<
  GetObjectCommandInput,
  "IfMatch" | "IfNoneMatch" | "IfModifiedSince" | "IfUnmodifiedSince"
> {
  return {
    IfMatch: headers.get("if-match") ?? undefined,
    IfNoneMatch: headers.get("if-none-match") ?? undefined,
    IfModifiedSince: httpDate(headers.get("if-modified-since")),
    IfUnmodifiedSince: httpDate(headers.get("if-unmodified-since")),
  };
}

function httpDate(value: string | null): Date | undefined {
  if (value === null) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time);
}

/**
 * RFC 9110 `If-Range`: an entity tag must match the current `ETag` with a
 * strong comparison, so a weak tag never matches. A date must equal the
 * current `Last-Modified` to the second.
 */
function ifRangeMatches(
  ifRange: string,
  output: Pick<GetObjectCommandOutput, "ETag" | "LastModified">,
): boolean {
  const value = ifRange.trim();
  if (value.startsWith('"')) return value === output.ETag;
  const time = Date.parse(value);
  return (
    !Number.isNaN(time) &&
    output.LastModified !== undefined &&
    Math.floor(output.LastModified.getTime() / 1000) === Math.floor(time / 1000)
  );
}

/** A bare 304 with the validators S3 sent. */
function notModified(error: unknown, headers: Headers): Response {
  const s3Headers = new Headers(
    (error as { $response?: { headers?: Record<string, string> } }).$response
      ?.headers,
  );
  setValidators(
    headers,
    s3Headers.get("etag") ?? undefined,
    s3Headers.get("last-modified") ?? undefined,
  );
  return new Response(null, { status: 304, headers });
}

/** Maps a failed GetObject to the error `/file` returns. */
async function getObjectError(
  error: unknown,
  route: OpenedRoute<"download">,
  context: ObjectContext,
  abortSignal: AbortSignal,
): Promise<unknown> {
  const status = awsStatus(error);
  if (status === 412) {
    return s3Error("PRECONDITION_FAILED", undefined, { cause: error });
  }
  if (status === 416) {
    const rangeError = s3Error("RANGE_NOT_SATISFIABLE", undefined, {
      cause: error,
    });
    const size =
      actualObjectSize(error) ??
      (await storedSize(route, context, abortSignal));
    if (size !== undefined) {
      rangeError.headers = { "Content-Range": `bytes */${size}` };
    }
    return rangeError;
  }
  if (isAwsNotFound(error)) {
    return s3Error("OBJECT_NOT_FOUND", undefined, { cause: error });
  }
  return error;
}

/** The object size S3 reports in an `InvalidRange` error body. */
function actualObjectSize(error: unknown): number | undefined {
  const value = (error as { ActualObjectSize?: unknown }).ActualObjectSize;
  const size =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof size === "number" && Number.isSafeInteger(size) && size >= 0
    ? size
    : undefined;
}

/** The object size from HeadObject, for a 416 whose error has none. */
async function storedSize(
  route: OpenedRoute<"download">,
  context: ObjectContext,
  abortSignal: AbortSignal,
): Promise<number | undefined> {
  const head = await headObjectOrNotFound(
    route.client,
    context.bucket,
    context.key,
    { abortSignal },
  );
  return head.ContentLength;
}

function setValidators(
  headers: Headers,
  eTag: string | undefined,
  lastModified: string | undefined,
): void {
  if (eTag) headers.set("ETag", eTag);
  if (lastModified) headers.set("Last-Modified", lastModified);
}

/**
 * Adds the `/file` hardening headers to an `APIError`, keeping the ones it
 * carries. Anything else is returned as it is.
 */
export function withFileHeaders(error: unknown): unknown {
  if (!isAPIError(error)) return error;
  const headers = fileHeaders();
  new Headers(error.headers).forEach((value, name) => {
    headers.set(name, value);
  });
  error.headers = headers;
  return error;
}
