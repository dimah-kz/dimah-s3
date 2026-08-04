import { S3_API_ROUTES } from "@dimah-s3/core";
import type { DimahS3Config } from "../types";
import { confirm } from "./confirm";
import { deleteObject } from "./delete";
import { download } from "./download";
import { multipartAbort } from "./multipart/abort";
import { multipartComplete } from "./multipart/complete";
import { multipartInit } from "./multipart/init";
import { multipartListParts } from "./multipart/list-parts";
import { multipartSignPart } from "./multipart/part";
import { upload } from "./upload";

/**
 * Single source of truth for core procedures shared by the HTTP handler and
 * direct `createServerApi`. Keys match {@link S3_API_ROUTES}.
 */
export type ProcedureEntry = {
  /** Relative path under `basePath` (same as `S3_API_ROUTES` values). */
  path: string;
  method: "GET" | "POST" | "DELETE";
  /** Optional HTTP status for successful JSON responses. */
  status?: number;
  /** Feature flag — disabled → 404 from both handler and `api`. */
  isEnabled: (config: DimahS3Config) => boolean | undefined;
  run: (
    config: DimahS3Config,
    input: unknown,
    request: Request,
  ) => Promise<unknown>;
};

export const PROCEDURE_REGISTRY = {
  upload: {
    path: S3_API_ROUTES.upload,
    method: "POST",
    isEnabled: (c) => c.upload?.enabled,
    run: (config, input, request) =>
      upload(config, input as Parameters<typeof upload>[1], request),
  },
  uploadConfirm: {
    path: S3_API_ROUTES.uploadConfirm,
    method: "POST",
    isEnabled: (c) => c.upload?.enabled,
    run: (config, input, request) =>
      confirm(config, input as Parameters<typeof confirm>[1], request),
  },
  download: {
    path: S3_API_ROUTES.download,
    method: "GET",
    isEnabled: (c) => c.download?.enabled,
    run: (config, input, request) =>
      download(config, input as Parameters<typeof download>[1], request),
  },
  delete: {
    path: S3_API_ROUTES.delete,
    method: "DELETE",
    isEnabled: (c) => c.delete?.enabled,
    run: (config, input, request) =>
      deleteObject(
        config,
        input as Parameters<typeof deleteObject>[1],
        request,
      ),
  },
  multipartInit: {
    path: S3_API_ROUTES.multipartInit,
    method: "POST",
    status: 201,
    isEnabled: (c) => c.multipart?.enabled,
    run: (config, input, request) =>
      multipartInit(
        config,
        input as Parameters<typeof multipartInit>[1],
        request,
      ),
  },
  multipartPart: {
    path: S3_API_ROUTES.multipartPart,
    method: "POST",
    isEnabled: (c) => c.multipart?.enabled,
    run: (config, input, request) =>
      multipartSignPart(
        config,
        input as Parameters<typeof multipartSignPart>[1],
        request,
      ),
  },
  multipartComplete: {
    path: S3_API_ROUTES.multipartComplete,
    method: "POST",
    isEnabled: (c) => c.multipart?.enabled,
    run: (config, input, request) =>
      multipartComplete(
        config,
        input as Parameters<typeof multipartComplete>[1],
        request,
      ),
  },
  multipartAbort: {
    path: S3_API_ROUTES.multipartAbort,
    method: "POST",
    isEnabled: (c) => c.multipart?.enabled,
    run: (config, input, request) =>
      multipartAbort(
        config,
        input as Parameters<typeof multipartAbort>[1],
        request,
      ),
  },
  multipartListParts: {
    path: S3_API_ROUTES.multipartListParts,
    method: "GET",
    isEnabled: (c) => c.multipart?.enabled,
    run: (config, input, request) =>
      multipartListParts(
        config,
        input as Parameters<typeof multipartListParts>[1],
        request,
      ),
  },
} as const satisfies Record<keyof typeof S3_API_ROUTES, ProcedureEntry>;

export type ProcedureKey = keyof typeof PROCEDURE_REGISTRY;
