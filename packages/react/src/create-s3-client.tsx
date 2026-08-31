"use client";

import {
  createS3Client as createCoreS3Client,
  type CreateS3ClientOptions,
  type CreateS3ClientResult,
  type S3ClientPlugin,
} from "@dimah-s3/core";
import type { ComponentType, ReactNode } from "react";
import {
  S3Provider as BaseS3Provider,
  useApi as useBaseApi,
  type S3ProviderProps,
} from "./s3-provider";

type BoundProviderProps = Omit<S3ProviderProps, "api"> & {
  children: ReactNode;
};

export type ReactS3Client<P extends readonly S3ClientPlugin[] = []> =
  CreateS3ClientResult<P> & {
    Provider: ComponentType<BoundProviderProps>;
    useApi: () => CreateS3ClientResult<P>;
  };

/**
 * Create a typed S3 browser client — Better Auth–style one-shot setup.
 *
 * The returned object *is* the API (`s3Client.download({ route, key })`), plus a bound
 * `Provider` / `useApi` so plugin methods stay typed without generics.
 *
 * ```ts
 * import { createS3Client } from "@dimah-s3/react";
 * import { dbClient } from "@dimah-s3/db/client";
 *
 * export const s3Client = createS3Client({
 *   basePath: "/api/s3",
 *   plugins: [dbClient()],
 * });
 *
 * await s3Client.db.listObjects();
 *
 * const api = s3Client.useApi(); // includes .db
 * // Vite / Hono: <s3Client.Provider>
 * // Next.js: export const S3Provider = s3Client.Provider
 * ```
 */
export function createS3Client<const P extends readonly S3ClientPlugin[] = []>(
  options?: CreateS3ClientOptions<P>,
): ReactS3Client<P> {
  type TApi = CreateS3ClientResult<P>;

  const api = createCoreS3Client(options);

  function Provider(props: BoundProviderProps) {
    return <BaseS3Provider api={api} {...props} />;
  }

  function useApi(): TApi {
    return useBaseApi<TApi>();
  }

  return Object.assign(api, { Provider, useApi });
}

export type { CreateS3ClientOptions, CreateS3ClientResult };
