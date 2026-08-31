/**
 * Augment to lock client `route` props to your `dimahS3({ routes })` names.
 *
 * ```ts
 * import type { InferS3Routes } from "@dimah-s3/core";
 * import type { s3 } from "@/lib/s3";
 *
 * declare module "@dimah-s3/core" {
 *   interface DimahS3Routes extends Record<InferS3Routes<typeof s3>, true> {}
 * }
 * ```
 */
export interface DimahS3Routes {} // eslint-disable-line @typescript-eslint/no-empty-object-type -- declaration merging

/** Named route. `string` until {@link DimahS3Routes} is augmented. */
export type S3RouteName = [keyof DimahS3Routes] extends [never]
  ? string
  : Extract<keyof DimahS3Routes, string>;

/** Route names inferred from a `dimahS3()` instance. */
export type InferS3Routes<T> = T extends { $Infer: { routes: infer R } }
  ? Extract<R, string>
  : string;
