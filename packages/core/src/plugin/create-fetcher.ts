import { DimahS3Error } from "../error";
import type { S3ClientFetcher, S3ClientFetchOptions } from "./types";

function buildQuery(
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function resolveHeaders(
  headers: S3ClientFetchOptions["headers"],
): Promise<HeadersInit | undefined> {
  if (headers == null) return undefined;
  if (typeof headers === "function") return headers();
  return headers;
}

function mergeHeaders(
  ...parts: (HeadersInit | undefined)[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of parts) {
    if (!part) continue;
    const h = new Headers(part);
    h.forEach((value, key) => {
      out[key] = value;
    });
  }
  return out;
}

function jsonBody(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

/**
 * Shared fetch + JSON error parsing for core routes and client plugins.
 * `base` is a normalized API prefix (e.g. `/api/s3`).
 *
 * Non-OK responses throw {@link DimahS3Error} with the HTTP status — same
 * class as server procedures, so client and server error shapes stay aligned.
 */
export function createFetcher(
  base: string,
  options?: S3ClientFetchOptions,
): S3ClientFetcher {
  const fetchImpl = options?.fetch ?? fetch;

  const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const extraHeaders = await resolveHeaders(options?.headers);
    const res = await fetchImpl(url, {
      ...init,
      credentials: options?.credentials ?? init?.credentials,
      headers: mergeHeaders(extraHeaders, init?.headers),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        params?: Record<string, string | number>;
      };
      throw new DimahS3Error(body.message ?? res.statusText, res.status, {
        code: body.code,
        params: body.params,
      });
    }
    return res.json() as Promise<T>;
  };

  return {
    get<T>(
      path: string,
      query?: Record<string, string | number | boolean | undefined>,
    ) {
      return json<T>(`${base}/${path}${buildQuery(query)}`);
    },
    post<T>(path: string, body?: unknown) {
      return json<T>(`${base}/${path}`, {
        method: "POST",
        ...jsonBody(body),
      });
    },
    put<T>(path: string, body?: unknown) {
      return json<T>(`${base}/${path}`, {
        method: "PUT",
        ...jsonBody(body),
      });
    },
    patch<T>(path: string, body?: unknown) {
      return json<T>(`${base}/${path}`, {
        method: "PATCH",
        ...jsonBody(body),
      });
    },
    delete<T>(
      path: string,
      query?: Record<string, string | number | boolean | undefined>,
    ) {
      return json<T>(`${base}/${path}${buildQuery(query)}`, {
        method: "DELETE",
      });
    },
  };
}
