import type { RouteCatalogEntry, RouteCatalogResponse } from "@dimah-s3/core";
import { isEnabled } from "@/config/feature-toggle";
import { runOperation } from "@/operations/run-operation";
import type { S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig, ResolvedRoute } from "@/types/resolved";

/**
 * Lists every route and the features a client may use
 * (`GET /routes`, `s3.api.catalog`). It runs the instance guard like every
 * other call.
 */
export function getRouteCatalog(
  config: ResolvedConfig,
  options: S3ServerCallOptions = {},
): Promise<RouteCatalogResponse> {
  return runOperation(config, "catalog", options, async () =>
    buildRouteCatalog(config),
  );
}

/**
 * The catalog of a resolved config. It reports effective values: `checksum`
 * is on whenever `verifyContent` is, and `inlineTypes` is the allow-list a
 * download really uses (`[]` when nothing opens inline).
 */
export function buildRouteCatalog(
  config: ResolvedConfig,
): RouteCatalogResponse {
  const routes: RouteCatalogResponse["routes"] = {};
  for (const [name, route] of Object.entries(config.routes)) {
    routes[name] = catalogEntry(route);
  }
  return { routes };
}

function catalogEntry(route: ResolvedRoute): RouteCatalogEntry {
  const { upload, download } = route;
  return {
    upload: isEnabled(upload)
      ? {
          enabled: true,
          ...(upload.fileTypes ? { fileTypes: [...upload.fileTypes] } : {}),
          ...(upload.maxFileSize !== undefined
            ? { maxFileSize: upload.maxFileSize }
            : {}),
          multipart: upload.multipart.enabled,
          checksum: upload.checksum,
        }
      : { enabled: false },
    download: isEnabled(download)
      ? {
          enabled: true,
          maxExpiresIn: download.maxExpiresIn,
          disposition: download.disposition,
          inlineTypes: download.inlineTypes ? [...download.inlineTypes] : [],
          mode: download.mode,
        }
      : { enabled: false },
    delete: { enabled: route.delete.enabled },
  };
}
