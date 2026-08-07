import type { DimahS3 } from "../dimah-s3";

/** Minimal surface adapters need from a dimah-s3 instance. */
export type DimahS3HandlerSource = Pick<
  DimahS3<Record<string, unknown>>,
  "handler"
>;
