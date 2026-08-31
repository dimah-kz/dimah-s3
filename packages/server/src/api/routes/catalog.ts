import {
  S3_API_ROUTES,
  type RouteCatalogEntry,
  type RouteCatalogResponse,
} from "@dimah-s3/core";
import { isEnabled } from "@/helpers/features";
import type { ResolvedDimahS3Config } from "@/types";
import { createS3Endpoint } from "@/api/create-s3-endpoint";

function catalogUpload(
  upload: ResolvedDimahS3Config["routes"][string]["upload"],
): RouteCatalogEntry["upload"] {
  if (!isEnabled(upload)) return { enabled: false };
  return {
    enabled: true,
    fileTypes: upload.fileTypes,
    maxFileSize: upload.maxFileSize,
    multipart: isEnabled(upload.multipart),
    ...(upload.checksum ? { checksum: true } : {}),
    ...(upload.replace ? { replace: upload.replace } : {}),
  };
}

function catalogDownload(
  download: ResolvedDimahS3Config["routes"][string]["download"],
): RouteCatalogEntry["download"] {
  if (!isEnabled(download)) return { enabled: false };
  return {
    enabled: true,
    ...(download.disposition ? { disposition: download.disposition } : {}),
    ...(download.mode ? { mode: download.mode } : {}),
  };
}

export function buildRouteCatalog(
  config: ResolvedDimahS3Config,
): RouteCatalogResponse {
  const routes: RouteCatalogResponse["routes"] = {};
  for (const [name, route] of Object.entries(config.routes)) {
    routes[name] = {
      upload: catalogUpload(route.upload),
      download: catalogDownload(route.download),
      delete: isEnabled(route.delete) ? { enabled: true } : { enabled: false },
    };
  }
  return { routes };
}

export const catalog = createS3Endpoint(
  S3_API_ROUTES.catalog,
  { method: "GET" },
  async (ctx): Promise<RouteCatalogResponse> => {
    return buildRouteCatalog(ctx.context.config);
  },
);
