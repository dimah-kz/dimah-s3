"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type {
  ContentDispositionType,
  DimahS3Error,
  S3Api,
  S3RouteName,
} from "@dimah-s3/core";
import { S3Context } from "@/s3-provider";
import { useLiveRef } from "@/internal-helpers";
import { toHookError } from "@/types/error";

export type UseObjectUrlOptions = {
  /** S3Api. Optional when an `<S3Provider>` is present in the tree. */
  api?: S3Api;
  /** Named server route (`dimahS3({ routes })`). */
  route: S3RouteName;
  /** Stored object key. `null` / `undefined` clears the URL. */
  objectKey?: string | null;
  /** Content-Disposition for the GET. @default "inline" */
  disposition?: ContentDispositionType;
  /** Filename for Content-Disposition. */
  fileName?: string;
};

export type UseObjectUrlReturn = {
  /** Presigned or proxy URL, or `null` while loading / when no key. */
  url: string | null;
  /** Validity in seconds. `0` for proxy downloads. */
  expiresIn: number | null;
  error: DimahS3Error | null;
  isLoading: boolean;
  /** Drop the cache entry and presign again. */
  refresh: () => void;
};

type CacheEntry = {
  url: string;
  expiresIn: number;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const REFRESH_SKEW_MS = 15_000;

function cacheKey(
  route: string,
  objectKey: string,
  disposition: string,
  fileName: string | undefined,
) {
  return `${route}\0${objectKey}\0${disposition}\0${fileName ?? ""}`;
}

function readFresh(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt - REFRESH_SKEW_MS <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

/**
 * Presign a GET URL for preview / `<img>` / `<video>`.
 * Caches until shortly before expiry. Proxy URLs (`expiresIn: 0`) stay
 * until `objectKey` changes or `refresh()` runs.
 */
export function useObjectUrl(options: UseObjectUrlOptions): UseObjectUrlReturn {
  const contextApi = useContext(S3Context);
  const optsRef = useLiveRef(options);
  const apiRef = useLiveRef(contextApi);
  const generationRef = useRef(0);
  const [url, setUrl] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [error, setError] = useState<DimahS3Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const objectKey = options.objectKey ?? null;
  const disposition = options.disposition ?? "inline";
  const fileName = options.fileName;
  const route = options.route;

  const load = useCallback(async () => {
    const opts = optsRef.current;
    const key = opts.objectKey;
    if (!key) {
      setUrl(null);
      setExpiresIn(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    const api = opts.api ?? apiRef.current;
    if (!api) {
      throw new Error(
        "[dimah-s3] No S3Api found. Pass `api` to useObjectUrl or wrap with <S3Provider>.",
      );
    }
    const id = cacheKey(
      opts.route,
      key,
      opts.disposition ?? "inline",
      opts.fileName,
    );
    const cached = readFresh(id);
    if (cached) {
      setUrl(cached.url);
      setExpiresIn(cached.expiresIn);
      setError(null);
      setIsLoading(false);
      return;
    }

    const generation = ++generationRef.current;
    setIsLoading(true);
    try {
      const result = await api.download({
        route: opts.route,
        key,
        fileName: opts.fileName,
        disposition: opts.disposition ?? "inline",
      });
      if (generation !== generationRef.current) return;
      const ttlMs =
        result.expiresIn > 0 ? result.expiresIn * 1000 : 24 * 60 * 60 * 1000;
      cache.set(id, {
        url: result.url,
        expiresIn: result.expiresIn,
        expiresAt: Date.now() + ttlMs,
      });
      setUrl(result.url);
      setExpiresIn(result.expiresIn);
      setError(null);
    } catch (err) {
      if (generation !== generationRef.current) return;
      setUrl(null);
      setExpiresIn(null);
      setError(toHookError(err, "Download failed"));
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [apiRef, optsRef]);

  useEffect(() => {
    void load();
  }, [load, objectKey, route, disposition, fileName, tick]);

  const refresh = useCallback(() => {
    if (objectKey) {
      cache.delete(cacheKey(route, objectKey, disposition, fileName));
    }
    setTick((n) => n + 1);
  }, [disposition, fileName, objectKey, route]);

  return { url, expiresIn, error, isLoading, refresh };
}
