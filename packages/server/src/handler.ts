import {
  normalizeS3ApiBasePath,
  pluginEndpointPath,
  S3_API_BASE_PATH,
} from "@dimah-s3/core";
import { errors, type ServerErrors } from "./errors";
import { parseBody, runHook, wrapHandler } from "./internal-helpers";
import type { ResolvedPluginEndpoint } from "./plugin/types";
import { PROCEDURE_REGISTRY, type ProcedureEntry } from "./procedures/registry";
import type { DimahS3Config } from "./types";

type HandlerContext = {
  config: DimahS3Config;
  request: Request;
  url: URL;
  errors: ServerErrors;
};

async function requireJson(request: Request): Promise<Record<string, unknown>> {
  const body = await parseBody<Record<string, unknown>>(request);
  if (!body) {
    throw errors.invalidJson();
  }
  return body;
}

type Route = {
  method: string;
  path: string;
  enabled: (config: DimahS3Config) => boolean | undefined;
  status?: number;
  run: (ctx: HandlerContext) => Promise<unknown>;
};

/** Decode HTTP-specific input, then call the shared procedure. */
function decodeInput(
  entry: ProcedureEntry,
  ctx: HandlerContext,
): Promise<unknown> {
  const { request, url } = ctx;
  const { searchParams } = url;

  switch (entry.path) {
    case PROCEDURE_REGISTRY.download.path: {
      const expiresRaw = searchParams.get("expiresIn");
      return Promise.resolve({
        key: searchParams.get("key")?.trim() ?? "",
        bucket: searchParams.get("bucket")?.trim() || undefined,
        fileName: searchParams.get("fileName")?.trim() || undefined,
        expiresIn: expiresRaw != null ? Number(expiresRaw) : undefined,
      });
    }
    case PROCEDURE_REGISTRY.delete.path:
      return Promise.resolve({
        key: searchParams.get("key")?.trim() ?? "",
        bucket: searchParams.get("bucket")?.trim() || undefined,
      });
    case PROCEDURE_REGISTRY.multipartListParts.path:
      return Promise.resolve({
        key: searchParams.get("key")?.trim() ?? "",
        uploadId: searchParams.get("uploadId")?.trim() ?? "",
        bucket: searchParams.get("bucket")?.trim() || undefined,
      });
    default:
      return requireJson(request);
  }
}

const routes: Route[] = Object.values(PROCEDURE_REGISTRY).map((entry) => ({
  method: entry.method,
  path: entry.path,
  enabled: entry.isEnabled,
  status: "status" in entry ? entry.status : undefined,
  run: async (ctx) => {
    const input = await decodeInput(entry, ctx);
    return entry.run(ctx.config, input, ctx.request);
  },
}));

/** Framework-agnostic HTTP router (`Request` → `Response`). */
export function createHandler(
  config: DimahS3Config,
  basePath: string = S3_API_BASE_PATH,
  pluginEndpoints: ResolvedPluginEndpoint[] = [],
) {
  const base = normalizeS3ApiBasePath(basePath);

  const pluginRoutes: Route[] = pluginEndpoints.map((e) => ({
    method: e.method,
    path: pluginEndpointPath(e.pluginId, e.path),
    status: e.status,
    enabled: () => true,
    run: ({ config: cfg, request, url }) =>
      e.handler({
        request,
        url,
        config: cfg,
        errors,
        json: () => parseBody(request),
      }),
  }));

  const allRoutes = [...routes, ...pluginRoutes];

  return wrapHandler(async (request: Request) => {
    await runHook(config.guard, { request });

    const url = new URL(request.url);
    const subpath = url.pathname.slice(base.length).replace(/^\//, "");

    const route = allRoutes.find(
      (r) => r.method === request.method && r.path === subpath,
    );

    if (!route || !route.enabled(config)) {
      throw errors.notFound();
    }

    const data = await route.run({ config, request, url, errors });
    return Response.json(
      data,
      route.status ? { status: route.status } : undefined,
    );
  });
}
