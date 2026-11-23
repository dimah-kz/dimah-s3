import type {
  CreateS3ClientResult,
  S3ClientPlugin,
  S3RequestOptions,
  UploadConfirmResponse,
} from "@dimah-s3/core";
import { dimahS3, type DimahS3 } from "@/dimah-s3";
import type { DimahS3Plugin, PluginContextMap } from "@/plugin";
import type { DimahS3Config, DimahS3RouteConfig } from "@/types/config";
import { createMemoryS3, type MemoryS3 } from "./memory-s3";
import {
  createTestClient,
  uploadTestFile,
  type TestUploadInput,
} from "./test-client";

/** Ticket secret of a test instance that sets none. Never use it outside tests. */
const TEST_SECRET = "dimah-s3-testing-secret-0123456789abcdef";

/** Bucket of a test instance that sets none. */
const TEST_BUCKET = "test-bucket";

/**
 * `dimahS3()` options for {@link createTestInstance}. The S3 client is the
 * in-memory one, so it is not an option; `bucket` and `secret` have test
 * defaults.
 */
export type TestInstanceConfig<
  P extends readonly DimahS3Plugin[],
  R extends Record<string, DimahS3RouteConfig>,
  CP extends readonly S3ClientPlugin[],
> = Omit<DimahS3Config, "client" | "plugins" | "routes"> & {
  plugins?: P;
  routes: R;
  /** Client plugins for {@link TestInstance.client}, such as `auditClient()`. */
  clientPlugins?: CP;
};

/** What {@link createTestInstance} returns. */
export type TestInstance<
  P extends readonly DimahS3Plugin[],
  R extends Record<string, DimahS3RouteConfig>,
  CP extends readonly S3ClientPlugin[],
> = {
  /** The `dimahS3()` instance: `s3.api`, `s3.put`, and each plugin context. */
  s3: DimahS3<P, PluginContextMap<P>, R>;
  /** The in-memory S3 behind every route that sets no `client` of its own. */
  storage: MemoryS3;
  /** The browser client, calling `s3.handler` in process. */
  client: CreateS3ClientResult<CP>;
  /** {@link uploadTestFile} through `client` into `storage`. */
  upload: (
    input: TestUploadInput,
    options?: S3RequestOptions,
  ) => Promise<UploadConfirmResponse>;
};

/**
 * A `dimahS3()` instance on an in-memory S3, with a browser client wired to
 * its handler. Use it to test a plugin, or your own hooks, end to end
 * without a bucket or a server. Node.js only.
 *
 * ```ts
 * const { s3, client, upload } = createTestInstance({
 *   plugins: [audit()],
 *   clientPlugins: [auditClient()],
 *   routes: { uploads: route({ upload: true }) },
 * });
 *
 * await upload({ route: "uploads", name: "a.txt", body: "hello" });
 * const { events } = await client.audit.listEvents();
 * ```
 */
export function createTestInstance<
  const P extends readonly DimahS3Plugin[] = [],
  const R extends Record<string, DimahS3RouteConfig> = Record<
    string,
    DimahS3RouteConfig
  >,
  const CP extends readonly S3ClientPlugin[] = [],
>(config: TestInstanceConfig<P, R, CP>): TestInstance<P, R, CP> {
  const { clientPlugins, ...options } = config;
  const bucket = options.bucket ?? TEST_BUCKET;
  const storage = createMemoryS3({ bucket });
  const s3 = dimahS3<P, R>({
    secret: TEST_SECRET,
    ...options,
    bucket,
    client: storage.client,
  });
  const basePath =
    options.basePath ??
    (options.baseURL === undefined
      ? undefined
      : new URL(options.baseURL).pathname);
  const client = createTestClient<CP>(s3, {
    ...(basePath !== undefined && { basePath }),
    ...(clientPlugins !== undefined && { plugins: clientPlugins }),
  });
  return {
    s3,
    storage,
    client,
    upload: (input, callOptions) =>
      uploadTestFile({ client, storage }, input, callOptions),
  };
}
