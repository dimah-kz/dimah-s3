"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import type {
  APIError,
  ContentDispositionType,
  DownloadPayload,
  S3Api,
  S3RouteName,
} from "@dimah-s3/core";
import { requireApi, toClientError } from "@/internal/client-error";
import { useLiveRef } from "@/internal/hooks";
import { createLruCache, type LruCache } from "@/internal/lru";
import { S3Context } from "@/s3-provider";

export type UseObjectUrlOptions = {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Named server route (`dimahS3({ routes })`). */
  route: S3RouteName;
  /** Stored object key. `null`, `undefined` or `""` clears the URL. */
  objectKey?: string | null;
  /** Content-Disposition for the GET. @default "inline" */
  disposition?: ContentDispositionType;
  /** File name for Content-Disposition. */
  fileName?: string;
  /**
   * Refresh this long before expiry. A URL that lives less than twice this
   * long refreshes at half its lifetime instead.
   * @default 60_000
   */
  refreshBeforeMs?: number;
};

export type UseObjectUrlReturn = {
  /** The key this state belongs to, or `null` when there is no key. */
  objectKey: string | null;
  /** Presigned or proxy URL for `objectKey`. `null` until it is signed. */
  url: string | null;
  /** When `url` stops working (ms since epoch). `null` for proxy URLs. */
  expiresAt: number | null;
  /** The last presign error for `objectKey`, or `null`. */
  error: APIError | null;
  /** `true` while a presign for `objectKey` is in flight. */
  isLoading: boolean;
  /** Drops the cached URL and presigns again. */
  refresh: () => void;
};

/** A URL as cached for every hook that shares one `S3Api`. */
type CachedUrl = {
  url: string;
  /** When the URL was requested (ms since epoch). */
  signedAt: number;
  /** When the URL stops working (ms since epoch). Proxy URLs do not expire. */
  expiresAt: number | null;
};

type UrlCache = {
  entries: LruCache<string, CachedUrl>;
  /** Presigns in flight, so hooks showing one object share one request. */
  pending: Map<string, Promise<CachedUrl>>;
};

/** What one hook shows, tagged with the api and object it was loaded for. */
type UrlState = {
  api: S3Api;
  id: string;
  url: string | null;
  expiresAt: number | null;
  error: APIError | null;
  isLoading: boolean;
};

const CACHE_SIZE = 500;
const DEFAULT_REFRESH_BEFORE_MS = 60_000;
/** Longer `setTimeout` delays fire at once. A capped timer re-arms on wake. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

const caches = new WeakMap<S3Api, UrlCache>();

function cacheFor(api: S3Api): UrlCache {
  let cache = caches.get(api);
  if (!cache) {
    cache = { entries: createLruCache(CACHE_SIZE), pending: new Map() };
    caches.set(api, cache);
  }
  return cache;
}

function cacheId(
  route: S3RouteName,
  objectKey: string,
  disposition: ContentDispositionType,
  fileName: string | undefined,
): string {
  return JSON.stringify([route, objectKey, disposition, fileName ?? null]);
}

/** Presigns `payload`, joining a request for the same `id` that is in flight. */
function presign(
  api: S3Api,
  id: string,
  payload: DownloadPayload,
): Promise<CachedUrl> {
  const cache = cacheFor(api);
  const running = cache.pending.get(id);
  if (running) return running;

  // Taken before the request, so the computed expiry is never late.
  const signedAt = Date.now();
  const request = api
    .download(payload)
    .then(({ url, expiresIn }) => {
      const entry: CachedUrl = {
        url,
        signedAt,
        expiresAt: expiresIn === undefined ? null : signedAt + expiresIn * 1000,
      };
      cache.entries.set(id, entry);
      return entry;
    })
    .finally(() => cache.pending.delete(id));
  cache.pending.set(id, request);
  return request;
}

/** When to presign `entry` again, or `null` when it never expires. */
function refreshAt(entry: CachedUrl, refreshBeforeMs: number): number | null {
  if (entry.expiresAt === null) return null;
  const lifetime = entry.expiresAt - entry.signedAt;
  const lead = Math.max(0, Math.min(refreshBeforeMs, lifetime / 2));
  return entry.expiresAt - lead;
}

/** `true` until `entry` reaches its refresh point. */
function isFresh(entry: CachedUrl, refreshBeforeMs: number): boolean {
  const at = refreshAt(entry, refreshBeforeMs);
  return at === null || Date.now() < at;
}

/**
 * Presigns a GET URL for previews (`<img>`, `<video>`, links).
 *
 * URLs are cached per `S3Api`, so hooks showing the same object share one
 * request. A URL is refreshed `refreshBeforeMs` before it expires; proxy URLs
 * never expire and stay until `refresh()`. `url` is only ever the URL for the
 * current `objectKey`: after the key changes it is `null` until the new URL
 * is signed. A background refresh keeps the old URL until the new one lands.
 */
export function useObjectUrl(options: UseObjectUrlOptions): UseObjectUrlReturn {
  const contextApi = useContext(S3Context);
  const {
    route,
    fileName,
    disposition = "inline",
    refreshBeforeMs = DEFAULT_REFRESH_BEFORE_MS,
  } = options;
  // An empty key is no key.
  const objectKey = options.objectKey || null;
  const api =
    objectKey === null
      ? null
      : requireApi(options.api ?? contextApi, "useObjectUrl");
  const id =
    objectKey === null
      ? null
      : cacheId(route, objectKey, disposition, fileName);

  const [state, setState] = useState<UrlState | null>(null);
  const [version, setVersion] = useState(0);
  const targetRef = useLiveRef({ api, id });

  useEffect(() => {
    if (api === null || id === null || objectKey === null) return;
    const payload: DownloadPayload = {
      route,
      key: objectKey,
      name: fileName,
      disposition,
    };
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const show = (entry: CachedUrl) => {
      setState({
        api,
        id,
        url: entry.url,
        expiresAt: entry.expiresAt,
        error: null,
        isLoading: false,
      });
      const at = refreshAt(entry, refreshBeforeMs);
      if (at === null) return;
      const wait = Math.min(Math.max(at - Date.now(), 0), MAX_TIMER_DELAY_MS);
      timer = setTimeout(load, wait);
    };

    const load = () => {
      if (!active) return;
      const cached = cacheFor(api).entries.get(id);
      if (cached && isFresh(cached, refreshBeforeMs)) {
        show(cached);
        return;
      }
      setState((previous) =>
        previous !== null && previous.api === api && previous.id === id
          ? { ...previous, isLoading: true }
          : {
              api,
              id,
              url: null,
              expiresAt: null,
              error: null,
              isLoading: true,
            },
      );
      presign(api, id, payload).then(
        (entry) => {
          if (active) show(entry);
        },
        (error: unknown) => {
          if (!active) return;
          setState({
            api,
            id,
            url: null,
            expiresAt: null,
            error: toClientError(error),
            isLoading: false,
          });
        },
      );
    };

    // One microtask: a Strict Mode remount cancels before the request starts.
    void Promise.resolve().then(load);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    api,
    id,
    route,
    objectKey,
    fileName,
    disposition,
    refreshBeforeMs,
    version,
  ]);

  const refresh = useCallback(() => {
    const target = targetRef.current;
    if (target.api === null || target.id === null) return;
    cacheFor(target.api).entries.delete(target.id);
    setVersion((n) => n + 1);
  }, [targetRef]);

  // State loaded for another api or object is never shown.
  const current =
    state !== null && state.api === api && state.id === id ? state : null;
  return {
    objectKey,
    url: current?.url ?? null,
    expiresAt: current?.expiresAt ?? null,
    error: current?.error ?? null,
    isLoading: id !== null && (current?.isLoading ?? true),
    refresh,
  };
}
