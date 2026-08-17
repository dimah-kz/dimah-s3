import { createEndpoint } from "better-call";
import { s3ContextMiddleware } from "./create-s3-middleware";

/**
 * Typed endpoint for dimah-s3 plugins and core routes.
 *
 * Paths are absolute under `basePath` (e.g. `/db/objects`). Context
 * (`config`, `errors`, `request`) is injected by the router / `s3.api`.
 *
 * ```ts
 * endpoints: {
 *   recent: createS3Endpoint("/audit/recent", { method: "GET" }, async (ctx) => {
 *     return { events: [] };
 *   }),
 * }
 * ```
 */
export const createS3Endpoint = createEndpoint.create({
  use: [s3ContextMiddleware],
});
