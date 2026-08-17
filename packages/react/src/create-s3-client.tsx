"use client";

import {
  createS3Client as createCoreS3Client,
  type CreateS3ClientOptions,
  type CreateS3ClientResult,
  type S3ClientPlugin,
} from "@dimah-s3/core";
import type { ReactNode } from "react";
import {
  S3Provider as BaseS3Provider,
  useApi as useBaseApi,
  type S3ProviderProps,
} from "./s3-provider";

type BoundProviderProps = Omit<S3ProviderProps, "api"> & {
  children: ReactNode;
};

/**
 * Create a typed S3 browser client — Better Auth–style one-shot setup.
 *
 * Returns the `api` singleton plus a bound `S3Provider` / `useApi` so plugin
 * methods stay typed without generics on every call.
 *
 * ```ts
 * import { createS3Client } from "@dimah-s3/react";
 * import { dbClient } from "@dimah-s3/db/client";
 *
 * export const { api, S3Provider, useApi } = createS3Client({
 *   basePath: "/api/s3",
 *   plugins: [dbClient()],
 * });
 *
 * await api.db.listObjects();
 *
 * const api = useApi(); // includes .db
 * <S3Provider>{children}</S3Provider>
 * ```
 */
export function createS3Client<const P extends readonly S3ClientPlugin[] = []>(
  options?: CreateS3ClientOptions<P>,
) {
  type TApi = CreateS3ClientResult<P>;

  const api = createCoreS3Client(options);

  function S3Provider(props: BoundProviderProps) {
    return <BaseS3Provider api={api} {...props} />;
  }

  function useApi(): TApi {
    return useBaseApi<TApi>();
  }

  return { api, S3Provider, useApi };
}

export type { CreateS3ClientOptions, CreateS3ClientResult };
