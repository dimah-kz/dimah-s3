import type { DimahS3Config } from "@/types/config";
import type { DimahS3Locals } from "@/types/locals";

/**
 * Context of every {@link createS3Endpoint} handler, read from
 * `ctx.context`. The router injects `config`, and the endpoint middleware
 * adds the request and the `locals` that the instance guards returned.
 */
export type S3EndpointContext = {
  /** The config passed to `dimahS3()`. */
  config: Readonly<DimahS3Config>;
  request: Request;
  locals: DimahS3Locals;
};
